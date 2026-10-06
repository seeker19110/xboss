# QUALITY-FINAL-1 — Kế hoạch thực thi và checkpoint 2026-10-06

Tiếp tục [PLAN đã duyệt](../nang-cap/AUDIT-2026-09-25/PLAN.md) và sổ nợ GitHub #572.
Chủ dự án yêu cầu lập kế hoạch rồi thực thi đầu-cuối ngày 06/10/2026. Không tạo scope ERP/AI mới.
Đây là kế hoạch thi hành, không phải xác nhận hoàn tất 54 tiêu chí hoặc production.

## Baseline và cách xác nhận

Main được đọc lại tại `a891d5aebdbda82ab268d3e86c35065e54eb1db4`.
Các PR đang mở khi bắt đầu: #562, #565, #566, #567, #568, #569, #571.
PR #573 xử lý dependency mới được CI xác nhận. Trước mỗi tích hợp phải đọc lại HEAD.
Chỉ đóng công việc khi có commit, test thật, review cần thiết và residual risk rõ ràng.

Container cục bộ không phân giải được github.com, không có full checkout/dependencies/PostgreSQL.
Dùng GitHub Actions để dựng candidate và chạy cổng thật; không gọi đó là test local hoặc subagent.
Không có phiên subagent được xác nhận. Công việc chồng file chạy tuần tự.

## Trình tự công việc

### W0 — Gỡ chặn CI, liên quan N02/N04

Cập nhật có kiểm soát dependency có advisory. Giữ mọi threshold và skip policy.
Khoá package-lock.json, CI và PROGRESS cho một đầu mối; không nâng hàng loạt.
Hoàn tất khi audit, formatter, lint, typecheck, static checks, PostgreSQL release gate,
coverage, build và E2E đạt trên HEAD cuối. Full gate không được thay bằng npm ci.

### W1 — Deploy an toàn, S03 / N03–N05

Tái dùng #571, kiểm preflight trước reset/clean/npm, cleanup và ghim SHA.
Review bảo mật/logic độc lập; đồng bộ DEPLOY/PROGRESS trước tích hợp.
Người vận hành được cấp quyền chuẩn bị /etc/xboss/migrate.env ngoài checkout, mode 0600,
đúng ownership và role. Không đưa migrator vào runtime, không fallback DATABASE_URL.
Preflight, deploy đúng SHA, health/smoke và rollback là bằng chứng riêng của môi trường thật.

### W2 — Phạm vi dữ liệu, S01/S02/S03 / N04/N06

Tái dùng #562, inventory #565, các slice payment #567/#568. #565 không phải quản lý kho.
Kiểm từng method/caller/parent theo org/project; bỏ NULL-as-wide ở route trước cutover membership.
Đầu vào không hợp lệ không được thay đổi một phần dữ liệu. Batch phải nguyên tử.
Kiểm âm khác tổ chức, khác dự án, mất quyền, thiếu dự án và parent lệch scope bằng role phù hợp.
Không đánh dấu xong toàn miền chỉ từ một PR GET hoặc PATCH.

### W3 — Tiền, báo cáo và chuỗi nghiệp vụ, S09–S13 / N08

Giữ helper exact có sẵn; chuyển caller từng miền SQL/DTO/UI/Excel/PDF.
Không đổi global parser, không reprice lịch sử, giữ quy tắc IPC SUM rồi round tổng.
Portfolio task-weighted sau S02c/S03 và khi giải phóng projects.ts; empty/unavailable rõ ràng.
Nghiệm thu chuỗi tiến độ–nghiệm thu–IPC/VO–thanh toán cùng snapshot và test concurrency.
Quy tắc vượt hợp đồng IPC vẫn là cảnh báo đã duyệt, không tự thêm hard-cap toàn hệ.

### W4 — Offline an toàn, S04–S08 / N07

Giữ public-cache-only và quarantine queue legacy. Context/device/vault và receipt/precondition
phải đạt trước mở enqueue/replay. Không tự nhận chủ hoặc xoá queue cũ, không lưu khoá thô.
Kiểm hai tài khoản, hai tab, response muộn, thu hồi quyền, quota/abort và Safari/iOS thật.
Phân biệt chưa lưu, lưu cục bộ, máy chủ xác nhận, xung đột và bị từ chối; không báo lưu giả.

### W5 — Phục hồi, S14 / N09

Tích hợp #566 trước #569; chạy lại trên bản kết hợp. Kiểm DB, attachments, key và WAL/PITR,
backup hỏng/thiếu và wrong-target trong disposable có identity và không egress.
RPO 5 phút, RTO 60 phút, retention 35 ngày là mục tiêu cần đo, chưa phải kết quả.
Smoke PostgreSQL không thay full recovery drill; snapshot thật chỉ khi đủ quyền.

### W6 — Nghiệm thu cuối và phát hành, S15/S16 / N10–N12

Đồng bộ README, PROGRESS, DEPLOY, goal và các tài liệu thực sự bị ảnh hưởng.
Ma trận 54 AC phải trỏ đến cùng release SHA; không cộng kết quả của nhiều PR thành nghiệm thu.
Giữ review độc lập, UAT và owner acceptance. D09: pilot 48 giờ, 25% trong 24 giờ,
mở rộng và theo dõi 7 ngày; không giả lập thời gian vận hành bằng test tức thời.
Chỉ ghi CODE_COMPLETE khi code/test đạt; RELEASE_VERIFIED cần bằng chứng môi trường thật.

## Checkpoint thực thi dependency

Workflow ứng viên chạy trên Node 24.21.0/npm 11.19.0, không dùng secret production.
Run đầu `37488920638` xác nhận source-map-js 1.2.1 lên 1.2.2 là thay đổi hẹp và npm ci đạt,
nhưng audit phát hiện thêm sharp <0.35.5 (GHSA-wq5f-xc86-pv6w), nên dừng và chưa xuất candidate.

Run `37489272479`, job `112357390408`, source `1627a7ad3a3315d5075bb0b6344fc432be4332a8`:

- PASS: npm tạo lockfile; chỉ source-map-js, sharp và binary sharp/libvips thay đổi.
- PASS: source-map-js 1.2.2; sharp 0.35.5 cùng binary tương ứng.
- PASS: npm ci --ignore-scripts --no-audit --no-fund.
- PASS: npm audit --omit=dev --audit-level=high; báo 0 vulnerabilities tại lần chạy này.
- PASS: nạp sharp thật; rsvg 2.63.2, vips 8.18.7.
- Chưa thay thế full CI trên commit tích hợp cuối hoặc nghiệm thu Windows/macOS/production.

Blob lockfile: `ecfb583a29b01e8881fee0b9d01a8340fbc97a4c`.
Workflow tạm chỉ xuất blob, không sửa ref; bị loại khỏi tree cuối trước khi PR được nghiệm thu.
Không thay schema, quyền, ngưỡng CI, app runtime hoặc offline queue.

## Điều kiện dừng và bàn giao

N05 vẫn BLOCKED_ENV khi chưa có credential migrator hợp lệ; không né bằng nới quyền.
N01 vẫn chưa có subagent thật. N06–N09 phải reconcile theo AC, không khai báo chưa viết mọi code.
Mỗi lần sửa có diff/test/evidence; cùng failure tối đa ba repair attempts trước khi xét lại nguyên nhân.
Revert code không đồng nghĩa được quay lại cấu hình kém an toàn hoặc down-migrate phá dữ liệu.
