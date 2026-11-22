# 3105 Patch Generator

Ứng dụng web tĩnh tạo **file `.3105`** từ một payload: chọn Bundle và Link đã cấu hình, nhập tên patch, chọn file rồi tải patch về. File được đọc và mã hóa trong trình duyệt; máy chủ không nhận payload.

Exporter dùng schema v3 và luồng mã hóa theo mã nguồn công khai của [3105](https://github.com/YangJiiii/3105), gồm Property List nhị phân, AES-GCM, SHA-256 và header `3105PATCH`. File tạo ra là package, không phải ZIP workspace. Extension `.3105` một mình không đủ; nội dung cũng được mã hóa đúng định dạng.

> **Khả năng tương thích:** web tạo package theo codec schema v3 công khai. Chưa xác nhận trực tiếp trên mọi phiên bản 3105; hãy thử nhập file vào app của bạn.

## Chạy thử

Cần Node.js, không cần cài package. Chạy `node serve.js`, rồi mở `http://localhost:5173`. Trang hosted cần HTTPS để trình duyệt cho phép Web Crypto.

## Cấu hình

Sửa `config.js` để đặt Bundle IDs và Link đích. Các giá trị mặc định có ví dụ; thay bằng Bundle ID và đường dẫn thật.

- Link kết thúc bằng `/`: xem Link là thư mục; giữ tên file tải lên.
- Link không có `/` cuối: xem Link là đường dẫn file đích; dùng tên cuối của Link làm tên file trong patch.
- Bundle ID `group.*` là App Group. Những Bundle ID khác là app thông thường.
- `maxFileSizeMB` giới hạn dung lượng tải lên; `acceptedExtensions` để trống thì nhận mọi đuôi file.

Generator tạo một rule thay thế cho Bundle/Link đã chọn. Package hiện là public (không mật khẩu). Bundle ID và Link phải tương thích với ứng dụng đích.

## Bản quyền

`exporter.js` chuyển thể luồng `PatchPackageCodec` từ dự án 3105 công khai. Dự án này được phát hành theo GNU GPL v3.0; xem [LICENSE](LICENSE) và [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Các thay đổi được đánh dấu tại các tệp tương ứng.
