/* =========================================================
 * BỘ XỬ LÝ PATCH
 *
 * 1. PatchSpec: kiểm tra Bundle ID / relative path và tính đường dẫn
 *    của file upload trong workspace, theo tài liệu công khai:
 *      https://github.com/YangJiiii/3105/blob/main/docs/PATCH_GUIDE.md
 *      <PatchName>/Application/<bundle-id>/<Link>
 *      <PatchName>/AppGroup/group.<name>/<Link>
 *    Link without a trailing slash is the complete target file path. A Link
 *    ending in "/" is a target folder; the uploaded filename is appended.
 * 2. buildPatch: ánh xạ file tải lên thành PatchProject theo model chính thức
 *    rồi mã hoá thành gói .3105 schema v3.
 *
 * Luồng mã hoá nằm trong exporter.js; file không rời khỏi trình duyệt.
 * ========================================================= */

const PatchSpec = (() => {
    // --- Theo tài liệu ---
    // • Thư mục ngay dưới Application/ là bundle ID; ID dưới AppGroup/ phải bắt đầu bằng "group."
    // • Relative path tính từ gốc container; cấm đường dẫn tuyệt đối và ".." (traversal).
    // --- Quy tắc riêng của website (tài liệu KHÔNG định nghĩa) ---
    // • Dạng bundle ID: các đoạn chữ/số/gạch ngang nối bằng dấu chấm (theo quy ước reverse-DNS của Apple).
    // • Tên patch: chữ, số, ".", "-", "_".
    // • Link không có "/" cuối là đường dẫn tệp đích hoàn chỉnh.
    //   Thêm "/" cuối để coi Link là thư mục và giữ tên file upload.
    const NAME_RE = /^[A-Za-z0-9._-]+$/;
    const ID_RE = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
    const PLACEHOLDER_RE = /^(BUNDLE|LINK)_[A-Z0-9]+$/;
    const CONTROL_RE = /[\u0000-\u001f\u007f]/;

    const isPlaceholder = v => typeof v !== "string" || v.trim() === "" || PLACEHOLDER_RE.test(v.trim());

    function validateBundleId(id) {
        if (isPlaceholder(id)) return "is not configured";
        if (id !== id.trim()) return "has leading or trailing spaces";
        if (id.length > 255) return "is too long";
        if (/[\/\\]/.test(id)) return "must not contain slashes";
        if (!ID_RE.test(id) || id.split(".").some(part => !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(part))) return "is not a valid identifier";
        return null;
    }

    function validateRelPath(p) {
        if (isPlaceholder(p)) return "is not configured";
        if (p !== p.trim()) return "has leading or trailing spaces";
        if (p.length > 1024) return "is too long";
        if (p.startsWith("/") || p.startsWith("~") || /^[A-Za-z]:/.test(p)) return "must be relative, not absolute";
        if (p.includes("\\")) return "must use forward slashes";
        if (CONTROL_RE.test(p)) return "contains control characters";
        const body = p.endsWith("/") ? p.slice(0, -1) : p;
        const segs = body.split("/");
        if (segs.some(s => s === "")) return "contains an empty path segment";
        if (segs.some(s => s === "..")) return "must not contain '..'";
        if (segs.some(s => s === ".")) return "must not contain '.' segments";
        return null;
    }

    function validateFileName(name) {
        if (!name || name === "." || name === "..") return "invalid file name";
        if (/[\/\\]/.test(name) || CONTROL_RE.test(name)) return "file name contains invalid characters";
        return null;
    }

    const scopeFor = id => (id.startsWith("group.") ? "AppGroup" : "Application");

    // Builds the workspace path of the uploaded file. The uploaded file name is kept as-is.
    // Never echoes config values in errors.
    function plan({ bundleKey, linkKey, bundleId, relPath, patchName, fileName }) {
        const e1 = validateBundleId(bundleId);
        if (e1) return { error: `Bundle ${bundleKey} in config.js ${e1}.` };
        const e2 = validateRelPath(relPath);
        if (e2) return { error: `Link ${linkKey} in config.js ${e2}.` };
        if (!NAME_RE.test(patchName)) return { error: "Invalid patch name." };
        const e3 = validateFileName(fileName);
        if (e3) return { error: `Uploaded ${e3}.` };
        const isDirectory = relPath.endsWith("/");
        const target = relPath.replace(/\/$/, "");
        const destination = isDirectory ? `${target}/${fileName}` : target;
        return { entryPath: `${patchName}/${scopeFor(bundleId)}/${bundleId}/${destination}` };
    }

    return { NAME_RE, isPlaceholder, validateBundleId, validateRelPath, scopeFor, plan };
})();

async function buildPatch({ bundleKey, linkKey, patchName, file, onProgress }) {
    const { bundles, links } = window.PATCH_CONFIG;
    const exporter = window.PatchExporter;
    if (!exporter || typeof exporter.export !== "function") throw new Error("No exporter module loaded.");

    const bundleId = bundles[bundleKey];
    const relPath = links[linkKey];
    const plan = PatchSpec.plan({ bundleKey, linkKey, bundleId, relPath, patchName, fileName: file.name });
    if (plan.error) throw new Error(plan.error);
    if (new TextEncoder().encode(patchName).length > 120) throw new Error("Patch name is too long (maximum 120 UTF-8 bytes).");

    const isDirectory = relPath.endsWith("/");
    const linkTarget = relPath.replace(/\/$/, "");
    const slash = linkTarget.lastIndexOf("/");
    const relativePath = isDirectory ? linkTarget : linkTarget.slice(0, slash);
    const replacementFilename = isDirectory ? file.name : linkTarget.slice(slash + 1);
    if (!relativePath) throw new Error("Link must include a folder path before the target filename.");
    if (new TextEncoder().encode(replacementFilename).length > 255) throw new Error("Target filename is too long (maximum 255 UTF-8 bytes).");
    if (new TextEncoder().encode(relativePath).length > 4096) throw new Error("Link path is too long (maximum 4096 UTF-8 bytes).");

    onProgress && onProgress(5, "Reading file…");
    const data = new Uint8Array(await file.arrayBuffer());

    onProgress && onProgress(45, "Creating secure .3105 package…");
    const id = crypto.randomUUID().toUpperCase();
    const now = new Date();
    const project = {
        id,
        name: patchName,
        author: "",
        isPrivate: false,
        createdAt: { __plistDate: now },
        updatedAt: { __plistDate: now },
        bundleIdentifiers: [bundleId],
        directories: [],
        rules: [{
            id: crypto.randomUUID().toUpperCase(),
            bundleID: bundleId,
            relativePath,
            replacementFilename,
            replacementData: data
        }]
    };
    const blob = await exporter.export({
        project,
        onProgress: q => onProgress && onProgress(45 + Math.round(q * 50), "Encrypting .3105 package…")
    });

    onProgress && onProgress(100, "Done");
    return {
        blob,
        filename: patchName + ".3105",
        verified: exporter.verified === true,
        format: exporter.description || exporter.id
    };
}
