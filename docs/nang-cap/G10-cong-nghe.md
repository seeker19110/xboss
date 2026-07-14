# G10 — Công nghệ (chuyển đổi số)

> Từ M31 (chuyển đổi số & công nghệ). Đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.

Dashboard tổng hợp công nghệ — chủ yếu **gom & nhúng**, không tự xây camera/IoT/BIM engine (ngoài phạm vi, phụ thuộc hạ tầng ngoài): CDE (link nhanh tới `/documents`, M20), giám sát bằng công nghệ (camera/album ảnh drone theo mốc tiến độ), phần mềm QLDA (link P6/MS Project ngoài), tích hợp BIM (viewer nhúng iframe), an toàn thông tin & trạng thái hệ thống (admin).

- `tech_links` (`category` bim/schedule/camera/drone/other, `embed` true = nhúng iframe — **chỉ cho host trong whitelist** `EMBED_HOST_WHITELIST`, chống nhúng bậy/CSP; whitelist hiện gồm domain Autodesk APS/ACC, Matterport, Smartsheet — **là danh sách suy đoán, cần công ty xác nhận domain thật trước khi dùng production**) + `progress_albums` (mốc tiến độ). Album ảnh drone **tái dùng `task_photos`** qua cột `album_id` (`task_id` không có `NOT NULL` nên ảnh không gắn task được phép `task_id=NULL` — xác nhận đúng nhánh mặc định của đặc tả, không cần bảng `album_photos` riêng). `lib/tech.ts::systemStatus()` — tái dùng logic tính dung lượng `data/uploads/` sẵn có (không viết lại), dùng chung cho panel admin.
- API: `GET/POST /api/tech-links` (+ `:id`), `GET/POST /api/progress-albums` (+ ảnh), `GET /api/tech/system-status` (chỉ admin). Không có notification mới (module tổng hợp).
- UI (`/tech`): hub tab CDE/BIM/Giám sát/Phần mềm/Hệ thống. Quyền cấu hình link/embed: `CAN.manageTech` (admin/pm); panel Hệ thống chỉ admin (kiểm `user.role !== 'admin'` trực tiếp, không qua `CAN.manageTech`, PM không thấy).

## Test

`tests/tech.test.ts` (thuần: `validateTechLink` chặn URL không https/embed ngoài whitelist; tích hợp: lọc category, album gắn ảnh); `e2e/authed/tech.spec.ts` (desktop+mobile+axe, không load host ngoài trong test).
