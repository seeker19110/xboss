# CONVENTIONS — Sổ quy ước dự án

> Mỗi pattern lặp lại có MỘT cách đúng duy nhất. Tính năng mới & mọi lần sửa phải đối chiếu.
> Lệch quy ước = phát hiện Nhóm 12 khi audit. Đổi quy ước lớn → ghi ADR.
> (Bản mẫu — copy thành `docs/CONVENTIONS.md` ở dự án đích rồi điền; xem `docs/framework/project-completion.md` Pha 1.)

| Pattern | Cách đúng duy nhất | File ví dụ chuẩn | Ghi chú |
|---------|--------------------|------------------|---------|
| Validate đầu vào | (vd) Zod schema tại ranh giới server | `lib/validation/…` | |
| Dạng lỗi API | (vd) `{ error: { code, message } }` + HTTP status đúng | | |
| Check quyền | (vd) luôn ở server, một lớp duy nhất | | |
| Trạng thái UI | đủ 4 trạng thái loading/empty/error/success | | |
| Thời gian / tiền tệ | UTC · số nguyên đơn vị nhỏ nhất (không float) | | |
| Đặt tên / cấu trúc thư mục | | | |
| i18n / theme | | | |

## Đang có NHIỀU KIỂU — cần hợp nhất (đầu vào cho kế hoạch hoàn thiện)
- (vd) Thông báo lỗi form: 2 kiểu (inline vs toast) → chốt inline, hợp nhất ở W-…
