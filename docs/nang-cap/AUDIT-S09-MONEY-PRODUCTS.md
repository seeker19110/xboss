# S09 bổ sung — scale decimal và tổng tích exact

State: **Approved for implementation**.
Chủ dự án đã duyệt QUALITY-FINAL-1 và lệnh triển khai việc nhỏ ngày 2026-09-25.
Spec cha: [A3 Money](AUDIT-2026-09-25/A3-MONEY.md), D05 và S09.
Phạm vi con không thay dependency S10 hoặc chính sách chứng từ đã chốt.

## Phạm vi và contract

Additive lib/nen/money.ts, hai test unit/PostgreSQL, spec và tài liệu ops.
Không thay helper/caller legacy, parser DB, SQL runtime, JSON API, UI/export hoặc schema.

parseFixedDecimalExact(decimal, scale) chỉ nhận chuỗi canonical đúng scale 0–18,
không coerce/round/locale/exponent/leading zero/negative zero, tối đa 1024 ký tự.
Quantity mặc định scale3, unit price scale2; biên cột SQL và quy tắc miền do API kiểm riêng.

sumMoneyProductsExact cộng tất cả quantity × unit price bằng bigint rồi round tổng theo
ipc-sum-v1. Không round từng line rồi cộng. Rate 10.25% dùng 1025/10000 exact.
compareMoneyExact so bigint hoặc amount canonical scale2, không sort chuỗi/Number.
Null/unavailable không thành mảng rỗng hoặc số 0. Utility số âm không nới input IPC.

## Tiêu chí chấp nhận

Giữ 1.005 quantity; từ chối scale/input sai. Hai line 0.001 × 5.00 tổng 0.01,
khác cộng hai line đã round thành 0.02. Ties âm/dương đối xứng; 10.000 line 0.01 là 100.00.
Aggregate lớn không mất cent, comparator đúng thứ tự, period/advance/retention đúng basis.
Parity với PostgreSQL numeric trên SELECT fixture; không INSERT aggregate vượt biên cột.

## Kiểm thử và rollback

16 unit test và test parity DB. Mutation bỏ round tổng phải bị phát hiện.
Full CI và review đúng HEAD trước merge. Không lấy helper test thay API/export/masking UAT.
Rollback bỏ export khi chưa có caller; không reprice lịch sử hoặc đổi exact về float.
