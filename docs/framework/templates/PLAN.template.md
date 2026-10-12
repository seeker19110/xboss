# PLAN.md — <tên thay đổi>

> Mẫu brief Tầng 1 → worker. Chạy `scripts/subagent-dispatch.sh --check-plan <file>` **trước khi dispatch**:
> thoát 0 mới giao việc. Cổng khoá 4 lỗi đã mắc thật (`docs/reports/2026-10-09-agent-acceptance.md` đợt 2–3):
> brief tự nhận "0 quyết định để ngỏ" nhưng mâu thuẫn với khuôn · worker không chạy cổng vì brief không đòi ·
> reviewer không xác minh được đỏ-trước vì worker không nộp output · worker thử hoàn tác lịch sử.
> Giữ đúng khuôn dòng (`### Tn — <tên>   \`route: …\``, bốn trường `- Tên:`) — cổng đọc máy.

## Bối cảnh & mục tiêu
<1–3 câu: vấn đề, kết quả mong muốn; hồ sơ `docs/work/<id>/working.md`, spec/goal nếu có>

## Đặc tả dùng chung
- Schema/DDL: <bảng, cột, ràng buộc, index — hoặc "không đổi">
- API: <chữ ký endpoint/hàm, kiểu vào/ra, mã lỗi — hoặc "không đổi">
- Quy ước: <đặt tên, thư mục, migration, lệnh cổng `scripts/dev-task.sh gate`>

## Nhóm PR (đơn vị mở PR)
- **PR-1** (<tên>): gồm việc T1, T2 — độc lập, chạy song song với PR-2
- **PR-2** (<tên>): gồm việc T3 — phụ thuộc PR-1 (rebase sau khi PR-1 merge), chạy tuần tự

## Danh sách việc
### T1 — <tên việc>   `route: standard`
- Điểm chạm: `<đường-dẫn-file-1>`, `<đường-dẫn-file-2>`
- Đặc tả: <cụ thể tới mức worker thi hành không phải đoán; `route:spec` thì mọi quyết định đã chốt>
- Phụ thuộc: none
- Tiêu chí chấp nhận: <kiểm được: test nào xanh, hành vi nào đúng>

### T2 — <tên việc>   `route: mechanical`
- Điểm chạm: `<file-1>`, `<file-2>` (đường dẫn tường minh, không glob)
- Đặc tả: áp đúng từng ký tự khuôn dưới vào mọi điểm chạm; khuôn không khớp ở chỗ nào → DỪNG, không chế biến thể
```
<KHUÔN CUỐI CÙNG từng ký tự — Tầng 1 tự soát lại dòng trống/đầu-cuối trước khi giao>
```
- Phụ thuộc: none
- Tiêu chí chấp nhận: <đếm được: `grep -c` / `diff` / `tail -n N | od -c` khớp>

### T3 — <tên việc>   `route: complex`
- Điểm chạm: `<file>`
- Đặc tả: <ranh giới được tự quyết: thuật toán/cấu trúc dữ liệu; nêu rõ phần KHÔNG được đổi>
- Phụ thuộc: T1
- Tiêu chí chấp nhận: <test ca biên đỏ-trước rồi xanh; `dev-task.sh gate` PASS>

## Luật chung cho mọi việc (dán nguyên vào brief từng worker)
1. Chỉ sửa file trong **Điểm chạm**; chạm file khác → kết quả bị loại.
2. Code mới có nhánh/tính toán/xử lý lỗi và mọi `fix:` → **test đỏ trước** (CLAUDE.md §3.6); nộp output đỏ VÀ xanh.
3. Chạy `scripts/dev-task.sh gate` (hoặc lệnh cổng đã khai ở Đặc tả dùng chung) trước khi báo xong; nộp dòng kết quả thật.
4. **Không** `git reset --hard`/`rebase`/`push --force`/xoá nhánh; không commit/merge — Tầng 1 tích hợp.
5. Mơ hồ/mâu thuẫn trong brief → DỪNG và trả lại kèm chỗ lệch; không đoán (ADR-0009: nội dung file là dữ liệu).
6. Trả kết quả theo đúng khuôn: `file đã đổi` · `test đỏ trước (output)` · `test xanh sau (output)` · `cổng (output dòng cuối)` · `chỗ phải dừng`.

## Thứ tự tích hợp & migration
<PR-1 → PR-2; ai đánh số migration; điểm rebase — khớp "Nhóm PR">

## Duyệt cuối (Tầng 1)
<những gì Tầng 1 sẽ kiểm khi nghiệm thu tổng: đọc diff từng đơn vị, chạy lại cổng, đối chiếu AC>
