# PROGRESS — XBoss

## 2026-09-25 — audit, đợt 1: tài khoản và phạm vi dự án

Trạng thái: đã triển khai code trên nhánh sửa lỗi; chưa xác nhận phát hành production.
Nền: `a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3`.

- Bỏ seed người dùng trong HTTP login/me; helper demo chặn production.
- Thêm bootstrap admin tường minh và reset admin không in mật khẩu/không nâng quyền.
- E2E seed tài khoản riêng trước login, không trông chờ production tự tạo người dùng.
- Chi phí bắt buộc có dự án hợp lệ và transaction có project scope.
- Chọn dự án dùng chính sách đọc kiểm cả tổ chức trước khi đặt cookie.
- Bổ sung test hồi quy route/helper và test PostgreSQL bootstrap/cách ly tổ chức.

Kiểm cục bộ ban đầu: 27 test route/helper pass, 0 fail, 0 skip; kiểm cú pháp TypeScript.
Chưa thay thế full CI: PostgreSQL, typecheck, build và E2E phải qua trên SHA mới trước merge.
Rà diff và CI đợt đầu: khôi phục nguyên giao thức login/2FA, chỉ bỏ seed;
reset admin giữ nguyên bộ đếm chống brute-force. Bổ sung 7 ca chống hồi quy login.
Sửa định dạng test theo cổng Prettier; không thay đổi hoặc bỏ qua cấu hình CI.
Không sửa dữ liệu, tài khoản hay cấu hình production trong đợt chỉnh sửa này.

Chi tiết, giới hạn kiểm chứng và chuyển đổi vận hành:
[Audit 2026-09-25](docs/ops/audit-2026-09-25.md).

## Lịch sử trước đợt này

Toàn bộ PROGRESS cũ (1.472.932 byte) được giữ nguyên nội dung tại
[PROGRESS-before-2026-09-25](docs/archive/PROGRESS-before-2026-09-25.md).
Git blob lưu trữ: `c5516b4dfa6e23e44f2fee3229934aa394310509`.
Đây là lưu trữ lịch sử, không đánh dấu lại các hạng mục cũ thành chưa hoàn thành.
Các liên kết tương đối trong bản lịch sử được viết theo vị trí gốc; có thể xem bản tại commit
`a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3` để giữ ngữ cảnh liên kết ban đầu.

## Những rủi ro audit vẫn mở

Cache/offline đa tài khoản và dự án; thống nhất toàn bộ helper đọc/ghi; số học tiền xuyên
SQL/JS/API; KPI portfolio và truy vấn tổng hợp; kiểm chứng restore và chuỗi nghiệm thu–thanh toán.
Không coi đợt 1 là hoàn thành toàn bộ kế hoạch cải tiến.
