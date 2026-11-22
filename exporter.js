/*
 * 3105 package exporter, adapted from the official GPL-3.0 PatchPackageCodec.
 * See LICENSE and THIRD_PARTY_NOTICES.md. This browser implementation creates
 * public (not password-protected) schema-v3 packages using Web Crypto.
 */
window.PatchExporter = (() => {
    const MAGIC = new TextEncoder().encode("3105PATCH\0");
    const utf8 = new TextEncoder();
    const concat = (...parts) => {
        const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let offset = 0;
        for (const part of parts) { out.set(part, offset); offset += part.length; }
        return out;
    };
    const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
    const uuid = () => crypto.randomUUID().toUpperCase();
    const asBytes = value => value instanceof Uint8Array ? value : new Uint8Array(value);

    // Minimal binary Property List writer for the Foundation value types used
    // by PatchPackageCodec: strings, dates, booleans, integers, data, arrays,
    // and dictionaries.
    function plist(value) {
        const nodes = [];
        function add(v) {
            if (v && v.__plistDate instanceof Date) {
                const id = nodes.length; nodes.push({ type: "date", value: v.__plistDate }); return id;
            }
            if (v instanceof Uint8Array) { const id=nodes.length; nodes.push({type:"data",value:v}); return id; }
            if (typeof v === "string") { const id=nodes.length; nodes.push({type:"string",value:v}); return id; }
            if (typeof v === "boolean") { const id=nodes.length; nodes.push({type:"bool",value:v}); return id; }
            if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) { const id=nodes.length; nodes.push({type:"int",value:v}); return id; }
            if (Array.isArray(v)) { const id=nodes.length; nodes.push({type:"array",refs:[]}); nodes[id].refs=v.map(add); return id; }
            if (v && typeof v === "object") {
                const id=nodes.length; nodes.push({type:"dict",keys:[],values:[]});
                for (const [k,x] of Object.entries(v)) { nodes[id].keys.push(add(k)); nodes[id].values.push(add(x)); }
                return id;
            }
            throw new Error("Unsupported Property List value.");
        }
        const top = add(value);
        const refSize = n => n <= 0x100 ? 1 : n <= 0x10000 ? 2 : n <= 0x100000000 ? 4 : 8;
        const writeUInt = (n, size) => { const b=new Uint8Array(size); for(let i=size-1;i>=0;i--){b[i]=n%256;n=Math.floor(n/256);} return b; };
        const markerLength = (marker, length) => {
            if (length < 15) return Uint8Array.of(marker | length);
            let size = length <= 0xff ? 1 : length <= 0xffff ? 2 : length <= 0xffffffff ? 4 : 8;
            const power = Math.log2(size);
            return concat(Uint8Array.of(marker | 15, 0x10 | power), writeUInt(length, size));
        };
        const encoded = nodes.map(node => {
            switch(node.type) {
            case "bool": return Uint8Array.of(node.value ? 0x09 : 0x08);
            case "int": { let size=node.value<=0xff?1:node.value<=0xffff?2:node.value<=0xffffffff?4:8; return concat(Uint8Array.of(0x10|Math.log2(size)),writeUInt(node.value,size)); }
            case "date": { const b=new ArrayBuffer(8); new DataView(b).setFloat64(0,(node.value.getTime()-Date.UTC(2001,0,1))/1000,false); return concat(Uint8Array.of(0x33),new Uint8Array(b)); }
            case "data": return concat(markerLength(0x40,node.value.length),node.value);
            case "string": {
                if (/^[\x00-\x7f]*$/.test(node.value)) { const b=utf8.encode(node.value); return concat(markerLength(0x50,b.length),b); }
                const u16=new Uint8Array(node.value.length*2); for(let i=0;i<node.value.length;i++){const c=node.value.charCodeAt(i);u16[i*2]=c>>8;u16[i*2+1]=c&255;}
                return concat(markerLength(0x60,node.value.length),u16);
            }
            case "array": return concat(markerLength(0xa0,node.refs.length),...node.refs.map(i=>writeUInt(i,refSize(nodes.length))));
            case "dict": return concat(markerLength(0xd0,node.keys.length),...node.keys.map(i=>writeUInt(i,refSize(nodes.length))),...node.values.map(i=>writeUInt(i,refSize(nodes.length))));
            default: throw new Error("Unsupported Property List node.");
            }
        });
        const objectRefSize=refSize(nodes.length), offsets=[]; let cursor=8;
        for(const b of encoded){offsets.push(cursor);cursor+=b.length;}
        const offsetTableOffset=cursor, offsetSize=refSize(offsetTableOffset);
        const trailer=concat(new Uint8Array(6),Uint8Array.of(offsetSize,objectRefSize),writeUInt(nodes.length,8),writeUInt(top,8),writeUInt(offsetTableOffset,8));
        return concat(utf8.encode("bplist00"),...encoded,...offsets.map(n=>writeUInt(n,offsetSize)),trailer);
    }

    async function digest(data) { return new Uint8Array(await crypto.subtle.digest("SHA-256",data)); }
    async function encode(project) {
        if (!crypto.subtle) throw new Error("Secure file creation requires HTTPS or localhost.");
        const key=crypto.getRandomValues(new Uint8Array(32));
        const replacementDigests={};
        for (const rule of project.rules) replacementDigests[rule.id]=await digest(rule.replacementData);
        const payload=plist({project,replacementDigests});
        const nonce=crypto.getRandomValues(new Uint8Array(12));
        const aesKey=await crypto.subtle.importKey("raw",key,{name:"AES-GCM"},false,["encrypt"]);
        const aad=utf8.encode(`3105PATCH/v3/payload/${project.id}`);
        const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:aad,tagLength:128},aesKey,payload));
        const fingerprint=await digest(key);
        const envelope=plist({
            schemaVersion:3,
            packageID:project.id,
            isPasswordProtected:false,
            publicContentKey:key,
            keyFingerprint:fingerprint,
            encryptedPayload:concat(nonce,cipher)
        });
        return new Blob([MAGIC,envelope],{type:"application/octet-stream"});
    }
    return { id:"3105-official-codec-v3", description:"3105 public patch package (schema v3)", verified:false, export:({project})=>encode(project) };
})();
