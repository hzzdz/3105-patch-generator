# 3105 Patch Workspace Builder

Ứng dụng web tĩnh (HTML/CSS/JS thuần) tạo **ZIP workspace** từ một file: chọn Bundle và Link đã cấu hình, đặt tên patch, chọn file rồi tải `<TênPatch>.zip`. Giao diện hiện tại được giữ nguyên; file được xử lý hoàn toàn trong trình duyệt.

> ZIP này là workspace có cấu trúc theo tài liệu 3105, **không phải gói `.3105`**. Công cụ không tạo, giải mã hay giả lập định dạng gói độc quyền.

Tài liệu tham khảo: [Hướng dẫn Patch workspace chính thức](https://github.com/YangJiiii/3105/blob/main/docs/PATCH_GUIDE.vi.md).

## Chạy

Cần Node.js; không cần cài package. Chạy `node serve.js`, sau đó mở `http://localhost:5173`. Có thể đổi cổng qua biến `PORT`, hoặc host thư mục như website tĩnh.

## Cấu hình

`config.js` đã có giá trị ví dụ hợp lệ để bạn thử ngay. Các identifier `com.example.*` và `group.com.example.shared` chỉ là dữ liệu mẫu, không trỏ đến một app thật. Trước khi dùng với thiết bị, thay chúng bằng identifier và đường dẫn của ứng dụng/dữ liệu bạn có quyền quản lý.

```js
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

const settings = {
    maxFileSizeMB: 500,
    acceptedExtensions: []
};
```

Bundle ID bắt đầu `group.` được đặt dưới `AppGroup/`; các ID khác nằm dưới `Application/`. Link là đường dẫn tương đối đến **thư mục** đích. Tên file tải lên được giữ nguyên. Các mục chưa cấu hình/sai sẽ bị khóa và cảnh báo trong giao diện. `acceptedExtensions: []` cho phép mọi đuôi file.

## Nội dung ZIP

ZIP có đúng một thư mục gốc `<TênPatch>/`, không lồng thêm thư mục thừa:

```text
MyPatch/
├── settings.json
├── Application/
│   └── com.example.app/Library/Preferences/settings.plist
└── AppGroup/
```

`settings.json` là cấu hình hợp lệ tối thiểu theo tài liệu (`schemaVersion: 1`, `fields: []`). Hai thư mục `Application/` và `AppGroup/` luôn được tạo, kể cả khi một thư mục chưa có payload. File tải lên được chép nguyên byte vào đúng đường dẫn và giữ nguyên tên. ZIP dùng định dạng chuẩn, không nén (store), tên đường dẫn UTF-8.

Tên đầu ra luôn `<TênPatch>.zip`. Không đổi extension sang `.3105`: extension không thể tạo ra gói 3105 thực.

## Giới hạn

- Tài liệu công khai mô tả workspace và việc 3105 đồng bộ workspace vào gói khi xuất trong ứng dụng. Tài liệu không xác nhận có thể nhập ZIP workspace trực tiếp. Hãy giải nén ZIP; để dùng trong 3105, chép thư mục patch vào `On My iPhone/3105/Patches/`, đồng bộ workspace trong ứng dụng, rồi dùng chức năng Export chính thức. Luồng này cần được xác nhận trên thiết bị/app đang dùng.
- Website không thể kiểm tra Bundle ID hoặc Link có tồn tại trên thiết bị đích hay không.
- Quy tắc tên patch, giới hạn độ sâu/số file và nhiều ràng buộc nội bộ của ứng dụng không được tài liệu định nghĩa đầy đủ; website áp dụng kiểm tra an toàn cơ bản riêng.
- Không tải file lên máy chủ. ZIP chứa file payload bạn đã chọn.

## Tệp trong project

| Tệp | Vai trò |
|---|---|
| `index.html`, `style.css` | Giao diện hiện có |
| `app.js` | Chọn mục, kiểm tra, upload, trạng thái và tải xuống |
| `processor.js` | Kiểm tra config, xây workspace và tên ZIP |
| `exporter.js` | Tạo ZIP chuẩn trong trình duyệt |
| `config.js` | Bundle, Link và giới hạn file cần bạn cấu hình |
| `serve.js` | Server tĩnh để chạy thử |
