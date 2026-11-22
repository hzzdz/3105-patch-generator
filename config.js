/* =========================================================
 * 3105 Patch Generator — CẤU HÌNH
 *
 * bundles: Bundle ID của app (hoặc App Group, bắt đầu bằng "group.").
 *          Ví dụ: "com.example.app"  hoặc  "group.com.example.shared"
 *
 * links:   THƯ MỤC đích, relative path TÍNH TỪ GỐC CONTAINER của app.
 *          File upload được đặt vào thư mục này và GIỮ NGUYÊN TÊN.
 *              Ví dụ: "Library/Preferences"  →  …/Library/Preferences/<tên file upload>
 *          Dấu "/" ở cuối có hay không đều được.
 *          Không dùng đường dẫn tuyệt đối, "..", hay UUID của container.
 *
 * File tải về luôn là ZIP workspace (<tên patch>.zip), không phải gói .3105.
 *
 * Giao diện chỉ hiển thị "Bundle A / Link A ...", không hiển thị các giá trị bên dưới.
 * Lưu ý: file này được tải về trình duyệt, nên ai mở mã nguồn trang vẫn đọc được.
 * Giá trị còn để dạng BUNDLE_A / LINK_A được coi là "chưa cấu hình" và bị khoá trên giao diện.
 * ========================================================= */

const bundles = {
    A: "com.example.app",
    B: "com.example.second",
    C: "group.com.example.shared"
};

const links = {
    A: "Library/Preferences",
    B: "Documents",
    C: "Library/Application Support"
};

// Tuỳ chọn khác
const settings = {
    maxFileSizeMB: 500,       // Dung lượng file tối đa
    acceptedExtensions: []    // Ví dụ: [".plist", ".json"] — để trống = chấp nhận mọi file
};

window.PATCH_CONFIG = { bundles, links, settings };
