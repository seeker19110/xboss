# M97 — Tái cấu trúc route trang (page routes)

**Ngày lập:** 2026-08-21 · **Nhánh:** `claude/route-restructure-plan-bgbwve`
**Phạm vi chốt với người dùng:** tái cấu trúc **page route theo chức năng**; **đổi thẳng URL, KHÔNG redirect**; **gộp trang trùng chức năng vào hub**.
**Bối cảnh:** app **chưa có người dùng thật** — không cần giữ tương thích ngược cho URL cũ, và được phép đổi/xoá URL mạnh tay.
**Ngoài phạm vi:** `app/api/*` (tên route API đã bám entity, đổi chỉ tạo rủi ro cho client fetch mà không được lợi ích IA nào).

---

## 1. Hiện trạng (đo trên code, không suy đoán)

- **122 trang tĩnh** + 6 trang động (`/tracking/[sheet]`, `/progress/[system]`, `/system/[code]`, `/work-fronts/[floor]`, `/hub/[id]`, `/r/[kind]/[id]`).
- Chỉ **46 mục** có trong `app/components/EngineeringNav.tsx`; `AppHeader.tsx` chỉ còn link `/account`.
- **7 hub hợp nhất** đã tồn tại: `/site`, `/schedule`, `/procurement`, `/commercial`, `/governance`, `/engineering-intelligence`, `/mepf-cad-bim-studio`.

### 1.1. Ba lớp rác đang chồng lên nhau

**(a) 26 trang "shim chuyển tiếp" client-side** — mỗi trang ~40 dòng UI chỉ để `router.replace(...)`. Đây chính là loại redirect người dùng yêu cầu bỏ:

| Trang shim | Trỏ tới |
| --- | --- |
| `/attendance` | `/site?tab=tasks-diary&sub=attendance` |
| `/claims` | `/commercial?tab=fidic-claims` |
| `/contracts` | `/commercial?tab=contracts` |
| `/costs` | `/commercial?tab=contracts&sub=costs` |
| `/diary` | `/site?tab=tasks-diary&sub=diary` |
| `/engineering/qr-logistics` | `/procurement?tab=qr-logistics` |
| `/equipment` | `/site?tab=equipment&sub=equipment` |
| `/finance` | `/commercial?tab=cashflow-esign` |
| `/hse` | `/site?tab=hse-safety` |
| `/insurance` | `/commercial?tab=contracts&sub=insurance` |
| `/materials` | `/procurement?tab=inventory` |
| `/materials/order-form` | `/procurement?tab=orders` |
| `/materials/purchase-orders` | `/procurement?tab=orders` |
| `/materials/suppliers` | `/procurement?tab=suppliers` |
| `/payment-certs` | `/commercial?tab=ipc-payments&sub=ipc` |
| `/payments` | `/commercial?tab=ipc-payments&sub=payments` |
| `/proposals` | `/commercial?tab=ipc-payments&sub=proposals` |
| `/quality` | `/site?tab=approvals-qc&sub=ncr` |
| `/resources` | `/site?tab=tasks-diary&sub=resources` |
| `/risks` | `/site?tab=hse-safety` |
| `/schedule-control` | `/schedule?tab=wbs` |
| `/scurve` | `/schedule?tab=scurve` |
| `/timeline` | `/schedule?tab=wbs` |
| `/variations` | `/commercial?tab=vo-variations` |
| `/vehicles` | `/site?tab=equipment&sub=vehicles` |
| `/work-fronts` | `/site?tab=work-fronts` |

Thêm `/order` (server `redirect()` → `/procurement?tab=orders`).

**(b) 7 trang re-export cùng một component:**
- `/ban-ve-thiet-ke`, `/ban-ve-hoan-cong`, `/bien-phap-thi-cong`, `/mo-hinh-bim`, `/shopdrawings` — mỗi trang 6 dòng, render `@/app/ban-ve/page` với prop `fixedKind` khác nhau.
- `/cad-bim` và `/mepf-cad-bim-studio` — cả hai `export { default } from "@/app/engineering/god-tier-studio/page"`. **Ba URL cho một trang**, và `/mepf-cad-bim-studio` mới là mục có trong nav.

**(c) Code chết:** `app/materials/_components/PurchaseRequestsTab.tsx` (675 dòng) và `ReportsTab.tsx` (664 dòng) không được import từ đâu cả — `app/materials/page.tsx` đã thành shim nên hub `materials` không còn tồn tại. **1339 dòng chết.**

### 1.2. Hai kiểu "hub" mâu thuẫn nhau

Đây là nguyên nhân gốc khiến cấu trúc route lộn xộn, không phải bản thân các URL:

- **Hub embed** (`/site`, `/procurement`, `/commercial`, `/schedule`): dùng `HubShell` + tab, nội dung nằm trong `_components/*Tab.tsx`. Trang lẻ tương ứng bị biến thành shim.
- **Hub launcher** (`/governance`, `/engineering-intelligence`): chỉ là trang thẻ liên kết `<a href="/users">`, `<a href="/handover">`… Trang lẻ vẫn sống nguyên ở top-level.

Kết quả: người dùng gặp `/procurement?tab=inventory` (query) và `/users` (top-level) cho cùng một cấp phân cấp thông tin.

### 1.3. Trang thật còn phẳng ở top-level (59 trang)

Đáng chú ý theo kích thước: `/mepf-process` (1993), `/handover` (1890), `/ban-ve` (1617), `/boq` (1350), `/admin` (1223), `/my-tasks` (1194), `/warranty` (1180), `/monitoring` (1086), `/` (1051), `/approvals` (1013), `/subcontractors` (997), `/environment` (1319), `/kickoff` (889), `/tech` (832), `/notifications` (825), `/tenders` (735), `/personnel` (714).

### 1.4. Tab hub rỗng/stub cần lấp

`app/procurement/_components/BoqBiddingTab.tsx` chỉ 129 dòng trong khi `/boq` có 1350 dòng và `/tenders` 735 dòng — tab "BOQ & Đấu Thầu" hiện là vỏ, chưa phải nội dung thật.

---

## 2. Quyết định kiến trúc

**QĐ-1 — Một quy tắc đặt URL duy nhất: `/<hub>` cho tổng quan, `/<hub>/<slug>` cho trang con.**
Bỏ hoàn toàn kiểu `?tab=&sub=` làm địa chỉ chính của một màn hình. Query chỉ dùng cho **trạng thái lọc/xem** (`?kind=`, `?floor=`, `?q=`), không dùng để định danh trang.

Lý do: `?tab=x&sub=y` không deep-link được sạch, không tách bundle được, không đặt được `metadata`, và là thứ đã đẻ ra 26 trang shim.

**QĐ-2 — `HubShell` giữ nguyên, nhưng tab trở thành link điều hướng thật.**
`HubShell` nhận `tabs` với `href` thay vì `content`; hub dùng `layout.tsx` để mọi route con `/<hub>/<slug>` hiển thị chung thanh tab + dải KPI. Nội dung `_components/*Tab.tsx` chuyển thành `app/<hub>/<slug>/page.tsx`.

**QĐ-3 — Gộp trang trùng bằng query param, không bằng trang re-export.**
5 trang bản vẽ → `/ban-ve?kind=design|shop|asbuilt|method|bim`. `/cad-bim` + `/mepf-cad-bim-studio` → chỉ giữ `/engineering/god-tier-studio`.

**QĐ-4 — Không redirect.** Trang shim bị **xoá**, URL cũ 404. **App chưa có người dùng thật** (xác nhận với người dùng ngày 2026-08-21), nên không có bookmark, email báo cáo hay tin nhắn Telegram cũ nào ngoài kia trỏ vào URL cũ — không cần lớp redirect tương thích ngược, và cũng không cần rà URL tuyệt đối gửi ra ngoài app.

Ràng buộc còn lại thuần nội bộ: mọi link trong `app/**` và `lib/**` phải được sửa trong cùng PR với việc xoá/di chuyển trang — đây là tiêu chí chặn merge, không phải việc dọn sau.

**QĐ-5 — `/engineering/*` (35 trang) giữ nguyên namespace.** Nó đã đúng quy tắc QĐ-1 sẵn. Chỉ đổi `/engineering-intelligence` → `/engineering` (hub launcher hiện tại của nó) ở PR cuối, khi mọi thứ khác đã ổn định.

### 2.1. Bản đồ URL đích

| Hub | Route con |
| --- | --- |
| `/site` | `/site` (tổng quan) · `/site/tasks` · `/site/diary` · `/site/attendance` · `/site/resources` · `/site/approvals` · `/site/qc` · `/site/ncr` · `/site/work-fronts` · `/site/work-fronts/[floor]` · `/site/hse` · `/site/risks` · `/site/equipment` · `/site/vehicles` |
| `/schedule` | `/schedule` · `/schedule/wbs` · `/schedule/tracking/[sheet]` · `/schedule/gantt` · `/schedule/lookahead` · `/schedule/scurve` · `/schedule/baselines` · `/schedule/reports` · `/schedule/report` (bản in) |
| `/procurement` | `/procurement` · `/procurement/inventory` · `/procurement/orders` · `/procurement/purchase-requests` · `/procurement/qr` · `/procurement/suppliers` · `/procurement/subcontractors` · `/procurement/boq` · `/procurement/tenders` · `/procurement/reports` · `/procurement/import` |
| `/commercial` | `/commercial` · `/commercial/contracts` · `/commercial/costs` · `/commercial/insurance` · `/commercial/payments` · `/commercial/payment-certs` · `/commercial/payments/print` · `/commercial/proposals` · `/commercial/variations` · `/commercial/claims` · `/commercial/finance` |
| `/governance` | `/governance` · `/governance/kickoff` · `/governance/handover` · `/governance/warranty` · `/governance/documents` · `/governance/correspondences` · `/governance/meetings` · `/governance/environment` · `/governance/monitoring` · `/governance/org` · `/governance/personnel` · `/governance/users` · `/governance/import` · `/governance/admin/*` (giữ nguyên 9 trang con của `/admin`) |
| `/engineering` | giữ nguyên 35 trang con hiện có; hub launcher `/engineering-intelligence` gộp vào `/engineering` |
| Ngoài hub (đúng đắn khi ở top-level) | `/` · `/login` · `/password` · `/account` · `/offline` · `/notifications` · `/notifications/all` · `/my-tasks` · `/portfolio` · `/ban-ve` · `/tech` · `/mepf-process` · `/hub/[id]` · `/r/[kind]/[id]` · `/system/[code]` · `/progress/[system]` |

---

## 3. Chia việc

Mỗi việc = 1 nhánh/worktree riêng, 1 PR draft. Thứ tự bắt buộc: **V1 → V2 → V3 → V4…V7 (song song được) → V8**.

### V1 — Dọn shim, trang re-export và code chết (`route: mechanical`)

- **Xoá:** 26 `page.tsx` shim ở §1.1(a) + `app/order/page.tsx` + `app/cad-bim/page.tsx` + `app/mepf-cad-bim-studio/page.tsx` + `app/materials/_components/PurchaseRequestsTab.tsx` + `app/materials/_components/ReportsTab.tsx`.
- **Sửa link:** `grep -rn` trong `app/**` mọi `href`/`router.push`/`router.replace` trỏ tới URL vừa xoá → trỏ thẳng đích cuối (`/procurement?tab=inventory` v.v., đích tạm thời của V1; V4–V7 sẽ đổi tiếp sang `/procurement/inventory`). Đặc biệt: `EngineeringNav.tsx` mục "MEPF CAD/BIM Studio" đang trỏ `/mepf-cad-bim-studio` → đổi sang `/engineering/god-tier-studio`.
- **Không đổi** bất kỳ hành vi hub nào.
- **Tiêu chí đạt:** `npm run lint`, `npm run typecheck`, `npm run build` xanh; `grep -rn` không còn link nội bộ nào trỏ tới 30 URL đã xoá; giảm ≥ 2400 dòng.

### V2 — Hợp nhất 5 trang bản vẽ vào `/ban-ve?kind=` (`route: standard`)

- **Xoá:** `app/ban-ve-thiet-ke`, `app/ban-ve-hoan-cong`, `app/bien-phap-thi-cong`, `app/mo-hinh-bim`, `app/shopdrawings`.
- **Sửa `app/ban-ve/page.tsx`:** thay prop `fixedKind` bằng đọc `useSearchParams().get("kind")`, validate theo danh sách `design|shop|asbuilt|method|bim`, giá trị lạ hoặc thiếu → hiển thị tất cả. Đổi tab/bộ lọc `kind` sao cho khi người dùng đổi loại thì `router.replace` cập nhật `?kind=` (deep-link được).
- Bọc trong `<Suspense>` (bắt buộc với `useSearchParams` ở App Router).
- **Tiêu chí đạt:** 5 URL cũ 404; `/ban-ve?kind=shop` cho đúng nội dung `/shopdrawings` trước đây; reload giữ nguyên bộ lọc; nav trỏ đúng.

### V3 — Chuyển `HubShell` sang tab-điều-hướng + `layout.tsx` (`route: complex`)

- **Sửa `app/components/HubShell.tsx`:** `HubTab` đổi `content: ReactNode` → `href: string`; tab active suy ra từ `usePathname()` thay vì state; bỏ `useSearchParams`/`useTransition` cho việc chọn tab. Giữ nguyên `stats`, `searchPlaceholder`, `headerActions`, `bottomActions`, `AppHeader`.
- Thêm `app/<hub>/layout.tsx` cho 5 hub, render `HubShell` bọc `{children}`; `app/<hub>/page.tsx` còn lại là trang tổng quan.
- **Ranh giới được phép quyết:** cách chia `stats` (fetch trong layout vs trong từng page), có dùng `template.tsx` hay không, cách giữ scroll khi đổi tab. **Không được** đổi giao diện thanh tab/KPI đang có, không đổi bảng màu, không thêm thư viện.
- Làm mẫu di trú đầy đủ cho **1 hub duy nhất là `/site`** để V4–V7 bám theo (5 tab → 5 route con, nội dung lấy nguyên `app/site/_components/*Tab.tsx`).
- **Tiêu chí đạt:** `/site` và 5 route con hoạt động, deep-link + F5 + nút back đúng; các hub khác chưa di trú vẫn build được (giữ tạm bản `HubShell` cũ dưới tên `HubShellLegacy` nếu cần, và ghi rõ nợ kỹ thuật vào `PROGRESS.md` để V4–V7 xoá).

### V4 — Di trú `/procurement` (`route: spec`)

- 5 tab hiện có → `/procurement/{inventory,orders,qr,suppliers,boq}`; thêm `/procurement/purchase-requests`, `/procurement/reports`, `/procurement/import` (chuyển từ `app/materials/reports`, `app/materials/import` — **xoá thư mục `app/materials` sau khi chuyển**), `/procurement/subcontractors` (từ `app/subcontractors`), `/procurement/tenders` (từ `app/tenders`), `/procurement/boq` (từ `app/boq`, 1350 dòng — thay thế stub `BoqBiddingTab` 129 dòng).
- **Tiêu chí đạt:** không còn `app/materials`, `app/boq`, `app/subcontractors`, `app/tenders`; mọi link nội bộ đã đổi; `BoqBiddingTab.tsx` bị xoá, không còn stub.

### V5 — Di trú `/commercial` (`route: spec`)

- 5 tab → route con; thêm `/commercial/payments/print` (từ `app/payments/print`). **Vùng rủi ro cao (`docs/audit.md`): route tài chính** — bắt buộc rà lại `PAYMENT_VIEW_ROLES` trên từng trang chuyển và chạy test liên quan.
- **Tiêu chí đạt:** phân quyền xem tài chính không nới lỏng ở bất kỳ route con nào; `npm test` phần thanh toán/nghiệm thu pass.

### V6 — Di trú `/schedule` (`route: spec`)

- 4 tab → route con; kéo `/gantt`, `/lookahead`, `/report`, `/reports` vào. `/tracking/[sheet]` chuyển thành `/schedule/tracking/[sheet]` — **cẩn trọng**: SSE `/api/events?sheet=`, hàng đợi offline (`app/components/offlineQueue.ts`), `public/sw.js` và kết quả `/api/search` đều sinh URL tới `/tracking/...`. Rà hết, và **tăng version `CACHE` trong `public/sw.js`**.
- **Tiêu chí đạt:** tick offline → online vẫn đồng bộ; tìm kiếm toàn cục nhảy đúng trang; `/report` in ra PDF vẫn sạch.

### V7 — Di trú `/governance` từ launcher sang hub thật (`route: spec`)

- 5 tab → route con; kéo `/kickoff`, `/handover`, `/warranty`, `/documents`, `/correspondences`, `/meetings`, `/environment`, `/monitoring`, `/org`, `/personnel`, `/users`, `/import`, và toàn bộ `app/admin/**` (9 trang) vào `app/governance/`.
- Thay các thẻ `<a href="/users">` trong `app/governance/page.tsx` bằng trang tổng quan thật.
- **Tiêu chí đạt:** không còn trang nào trong danh sách trên ở top-level; `CAN` check phía trang vẫn nguyên (nhắc lại: trang chỉ redirect client-side, API mới là ranh giới bảo mật — không được coi việc đổi URL là biện pháp phân quyền).

### V8 — Nav, tài liệu, chốt sổ (`route: standard`)

- Viết lại `EngineeringNav.tsx` theo bản đồ §2.1: nhóm cấp 1 = 6 hub + mục ngoài hub; bỏ 46 mục phẳng hiện tại. Kiểm `roles` từng mục khớp `lib/roles.ts`.
- Cập nhật `lib/nav-settings.ts` nếu có lưu href.
- Cập nhật `PROGRESS.md`, `docs/nang-cap/README.md` (đóng M97), `spec.md`/`PROJECT.md` chỗ nào nêu URL cũ.
- **Tiêu chí đạt:** `grep -rn '"/\(materials\|boq\|contracts\|payments\|users\|handover\)"' app lib` không còn kết quả; đi hết mọi mục nav không gặp 404.

---

## 4. Rủi ro & cách chặn

| Rủi ro | Chặn bằng |
| --- | --- |
| Link nội bộ sót lại sau khi xoá/di chuyển trang ⇒ 404 trong app | `grep -rn` toàn bộ `app/**` và `lib/**` (kể cả URL tuyệt đối trong `lib/push.ts`, cron report, nhãn QR, `app/api/r/[kind]/[id]` — chưa gửi ra ngoài nhưng vẫn phải đúng) là bước cuối của mọi việc. Vì chưa có người dùng, đây là rủi ro sửa được ngay, không phải rủi ro vận hành. |
| `useSearchParams` không bọc `Suspense` ⇒ build fail | `npm run build` là tiêu chí đạt của mọi việc, không chỉ lint/typecheck |
| Service worker cache URL cũ ⇒ người dùng cũ thấy 404 dai dẳng | Tăng `CACHE` trong `public/sw.js` ở V6 và một lần nữa ở V8 |
| Di trú đồng thời nhiều hub ⇒ xung đột `HubShell` | V3 phải merge trước khi mở V4–V7; mỗi việc một worktree riêng, `git fetch origin` trước khi tạo nhánh |
| Mất phân quyền khi copy trang sang thư mục mới | V5/V7 rà theo `docs/audit.md` mục "Vùng rủi ro cao" |

## 5. Ước lượng

| Việc | Route | Quy mô |
| --- | --- | --- |
| V1 | `mechanical` | ~30 file xoá, ~2400 dòng giảm |
| V2 | `standard` | 5 file xoá, 1 file sửa |
| V3 | `complex` | `HubShell` + 1 layout + 5 route con |
| V4 | `spec` | ~12 route con, 4 thư mục xoá |
| V5 | `spec` | ~10 route con |
| V6 | `spec` | ~9 route con + sw.js + offline queue |
| V7 | `spec` | ~22 route con |
| V8 | `standard` | nav + tài liệu |
