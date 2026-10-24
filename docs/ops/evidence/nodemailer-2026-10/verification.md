# Vá Nodemailer — 24/10/2026

Bugfix mức S theo ủy quyền của chủ dự án: “rồi làm tất cả các việc còn lại bạn có thể
quyết, ưu tiên chất lượng, đơn giản hoá”. Base `6b631f15`, sau merge PR #677.

## Vấn đề và thay đổi

Audit production còn một package moderate, Nodemailer 10.0.14, gồm ba advisory
phân tích địa chỉ: chú thích lồng nhau, dấu chấm phẩy trong nhóm và local-part có nháy.
Cả ba có thể làm envelope chọn sai người nhận. Bản vá tối thiểu là **10.1.4**.

Pin riêng package này; diff lock chỉ root và `node_modules/nodemailer`. Ba điểm gọi
daily-report, weekly-report và health-check giữ nguyên route, auth, SMTP settings,
người nhận, nội dung và project/org scope. Không có migration.

Nguồn maintainer: [release 10.1.4](https://github.com/nodemailer/nodemailer/releases/tag/v10.1.4),
[chú thích lồng nhau](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-8c8m-p3m8-cjg8),
[nhóm địa chỉ](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-m943-m63m-w62w),
[local-part có nháy](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-85x2-q946-cp5h).

## Kiểm chứng

`tests/nodemailer-security.test.ts` dùng `sendMail` thật: ba PoC kiểm envelope,
địa chỉ thường/tên tiếng Việt, SMTP loopback có AUTH/PIPELINING/To+Bcc và RCPT 550.
Không nạp SMTP env, không gọi provider hoặc gửi email ra ngoài.

- RED trên bản copy độc lập 10.0.14: 3 fail đúng ba PoC, 3 pass, 0 skip.
- GREEN trên 10.1.4, cùng file test: 6 pass, 0 fail/skip/cancel; root chạy lại đạt.
- Harness GREEN ban đầu có hai lỗi kỳ vọng/giao thức, được sửa trước kết quả cuối:
  MIME normalizer thay dấu `>` trong quoted local-part bằng khoảng trắng; SMTP giả
  phải trả 503 cho DATA khi mọi RCPT bị từ chối. Vẫn kiểm mailbox chính xác và miền
  `victim.invalid`, lỗi EENVELOPE/550 và không gửi body; không nới điều kiện an toàn.
- `npm audit --omit=dev --json`: 1 moderate → **0 vulnerability** tại thời điểm kiểm.
- Gate 18/18 và build đạt. Full release gate: 383 file/5.152 pass/0 fail/1 skip allowlist trên Node 24.21.0.
  Lượt full bắt đầu trước khi thêm file mail mới; sáu ca mới được chạy riêng, không
  gộp thành số full giả. CI chạy lại cả bộ trên HEAD phát hành.

Số liệu máy đọc và hash test: [verification.json](verification.json).

## Giới hạn và rollout

SMTP loopback không chứng minh TLS hoặc nhà cung cấp thật. Pin npm không nâng runtime
Node hay Undici đi kèm Node. Local 24.21.0 có bundle 7.29.1; đã cài riêng runtime
kiểm thử [Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1), checksum khớp bản
phát hành, xác nhận bundle 7.30.1/OpenSSL 3.5.9. Không suy ra patch VPS từ Node major
24 trong deploy; phiên bản binary của tiến trình PM2 production chưa được xác minh.

Phát hành qua PR/CI/deploy hiện hữu, không đổi cổng. Nếu phát sinh lỗi vận chuyển thư,
ưu tiên chẩn đoán và bản vá tương thích; không rollback về thư viện có advisory như
một thao tác tự động. UAT và usage vẫn WAITING theo quyết định chủ dự án.
