## Thông báo, Web Push, cảnh báo vận hành

- Thông báo đồng bộ **on-fetch** (`lib/dich-vu/thong-bao.ts`) — chạy mỗi lần người dùng mở chuông, nên truy vấn phải có index cho cột lọc/sắp xếp (`notifications`, `tasks`, `task_history` là bảng lớn).
- Loại thông báo mới: lọc theo **vai trò + dự án đang chọn**; dedup bằng cột khoá riêng + **partial unique index**; tự dọn bản ghi chưa đọc khi hết điều kiện. Thiếu một trong ba là sinh trùng/rò chéo dự án/thông báo "ma".
- Ngưỡng cảnh báo đọc từ `alert_rules` (`lib/van-hanh/alerts.ts`), không hardcode số.
- Web Push (`lib/van-hanh/push.ts`): thiếu VAPID key → mọi hàm gửi là no-op (không throw); subscription trả 404/410 phải bị xoá; lỗi gửi một thiết bị không làm hỏng cả lô.
- Nội dung push/email không chứa dữ liệu của dự án người nhận không có quyền xem.
