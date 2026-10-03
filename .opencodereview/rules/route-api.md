## Checklist route API (API là ranh giới bảo mật DUY NHẤT — trang chỉ redirect phía client)

- Handler gọi `getCurrentUser()` (`@/lib/bao-mat/auth`) và trả **401** (không phải 403) khi chưa đăng nhập, **trước** mọi truy vấn dữ liệu. Ngoại lệ có chủ đích: `app/api/v1/**` xác thực bằng `requireApiKey` (API key có scope); route cron xác thực bằng `checkCronSecret`; `/api/project` công khai.
- Có `export const dynamic = "force-dynamic"`.
- Kiểm quyền đúng nghiệp vụ qua map `CAN.*` / `canTouchTask` / `canTouchPackage` — chỉ "đã đăng nhập" là chưa đủ. **Đối chiếu route anh em cùng tài nguyên**: nếu `POST` có `canTouchTask` mà `GET`/`PATCH`/`DELETE` cùng file/cùng resource thiếu thì là lỗi thật (đã xảy ra với `tasks/:id/photos`, `.../documents`). Vai trò chỉ-xem (`bch`/`cdt`/`viewer`, `VIEW_ONLY_ROLES`) không được ghi qua cổng quyền dành cho xem (vd dùng `CAN.view*` làm cổng ghi).
- **Phạm vi dự án (M22)**: không tin thẳng `projectId` từ body/query khi ghi — chốt qua `chotProjectIdChoGhi` (`lib/ha-tang/projects.ts`); truy vấn danh sách/tài chính phải lọc `project_id` của dự án đang chọn. Sửa/xoá dữ liệu cá nhân (comment, note) kiểm đúng người tạo hoặc vai trò quản lý.
- Validate input (kiểu, khoảng giá trị, độ dài, enum) trước khi ghi; trả 400/422 kèm thông điệp tiếng Việt, không phơi stack trace hay chi tiết SQL.
- Upload: giới hạn dung lượng; kiểm mime thật khi khả thi (không chỉ tin `Content-Type` client); tên file do server sinh, ghi qua `lib/nen/storage.ts`.
- Cookie phiên đặt mới phải đủ `httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`.
- **Route chỉ là ranh giới HTTP (ADR-0008)**: kiểm phiên/quyền, đọc tham số, gọi dịch vụ ở `lib/<miền>/`, bọc `NextResponse`. Logic nghiệp vụ dày đặc viết thẳng trong route là dấu hiệu sai chỗ (chỉ nêu khi gây trùng lặp/khó test thật).
- SQL qua helper `lib/db` với `?`; số `?` khớp số tham số.
