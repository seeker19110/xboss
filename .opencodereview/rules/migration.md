## Migration SQL (`migrations/NNNN_*.sql` — ADR-0003)

- **Append-only**: file migration đã có (đã áp production) không được sửa nội dung — diff sửa/xoá dòng trong file migration cũ là lỗi; thay đổi phải là file mới số kế tiếp, không trùng số với file khác.
- **Idempotent**: chạy lại không lỗi — `CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`, constraint/trigger/policy tạo trong khối kiểm tồn tại.
- Migration **đụng dữ liệu** (`UPDATE`/backfill/`ALTER COLUMN ... TYPE`/`DROP COLUMN`/`DROP TABLE`) phải ghi rõ trong comment đầu file là cần qua staging + `npm run db:migrate -- --dry-run`; backfill không được giả định dữ liệu cũ sạch (trùng/null/xung đột phải có cách xử lý rõ).
- Bảng tài chính/hợp đồng mới có `project_id`: bật RLS + policy 3 nhánh theo mẫu `0069_rls.sql` (ADR-0005); cấp quyền cho role ứng dụng `xboss_app` khi cần.
- Cột/bảng lọc nhiều (`project_id`, khoá ngoại, cột ngày dùng sắp xếp) có index; cột tiền dùng `NUMERIC`, cột ngày dùng `DATE`.
- `ALTER TABLE` khoá bảng lớn (`tasks`, `progress_dimensions`, `task_history`, `notifications`): tránh thao tác viết lại toàn bảng khi không cần; tạo index lớn cân nhắc `CONCURRENTLY` (lưu ý không chạy được trong transaction).
- Đổi schema phải đi kèm cập nhật `docs/ERD.md` (sinh bằng `npm run gen:erd`).
