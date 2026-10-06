# QUALITY-FINAL-1 — Credential runtime và checkpoint thực thi 2026-10-06

## Bằng chứng trước bản sửa bổ sung

PR #573 HEAD `e0dfb8b7d6683f0cac47131f1da71c0e2d650a6e`: CI `37489654549` đạt.
PR #574 commit tích hợp `a81bbb3509f3292a3f4cdffe28e0cc44b1937f2d`: CI `37492679580` đạt.
Đã kiểm một bản kết hợp có các test PostgreSQL/coverage/build/E2E; không chỉ cộng kết quả
các PR riêng. Mutation và freshness chỉ-main chưa được coi là đã chạy trên PR.

## Rủi ro S03 được sửa tiếp

`deploy.sh`/PM2 trước đây chưa kiểm `.env.production` và `.env.production.local`; guard tên
biến cũng bỏ sót `export MIGRATE_DATABASE_URL=...` và cú pháp colon được dotenv hỗ trợ.
Next.js còn nạp các file env production, nên việc chỉ quét `.env`/`.env.local` chưa đủ.

Bản sửa mở rộng các file được kiểm, chặn các dạng gán trên trước reset/clean/npm và trước
khởi động PM2. Deploy cũng dừng khi đường dẫn env không phải file đọc được hoặc grep lỗi.
Không in giá trị secret, không nhận biến migrator trong runtime; biến từ shell vẫn bị xóa.
Không thay đổi quyền DB hoặc tự xử lý file env thật.

Nguồn đối chiếu: tài liệu chính thức Next.js về Environment Variable Load Order và parser
của các phiên bản dotenv/Next trong lockfile. Không thay định dạng file env của ứng dụng.

## Kiểm chứng tại chỗ

Snapshot tải từ artifact `11426420599` của run `37491720075`, kiểm SHA-256 của ZIP và hai tar.
Index source khớp tree `78a10708e31209f9c4b811f3a9c00dad161e34c6`; toolchain Node 24.21.0.
Không gọi đó là full git clone hoặc truy cập production. Các file export chỉ là source/toolchain,
không có credential git hoặc env production.

- PASS: 64 test deploy-preflight, deploy-migration-credential, runtime-migration-env và restore-check;
  không fail/skip. Bao phủ plain/export/colon, năm file env, tên biến gần giống, không lộ secret,
  lỗi preflight không reset/npm/pm2, và fixture khôi phục hiện hữu.
- PASS: bộ test mới chạy trên deploy/PM2 cũ trả nonzero; không chỉ test nhánh thành công.
- PASS: bash syntax và TypeScript trước cập nhật tài liệu; kiểm lại toàn gate trên commit cuối.
- NOT_RUN local: PostgreSQL, browser E2E và production. Full CI HEAD cuối vẫn là điều kiện bắt buộc.

## Kết quả thử VPS và review

PR #575, run `37492119330`, job `112367248282`: exit78 trước SSH do
`VPS_SSH_KNOWN_HOSTS` không khả dụng. Không tạo/chuyển secret, không đọc giá trị migrator,
không chạm DB hoặc restart. Workflow tạm đã bị loại ở `3b98f2bc5dcccf56c62b82614ec0e451d11346e1`.
Không kết luận trạng thái VPS mới từ lỗi này; N05 giữ BLOCKED_ENV.

OCR job `37493461721` thành công nhưng bước LLM skip; chưa có bằng chứng review độc lập đạt.
Yêu cầu reviewer không thay thế review đã thực hiện. Không tự ký APPROVE thay người khác.

## Việc còn lại và điều kiện phát hành

Tiếp tục PLAN S00–S16 và sổ nợ #572. Phần resolver/transaction/scope ở các miền còn lại,
POST/DELETE payment, tiền exact xuyên caller, portfolio task-weighted, vault/receipts/offline,
chuỗi nghiệp vụ và full PITR vẫn cần reconcile/triển khai/nghiệm thu theo AC.
Không coi gói tích hợp này là hoàn tất các phần trên hoặc CODE_COMPLETE toàn dự án.

Người vận hành cần xác minh host key độc lập rồi cấu hình secret triển khai; kiểm file migrator
0600/ownership/role riêng và runtime không có quyền owner/BYPASSRLS. Sau đó mới đủ nền để
preflight/deploy đúng release SHA, smoke/UAT và drill. Không né bằng fallback DATABASE_URL.
D09 cần thời gian pilot/rollout thực; không tự chứng nhận bằng test tức thời.

Rollback bản code bằng revert có đánh giá; không down-migrate hoặc xóa dữ liệu/queue legacy.

## Đối chiếu main thay đổi trong phiên

PR #574 đã được merge tại `c838a1279359ad41e670cd33db22489858264061` lúc 16:20:12 UTC.
Tree main là `78a10708e31209f9c4b811f3a9c00dad161e34c6`, trùng snapshot nguồn của bản sửa này.
CI push main `37494895895` được ghi nhận đang chạy ở lần đối chiếu; chưa dùng làm bằng chứng PASS.
Nhánh nguồn #574 đã xóa nên PR bổ sung chuyển sang base main, không khôi phục hoặc force nhánh cũ.
Sự kiện merge không thay bằng chứng review độc lập, credential hợp lệ hoặc nghiệm thu production.
