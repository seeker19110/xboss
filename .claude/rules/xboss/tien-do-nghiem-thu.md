---
paths:
  - "lib/tien-do/**/*.ts"
  - "app/api/tasks/**/*.ts"
  - "app/api/approvals/**/*.ts"
  - "app/api/dimensions/**/*.ts"
  - "lib/tien-do/import.ts"
---

# Bất biến tiến độ & nghiệm thu (vùng rủi ro cao — docs/audit.md §4, §8)

- `% task` = ô checked / tổng ô; chỉ `= 1` khi đúng bằng tổng (không để `Math.round` biến 99.5%
  thành 100%). `% nhóm` = trung bình task. Đổi % → ghi `task_history`.
- `nghiem_thu` **không bao giờ** bị hạ cấp tự động; chỉ đặt/huỷ qua `/api/tasks/:id/approve` hoặc
  `/api/approvals` (Admin/PM, task đạt 100%, ghi `task_history`). PATCH thường chặn `nghiem_thu`.
- Bất biến `nghiem_thu ⇒ progress = 1` giữ ở **mọi** đường làm giảm %: tick ô, thêm/copy cột
  lưới, import Excel, thao tác hàng loạt (TRAPS.md §5). Duyệt/huỷ theo tầng không đụng task
  duyệt riêng (`approval_source`).
- `tre` suy ra từ `end_date < todayISO() && progress < 1` — so chuỗi ngày, "hôm nay" theo
  `Asia/Ho_Chi_Minh`.
- Đọc-sửa-ghi trên `tasks`/`work_packages` bọc `withTransaction` + `SELECT … FOR UPDATE`; thao tác
  lặp lại (mạng chập chờn) phải idempotent.
- Engine phê duyệt M46: `task_acceptance` miễn SoD khi có request đang chờ — test qua route thật
  với đúng người bấm (TRAPS.md §6).
- Mọi thay đổi ở đây: test hồi quy + `npm run test:mutation` còn đỏ đúng chỗ; review bắt buộc
  `audit-logic`.
