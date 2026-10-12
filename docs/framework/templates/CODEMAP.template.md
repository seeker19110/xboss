# CODEMAP.md — muốn đổi X thì sửa ở đâu

> Bảng tra cứu, **không phải** tài liệu đọc từ đầu. Mỗi dòng: **muốn gì → sửa file/thư mục nào → rồi
> phải chạy lại gì** (lệnh/cổng/CI). Khác `docs/FEATURE-MAP.md` (trả lời "có tính năng gì") và
> `docs/CONVENTIONS.md` (trả lời "viết đúng thì viết thế nào") — file này trả lời **"chạm vào đâu"**.
>
> Cách dùng: trước khi sửa một thứ đã quen mà quên chi tiết → tra ở đây trước khi đọc code từ đầu.
> Sau khi đổi cấu trúc (đổi tên thư mục, tách package, đổi lệnh CI) → cập nhật dòng liên quan **trong
> cùng PR**. Repo lớn/nhiều package → tách `<package>/CODEMAP.md` riêng, dòng ở đây chỉ tóm tắt +
> trỏ tới file con.

_Chưa có mục nào. Lập lần đầu ở Pha 0 của `/completion` (đọc code + package.json/Makefile thật, không
đoán); cập nhật mỗi khi cấu trúc đổi._

## Mẫu bảng

| Muốn | Sửa | Rồi chạy |
| --- | --- | --- |
| <thay đổi thường gặp, vd "Thêm route mới"> | <file/thư mục cụ thể> | <lệnh/cổng cần chạy lại, vd `npm run test:e2e`> |
