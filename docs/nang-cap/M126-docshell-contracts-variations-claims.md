# M126 — Áp DocShell (master–detail) cho `/claims`, `/variations`, `/contracts`

| Thuộc tính       | Giá trị                                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| Issue / Goal     | Đóng non-goal của M124: 3 trang tài chính còn lại bỏ mẫu "bảng + Modal"           |
| Spec owner       | Phiên chính (opusplan)                                                            |
| State            | **Approved for implementation**                                                   |
| Người/ngày duyệt | Người dùng · 2026-09-21 ("áp DocShell cho /contracts, /variations, /claims luôn") |
| Cập nhật         | 2026-09-21                                                                        |

> Mẫu đích = `app/payment-certs/page.tsx` + `app/payment-certs/_components/CertDocument.tsx`
> (M124, PR #486). Mọi quy ước ở M124 §6–§7 áp nguyên cho 3 trang này; đặc tả này chỉ ghi
> **khác biệt** từng trang. Khảo sát chi tiết 3 trang (số dòng, API, e2e) ở mục 3.

## 1. Mục tiêu và guardrail

- 3 trang chuyển sang master–detail: danh sách trái 320px (`lg`), chứng từ toàn trang phải, mobile
  chuyển màn; `?id=` trong URL; `DocToolbar` (desktop) + `bottomActions` (mọi breakpoint khi có
  bản ghi chọn); phím tắt `Ctrl+S` (khi có ô nhập) và `Esc`; `Chip` trạng thái; `DocField`,
  `DocTotals`, `StatCard`, `Button` từ `app/components/ui`.
- **Không đổi API/lib/migration** (kể cả không thêm `GET /api/claims/:id` — chi tiết claim lấy
  từ object trong danh sách như hiện nay). Không sửa `CustomFieldsSection`. Không sửa e2e.
- Giữ nguyên hàm gọi API (`submit`/`decide`/`settle`/`reject`/`addenda`/upload…) và mọi chú
  thích tiếng Việt hiện có; chỉ bỏ `onClose()` ở đuôi các hàm (master–detail giữ chứng từ mở và
  refresh) như M124.
- Modal **tạo mới** (`AddContractModal`, `AddVoModal`, `AddClaimModal`) **giữ nguyên** — e2e neo
  vào chúng (heading "Thêm claim", "Dòng khối lượng", "Mã dòng 2", `getByLabel("Loại")`…). Chỉ
  chuyển `<button>` viết tay bên trong sang `Button` nếu tiện, không đổi text/label/aria.
- Soft-delete (`contracts`, `claims`): khi bật "Xem … đã xoá", danh sách hiện bản ghi đã xoá kèm
  nút Khôi phục và **không mở** chứng từ (như hành vi click bị vô hiệu hiện nay).
- Tiền: `MaskedValue` + `mSum/mMul/mSumBy` ở mọi số tiền (kể cả `/claims`, hiện chưa dùng —
  server không che claim thì `MaskedValue` chỉ hiển thị bình thường, không đổi hành vi).
  `/variations` tính giá trị quyết định ở `decide()` (dòng ~578) đổi sang `mMul/mSumBy`.

## 2. Cấu trúc file (mỗi trang)

`app/<trang>/page.tsx` (master–detail, URL state, `bottomActions`) +
`app/<trang>/_components/<X>Document.tsx` (hook `use<X>Document` + `<X>Actions` +
`<X>BottomActions` + component chứng từ) + giữ `Add<X>Modal` (tách sang
`app/<trang>/_components/Add<X>Modal.tsx` nếu page vẫn > 400 dòng).

## 3. Khác biệt từng trang

### 3.1 `/claims` (803 dòng, `ClaimDetailModal` 537–803, không dòng con, không GET chi tiết)

- Danh sách trái: giữ **segmented filter** `role="group"` name "Lọc theo loại claim" với 3 nút
  "Tất cả/Chi phí/EOT" + `aria-pressed` (e2e neo), checkbox "Xem claim đã xoá" (admin). Hàng:
  mã · tiêu đề (truncate) · `Chip` trạng thái (`notice/quantified/negotiating` = warning,
  `settled` = success, `rejected` = danger) · nhãn loại (cost/eot).
- Đầu trang (trên cả 2 cột): 2 StatCard giữ đúng text "Claim chi phí đang mở", "Claim EOT gia hạn
  đang mở" (e2e neo) + nút "Thêm claim" (canManage).
- Chứng từ: tiêu đề mã + Chip; `Section` "Thông tin claim" `DocFieldGroup` read-only: Loại, Tiêu
  đề, Hợp đồng, Ngày thông báo, Nguyên nhân (textarea read-only), Người tạo/ngày tạo; theo `kind`:
  cost → "Giá trị đề xuất"; eot → "Số ngày đề xuất".
- **Khối "Quyết định"** (`Card raised`, chỉ khi `isOpen && isAdminOrPm`) thay chuỗi `appPrompt`:
  form inline gồm ô "Giá trị chốt" (cost) hoặc "Số ngày chốt" (eot) + textarea "Ghi chú" + 2 nút
  "Chốt" (primary, gọi `POST .../settle` body như cũ) và "Từ chối" (`danger`, `appConfirm` rồi
  `POST .../reject {settlementNote}` — ghi chú lấy từ textarea, bắt buộc không rỗng). Khi đã có
  quyết định: khối hiển thị read-only Giá trị/Số ngày chốt, Ghi chú, `settledAt`.
- `DocTotals`: cost → Đề xuất / Đã chốt / tổng "Chênh lệch" (chốt − đề xuất, tính bằng `mSub`,
  `MaskedValue`); eot → Ngày đề xuất / Ngày chốt (không tiền, dùng `DocTotals` với giá trị chuỗi
  "n ngày").
- `Section` "Hồ sơ đính kèm": danh sách file + upload (chỉ `isOpen`) như cũ.
- `Ctrl+S` = "Chốt" khi khối quyết định đang hiện và ô chốt hợp lệ; ngược lại no-op (vẫn
  `preventDefault`).

### 3.2 `/variations` (946 dòng, `VoDetailModal` 504–946, 6 trạng thái, có dòng con)

- Danh sách trái: hàng mã · tiêu đề · Chip (`draft` neutral, `submitted` warning, `approved`/
  `contract_added` success, `partially_approved` info, `rejected` danger). 4 StatCard đầu trang
  giữ đúng text "Nháp/Đã trình/Được duyệt/Từ chối" — **chỉ 1 chỗ mỗi text trong `<main>`** ngoài
  Chip; e2e dùng `.first()` không scope nên Chip trong danh sách phải đứng **sau** StatCard trong
  DOM (StatCard render trước) để `.first()` vẫn trúng StatCard.
- Chứng từ: "Thông tin phát sinh" `DocFieldGroup`: Mã, Tên, Lý do, Hệ, Mô tả, Người tạo, Ngày
  trình, Ngày quyết định; `approvalStatus` chip/lịch sử như CertDocument (cùng M46).
- Lưới dòng: cột STT · Mã · Tên công tác · ĐVT · KL đề xuất · KL duyệt (input inline chỉ khi
  `canDecide`, `min=0 max=qtyProposed`) · Đơn giá (`MaskedValue`) · Thành tiền đề xuất
  (`mMul(qtyProposed, unitPrice)`) · Thành tiền duyệt (`mMul(qtyApproved ?? qtyProposed, unitPrice)`).
  Header dính + cột STT/Mã dính trái như M124.
- `DocTotals`: Giá trị đề xuất (`proposedValue` API) / Giá trị duyệt (API `approvedValue` khi đã
  quyết định, còn `canDecide` thì tạm tính `mSumBy` từ ô đang nhập, ghi rõ "tạm tính") / tổng =
  Giá trị duyệt.
- Actions theo trạng thái: `draft && isAdminOrPm` → "Trình lên CĐT/TVGS" (primary);
  `canDecide` → "Duyệt toàn bộ" (primary), "Duyệt một phần" (secondary, gửi `lines` từ ô nhập),
  "Từ chối" (danger); `canContractAdd` → khối `Card sunken` "Đưa vào phụ lục hợp đồng" (select HĐ
  - mã phụ lục + nút "Chốt") giữ nguyên logic; upload khi `canEditMeta`.
- `Ctrl+S` = "Duyệt một phần" khi `canDecide` và có ô nhập đổi; ngược lại no-op.

### 3.3 `/contracts` (1200 dòng, `ContractDetailModal` 660–1187, 5 tab, custom fields)

- Danh sách trái: giữ **nhóm gập/mở theo `kind`** (3 nhóm nhan_thau/giao_thau/ncc, header nhóm là
  `<button aria-expanded>`), hàng mã · tên · Chip trạng thái (`draft` neutral, `active` success,
  `completed` info, `terminated` danger), checkbox "Xem hợp đồng đã xoá" (admin). 3 StatCard đầu
  trang giữ text "Nhận thầu/Giao thầu/Nhà cung cấp" (e2e neo) + nút "Thêm hợp đồng" (canManage).
- Chứng từ dùng `Tabs` (M125) cho 5 nhóm nội dung, URL `?id=&tab=`:
  - `info` (mặc định): `DocFieldGroup` — trái: Số HĐ (read-only), Loại, Tên (input khi canManage),
    Đối tác, Hệ, Trạng thái (select); phải: Giá trị, % tạm ứng, % giữ lại, Ký ngày, Hiệu lực
    từ/đến (input như form sửa cũ) + `CustomFieldsSection` nguyên trạng. `DocTotals`: Giá trị HĐ /
    Phụ lục (`addendaTotal`) / Đã thanh toán (`paid`) / PO cam kết / tổng "Còn lại" (`mSub`, như
    KPI cũ). Lưu qua `PATCH` (Ctrl+S).
  - `addenda`: bảng phụ lục (mã · tiêu đề · giá trị ± · ký ngày · người tạo · nút xoá) + 2 ô thêm
    (mã, giá trị) như cũ.
  - `documents`: danh sách file + upload như cũ.
  - `links`: 3 danh sách read-only (bills, purchaseOrders, floorContracts) như cũ.
  - `ipc`: danh sách đợt IPC + link `/payment-certs?contractId=` như cũ.
- Actions: Lưu (primary, tab info, canManage) · Xoá hợp đồng (danger, canManage, `appConfirm`) ·
  Khôi phục (khi đã xoá).
- Class động `bg-${systemColor}-400` giữ nguyên chuỗi như code cũ.

## 4. Acceptance criteria (mỗi trang)

- AC1: không còn `<Modal>` chi tiết; `grep -rn "DetailModal" app/<trang>` rỗng; `Modal` chỉ còn
  trong `Add<X>Modal`.
- AC2: `?id=<n>` reload mở đúng bản ghi; đổi filter/nhóm không mất `id` trừ khi bản ghi bị lọc
  khỏi danh sách (khi đó xoá `id`).
- AC3: mọi luồng API cũ vẫn gọi đúng method/path/body (kiểm bằng route thật trên Postgres ephemeral
  như M124: tạo → trình/quyết định/chốt → 200).
- AC4: e2e 3 spec (`contracts.spec.ts`, `variations.spec.ts`, `claims.spec.ts`) + `input-zoom-mobile`
  xanh ở CI; neo text/role liệt kê ở §3 giữ nguyên.
- AC5: lint/typecheck/build/check:contrast/check:mau-accent/check:hex-hardcode/format:check/test
  xanh; không `dark:`/hex; mọi nút qua `Button`.
- AC6: mỗi `page.tsx` ≤ 450 dòng.

## 5. Điểm chạm code

Sửa `app/claims/page.tsx`, `app/variations/page.tsx`, `app/contracts/page.tsx`; mới
`app/{claims,variations,contracts}/_components/*`. Docs: `PROGRESS.md` (mục ✅ M126), ADR-0009
(một dòng ghi 4 trang đã áp DocShell), `docs/nang-cap/README.md`. Không chạm `lib/`, `app/api/`.
