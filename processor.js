/* =========================================================
 * BỘ XỬ LÝ PATCH
 *
 * 1. PatchSpec: kiểm tra Bundle ID / relative path và tính đường dẫn
 *    của file upload trong workspace, theo tài liệu công khai:
 *      https://github.com/YangJiiii/3105/blob/main/docs/PATCH_GUIDE.md
 *      <PatchName>/Application/<bundle-id>/<link>/<tên file upload>
 *      <PatchName>/AppGroup/group.<name>/<link>/<tên file upload>
 * 2. buildPatch: đọc file, giao cho exporter (exporter.js) đóng gói,
 *    đặt tên file tải về = <tên patch> + settings.outputExtension.
 *
 * Định dạng đóng gói do exporter quyết định; xem exporter.js để biết
 * định dạng hiện tại và trạng thái xác minh của nó.
 * ========================================================= */

const PatchSpec = (() => {
    // --- Theo tài liệu ---
    // • Thư mục ngay dưới Application/ là bundle ID; ID dưới AppGroup/ phải bắt đầu bằng "group."
    // • Relative path tính từ gốc container; cấm đường dẫn tuyệt đối và ".." (traversal).
    // --- Quy tắc riêng của website (tài liệu KHÔNG định nghĩa) ---
    // • Dạng bundle ID: các đoạn chữ/số/gạch ngang nối bằng dấu chấm (theo quy ước reverse-DNS của Apple).
    // • Tên patch: chữ, số, ".", "-", "_".
    // • Link luôn là THƯ MỤC đích (dấu "/" cuối có hay không đều được); file upload giữ nguyên tên.
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
        if (!ID_RE.test(id)) return "is not a valid identifier";
        if (id.startsWith("group.") && !/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/.test(id.slice(6))) return "is not a valid App Group identifier";
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
        const dir = relPath.replace(/\/$/, "");
        return { entryPath: `${patchName}/${scopeFor(bundleId)}/${bundleId}/${dir}/${fileName}` };
    }

    return { NAME_RE, isPlaceholder, validateBundleId, validateRelPath, scopeFor, plan };
})();

async function buildPatch({ bundleKey, linkKey, patchName, file, onProgress }) {
    const { bundles, links } = window.PATCH_CONFIG;
    const exporter = window.PatchExporter;
    if (!exporter || typeof exporter.export !== "function") throw new Error("No exporter module loaded.");

    const p = PatchSpec.plan({
        bundleKey, linkKey,
        bundleId: bundles[bundleKey], relPath: links[linkKey],
        patchName, fileName: file.name
    });
    if (p.error) throw new Error(p.error);

    onProgress && onProgress(5, "Reading file…");
    const data = new Uint8Array(await file.arrayBuffer());

    onProgress && onProgress(35, "Packaging…");
    const workspace = [
        { path: `${patchName}/`, data: new Uint8Array(0) },
        { path: `${patchName}/settings.json`, data: new TextEncoder().encode('{\n  "schemaVersion": 1,\n  "fields": []\n}\n') },
        { path: `${patchName}/Application/`, data: new Uint8Array(0) },
        { path: `${patchName}/AppGroup/`, data: new Uint8Array(0) },
        { path: p.entryPath, data }
    ];
    const blob = await exporter.export({
        entries: workspace,
        onProgress: q => onProgress && onProgress(35 + Math.round(q * 60), "Packaging…")
    });

    onProgress && onProgress(100, "Done");
    return {
        blob,
        filename: patchName + ".zip",
        verified: exporter.verified === true,
        format: exporter.description || exporter.id
    };
}
