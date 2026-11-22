/* =========================================================
 * 3105 Patch Generator — CẤU HÌNH
 *
 * bundles: Bundle ID của app (hoặc App Group, bắt đầu bằng "group.").
 *          Ví dụ: "com.example.app"  hoặc  "group.com.example.shared"
 *
 * links:   Đường dẫn tương đối TÍNH TỪ GỐC CONTAINER của app.
 *          Không có "/" cuối: đây là ĐƯỜNG DẪN FILE đích; file upload được
 *          đặt tại đó (có thể đổi tên theo phần cuối của Link).
 *          Có "/" cuối: đây là THƯ MỤC đích; file upload được đặt vào đó
 *          và GIỮ NGUYÊN TÊN.
 *              Ví dụ: "Library/Preferences/" → …/Library/Preferences/<tên file upload>
 *              Ví dụ: "Library/Preferences/app.plist" → …/Library/Preferences/app.plist
 *          Không dùng đường dẫn tuyệt đối, "..", hay UUID của container.
 *
 * File tải về là package .3105 schema v3; codec chạy hoàn toàn trong trình duyệt.
 *
 * Giao diện chỉ hiển thị "Bundle A / Link A ...", không hiển thị các giá trị bên dưới.
 * Lưu ý: file này được tải về trình duyệt, nên ai mở mã nguồn trang vẫn đọc được.
 * Giá trị còn để dạng BUNDLE_A / LINK_A được coi là "chưa cấu hình" và bị khoá trên giao diện.
 * ========================================================= */

const Bundles = {
    A: "com.hzz.game",
    B: "com.hdz.game"
};

const Links = {
    A: "Documents/contentcache/Optional/ios/optionalavatarres/gameassetbundles/optionalab_avatar_66.1GZrX1l5Sm~2FgqXYqB7dDyULWdn4~3D",
    B: "Documents/contentcache/Optional/ios/optionalavatarres/gameassetbundles/optionalab_avatar_38.OGKQHD4lBsPTBXw2QMHH3pwjUpE~3D",
    C: "Documents/contentcache/Optional/ios/optionalavatarres/gameassetbundles/optionalab_avatar_68.mkIcgw~2FuXDgA~2Ftt4a~2FDHdRIIp7g~3D"
};

// Tuỳ chọn khác
const settings = {
    maxFileSizeMB: 500,       // Dung lượng file tối đa
    acceptedExtensions: []    // Ví dụ: [".plist", ".json"] — để trống = chấp nhận mọi file
};

window.PATCH_CONFIG = { bundles, links, settings };
