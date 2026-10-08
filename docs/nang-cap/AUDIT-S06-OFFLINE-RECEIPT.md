# S06 — receipt và precondition ở endpoint hàng đợi offline thật

State: **Approved for implementation**.
Chủ dự án duyệt QUALITY-FINAL-1 (2026-09-25) và yêu cầu thi hành tiếp lộ trình ngày 2026-10-08.
Spec cha: [A2 Offline](AUDIT-2026-09-25/A2-OFFLINE.md) (A2-FR09..FR11), [DATA-CONTRACTS §5, §7](AUDIT-2026-09-25/DATA-CONTRACTS.md),
APPROVAL D04, PLAN §S06, TEST-MATRIX A2-AC04/06/10. Đây là phạm vi con, không thay contract của đặc tả cha.

## Phạm vi và contract

- Endpoint thật (theo `opEndpoint` của hàng đợi): `PATCH /api/dimensions/:id` (`tick`),
  `PATCH /api/dimensions/batch` (`tick_batch`), `POST /api/tasks/:id/photos` (`photo`),
  `PUT /api/diaries/:date` (`diary_note`). Request hàng đợi gửi `Idempotency-Key` (UUID = operationId)
  và `X-XBoss-Context` (S05); không có cả hai header = caller online cũ, giữ nguyên hành vi (trừ
  precondition nhật ký bên dưới).
- Thứ tự: phiên 401 → quyền vai trò 403 → context 409 (`context_invalid|expired|changed`, kiểm
  TRƯỚC phạm vi tài nguyên để tab cũ không bị 404 oan) → phạm vi/quyền tài nguyên 404/403 → trong
  transaction: khoá advisory (org, dự án, user, operationId) → tra receipt (cùng hash → ACK replay,
  khác hash/loại → 409 `idempotency_conflict`) → precondition/gate → mutation + receipt → COMMIT.
- Migration `0164_offline_receipts.sql`: `audit_operation_receipts` đúng DDL contract (RLS nghiêm
  ngặt so text, `xboss_app` chỉ SELECT/INSERT); `photo_upload_staging` (metadata file đang ghi, đối
  soát mồ côi); `site_diaries.version` + trigger tăng ở mọi UPDATE dòng nhật ký và mọi đổi dòng con.
- Hash SHA-256 (`receipt-v1`) của JSON chuẩn gồm kind/scope/target/payload đã chuẩn hoá/baseVersion;
  ảnh băm digest byte + kích thước/mime/chú thích/tên gốc, không dính boundary multipart.
- ACK: thành công lần đầu giữ nguyên body cũ + `receipt`; replay trả `{ receipt }` (200), không payload.
- Nhật ký full-replace: `If-Match: "<id>-<version>"` (GET trả `etag` + header ETag) hoặc
  `If-None-Match: *` khi tạo mới; thiếu → 428 `precondition_required`; lệch → 412
  `version_mismatch`; so dưới khoá (advisory theo dự án+ngày + `FOR UPDATE`). Áp cho mọi caller
  (modal nhật ký online gửi kèm), replay receipt hợp lệ được trả trước khi so If-Match.
- Ảnh: dòng staging COMMIT trước khi đặt file; ghi `task_photos` + receipt + xoá staging cùng một
  transaction; lỗi/huỷ/thua đồng thời → xoá file khi dòng staging còn; dòng quá 60 phút được đối
  soát ở lần upload kế tiếp của chính người đó.

## Tiêu chí chấp nhận

- A2-AC04: mất ACK → cùng receipt, không chạy lại mutation; 20 request đồng thời cùng key → đúng 1
  lần thực thi (tick, tick_batch, ảnh); payload/loại khác cùng key → 409.
- A2-AC06: 400 header sai, 403 quyền bị thu hồi (kể cả khi đã có receipt), 404 tài nguyên khác dự
  án (không để lại receipt), 409 context/idempotency, 412 phiên bản, 428 thiếu precondition.
- A2-AC10: If-Match cũ/If-None-Match khi đã có → 412 không đè; tạo đồng thời → 1 thành công + 412;
  replay sau mất ACK không 412 giả; ghi metadata ảnh lỗi → file được dọn; staging mồ côi được đối soát.
- Route chạy bằng role `xboss_app`; mutation `test:mutation` cho hash 409, replay, If-Match, dọn file.
- Ngoài phạm vi (S07/S08): queue IndexedDB mới gửi header/baseVersion, lease/fencing, UI xung đột.
