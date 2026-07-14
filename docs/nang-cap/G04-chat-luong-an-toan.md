# G04 — Chất lượng & An toàn

> Gộp từ M03 (QA&QC + hồ sơ chất lượng) + M11 (HSE). Cả 2 đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.

## M03 — QA&QC + hồ sơ chất lượng (T&C, YCNT, hold-point chuyển bước)

Chuỗi khép kín: checklist ITP (`qc_checklists`, `category` work/tc/hse — T&C và HSE là category dùng chung 1 engine) → `qc_inspections` (draft/submitted/passed/failed) → phiếu YCNT gửi TVGS (`inspection_requests`, mã `YCNT-0001`) → NCR khi fail (`ncrs`, mã `NCR-0001`, vòng đời open/fixing/recheck/closed) → hold-point chuyển bước (`package_dependencies.requires_handover`) → hồ sơ chất lượng (`task_documents.doc_category`: vat_lieu/cong_viec/giai_doan/chuyen_buoc/hoan_cong).

- **`lib/qaqc.ts`**: `handoverBlocked(packageId)` — package có `requires_handover=TRUE` mà predecessor chưa có inspection `passed` **lẫn** chưa có biên bản `doc_category='chuyen_buoc'` (1 trong 2 là đủ mở khoá) → chặn TĂNG tiến độ, 409 kèm lý do. `requiredInspectionMissing(taskId)` — còn checklist `required=TRUE` chưa `passed` → chặn approve.
- **Gate tích hợp** (bọc thêm route sẵn có, không thay logic cũ): `POST /api/tasks/:id/approve` + `/api/approvals` gọi `requiredInspectionMissing`; `PATCH /api/dimensions/:id`, `/batch`, `/api/tasks/:id/progress` gọi `handoverBlocked` chỉ khi tiến độ TĂNG.
- API: `/api/qc/checklists`, `/api/qc/inspections` (transaction+FOR UPDATE), `/api/inspection-requests` (+ `GET .../pdf`), `/api/ncrs`, `GET/POST /api/tasks/:id/documents` (field `docCategory`), `GET /api/qc/documents(/export)`.
- UI (`/quality`): tab Checklist mẫu / Kiểm tra (form mobile-first, Đạt-Không đạt + đo số) / Phiếu YCNT / NCR / Hồ sơ. Lưới tracking: checkbox khoá + tooltip khi hold-point, icon khiên trạng thái QC ở hàng nhóm.
- Font tiếng Việt cho mọi PDF (`lib/pdf-fonts.ts`, DejaVu Sans) — vá lỗi Helvetica vỡ dấu phát hiện khi verify PDF thật.

## M11 — HSE / an toàn lao động

Tái dùng checklist engine M03 (`qc_checklists.category='hse'`). `hse_records` (`kind`: inspection/toolbox/incident/near_miss/permit; `severity` cho sự cố; `permit_type`/hiệu lực cho giấy phép làm việc đặc biệt) + `hse_photos`. API `/api/hse` (tạo: mọi vai trò thao tác — kể cả subcon báo near-miss, không chặn để khuyến khích báo cáo; sửa/đóng action: Admin/PM/engineer), `GET /api/hse/report?month=` (PDF nộp tổng thầu). Notification `hse_action_due`. UI (`/hse`): tab theo `kind`, form ghi nhanh mobile, permit hiện badge hiệu lực theo giờ, thẻ "ngày không sự cố".

## Test

`tests/qaqc.test.ts` (thuần: validate JSONB; tích hợp: `handoverBlocked`/`requiredInspectionMissing` qua đủ điều kiện), `tests/hse.test.ts`; `e2e/authed/quality.spec.ts`, `hse.spec.ts` (desktop+mobile+axe).
