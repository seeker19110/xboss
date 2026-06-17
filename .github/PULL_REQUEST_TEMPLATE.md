<!-- Tiêu đề PR theo conventional prefix: feat:/fix:/chore:/ci:/docs: + mô tả tiếng Việt -->

## Thay đổi gì
<!-- Tóm tắt ngắn: làm gì, ở đâu, vì sao. -->

## Loại thay đổi
- [ ] feat (tính năng mới)
- [ ] fix (sửa lỗi)
- [ ] chore / ci / docs / refactor

## Checklist (Definition of Done)
- [ ] `npm run lint` và `npm run typecheck` xanh
- [ ] `npm run build` chạy được
- [ ] `npm test` pass (test tích hợp DB chạy trong CI với Postgres)
- [ ] Route handler mới gọi `getCurrentUser()` + trả 401 khi chưa đăng nhập; kiểm quyền qua `CAN` / `canTouchTask`
- [ ] Validate input; không lộ secret; thao tác nhạy cảm có rate-limit; cron bảo vệ bằng `CRON_SECRET` qua header Bearer
- [ ] SQL dùng helper `lib/db` với placeholder `?` — không nối chuỗi giá trị
- [ ] Đã tự review diff đúng phạm vi; cập nhật test khi đổi logic
- [ ] CI (`.github/workflows/ci.yml`) xanh

## Ảnh hưởng / rủi ro
<!-- Migration schema thủ công? Đổi biến môi trường? Ảnh hưởng dữ liệu cũ? -->

## Cách kiểm thử
<!-- Các bước reviewer có thể làm để xác nhận. -->
