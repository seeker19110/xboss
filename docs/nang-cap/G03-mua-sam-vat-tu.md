# G03 — Mua sắm & Vật tư

> Gộp từ M04 (NCC & đơn hàng nâng cao) + M18 (định mức thi công) + M33 (hồ sơ năng lực & đánh giá NTP). Tất cả đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.

## M04 — NCC & đơn hàng nâng cao

Hoàn thiện chuỗi mua sắm sẵn có: vòng đời PO 6 bước (`draft→confirmed→delivering→partial→received→reconciled`, huỷ được từ confirmed/delivering/partial — `lib/procurement.ts::isValidPoTransition`, ghi `po_status_history`), đánh giá NCC (`supplier_ratings` — 1 đánh giá/PO, 3 tiêu chí sao, `UNIQUE(supplier_id, po_id)`), cấp phát vật tư theo tầng/tổ đội (`material_transactions.floor_label`/`crew`), xe ra vào công trường (`vehicle_logs` — trạng thái `registered→approved→entered→exited`/`no_show`/`cancelled`, `nextVehicleStatus()`). Notification `po_late`/`vehicle_late`. UI: `/vehicles` (timeline theo ngày, thao tác 1 chạm tại cổng, mobile-first); PO trang hiện có thêm stepper 6 bước.

## M18 — Định mức thi công theo hạng mục (vật tư/nhân công/máy)

Bổ sung định mức **theo dòng BOQ** (khác `material_over` mức tổng vật tư): `boq_norms` (`resource_type` material/labor/equipment, `qty_per_unit`, CHECK material bắt buộc `material_id`, khác bắt buộc `resource_name` tự do — máy chưa nối FK thiết bị, chờ M12). `lib/norms.ts::normUsage(boqItemId)`: `expected = qty_per_unit × boqExecutedQty`, `actual` từ `material_transactions`/`diary_manpower` (đối chiếu nhân công là **ước tính**, gộp theo tổ đội không tách hạng mục), `variancePct`. `overNormItems(thresholdPct=20)` → notification `norm_over` (chỉ vật tư có đối chiếu tin cậy, gửi Admin/PM/Kỹ sư — không phải `viewPayments` vì là cảnh báo kỹ thuật không phải tài chính). UI: tab "Định mức" trong modal chi tiết `/boq`.

## M33 — Hồ sơ năng lực & Đánh giá Nhà thầu phụ (NTP)

Hồ sơ NTP tập trung (khác `suppliers` chung và `discipline_contractors` phân hệ/tầng của M01 — không thay 2 bảng đó): `subcontractor_profiles` (bảng con 1-1 với `suppliers` — sơ đồ tổ chức, người đại diện, năng lực), `subcon_documents` (hồ sơ năng lực, pattern `task_documents`), `subcon_evaluations` (đánh giá **định kỳ** 4 tiêu chí an toàn/chất lượng/tiến độ/nhân sự, `UNIQUE(supplier_id, period)` — khác `supplier_ratings` theo từng PO của M04, không gộp 2 loại điểm). `lib/subcontractors.ts::getSubcontractor` gộp hồ sơ + công nợ (**view**, tái dùng `lib/contracts.ts`/`lib/paymentcerts.ts`, không lưu trùng) + lịch sử đánh giá. Subcon đăng nhập chỉ xem đúng hồ sơ mình (403 khi xin hồ sơ NTP khác) qua `users.supplier_id`.

## Test

`tests/procurement.test.ts`, `norms.test.ts`, `subcontractors.test.ts` (thuần + tích hợp, `TEST_DATABASE_URL`); `e2e/authed/vehicles.spec.ts`, `boq.spec.ts` (tab định mức), `subcontractors.spec.ts` (desktop+mobile+axe).
