# G06 — Bản vẽ & Hồ sơ

> Gộp từ M08 (bản vẽ BIM/Shop + BPTC) + M10 (RFI/công văn) + M13 (họp & rủi ro) + M19 (đề xuất & phê duyệt) + M20 (kho hồ sơ) + M32 (thay đổi thiết kế) + M34 (claim & EOT). Tất cả đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.

## M08 — Bản vẽ BIM/Shop drawing + biện pháp thi công

Drawing register: mã bản vẽ + rev + trạng thái duyệt. `drawings` (`kind` shop/asbuilt/bim/**method** — biện pháp thi công dùng chung bảng) + `drawing_revisions` (`rev` A/B/C..., `status` submitted→commented→approved/approved_with_comments/rejected→superseded, `UNIQUE(drawing_id, rev)` — rev mới `approved` tự supersede rev cũ trong transaction). Gate: package đánh dấu "cần biện pháp" chỉ tick được khi có `kind='method'` `approved` (dùng chung cơ chế hold-point M03). UI (`/drawings`): register + timeline rev + nút "Xem bản mới nhất đã duyệt" (hành động chính hiện trường).

## M10 — RFI / công văn CĐT-TVGS

Sổ công văn 2 chiều: `correspondences` (`code` không UNIQUE — 2 bên đánh số khác nhau, `direction` in/out, `kind` rfi/letter/site_instruction, `reply_id` nối văn bản trả lời) + `correspondence_files`. `POST .../:id/reply` tạo văn bản `out` nối `reply_id` + tự set gốc `replied`. Xem: mọi vai trò **trừ subcon** (nhạy cảm hợp đồng). Notification `correspondence_due`.

## M13 — Biên bản họp + sổ rủi ro

Cùng mô hình "danh sách + action + hạn". `meetings` + `meeting_actions` (action liên kết mềm `task_id`, hiện ở `/my-tasks`). `risks` (ma trận 5×5: `probability`×`impact`, `score` tính lúc query không lưu) — heatmap trên `/risks`. Notification `action_overdue`. Xem risks: mọi vai trò trừ subcon.

## M19 — Đề xuất & phê duyệt online tổng quát

Tổng quát hoá đề xuất (tạm ứng/thanh toán/cấp phát/khác) **song song** `purchase_requests` hiện có (không gộp — quyết định có chủ đích, tránh big-bang). `proposals` (`code DX-0001`, `kind` advance/payment/allocation/other, vòng đời draft→submitted→approved/rejected 1 cấp — nhất quán mọi vòng đời duyệt khác trong dự án, không thêm workflow engine cấu hình được). Approve `kind∈{advance,payment}` có `contract_id` → tuỳ chọn tạo `payment_bills` (checkbox, không tự động ép). `allocationOverNorm` (phụ thuộc M18) cảnh báo không chặn cứng khi cấp phát vượt định mức. Notification `proposal_pending`. Widget "Chờ duyệt của tôi" gộp `proposals` + `purchase_requests`.

## M20 — Kho hồ sơ dự án (Drive)

**View hợp nhất**, không di trú dữ liệu: `lib/documents-hub.ts::listAllDocuments` UNION tĩnh (không introspect DB) các nguồn đã biết (`task_documents`, `contract_documents`, `vo_documents`, `drawing_revisions`) thành 1 kiểu `HubDocument`, `viewUrl` trỏ đúng route gốc từng loại (không tạo route xem file mới). Quyền xem giữ nguyên logic gốc của bảng nguồn (subcon chỉ thấy task được giao, `contract` chỉ `viewPayments`). Chỉ 1 bảng mới: `project_documents` (file tự do cấp dự án, không phân loại hệ/tầng). UI (`/documents`): lọc hệ/tầng/loại nguồn + tìm kiếm.

## M32 — Quản lý thay đổi thiết kế

Lấp khoảng trống quy trình: tiếp nhận → đánh giá tác động (kỹ thuật/chi phí/tiến độ, mô tả định tính) → duyệt → cập nhật bản vẽ. **Không làm lại BPTC** (đã xong ở M08). `design_changes` (`code DC-0001`, vòng đời submitted→assessing→approved/rejected→drawing_updated) + `variation_orders.design_change_id` (nối VO khi phát sinh chi phí thật, tuỳ chọn). Không tự động cập nhật bản vẽ khi duyệt — người dùng tự xác nhận qua nút riêng sau khi upload revision mới. UI: thêm 1 tab "Thay đổi thiết kế" vào `/drawings` (không route riêng, không mục sidebar mới).

## M34 — Claim chi phí & Gia hạn thời gian (EOT)

Tách khỏi VO (M06, chủ động đề xuất) vì claim là **phản ứng** với sự kiện ngoài kiểm soát (chờ mặt bằng, thay đổi thiết kế CĐT...). `claims` (`code CLM-0001`, `kind` cost/eot, vòng đời notice→quantified→negotiating→settled/rejected, `vo_id`/`design_change_id` nullable để nối khi cần). `lib/claims.ts::eotEvidenceSuggestion` gợi ý `days_requested` từ số ngày chờ mặt bằng luỹ kế (M14, chỉ gợi ý không bắt buộc). Notification `claim_pending`. Xem: admin/pm/engineer/bch (loại cdt/subcon/viewer — nhạy cảm thương mại, nhất quán quyết định chung). UI: trang riêng `/claims` (không gộp `/variations`).

## Nhất quán xuyên suốt nhóm

Mọi vòng đời duyệt tổng quát đều 1 cấp (submit → Admin/PM quyết qua `CAN.approve`), không có workflow engine cấu hình được. Test: `tests/drawings.test.ts`, `correspondences.test.ts`, `meetings.test.ts`, `risks.test.ts`, `proposals.test.ts`, `documents-hub.test.ts`, `designchanges.test.ts`, `claims.test.ts`; `e2e/authed/drawings.spec.ts`, `correspondences.spec.ts`, `meetings.spec.ts`, `risks.spec.ts`, `proposals.spec.ts`, `documents.spec.ts`, `claims.spec.ts` (desktop+mobile+axe).
