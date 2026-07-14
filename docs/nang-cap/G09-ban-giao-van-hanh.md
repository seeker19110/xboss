# G09 — Bàn giao & Vận hành (bảo hiểm, bàn giao, bảo hành)

> Gộp từ M28 (bảo hiểm & bảo lãnh) + M29 (bàn giao & kết thúc) + M30 (bảo hành & bảo trì). Tất cả đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.
>
> **Tên bảng/lib thật khác đặc tả gốc** (đổi lúc code cho khớp domain tiếng Việt): bảng `insurance_bonds` (không phải `guarantees_insurances`), `lib/insurance.ts` (không phải `lib/guarantees.ts`) — nội dung/logic giữ nguyên như đặc tả.

## M28 — Bảo hiểm & Bảo lãnh

1 bảng gọn cho cả bảo hiểm (CAR, trách nhiệm bên thứ ba, tai nạn LĐ) và bảo lãnh (thực hiện HĐ, tạm ứng, bảo hành) — `category` phân biệt, gắn `contract_id` (nullable — có loại cấp toàn dự án). `insurance_bonds` (`category` insurance/guarantee, hiệu lực, giá trị). `lib/insurance.ts::expiringGuarantees(days=30)` → notification `guarantee_expiry`. Quyền: xem `viewPayments`, ghi `manageContracts` (cùng nhóm HĐ). UI (`/guarantees`): bảng 2 nhóm + KPI sắp hết hạn/tổng giá trị đang hiệu lực.

## M29 — Bàn giao & Kết thúc (T&C, as-built, demob)

Giai đoạn kết thúc: chạy thử & nghiệm thu hệ thống (`commissioning`, JSONB checklist — pattern `qc_checklists` M03, không phát minh cơ chế mới), nghiệm thu bàn giao theo hạng mục (`handover_items`), **punch list** (tồn tại khi bàn giao — điểm nhấn module, `handover_item_id` nullable), giải thể công trường (`demob_items`), bài học kinh nghiệm (`lessons_learned`). `lib/handover.ts::handoverProgress` (KPI), `overduePunch` → notification `punch_overdue`. **As-built không lưu file mới** — liên kết `drawing_revisions` kind asbuilt (M08) / `project_documents` (M20), tránh trùng kho file. Quyết toán cuối kỳ dùng chung `/costs` (M02/M27), M29 chỉ tổng hợp link. UI (`/handover`): hub 5 tab (T&C/Nghiệm thu/Punch/Demob/Bài học).

## M30 — Bảo hành & Bảo trì (O&M)

Sau bàn giao: danh mục hạng mục bảo hành theo hệ + thời hạn, xử lý claim lỗi sau bàn giao, hướng dẫn vận hành & bảo trì (O&M). `warranty_items` (`handover_item_id` nối M29, `guarantee_id` nối bảo lãnh bảo hành M28/`insurance_bonds`, hạn = `warranty_from + warranty_months` **tính động, không lưu ngày hết**) + `warranty_claims` (**tách khỏi NCR M03** — NCR là trong thi công, claim là sau bàn giao, khác vòng đời/quyền dù cùng pattern) + `om_documents` (bảng riêng, khác `project_documents` chung của M20 — phân loại theo hệ). `lib/warranty.ts::expiringWarranties`/`overdueClaims` → notification `warranty_expiry`/`warranty_claim_overdue`. UI (`/warranty`): hub 3 tab (Bảo hành/Claim/O&M).

## Test

`tests/guarantees.test.ts` (hoặc `insurance.test.ts`), `handover.test.ts`, `warranty.test.ts` (thuần + tích hợp, `TEST_DATABASE_URL` — cảnh báo xuất hiện/tự dọn đúng điều kiện, dedup); `e2e/authed/guarantees.spec.ts`, `handover.spec.ts`, `warranty.spec.ts` (desktop+mobile+axe).
