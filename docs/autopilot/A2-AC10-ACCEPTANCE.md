# Acceptance — A2-AC10 browser diary conflict

Nguồn Approved 25/09/2026: [A2 §acceptance](../nang-cap/AUDIT-2026-09-25/A2-OFFLINE.md), [TEST-MATRIX §4](../nang-cap/AUDIT-2026-09-25/TEST-MATRIX.md), [S06](../nang-cap/AUDIT-S06-OFFLINE-RECEIPT.md), [S15 §A2](../nang-cap/AUDIT-S15-RELEASE-CANDIDATE.md). Lát này chỉ bổ sung lớp B còn thiếu "diary conflict thật"; không đổi app/route/schema, không kết luận M (Safari/iOS) hoặc phần ảnh mồ côi (đã có P/H S06).

- [x] `A2B-STALE-001` **MUST** PM soạn nhật ký offline trên bản v1; người khác (kỹ sư, phiên riêng) lưu v2; khi có mạng hàng đợi gửi `If-Match: v1` cùng `Idempotency-Key` = operationId → 412, op `conflict` bền trong IndexedDB, DB giữ nguyên v2 (không tăng version, không receipt của PM).
- [x] `A2B-RESOLVE-002` **MUST** Màn phục hồi hiển thị đủ bản thiết bị và bản máy chủ; chọn "Giữ bản trên thiết bị" sau hộp xác nhận tạo op mới (key khác) với `If-Match` = etag v2 vừa xem → 200, hàng đợi sạch, DB = bản thiết bị, đúng một receipt.
- [x] `A2B-CREATE-003` **MUST** Tạo-nếu-chưa-có: PM soạn offline khi ngày trống (`If-None-Match: *`), kỹ sư tạo trước → 412 không đè, `created_by` vẫn là kỹ sư; "Dùng bản máy chủ" bỏ op, không gửi PUT nào nữa, DB nguyên vẹn, 0 receipt.
- [x] `A2B-REPLAY-004` **MUST** Mất ACK: lần gửi đầu COMMIT rồi response bị cắt; "Gửi lại ngay" gửi cùng key và cùng `If-Match` (nay đã cũ) → 200 receipt replay, không 412 giả, không ghi lần hai (version/nội dung giữ nguyên), đúng một receipt.
- [x] `A2B-RUN-005` **MUST** Chromium thật desktop + mobile, HTTP/IDB/DB thật, không mock auth/API/DB; 6 ca + setup pass, 0 skip/retry; lặp ba lần mỗi viewport ổn định.
- [x] `A2B-GATE-006` **MUST** typecheck, build và cổng tĩnh `npm run gate` xanh trên commit cuối; review độc lập không còn P1/P2.

## Bằng chứng 22/10/2026

- STALE/RESOLVE/CREATE/REPLAY: `e2e/authed/a2-ac10-diary-conflict.spec.ts` (ba ca), assertion header thật (`If-Match`/`If-None-Match`/`Idempotency-Key`), trạng thái IndexedDB `ops2`, bảng `site_diaries` và `audit_operation_receipts`.
- RUN: desktop+mobile 7/7 (T-003), lặp ×3 19/19 (T-004), 0 skip/retry/flaky.
- GATE: typecheck (T-001), build (T-002), `npm run gate` (T-005) xanh. Review độc lập: 0 P1; P2 race nhịp flush nền ở ca mất ACK đã sửa (lần gửi tự động trước "Gửi lại ngay" bị cắt trước máy chủ, vẫn kiểm cùng key/If-Match) và chạy lại T-001…T-005; P3 `expect` trong route handler đã chuyển ra thân test. P3 còn lại (độ bền qua reload — đã phủ ở offline-deep; cửa sổ chờ PUT muộn; tín hiệu replay trực tiếp) ghi nhận, không chặn.
