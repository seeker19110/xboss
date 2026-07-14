# G05 — Hiện trường (nhật ký, thiết bị, mặt bằng)

> Gộp từ M05 (nhật ký thi công) + M12 (thiết bị) + M14 (mặt bằng). Tất cả đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.

## M05 — Nhật ký thi công + nhân lực

Nhật ký điện tử theo NĐ 06/2021, **sinh gần tự động** từ dữ liệu sẵn có. `site_diaries` (`diary_date UNIQUE`, `status` draft/locked — khoá thì PATCH trả 409, chỉ Admin mở khoá lại) + `diary_manpower` (`crew` + `headcount`, `UNIQUE(diary_id, crew)`). `lib/diary.ts::buildDiaryPrefill(date)` gộp `task_history` theo work package thành câu mô tả sẵn ("Hệ ống gió T5: lắp đặt 12 căn..."). API: `GET /api/diaries?month=`, `GET/PUT /api/diaries/:date` (upsert draft, manpower cùng transaction), `POST/DELETE .../lock`, `GET .../pdf`. Notification `diary_missing` (có `task_history` trong ngày mà chưa lập). UI (`/diary`): lịch tháng + editor mobile-first (chip thời tiết, gallery ảnh tick chọn, bảng nhân lực).

## M12 — Quản lý thiết bị/máy thi công

Sổ thiết bị: tình trạng, vị trí, tổ đội đang giữ, hạn kiểm định/hiệu chuẩn — quan trọng nhất là thiết bị đo phục vụ T&C (M03, hết hiệu chuẩn = biên bản đo vô hiệu). `equipment` (`code` `TB-0001`, `condition` good/maintenance/broken/retired, `calibration_due`) + `equipment_logs` (`action` issue/return/move/maintain/calibrate — ghi log cập nhật `current_location`/`current_crew`/`condition` cùng transaction, giống cách `material_transactions` cập nhật `qty_used`). Notification `calibration_due` (≤30 ngày). UI (`/equipment`): bảng + panel lịch sử log + form thao tác theo action.

## M14 — Quản lý mặt bằng thi công (work front)

Theo dõi bàn giao mặt bằng theo tầng/khu — dữ liệu làm **bằng chứng xin gia hạn (EOT)**. `work_fronts` (`UNIQUE(sheet_type_id, floor_label)`, `status` pending→handed_over→in_progress→returned, `blocker`) + `work_front_documents` (biên bản/ảnh hiện trạng). Tích hợp: `/api/lookahead` gắn cờ `waitingFront` cho task thuộc tầng `pending`; notification `front_missing` (task tới hạn ≤3 ngày mà tầng còn pending); dashboard M09 đếm tầng chờ + số ngày chờ luỹ kế. UI (`/work-fronts`): ma trận tầng×sheet (ô màu theo trạng thái); lưới tracking hiện badge "Chưa có mặt bằng" (**không chặn cứng** tick, chỉ cảnh báo — khác hold-point QA&QC của M03); xuất báo cáo PDF đối chứng EOT.

## Test

`tests/diary.test.ts`, `equipment.test.ts`, `workfronts.test.ts` (tích hợp, `TEST_DATABASE_URL`); `e2e/authed/diary.spec.ts`, `equipment.spec.ts`, `work-fronts.spec.ts` (desktop+mobile+axe).
