# M37 — Redesign theme sáng Phase 2 (typography · spacing · component consistency)

**Phạm vi: chỉ phần "toàn cục" của redesign theme sáng chạm nhiều file (typography, padding thẻ, nút danger, modal, theme-color) — không đụng lại palette màu (đã xong ở PR1/#150). · Phụ thuộc: PR1 (#150) đã merge · Phức tạp: Trung bình-cao (5 PR độc lập) · Rủi ro: Thấp-vừa (PR 2.2 diff lớn nhưng thuần thị giác; PR 2.4 chạm `SpreadsheetGrid` cần thận trọng)**

## Mục tiêu

PR1 đã xong phần nền tảng (palette light, `StatusBadge`, `Skeleton`, token thẻ + quy tắc tier). Phase 2 là phần còn lại của yêu cầu "redesign toàn diện (màu + layout + typography)": chuẩn hoá typography/spacing/component còn rải rác qua 70+ file. XBoss là công cụ dữ liệu **dày** (kỹ sư/thầu phụ dùng trên điện thoại tại công trường) — "tăng trải nghiệm & chuyên nghiệp" ở đây nghĩa là **nhất quán + phân lớp rõ + bớt lỗi vặt**, KHÔNG phải nống khoảng trắng/size chữ làm vỡ mật độ dữ liệu. Vì vậy mọi PR trong Phase 2 ưu tiên **chuẩn hoá & gộp** hơn "làm to mọi thứ", và giới hạn phạm vi để review được thay vì rewrite ồ ạt.

## Bất biến (không được phá, thừa hưởng từ PR1 + `docs/a11y/contrast-audit.md`)

- Cơ chế đảo màu qua biến CSS (`html.light`/`html.dark`/…) trong `app/globals.css` — viết component dark-first bằng thang `zinc` + accent `-300/-400`, **không** `dark:`/hex.
- Accent `-700..-950` KHÔNG đảo theo theme (nút đặc dùng `-700` cho chữ trắng; badge trạng thái `-950/-200` cố định).
- `.sheet-stable` (5 chỗ in/Excel) đã cô lập — không đụng.
- Cổng CI chặn merge: Lighthouse accessibility ≥0.9 trên `/login` (mức `error`); axe E2E (`e2e/*.spec.ts`) không cho lỗi `serious`/`critical`. **Mọi PR phải giữ 2 cổng này xanh.**

## Hiện trạng & khoảng trống (từ khảo sát trước PR1)

| Khu vực       | Hiện trạng                                                                                                                                                                                  | Vấn đề                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Typography    | Gần như toàn bộ dùng `text-xs`/`text-sm`/`text-[11px]`, kể cả tiêu đề mục; `text-lg`/`text-base` gần như không dùng                                                                         | Thiếu phân cấp thị giác ở tiêu đề trang/mục → trang phẳng                                        |
| Padding thẻ   | Cùng vỏ `bg-zinc-900 border border-zinc-800 rounded-xl` dùng lẫn `p-3/p-4/p-5/p-6` (~100 chỗ)                                                                                               | Không theo tier nào — quy tắc đã ghi ở PR1 Part D (`docs/nang-cap/README.md`) nhưng chưa áp dụng |
| Nút danger    | `bg-red-950 border` (approvals), `bg-red-800` (materials), ghost `text-zinc-500 hover:text-red-200 hover:bg-red-950` (admin/tracking), `bg-red-700 hover:bg-red-600` (dialogs — đúng chuẩn) | 4 biến thể khác nhau, không nhất quán                                                            |
| Modal/overlay | `dialogs.tsx` có `Modal` chuẩn (focus-trap/Escape/scroll-lock/backdrop); nhưng `AppHeader.tsx`, `SpreadsheetGrid.tsx`, `RatingModal.tsx` tự dựng overlay riêng                              | Mất a11y miễn phí (focus-trap…), không nhất quán backdrop/radius                                 |
| `theme-color` | `app/layout.tsx` `viewport.themeColor` hardcode 1 giá trị (đã đổi theo light ở PR1)                                                                                                         | Chuyển sang dark/kingblue/darkblue/navy thì thanh trình duyệt/PWA vẫn màu light                  |

Điểm chạm chung: `app/globals.css` (không đổi màu, chỉ tham chiếu), `docs/nang-cap/README.md` (ghi thêm recipe mỗi PR chốt), `app/components/dialogs.tsx` (`Modal` tái dùng), `app/components/ThemeToggle.tsx`, `app/layout.tsx`.

---

## PR 2.1 — Thang typography + phân cấp header (đo lường, không nống mật độ)

**Thiết kế — thang chữ chuẩn** (ghi vào `docs/nang-cap/README.md` mục UI/UX, dạng "recipe" Tailwind, KHÔNG tạo class CSS mới):

| Vai trò            | Recipe                                                         | Ghi chú                                                      |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Tiêu đề trang (h1) | `text-lg font-semibold text-zinc-50`                           | hiện phần lớn `text-sm`; chỉ nâng tiêu đề trang cấp cao nhất |
| Tiêu đề mục (h2)   | `text-base font-semibold text-zinc-100`                        | hiện `text-sm`; chỉ áp cho header section-level              |
| Tiêu đề thẻ (h3)   | `text-sm font-semibold`                                        | giữ nguyên                                                   |
| Eyebrow/kicker     | `text-xs font-semibold uppercase tracking-wider text-zinc-400` | chuẩn hoá `tracking-widest`→`wider` (đang lẫn lộn)           |
| Body/ô bảng        | `text-sm`                                                      | giữ                                                          |
| Phụ/caption        | `text-xs text-zinc-400`                                        | giữ                                                          |
| Micro              | `text-[11px]`                                                  | giữ                                                          |
| Số liệu lớn (stat) | `text-2xl/3xl/4xl font-bold`                                   | giữ                                                          |

**Phạm vi PR (giới hạn để review được):** chỉ **tiêu đề trang + tiêu đề mục** ở trang lưu lượng cao — `app/page.tsx` (dashboard), `app/tracking/[sheet]/page.tsx`, `app/components/AppHeader.tsx` (topbar title dòng ~328: `text-sm`→`text-base`). KHÔNG đổi body/table/micro, KHÔNG đổi padding ở PR này.

**Rủi ro:** tăng chiều cao header — kiểm mắt trên mobile để không vỡ layout. a11y không ảnh hưởng (chỉ đổi size, màu giữ token cũ đã đạt AA).

## PR 2.2 — Đồng bộ padding thẻ theo tier

**Thiết kế:** áp quy tắc đã ghi ở PR1 Part D toàn bộ codebase — stat tile dày → `p-3`; thẻ nội dung → `p-4`; panel cấp trang/hero → `p-5` (bỏ `p-6`). Rà `bg-zinc-900 border border-zinc-800 rounded-xl p-{n}` từng file, đọc ngữ cảnh JSX xung quanh để phân tier đúng (việc cơ học có phán đoán nhẹ, hợp `coder` hơn `mechanical`).

**Điểm chạm:** ~40 trang `app/*` + `app/components/*` (hse, subcontractors, proposals, meetings, finance, handover, monitoring, insurance, environment, org, quality, contracts, claims, notifications, portfolio, payment-certs, `DashboardExtCards`, `ForecastCards`, `SCurveChart`, schedule-control, account, materials/import, `DashboardBarChart`, progress/[system]…).

**Rủi ro:** diff lớn nhưng thuần thị giác, không a11y. Verify: chạy app, liếc vài trang mỗi tier.

## PR 2.3 — Chuẩn hoá nút danger về 1 mẫu

**Thiết kế:** chốt 2 biến thể chuẩn (ghi `docs/nang-cap/README.md`):

- Danger đặc (nút text): `bg-red-700 hover:bg-red-600 text-on-accent` (khớp `-700` an toàn AA, khớp `dialogs.tsx:151`).
- Danger ghost (icon-only, vd nút xoá trong bảng): `text-zinc-500 hover:text-red-300 hover:bg-red-950/40`.

Thay các biến thể lệch (`app/approvals/page.tsx:354` `bg-red-950 border`, `app/materials/_components/PurchaseRequestsTab.tsx:648` `bg-red-800`, `app/admin/page.tsx:878`, `app/tracking/[sheet]/page.tsx:891,2187` ghost) về 2 mẫu chuẩn; rà thêm `grep -rn "bg-red-\(950\|900\|800\)" app/` để bắt hết. **Không** đổi `dialogs.tsx` (đã đúng).

**Verify:** axe (nút danger đặc `-700` + `text-on-accent` đã biết đạt AA).

## PR 2.4 — Gộp overlay tự chế về `Modal` chung

**Thiết kế:** chuyển `app/components/AppHeader.tsx`, `app/components/SpreadsheetGrid.tsx`, `app/materials/purchase-orders/RatingModal.tsx` (đang tự dựng overlay) sang dùng `<Modal>` từ `app/components/dialogs.tsx` — giữ nội dung, bỏ backdrop/z-index/escape tự chế.

**Thận trọng:** `SpreadsheetGrid` là component nặng, phức tạp — kiểm kỹ overlay ở đó có phụ thuộc hành vi đặc thù (vị trí/kích thước) không; nếu quá rủi ro, để lại và chỉ gộp 2 chỗ còn lại (ghi rõ lý do nếu skip).

**Verify:** mở từng modal thật qua UI, test Escape + click backdrop + focus-trap (Tab không thoát ra ngoài).

## PR 2.5 — `theme-color` động theo theme đang chọn

**Thiết kế:** trong `ThemeToggle.cycle()` và script init `beforeInteractive` ở `app/layout.tsx`, cập nhật `<meta name="theme-color">` động theo `--background` của theme active. Map: `light #f6f7f9` · `dark #0a0a0a` · `kingblue #0a1f4d` · `darkblue #0c1a2e` · `navy #060b18` (khớp `--background` trong `globals.css`). Script init đặt đúng ngay lần tải đầu để tránh nhấp nháy.

**Điểm chạm:** `app/layout.tsx` (script init, bỏ `themeColor` tĩnh), `app/components/ThemeToggle.tsx` (`cycle` cập nhật meta).

**Verify:** chuyển đủ 5 theme, xem `<meta theme-color>` đổi (DevTools) + thanh PWA đổi trên mobile.

---

## Chia PR & thứ tự giao `coder`

Thứ tự (ít phụ thuộc → nhiều, PR 2.2 churn lớn làm cuối để tránh xung đột): **2.5 → 2.3 → 2.4 → 2.1 → 2.2**. Mỗi PR: nhánh/worktree riêng, đồng bộ `origin/main` trước khi code, giao 1 lượt `coder` với đúng mục đặc tả tương ứng. Sau mỗi `coder`, chạy `reviewer` (skill `code-review`) trước khi Opus duyệt cuối.

## Definition of Done (mỗi PR)

- [ ] `npm run lint` + `npm run typecheck` xanh; test liên quan pass; `npm run build` chạy được.
- [ ] Không phá bất biến (đảo màu/accent/badge/`.sheet-stable`) — xem mục Bất biến.
- [ ] axe E2E + Lighthouse `/login` accessibility ≥0.9 xanh trên CI.
- [ ] Đã chạy app thật ở **cả** theme sáng & tối, kiểm mắt phạm vi đổi.
- [ ] Cập nhật `docs/nang-cap/README.md` khi chốt recipe/quy tắc mới (2.1, 2.3).
