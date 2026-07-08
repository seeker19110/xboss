# Kế hoạch nâng cấp: AppShell đa dự án + toàn bộ IA dashboard theo cấu trúc phân cấp

> **Trạng thái: ĐÃ CHỐT hướng đi (2026-07).** PM duyệt cấu trúc phân cấp + cách gom
> cụm + thiết kế project switcher. Triển khai theo lộ trình N1→N4 ở các PR sau (bắt
> đầu M21); **điều chỉnh chi tiết khi vào từng module** — cây IA là append-only, chốt
> khung không chốt cứng từng leaf. Tài liệu này phân tích file mockup
> `xBossmockup.xlsx` (do PM cung cấp 2026-07), đối chiếu hiện trạng điều hướng
> (`app/components/AppHeader.tsx` + `app/lib/nav.ts`, khung M0 trong
> `docs/nang-cap/M00-khung-ui-sidebar.md`) và đề xuất tái cấu trúc **toàn bộ**
> thông tin (IA) vào AppShell theo mô hình **phân cấp đa dự án**.
>
> Bản đồ IA trực quan kèm theo (một trang, gửi riêng dạng Artifact) là phụ lục
> trực quan của tài liệu này.

## 1. Bối cảnh & phát hiện chính

Mockup mô tả một **cây thông tin toàn vòng đời dự án thi công** (khởi động → thiết
kế → đấu thầu → cung ứng → thi công → QA/QC/HSE → chi phí → bàn giao → bảo hành),
gồm **24 "Dashboard" cấp cao** lồng tối đa **4 cấp con** (nhóm → mục → mục con →
form). Cột `0/I/II/III/IV/V/VI` ở dòng đầu chính là **bậc thụt lề** = cấp phân cấp.

Ba phát hiện định hình toàn bộ kế hoạch:

1. **Cây mockup là tổng cho MỘT dự án.** File có `Dự án TT AVIO – Phúc Lộc Khang`
   (dòng 3) rồi `Dự án 2` (598), `Dự án 3` (603) — mỗi dự án lặp lại **nguyên cây
   24 dashboard**. XBoss phải quản lý **đa dự án**, nên tầng cao nhất của IA là
   **Portfolio → Dự án**, và toàn bộ 24 dashboard nằm **bên trong** dự án đang chọn.
2. **Điều hướng hiện tại phẳng 2 cấp.** `NAV_GROUPS` gồm 7 nhóm × ~30 mục, map
   thẳng tới trang thật. Không có khái niệm dự án ở UI (schema có `projects` nhưng
   UI mặc định 1 dự án — `/api/project` trả tên 1 dự án, fallback khi DB trống).
3. **~60% node mockup chưa có trang.** ~15/24 dashboard đã có ít nhất 1 trang thật;
   ~9 dashboard hoàn toàn mới (Môi trường, Tài chính kế toán, Bảo hiểm & bảo lãnh,
   Bàn giao & kết thúc, Bảo hành, Chuyển đổi số, Khởi động & pháp lý, Quan hệ &
   quan trắc, phần lớn Nhân sự & tổ chức).

**Quyết định phạm vi (đã chốt với PM):** thể hiện **toàn bộ cây** trong AppShell —
node đã có trang thì link chạy được, node chưa build thì hiện mờ + badge **"Sắp có"**
(không click). Sidebar trở thành **bản đồ lộ trình sống**, không chỉ là menu.

**Nguyên tắc xuyên suốt — nâng cấp tiến hoá, GIỮ phần đang tốt.** Không đập đi làm
lại. Toàn bộ 30 trang đang chạy, khung M0 (AppShell/topbar/theme), `NAV_GROUPS`,
hub hệ `/he/[code]`, các pattern (Skeleton/dialogs/Toast/upload/notification) được
**giữ nguyên và bọc lại** dưới cây IA mới — không đổi URL, không phá luồng đang dùng.
Cây `dashboardTree.ts` là **mở rộng** của `nav.ts` hiện tại (thêm `children`+`status`),
không thay thế. Mỗi cụm/dashboard chỉ gom lại + đặt đúng vị trí phân cấp; giá trị đã
có không mất đi, phần mới lấp dần.

**Title đỉnh AppShell = tên dự án hiện tại.** Đỉnh sidebar (chỗ chữ "XBoss" logo cũ)
hiển thị **tên dự án đang chọn** (đọc từ `/api/project`) làm tiêu đề chính, kèm nút
đổi dự án (project switcher). Logo/thương hiệu XBoss thu về icon nhỏ. Topbar vẫn giữ
breadcrumb cụm/dashboard của trang đang xem — nhưng "danh tính" của cả AppShell là
**dự án**, đúng mô hình đa dự án.

## 2. Mô hình phân cấp đề xuất (5 tầng)

```
0. Portfolio        — Tổng các dự án (KPI gộp, danh sách dự án)      ← MỚI
1. Dự án            — Dự án đang chọn (project switcher)              ← MỚI (UI)
2. Cụm nghiệp vụ    — ~11 cụm gom 24 dashboard theo vòng đời          ← MỚI
3. Dashboard        — 24 dashboard của mockup                        (một phần đã có)
4. Mục / Section    — nhóm D→E→F→G, render trong trang hub dashboard  (một phần đã có)
```

**Nguyên tắc chia tầng cho sidebar (KISS — không nhồi 4 cấp vào sidebar):**

- **Sidebar tải 2 tầng điều hướng**: Cụm nghiệp vụ (header nhóm) → Dashboard (mục
  bấm được, gập/mở). Đây là mức "phân cấp hợp lý nhất" cho thao tác hằng ngày.
- **Chiều sâu còn lại (cấp 4: D/E/F/G) sống trong TRANG HUB của từng dashboard** —
  render dạng thẻ/section với badge trạng thái, đúng pattern hub hệ thi công đang có
  (`/he/[code]`). Tránh sidebar sâu 4 cấp gây rối trên mobile công trường.
- **Project switcher** đặt trên đỉnh sidebar (dưới logo): tên dự án đang chọn +
  dropdown đổi dự án + lối tới **Portfolio**. Lựa chọn dự án lưu `localStorage`
  (`xboss_project`) và là tham số ngầm của mọi trang/nội dung bên dưới.

## 3. IA đề xuất — gom 24 dashboard thành 11 cụm nghiệp vụ

Thứ tự cụm bám **vòng đời dự án** (không phải bảng chữ cái) để PM/kỹ sư đọc theo
dòng công việc. Cột "Trạng thái" = mức phủ của code hiện có.

| # | Cụm nghiệp vụ | Dashboard (mockup) | Trang/route hiện có | Trạng thái |
|---|---|---|---|---|
| A | **Tổng quan & Báo cáo** | Báo Cáo & KPI Tổng | `/` `/report` (KPI, S-curve, EVM/SPI qua `SpiCards`/`ForecastCards`, Alerts qua thông báo) | Phần lớn đã có |
| B | **Khởi động & Tổ chức** | Khởi Động & Pháp Lý; Nhân Sự & Tổ Chức | `/users` `/admin` (tài khoản, phân công) | Ít — chủ yếu mới |
| C | **Thiết kế & Bản vẽ** | Thiết Kế & BPTC; BIM-Shop-Drawing | `/drawings` | Một phần (BPTC mới) |
| D | **Kế hoạch & Tiến độ** | Tiến Độ (tổng + theo hệ) | `/timeline` `/gantt` `/lookahead` `/` (S-curve), theo hệ qua `/he/[code]` | Đã có tốt |
| E | **Đấu thầu & Nhà thầu phụ** | Đấu Thầu & Chọn Thầu Phụ; NTP | `/tenders`, hub NTP theo hệ `/he/[code]` | Một phần |
| F | **Vật tư & Thiết bị** | Vật Tư; Thiết Bị & Máy Móc | `/materials` `/materials/purchase-orders` `/boq` `/equipment` `/vehicles` | Đã có tốt |
| G | **Thi công hiện trường** | Hiện Trường | `/work-fronts` `/diary` `/tracking` `/my-tasks` `/approvals` | Đã có tốt |
| H | **Chất lượng · An toàn · Môi trường** | Chất Lượng (QA/QC); An Toàn HSE & Rủi Ro; Môi Trường & Giấy Phép; Quan Hệ & Quan Trắc | `/quality` `/hse` `/risks` | QA/HSE đã có; Môi trường & Quan trắc mới |
| I | **Chi phí · Hợp đồng · Tài chính** | Chi Phí & Hợp Đồng; Tài Chính – Kế Toán; Bảo Hiểm & Bảo Lãnh; Claim & Thay Đổi | `/costs` `/contracts` `/payments` `/payment-certs` `/proposals` `/variations` | Chi phí/HĐ đã có; Kế toán, Bảo hiểm mới |
| J | **Điều hành & Hồ sơ** | Họp – Công Văn; Hồ Sơ | `/meetings` `/correspondences` `/documents` | Đã có |
| K | **Bàn giao & Vận hành** | Bàn Giao & Kết Thúc; Bảo Hành – Bảo Trì | — | Mới hoàn toàn |
| L | **Công nghệ & Số hoá** | Chuyển Đổi Số & Công Nghệ | — (một phần: CDE ↔ `/documents`, mobile ↔ PWA) | Mới (khung đã có) |

> Cụm L có thể gộp vào **Quản trị** (Users/Import/Account) làm một cụm "Hệ thống"
> ở đáy sidebar nếu muốn giảm số cụm xuống 11. Giữ tách khi muốn nêu rõ lộ trình số hoá.

### 3.1. Chi tiết cấp 4 (trong trang hub) — ví dụ 2 dashboard tiêu biểu

**Dashboard Vật Tư** (đã có nhiều) — trang hub `/materials` render các section:

- TENDER + BOQ Tổng → `/boq` ✅
- BOQ theo hệ (Kết cấu / Xây tô / ACMV / Điện / CTN / PCCC) → lọc `/boq?he=` ✅ một phần
- Quản lý định mức (lập → duyệt → giao khoán → cấp phát → theo dõi → so sánh → báo cáo) → M18 🕓
- Đặt hàng (PR → RFQ → PO → duyệt → giao → GRN → đối chiếu) → `/materials/purchase-orders` ✅ một phần
- Kho bãi & Nhập–Xuất–Tồn → 🕓

**Dashboard Chất Lượng (QA/QC)** — trang hub `/quality`:

- Kế hoạch chất lượng (ITP) theo hệ → ✅ một phần (`/quality`)
- Mock-up & mẫu → 🕓
- Hồ sơ thí nghiệm (theo hệ) → 🕓
- Nghiệm thu chất lượng (RFI/RFA, checklist, biên bản) → ✅ (`/approvals` + task_documents)
- Kiểm soát không phù hợp (NCR/CAR/PAR) → 🕓
- Báo cáo chất lượng & KPI → 🕓

_(Cây đầy đủ 4 cấp cho cả 24 dashboard nằm trong bản đồ Artifact + sẽ mã hoá trong
`app/lib/dashboardTree.ts` khi triển khai — xem §6.)_

## 4. Thiết kế AppShell mới

### 4.1. Cấu trúc sidebar

```
┌───────────────────────────────────┐
│ [◈] TT AVIO – Tháp A          ▾   │  ← TITLE = tên dự án hiện tại (+ đổi dự án/Portfolio)
│      XBoss · logo nhỏ             │
├───────────────────────────────────┤
│ A · TỔNG QUAN & BÁO CÁO           │  ← header cụm (không bấm)
│   ▸ Báo cáo & KPI tổng            │  ← dashboard (bấm mở hub / gập-mở)
│ D · KẾ HOẠCH & TIẾN ĐỘ            │
│   ▾ Tiến độ            [đang mở]   │
│       Timeline tổng thể     ✓     │  ← mục con (link thật)
│       Gantt tổng thể        ✓     │
│       Lookahead             ✓     │
│       Tiến độ theo hệ ▸           │
│ H · CHẤT LƯỢNG · AN TOÀN · MT     │
│   ▸ Chất lượng (QA/QC)            │
│   ▸ An toàn – HSE & Rủi ro        │
│   ▸ Môi trường & Giấy phép  Sắp có│  ← node chưa build: mờ + badge
│ …                                 │
├───────────────────────────────────┤
│ ⚙ Hệ thống (Users/Import) [Admin] │
└───────────────────────────────────┘
```

- **Trạng thái node**: `available` (link thật, đủ tương phản) · `partial` (link thật
  + chấm "đang hoàn thiện") · `coming-soon` (mờ `text-zinc-500`… **không** vi phạm
  a11y vì là mục vô hiệu, kèm badge chữ "Sắp có" + `aria-disabled`, không phải link).
- **Gập/mở cụm & dashboard**: nhớ trạng thái trong `localStorage`; cụm chứa trang
  đang xem tự mở. Trên mobile là drawer off-canvas như hiện tại.
- **Badge "Sắp có"** dùng nền `zinc-800` + chữ `amber-300`, đồng bộ bảng màu app.
- Giữ nguyên topbar (title/breadcrumb suy từ cây nav) + `GlobalSearch`,
  `NotificationBell`, `ThemeToggle`, `OnlineUsers`, avatar.

### 4.1b. Project switcher — dropdown chọn nhanh dự án

Title đỉnh AppShell không chỉ hiển thị tên dự án mà là **nút mở dropdown** đổi dự án
tức thì, không rời trang đang xem.

**Trigger (luôn thấy, đỉnh sidebar):**

```
┌───────────────────────────────┐
│ [◈] TT AVIO – Tháp A       ▾  │  ← bấm mở dropdown; ◈ = avatar/màu dự án
└───────────────────────────────┘
```

- Icon/màu nhận diện dự án + **tên dự án đang chọn** (truncate 1 dòng) + chevron `▾`.
- Vùng chạm ≥40px; `aria-haspopup="listbox"`, `aria-expanded`. Khi thu gọn sidebar
  (icon-only) chỉ hiện ◈, bấm vẫn mở dropdown (popover).

**Panel dropdown (mở ra):**

```
┌───────────────────────────────┐
│ 🔎 Tìm dự án…                 │  ← ô lọc, chỉ hiện khi > ~7 dự án
├───────────────────────────────┤
│ ★ ĐÃ GHIM                     │  ← nhóm pin (nếu có), luôn trên cùng
│ ✓ ● TT AVIO – Tháp A  ★  72%  │  ← dự án hiện tại (tick + %tiến độ)
│   ● Khu dân cư PLK    ★   8% ⚠│
├───────────────────────────────┤
│ ● ĐANG THI CÔNG               │  ← nhóm theo trạng thái
│   ● TT AVIO – Tháp B  ☆  45%  │      ☆ = bấm để ghim/bỏ ghim
│   ● Nhà xưởng ABC     ☆  30%  │
│ ✔ ĐÃ BÀN GIAO / ĐÓNG          │
│   ● Cao ốc XYZ        ☆ 100%  │  ← làm mờ nhẹ
├───────────────────────────────┤
│ ▦  Xem tất cả dự án (Portfolio)│  ← lối tới trang tổng
└───────────────────────────────┘
```

- Mỗi dòng: chấm màu dự án + tên + **% tiến độ** (tabular-nums) + badge cảnh báo nếu
  có việc trễ. Dự án đang chọn có dấu `✓` + nền `zinc-800`.
- **Ghim yêu thích (★):** bấm sao để ghim; dự án đã ghim gom lên nhóm **"★ Đã ghim"**
  trên cùng (nhiều PM chỉ xoay quanh vài dự án). Lưu `localStorage('xboss_pinned')` —
  thuần client, không cần backend.
- **Nhóm theo trạng thái:** khi có nhiều dự án, tách **"Đang thi công"** và **"Đã bàn
  giao / Đóng"** (đọc trạng thái dự án); nhóm đã đóng làm mờ nhẹ, xếp dưới. Khi ít dự
  án (≤ ~5) và chưa ghim gì → hiển thị phẳng, bỏ header cho gọn.
- **Ô lọc** hiện khi danh sách dài (>~7); lọc client theo tên/mã.
- Chân panel: **"Xem tất cả dự án (Portfolio)"** → `/portfolio`.
- **Chọn 1 dự án** = đặt `xboss_project` (localStorage + cookie để server scope) →
  làm mới nội dung theo dự án mới, **giữ nguyên trang/route đang xem nếu tồn tại**
  (vd đang ở `/materials` thì đổi dự án vẫn ở `/materials` của dự án mới); nếu route
  không áp dụng cho dự án mới thì lùi về dashboard dự án.

**Hành vi & a11y:**

- Đóng khi bấm ngoài / `Esc`; điều hướng bằng phím ↑/↓/Enter (role `listbox`/`option`).
- Mobile (<1024px): mở dạng **bottom sheet** full-width thay vì popover, dễ chạm.
- Khi chỉ có **1 dự án**: trigger vẫn hiển thị tên (title), bấm mở panel chỉ có 1 mục
  + lối Portfolio — sẵn sàng mở rộng, không phải trạng thái đặc biệt.
- **Nguồn dữ liệu:** `GET /api/projects` (mới — danh sách dự án user được thấy + %
  tiến độ + số việc trễ, dùng chung với trang Portfolio); tôn trọng `user_projects`
  (M22). Trước khi có M22: trả 1 dự án hiện tại từ `/api/project`.

> Đây thuần UI/UX ở đợt N1–N2 (dropdown + `xboss_project` client). Việc **server thực
> sự lọc theo `project_id`** là M22 (đợt N3) — dropdown làm trước, scoping bật sau,
> không phá vỡ hành vi 1 dự án hiện tại.

### 4.2. Trang Portfolio (`/portfolio` hoặc `/`)

Khi có >1 dự án: trang tổng liệt kê dự án dạng thẻ (tên, % tiến độ, số việc trễ,
trạng thái) + KPI gộp toàn danh mục. Bấm 1 dự án = đặt `xboss_project` và vào
dashboard dự án đó. Khi chỉ có 1 dự án: giữ hành vi cũ (vào thẳng dashboard),
switcher vẫn hiện để sẵn sàng mở rộng.

### 4.3. Trang hub dashboard

Mỗi dashboard cấp 3 có một **trang hub** render cây con (D/E/F/G) dạng thẻ nhóm,
mỗi lá là link/badge trạng thái — tái dùng khuôn `/he/[code]`. Đây là nơi chứa
chiều sâu, giữ sidebar gọn.

## 5. Ảnh hưởng kiến trúc — đa dự án

Đây là thay đổi nền tảng, cần ADR riêng trước khi code:

- **Scoping theo dự án**: hầu hết bảng nghiệp vụ đã có `project_id` (Project →
  Tower → …). Cần: (a) API nhận `projectId` (header/query) và lọc theo đó; (b)
  chốt dự án đang chọn ở server (cookie/param) thay vì mặc định 1 dự án; (c) rà
  các query đang ngầm giả định 1 dự án.
- **Quyền theo dự án**: cân nhắc `user_projects` (ai thấy dự án nào) song song
  `user_disciplines` hiện có. Ranh giới bảo mật vẫn ở API (nguyên tắc dự án).
- **Portfolio KPI**: view/endpoint gộp cross-project (không phá cache 1 dự án).
- **Migration**: append-only `migrations/000N_*.sql` cho `user_projects` + index
  `project_id` còn thiếu; cập nhật `docs/ERD.md` + ADR-000N "multi-project".

> Khuyến nghị: tách thành **2 nhánh công việc**. (1) *AppShell IA đầy đủ* (thuần
> UI/nav, không đụng scoping — an toàn, giá trị thấy ngay). (2) *Multi-project
> backend* (ADR + scoping + Portfolio) làm nền, rủi ro cao hơn. Có thể ship (1)
> trước với project switcher trỏ 1 dự án, rồi bật (2).

## 6. Mô hình dữ liệu nav khi triển khai

Nguồn duy nhất: mở rộng `app/lib/nav.ts` (hoặc file mới `app/lib/dashboardTree.ts`)
sang cây có `children` + `status`:

```ts
type NavStatus = "available" | "partial" | "coming-soon";
type DashNode = {
  id: string;
  label: string;
  href?: string;              // có = link thật; không = header/placeholder
  icon?: LucideIcon;
  status?: NavStatus;         // mặc định suy: có href → available
  roles?: Role[];
  children?: DashNode[];
};
type DashCluster = { id: string; label: string; icon: LucideIcon; dashboards: DashNode[] };
```

`AppHeader` render đệ quy cây này; `findActiveNav` mở rộng để tìm theo href sâu.
Giữ `canSeeNavItem` (ẩn/hiện theo vai trò — chỉ là UX). Cây là **append-only theo
tài liệu** — mỗi module M<x> khi hoàn thành chỉ đổi `status` node tương ứng từ
`coming-soon` → `available`.

## 7. Lộ trình đề xuất (phân đợt, bám `docs/nang-cap/`)

| Đợt | Nội dung | Rủi ro | Phụ thuộc |
|---|---|---|---|
| **N1** | Cây `dashboardTree.ts` + sidebar phân cấp gập/mở + badge "Sắp có" + trang hub khuôn chung. **Thuần UI, không đổi API.** | Thấp | — |
| **N2** | Project switcher (client, 1 dự án) + trang Portfolio (đọc `/api/project(s)`). | Thấp–TB | N1 |
| **N3** | ADR multi-project + scoping API theo `project_id` + `user_projects` + Portfolio KPI gộp. | Cao | N2 |
| **N4+** | Lấp dần 9 dashboard mới (Môi trường, Tài chính KT, Bảo hiểm, Bàn giao, Bảo hành, Chuyển đổi số…) — mỗi cái 1 module M<x>, đổi `status` node. | TB | N1 |

## 8. Định nghĩa hoàn thành cho đợt N1 (khi được lệnh triển khai)

- [ ] `app/lib/dashboardTree.ts` mã hoá đủ 24 dashboard + cấp con + `status`, map
      route hiện có chính xác (không link chết).
- [ ] Sidebar render cây 2 tầng, gập/mở nhớ `localStorage`, cụm chứa trang hiện tại
      tự mở; node `coming-soon` `aria-disabled`, không phải link.
- [ ] Trang hub khuôn chung render cây con + badge; áp cho ≥2 dashboard mẫu.
- [ ] Topbar title/breadcrumb suy đúng theo cây mới; tương phản đủ 2 theme; axe xanh
      desktop + mobile; `e2e/authed/appshell.spec.ts` cập nhật.
- [ ] `lint` + `typecheck` + `build` xanh; cập nhật `PROGRESS.md` + tài liệu này.
