/* =========================================================
 * EXPORTER — module đóng gói đầu ra (có thể thay thế)
 *
 * Muốn đổi định dạng đầu ra: viết một exporter mới với CÙNG giao diện
 * dưới đây rồi gán vào window.PatchExporter (hoặc thay file này).
 *
 *   window.PatchExporter = {
 *     id:          string   // mã định danh exporter
 *     description: string   // mô tả ngắn, hiển thị trên success card
 *     verified:    boolean  // true CHỈ KHI định dạng đã được xác minh là
 *                           // ứng dụng đích thực sự nhận. Giao diện dựa vào
 *                           // cờ này để báo "Verified" / "Unverified".
 *     async export({ entries, onProgress }) → Blob
 *       entries:    [{ path: string, data: Uint8Array }]
 *       onProgress: (fraction 0..1) => void
 *   }
 *
 * Tên file tải về và extension KHÔNG do exporter quyết định.
 * processor.js ghép <tên patch> + settings.outputExtension (config.js).
 *
 * ---------------------------------------------------------
 * Exporter hiện tại: "workspace-zip" — ZIP workspace, không phải gói .3105.
 *   • Container: ZIP chuẩn (phương thức store, không nén, tên file UTF-8).
 *   • Nội dung: <Patch>/settings.json, hai thư mục ánh xạ Application/
 *     và AppGroup/, cùng file payload theo cấu trúc tài liệu công khai.
 *   • Đây KHÔNG phải định dạng gói .3105: theo tài liệu, gói .3105 là một
 *     "envelope" được mã hoá, nhưng đặc tả của nó không được công bố.
 *     Đổi extension không làm file này trở thành gói hợp lệ.
 * ========================================================= */

window.PatchExporter = (() => {
    /* ---------- ZIP writer tối giản (store, không nén, không phụ thuộc thư viện) ---------- */
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
    }

    async function crc32(data, onProgress) {
        let crc = 0xffffffff;
        const CHUNK = 4 * 1024 * 1024;
        for (let off = 0; off < data.length; off += CHUNK) {
            const end = Math.min(off + CHUNK, data.length);
            for (let i = off; i < end; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
            if (onProgress) onProgress(end / data.length);
            await new Promise(r => setTimeout(r, 0)); // nhường UI
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function dosDateTime(d) {
        const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        const date = ((Math.max(1980, Math.min(2107, d.getFullYear())) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        return { time, date };
    }

    async function zip(entries, onProgress) {
        if (!Array.isArray(entries) || entries.length === 0 || entries.length > 0xffff) throw new Error("Invalid workspace entry count.");
        const enc = new TextEncoder();
        const { time, date } = dosDateTime(new Date());
        const parts = [], central = [];
        let offset = 0;
        const total = entries.reduce((s, e) => s + e.data.length, 0) || 1;
        let done = 0;

        for (const e of entries) {
            const name = enc.encode(e.path);
            const crc = await crc32(e.data, p => onProgress && onProgress((done + p * e.data.length) / total));
            done += e.data.length;
            const size = e.data.length;

            const lh = new DataView(new ArrayBuffer(30));
            lh.setUint32(0, 0x04034b50, true);
            lh.setUint16(4, 20, true);
            lh.setUint16(6, 0x0800, true); // UTF-8 names
            lh.setUint16(8, 0, true);      // store
            lh.setUint16(10, time, true);
            lh.setUint16(12, date, true);
            lh.setUint32(14, crc, true);
            lh.setUint32(18, size, true);
            lh.setUint32(22, size, true);
            lh.setUint16(26, name.length, true);
            lh.setUint16(28, 0, true);
            parts.push(lh.buffer, name, e.data);

            const ch = new DataView(new ArrayBuffer(46));
            ch.setUint32(0, 0x02014b50, true);
            ch.setUint16(4, 20, true);
            ch.setUint16(6, 20, true);
            ch.setUint16(8, 0x0800, true);
            ch.setUint16(10, 0, true);
            ch.setUint16(12, time, true);
            ch.setUint16(14, date, true);
            ch.setUint32(16, crc, true);
            ch.setUint32(20, size, true);
            ch.setUint32(24, size, true);
            ch.setUint16(28, name.length, true);
            ch.setUint32(42, offset, true);
            central.push(ch.buffer, name);

            offset += 30 + name.length + size;
        }

        const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, entries.length, true);
        end.setUint16(10, entries.length, true);
        end.setUint32(12, cdSize, true);
        end.setUint32(16, offset, true);

        return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
    }

    return {
        id: "workspace-zip",
        description: "ZIP workspace folder (not a .3105 package)",
        verified: false,
        export: ({ entries, onProgress }) => zip(entries, onProgress)
    };
})();
