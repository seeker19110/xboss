# M124 — Bố cục màn hình "chứng từ" (DocShell) + áp cho trang Thanh toán khối lượng

| Thuộc tính       | Giá trị                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Issue / Goal     | Chuẩn hoá màn hình nhập/duyệt chứng từ tài chính theo mẫu tổng hợp từ 2 app Kế toán Access |
| Spec owner       | Phiên chính (opusplan)                                                                    |
| State            | **Approved for implementation**                                                           |
| Người/ngày duyệt | Người dùng · 2026-09-21 (chốt phạm vi "1 trang tài chính làm mẫu" + "toolbar trên & thanh đáy, đáy ưu tiên mobile") |
| Cập nhật         | 2026-09-21                                                                                |

> Mockup đã duyệt: artifact "XBoss Chứng từ" (https://claude.ai/artifact/2kcKEuoLSb1udqkGKgb79w). Đặc tả này là nguồn sự thật khi mockup và chữ lệch nhau.

## 1. Problem, vai trò và bằng chứng

Người dùng gửi 2 ảnh màn hình "Nhật ký chung" của phần mềm Kế toán Access (toolbar trên + tab
MDI; và bản cổ điển có thanh hành động đáy + thanh trạng thái) và yêu cầu thiết kế lại
layout/UI-UX theo kiểu đó hoặc tổng hợp tốt hơn.

Hiện trạng XBoss (đọc code 2026-09-21):

- `app/payment-certs/page.tsx` (~700 dòng): danh sách đợt IPC dạng bảng, **chi tiết đợt mở trong
  `Modal max-w-2xl`** (`CertDetailModal`, dòng 381–705). Bảng dòng KL trong modal dùng `text-xs`,
  input KL rộng 80px, nút hành động `py-2 text-xs` (dưới ngưỡng 40px của ADR-0009). Nhập nhiều
  dòng trong modal rất chật, không có tổng hợp tạm ứng/giữ lại/đề nghị dù API đã trả (`totals`).
- Các trang tài chính khác (`/contracts`, `/variations`, `/claims`) cùng mẫu "bảng + Modal".
- Đã có: AppShell sidebar + topbar (`AppHeader`), thanh cố định đáy qua prop `bottomActions`
  (`AppHeader.tsx:395–416`, CSS `.app-bottombar`/`.safe-bottom` trong `globals.css`), bộ component
  nền `Button/Card/Chip/Section/StatCard` (ADR-0009), theme dark-first 5 bộ (ADR-0010).

Cái XBoss **thiếu** là một **mẫu màn hình chứng từ** thống nhất: header thông tin 2 cột, lưới
dòng, tổng hợp, đính kèm/ghi chú/trạng thái, toolbar trên + thanh hành động đáy có phím tắt.

## 2. Outcome, metric và guardrail

- Trang `/payment-certs` hiển thị chi tiết đợt IPC **toàn trang** (không Modal) theo DocShell; nhập
  KL nhiều dòng thoải mái trên desktop, vẫn dùng được trên điện thoại (form 1 cột, lưới cuộn ngang,
  thanh đáy dính).
- Guardrail: **không đổi API, không đổi schema, không đổi logic tiền** (tổng vẫn lấy từ
  `totals` của API, JS chỉ hiển thị). a11y: axe không vi phạm serious/critical (e2e sẵn có).
  Tương phản: `npm run check:contrast` + `check:mau-accent` xanh. Không dùng `dark:` / hex trong
  component.

## 3. Nghiên cứu hiện trạng

- API: `GET /api/payment-certs?contractId=` → `{certs: PaymentCertRow[]}`;
  `GET /api/payment-certs/:id` → `{cert, totals: CertTotals, approvalStatus, vuotHopDong}`;
  `PATCH /api/payment-certs/:id {items, periodLabel?}` (draft, Admin/PM);
  `POST .../submit`, `POST .../decide {decision, rejectReason}`; `GET .../pdf`, `.../excel`.
  Kiểu trong `lib/tai-chinh/paymentcerts.ts` (`PaymentCertRow`, `CertItemRow`, `CertTotals`
  = `periodValue/cumulativeValue/advanceDeduct/retentionDeduct/approvedValue`).
- Che tiền (M50 PR2): `unitPrice`/totals có thể `null` → giữ `MaskedValue` + `mSum/mMul/mSumBy`.
- e2e: `e2e/authed/payment-certs.spec.ts` chỉ kiểm EmptyState + axe (seed không có hợp đồng) — giữ
  nguyên, phải vẫn xanh (title "Thanh toán khối lượng" trong `<header>` không được đổi).
- Test unit chạm page: không có.

## 4. Phương án

| Phương án                                       | Lợi ích                              | Chi phí/rủi ro                         | Kết luận |
| ----------------------------------------------- | ------------------------------------ | -------------------------------------- | -------- |
| Không làm                                       | 0                                    | Modal chật, không nhất quán            | Loại     |
| A. Chép nguyên mẫu Access (nền trắng/đỏ, chữ nhỏ, ribbon) | Giống ảnh                    | Vỡ theme/ADR-0009/0010, không mobile   | Loại     |
| **B. DocShell trên hệ token XBoss, áp 1 trang mẫu** | Nhất quán, mở rộng dần được       | Phải viết 4 component nhỏ               | **Chọn** |
| C. Đổi cả nhóm tài chính một lượt               | Đồng bộ ngay                         | Diff khổng lồ, rủi ro cao               | Đợt sau  |

## 5. Scope / non-goals

**Scope:** (1) 4 component nền mới trong `app/components/ui/`; (2) trang `/payment-certs` chuyển
sang master–detail dùng DocShell, bỏ `CertDetailModal`; (3) tài liệu (ADR-0009 bổ sung mục, PROGRESS).
**Non-goals:** đổi AppHeader/sidebar; các trang tài chính khác; đính kèm file cho IPC (chưa có
bảng — khối "Đính kèm" **không** làm ở M124); tab MDI; phím tắt ngoài `Ctrl+S` và `Esc`.

## 6. User journeys và mọi trạng thái

- **Desktop (≥ lg):** trái = danh sách đợt của hợp đồng đang chọn (cột 320px, cuộn dọc); phải =
  chứng từ đang chọn. Chưa chọn → phải hiện `EmptyState` "Chọn một đợt bên trái hoặc Lập đợt mới".
- **Mobile (< lg):** chỉ hiện danh sách; chạm 1 đợt → thay bằng chứng từ toàn màn hình, có nút
  "‹ Danh sách" ở toolbar; thanh hành động đáy dính.
- Đợt đang chọn ghi vào URL `?contractId=&id=` (giữ `contractId` sẵn có), reload giữ nguyên.
- Loading: `PageSkeleton` cho lần đầu; đổi đợt → skeleton riêng trong khối chứng từ.
- Lỗi mạng khi lưu/trình/duyệt: giữ nguyên hành vi try/catch + toast/appAlert hiện có.
- Không quyền (`canManage` false): toolbar/thanh đáy chỉ còn In PDF/Excel (khi approved) và Đóng.

## 7. Functional và non-functional requirements

**FR1 — `DocToolbar`** (`app/components/ui/DocToolbar.tsx`): thanh công cụ trên, `hidden md:flex`,
`sticky top-0 z-20` trong khối chứng từ, nền `bg-zinc-900/95 backdrop-blur border-b border-zinc-800`,
cuộn ngang `scrollbar-none`. Props: `children` (các `Button`), `trailing?` (canh phải: điều hướng
trước/sau + vị trí "n / N"). Có `DocToolbar.Sep` (vạch ngăn `w-px h-6 bg-zinc-800`).
**FR2 — `DocField`** (`app/components/ui/DocField.tsx`): hàng nhãn–giá trị,
`grid grid-cols-1 sm:grid-cols-[120px_1fr] items-center gap-x-3 gap-y-1 min-h-10`; nhãn
`text-sm text-zinc-400`, `required` thêm `<span class="text-red-400">*</span>`; giá trị chỉ đọc
dùng `readOnly` → viền `border-dashed` nền trong suốt. Kèm `DocFieldGroup` = 2 cột
`grid md:grid-cols-[1.4fr_1fr] gap-x-7 gap-y-3`.
**FR3 — `DocTotals`** (`app/components/ui/DocTotals.tsx`): `rows: {label, value: ReactNode, negative?}[]`
+ `total: {label, value}`; số `tabular-nums`, dòng âm hiển thị dấu "−"; tổng cuối
`text-2xl font-bold text-emerald-300`. Không tính toán — nhận giá trị đã format.
**FR4 — `Kbd`** (`app/components/ui/Kbd.tsx`): chip phím tắt `text-[10px] border border-zinc-700
rounded px-1 text-zinc-400`, `hidden md:inline` (điện thoại không có bàn phím). Trên nút primary
dùng `border-white/40 text-white/80` qua prop `onAccent`.
**FR5 — Export** cả 4 qua `app/components/ui/index.ts`.
**FR6 — `/payment-certs`:** bố cục §6. Khối chứng từ (`app/payment-certs/_components/CertDocument.tsx`)
gồm, theo thứ tự dọc:
  1. `DocToolbar`: [Lưu KL (draft, canManage)] [Trình lên CĐT/TVGS (draft)] · Sep · [Duyệt] [Từ chối]
     (submitted, canDecide) · Sep · [PDF] [Excel] (approved) · trailing: ‹ › đổi đợt + "đợt k / N".
  2. Tiêu đề: `h2` mã đợt (font-mono) + `Chip` trạng thái (tone: draft neutral / submitted warning /
     approved success / rejected danger) + chip "Chờ duyệt (bước x/y)" nếu `approvalStatus.pending`;
     dòng meta: hợp đồng · Đợt n · người lập · `createdAt`.
  3. `Section` "Thông tin chứng từ" trong `Card raised`, `DocFieldGroup`: trái = Mã đợt, Hợp đồng
     (mã — tên, readOnly), Đợt, Nhãn kỳ (`periodLabel`, input khi draft+canManage, PATCH cùng lúc
     với Lưu KL), Người lập; phải = Ngày trình (`submittedAt`), Ngày quyết định (`decidedAt`),
     Lý do từ chối (khi có, chữ `text-rose-300`).
  4. Cảnh báo `vuotHopDong` + chú thích nguồn KL: giữ nguyên nội dung/markup hiện có.
  5. `Card raised` lưới dòng KL: bảng `text-sm`, `min-w-[720px]`, header `sticky top-0` dính,
     cột STT + BOQCODE `sticky left-0 bg-zinc-900`; cột: STT · Mã · Tên (đơn vị) · KL HĐ ·
     Đơn giá · KL đợt này (input `w-24 min-h-10 text-right` khi canEdit) · Luỹ kế · Thành tiền
     (`mMul(qty, unitPrice)` qua `MaskedValue`). Dưới bảng: dòng gợi ý "Enter/Tab chuyển ô"
     (`text-xs text-zinc-500`, `hidden md:block`).
  6. Hàng dưới `grid lg:grid-cols-[1fr_1.1fr] gap-4`: trái `Card sunken` "Trạng thái & lịch sử duyệt"
     (trạng thái, người lập, thời gian, danh sách `approvalStatus.actions` như hiện nay); phải
     `Card raised` `DocTotals`: Giá trị đợt (`totals.periodValue`), Luỹ kế (`cumulativeValue`),
     Khấu trừ tạm ứng (−`advanceDeduct`), Giữ lại (−`retentionDeduct`); tổng = Đề nghị thanh toán
     (`approvedValue`). Khi đang sửa KL chưa lưu: hiện thêm dòng nhỏ "Tạm tính theo KL đang nhập:
     …" từ `mSumBy` (như `totals` cũ) — không thay số của API.
  7. Thanh đáy: truyền qua `bottomActions` của `AppHeader` (đã có `.app-bottombar`), gồm cùng bộ
     nút của DocToolbar (nút primary theo trạng thái: Lưu KL / Trình / Duyệt) + Kbd `Ctrl S` trên
     Lưu + "Đóng `Esc`" (mobile: quay về danh sách; desktop: bỏ chọn). Thanh đáy hiện ở **mọi**
     breakpoint khi có đợt đang chọn (đáy ưu tiên mobile theo quyết định người dùng); không có đợt
     chọn thì không truyền `bottomActions`.
**FR7 — Phím tắt:** `Ctrl/⌘+S` → Lưu KL (khi canEdit, preventDefault); `Esc` → Đóng. Đăng ký
trong `CertDocument` bằng `useEffect` keydown trên `window`, gỡ khi unmount.
**FR8 — Danh sách trái:** giữ 3 StatCard hợp đồng (chuyển sang `StatCard` của ui nếu props khớp,
nếu không giữ nguyên) ở **trên** cả 2 cột; bảng đợt rút gọn còn Mã · Đợt · Trạng thái (`Chip`),
dòng đang chọn `bg-emerald-500/10 border-l-2 border-emerald-500`.
**NFR1** — mọi nút qua `Button` (≥40px), không class nút viết tay mới. **NFR2** — không `dark:`,
không hex. **NFR3** — `MaskedValue` cho mọi số tiền. **NFR4** — e2e sẵn có xanh không sửa.

## 8. Acceptance criteria

- AC1: Given desktop, có hợp đồng và ≥1 đợt; When chọn đợt; Then chi tiết hiện cột phải, URL có
  `id=`, không Modal nào mở (`document.querySelector('[role=dialog]')` null).
- AC2: Given mobile 390px; When chọn đợt; Then danh sách ẩn, chứng từ toàn màn hình, thanh đáy
  hiện với nút Đóng; bấm Đóng quay về danh sách.
- AC3: Given draft + Admin/PM; When sửa KL và bấm `Ctrl+S`; Then PATCH gọi đúng body cũ
  (`items[{boqItemId, qtyPeriod}]` + `periodLabel`), toast/refresh như trước.
- AC4: `DocTotals` hiển thị đúng 4 dòng + tổng từ `totals` của API; user bị che tiền thấy "•••"
  (MaskedValue) chứ không thấy 0.
- AC5: `npm run lint`, `typecheck`, `build`, `check:contrast`, `check:mau-accent`, `npm test`,
  e2e `payment-certs.spec.ts` xanh.
- AC6: Không còn `CertDetailModal` trong repo; không import `Modal` ở `app/payment-certs/`.

## 9. Kiến trúc và điểm chạm code

- Mới: `app/components/ui/DocToolbar.tsx`, `DocField.tsx`, `DocTotals.tsx`, `Kbd.tsx`; sửa
  `app/components/ui/index.ts`.
- Mới: `app/payment-certs/_components/CertDocument.tsx` (tách từ `CertDetailModal`, giữ nguyên
  toàn bộ hàm `saveItems/submitCert/decide` và các chú thích tiếng Việt hiện có).
- Sửa: `app/payment-certs/page.tsx` (master–detail, URL state, bottomActions).
- Docs: ADR-0009 thêm mục "Màn hình chứng từ (M124)"; `PROGRESS.md`; `docs/nang-cap/README.md`.
- Không chạm `lib/`, `app/api/`, `migrations/`.

## 10. API contract

Không đổi.

## 11. Data contract và DDL

Không đổi.
