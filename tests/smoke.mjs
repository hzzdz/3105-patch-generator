import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const enc = new TextEncoder();
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
const ctx = vm.createContext({
  window: {}, crypto: webcrypto, TextEncoder, Uint8Array, ArrayBuffer, DataView,
  Blob, Date, Math, Object, Number, String, RegExp, Error, console, setTimeout
});
vm.runInContext(await readFile(new URL("../exporter.js", import.meta.url), "utf8"), ctx);
ctx.window.PATCH_CONFIG = {
  bundles: { A: "com.example.game", B: "group.com.example.shared" },
  links: { A: "Documents/gameassetbundles/fixed-name.bin", B: "Documents/gameassetbundles/" },
  settings: {}
};
vm.runInContext(await readFile(new URL("../processor.js", import.meta.url), "utf8"), ctx);

function parseBplist(bytes) {
  assert.equal(new TextDecoder().decode(bytes.slice(0, 8)), "bplist00");
  const trailer = bytes.length - 32;
  const offsetSize = bytes[trailer + 6];
  const refSize = bytes[trailer + 7];
  const numObjects = Number(readUInt(bytes, trailer + 8, 8));
  const top = Number(readUInt(bytes, trailer + 16, 8));
  const offsetTable = Number(readUInt(bytes, trailer + 24, 8));
  const offsets = Array.from({ length: numObjects }, (_, i) => Number(readUInt(bytes, offsetTable + i * offsetSize, offsetSize)));
  const cache = new Map();
  function lengthAt(pos, nibble) {
    if (nibble < 15) return [nibble, pos];
    const marker = bytes[pos++];
    assert.equal(marker >>> 4, 1);
    const n = 2 ** (marker & 15);
    return [Number(readUInt(bytes, pos, n)), pos + n];
  }
  function parse(id) {
    if (cache.has(id)) return cache.get(id);
    const pos = offsets[id], marker = bytes[pos], kind = marker >>> 4, nibble = marker & 15;
    if (kind === 0) return nibble === 8 ? false : nibble === 9 ? true : null;
    if (kind === 1) return Number(readUInt(bytes, pos + 1, 2 ** nibble));
    if (kind === 3) return new Date(Date.UTC(2001, 0, 1) + new DataView(bytes.buffer, bytes.byteOffset + pos + 1, 8).getFloat64(0, false) * 1000);
    let [count, body] = lengthAt(pos + 1, nibble);
    if (kind === 4) return bytes.slice(body, body + count);
    if (kind === 5) return new TextDecoder("ascii").decode(bytes.slice(body, body + count));
    if (kind === 6) {
      let s=""; for(let i=0;i<count;i++) s+=String.fromCharCode((bytes[body+i*2]<<8)|bytes[body+i*2+1]); return s;
    }
    if (kind === 10) {
      const result=[]; cache.set(id,result);
      for(let i=0;i<count;i++) result.push(parse(Number(readUInt(bytes,body+i*refSize,refSize))));
      return result;
    }
    if (kind === 13) {
      const result={}; cache.set(id,result); const values=body+count*refSize;
      for(let i=0;i<count;i++) result[parse(Number(readUInt(bytes,body+i*refSize,refSize)))]=parse(Number(readUInt(bytes,values+i*refSize,refSize)));
      return result;
    }
    throw new Error(`Unexpected plist marker ${marker.toString(16)}`);
  }
  return parse(top);
}
function readUInt(bytes, pos, size) { let n=0n; for(let i=0;i<size;i++) n=(n<<8n)|BigInt(bytes[pos+i]); return n; }

const fileBytes = Uint8Array.from([0, 255, 1, 128, 10, 13]);
const project = {
  id: "12345678-1234-4234-8234-123456789ABC", name: "SmokePatch", author: "", isPrivate: false,
  createdAt: { __plistDate: new Date("2026-11-22T00:00:00Z") },
  updatedAt: { __plistDate: new Date("2026-11-22T00:00:00Z") },
  bundleIdentifiers: ["com.example.game"], directories: [],
  rules: [{ id: "ABCDEF12-1234-4234-8234-123456789ABC", bundleID: "com.example.game", relativePath: "Documents", replacementFilename: "payload.bin", replacementData: fileBytes }]
};
const blob = await ctx.window.PatchExporter.export({ project });
const bytes = new Uint8Array(await blob.arrayBuffer());
const magic = enc.encode("3105PATCH\0");
assert.deepEqual(bytes.slice(0, magic.length), magic);
const envelope = parseBplist(bytes.slice(magic.length));
assert.equal(envelope.schemaVersion, 3);
assert.equal(envelope.isPasswordProtected, false);
assert.equal(envelope.packageID, project.id);
// Unprotected schema-v3 packages carry the content key in publicContentKey.
assert.equal(envelope.keyFingerprint.length, 32);
const key = envelope.publicContentKey;
assert.ok(key instanceof Uint8Array);

const packed = envelope.encryptedPayload;
const aesKey = await webcrypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);
const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0,12), additionalData: enc.encode(`3105PATCH/v3/payload/${project.id}`), tagLength:128 }, aesKey, packed.slice(12));
const payload = parseBplist(new Uint8Array(plain));
assert.equal(payload.project.name, project.name);
assert.equal(payload.project.rules[0].replacementFilename, "payload.bin");
assert.deepEqual([...payload.project.rules[0].replacementData], [...fileBytes]);
assert.deepEqual([...payload.replacementDigests[project.rules[0].id]], [...new Uint8Array(await webcrypto.subtle.digest("SHA-256", fileBytes))]);
const generated = await ctx.buildPatch({ bundleKey:"A", linkKey:"A", patchName:"SmokePatch", file:new File([fileBytes],"uploaded-name.bin"), onProgress:()=>{} });
assert.equal(generated.filename, "SmokePatch.3105");
assert.equal(generated.verified, false);
const generatedBytes = new Uint8Array(await generated.blob.arrayBuffer());
assert.deepEqual(generatedBytes.slice(0, magic.length), magic);
const generatedEnvelope = parseBplist(generatedBytes.slice(magic.length));
const generatedKey = await webcrypto.subtle.importKey("raw", generatedEnvelope.publicContentKey, { name:"AES-GCM" }, false, ["decrypt"]);
const generatedPayloadBytes = await webcrypto.subtle.decrypt({ name:"AES-GCM", iv:generatedEnvelope.encryptedPayload.slice(0,12), additionalData:enc.encode(`3105PATCH/v3/payload/${generatedEnvelope.packageID}`), tagLength:128 }, generatedKey, generatedEnvelope.encryptedPayload.slice(12));
const generatedPayload = parseBplist(new Uint8Array(generatedPayloadBytes));
assert.equal(generatedPayload.project.name,"SmokePatch");
assert.equal(generatedPayload.project.rules[0].relativePath,"Documents/gameassetbundles/fixed-name.bin");
assert.equal(generatedPayload.project.rules[0].replacementFilename,"fixed-name.bin");
assert.deepEqual([...generatedPayload.project.rules[0].replacementData],[...fileBytes]);
assert.equal(hex(new Uint8Array(await webcrypto.subtle.digest("SHA-256",generatedEnvelope.publicContentKey))),hex(generatedEnvelope.keyFingerprint));
const directoryGenerated = await ctx.buildPatch({ bundleKey:"B", linkKey:"B", patchName:"FolderPatch", file:new File([fileBytes],"uploaded-name.bin"), onProgress:()=>{} });
const directoryBytes = new Uint8Array(await directoryGenerated.blob.arrayBuffer());
const directoryEnvelope = parseBplist(directoryBytes.slice(magic.length));
const directoryKey = await webcrypto.subtle.importKey("raw",directoryEnvelope.publicContentKey,{name:"AES-GCM"},false,["decrypt"]);
const directoryPlain = await webcrypto.subtle.decrypt({name:"AES-GCM",iv:directoryEnvelope.encryptedPayload.slice(0,12),additionalData:enc.encode(`3105PATCH/v3/payload/${directoryEnvelope.packageID}`),tagLength:128},directoryKey,directoryEnvelope.encryptedPayload.slice(12));
const directoryPayload = parseBplist(new Uint8Array(directoryPlain));
assert.equal(directoryPayload.project.rules[0].relativePath,"Documents/gameassetbundles/uploaded-name.bin");
assert.equal(directoryPayload.project.rules[0].replacementFilename,"uploaded-name.bin");
console.log(".3105 schema-v3 smoke test passed (file and folder Link mapping, header, plist, encryption, digest, binary payload).");
