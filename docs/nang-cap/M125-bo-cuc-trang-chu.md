# M125 — Bố cục trang chủ mạch lạc (cùng bộ khung với màn hình chứng từ M124)

| Thuộc tính       | Giá trị                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| Issue / Goal     | Trang chủ `/` đọc được theo một nhịp: ngữ cảnh → số liệu → việc cần làm |
| Spec owner       | Phiên chính (opusplan)                                                  |
| State            | **Approved for implementation**                                         |
| Người/ngày duyệt | Người dùng · 2026-09-21 ("layout trang chủ mạch lạc như vậy")           |
| Cập nhật         | 2026-09-21                                                              |

> Mockup: artifact "XBoss Trang chủ" (https://claude.ai/artifact/8BR2JgohGtsPbcTZq5PvCX). Đặc tả là nguồn sự thật khi lệch mockup. Phụ thuộc M124 (dùng `DocToolbar`, `Kbd`).

## 1. Problem và bằng chứng

`app/page.tsx` (994 dòng, đọc 2026-09-21) xếp dọc **15 khối** theo thứ tự: Tổng quan (4 StatCard) →
Tiến độ theo trang tracking (lưới 5 cột) → Theo hệ thi công (lưới 6 cột) → Trung tâm điều hành
(7 thẻ HUBS 4 cột + dải LIFECYCLE 6 giai đoạn) → `ProgressMap` → `DashboardExtCards` →
`BlockedPanel` → `NormsOverPanel` → `SpiCards` → `ForecastCards` → `SCurveChart` → `EvmChart` →
`DashboardBarChart` → `ScheduleControlPanel` → Pareto → Bảng trễ. Năm kiểu lưới khác nhau
(2/4, 2/3/4/5, 2/3/6, 1/2/4, bảng) nên mắt không bám được nhịp; người dùng phải cuộn ~6 màn hình
mới tới bảng trễ — thứ PM cần nhất mỗi sáng. Nút Excel/PDF/Import viết tay trong `bottomActions`
(dòng 437–466) không qua `Button`.

## 2. Outcome và guardrail

- Trang chủ mở ra thấy ngay: toolbar ngữ cảnh + 4 số liệu hành động + bảng trễ nằm trong ~2 màn
  hình desktop; các phân tích sâu (S-curve, EVM, bản đồ, biểu đồ) nằm trong **tab** của một thẻ
  duy nhất, không chiếm chiều dọc khi chưa cần.
- Guardrail: **không đổi API, không đổi bất kỳ component panel nào** (`ProgressMap`, `SCurveChart`,
  `EvmChart`, `ScheduleControlPanel`, `DashboardExtCards`, `SpiCards`, `ForecastCards`,
  `BlockedPanel`, `NormsOverPanel`, `DashboardBarChart`) — chỉ **sắp xếp lại** trong `page.tsx`.
  Giữ nguyên: kéo thả thứ tự trang tracking (Admin/PM), modal "Thêm trang", bộ lọc bảng trễ +
  Pareto lọc bảng, `EditableText`, e2e hiện có của trang chủ. Axe 0 serious/critical.

## 3. Hiện trạng liên quan

- Dữ liệu: `GET /api/dashboard` → `{kpi[], totalDelayed, delayedTasks[], groupProgress, quality,
vo, workfront, bySystem, approvals: {pendingProposals, pendingPurchaseRequests} | null}`;
  `GET /api/sheets`, `GET /api/systems`, `GET /api/code-lists?domain=delay_reason`.
- `overview` (dòng 284–293): `pct`, `totalTasks`, `delayed`.
- Thanh đáy: `AppHeader bottomActions` (chỉ hiện trên mobile khi không có nút riêng — ở trang chủ có
  nút riêng nên hiện mọi breakpoint; xem `AppHeader.tsx:395–416`).
- e2e: `e2e/authed/*.spec.ts` có spec trang chủ — worker `grep -l '"/"' e2e/authed` để tìm, phải
  giữ xanh, không sửa spec.

## 4. Scope / non-goals

**Scope:** sắp xếp lại `app/page.tsx` theo §5; 1 component nền mới `Tabs`; thay nút viết tay bằng
`Button`/`ButtonLink`. **Non-goals:** KPI mới cần API (vd "đến hạn ≤3 ngày" — chưa có trong
`/api/dashboard`, không thêm); đổi nội dung panel; tuỳ biến bố cục theo người dùng; đổi sidebar.

## 5. Bố cục (desktop ≥ lg; mobile xếp dọc theo đúng thứ tự liệt kê)

**Z0 — Toolbar** (`DocToolbar` của M124, `hidden md:flex`): [Import Excel — primary, `canImport`]
[Excel] [Báo cáo PDF] · Sep · [Nghiệm thu → `/approvals`] [Lookahead → `/lookahead`] · Sep ·
[Thêm trang — `canImport`, mở modal sẵn có] · trailing: chữ nhỏ "Cập nhật HH:mm" (giờ fetch xong).
Thanh đáy (`bottomActions`) giữ cùng bộ Import/Excel/PDF nhưng qua `ButtonLink`, `md:hidden`
(desktop đã có toolbar).

**Z1 — Dải số liệu** (`grid grid-cols-2 lg:grid-cols-4 gap-3`, `StatCard`):

1. Tiến độ tổng — `overview.pct` %, thanh progress (như hiện tại).
2. Hạng mục trễ — `totalDelayed`, phụ đề "`delayedTasks.length` công tác"; bấm cuộn tới
   `#delayed-table`. Tông cảnh báo khi > 0.
3. Chờ duyệt — `approvals.pendingProposals + approvals.pendingPurchaseRequests` (ẩn thẻ này khi
   `approvals` null, lưới còn 3 cột `lg:grid-cols-3`); link `/approvals`.
4. Công tác theo dõi — `overview.totalTasks`, phụ đề "`sheets.length` trang tracking".

**Z2 — Thân 2 cột** `grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start`.

_Cột trái (chính), theo thứ tự:_

- **Thẻ "Tiến độ" có tab** (`Card raised` + `Tabs`), tab lưu URL `?tab=` (mặc định `sheets`):
  `sheets` Trang tracking (danh sách hàng: tên sheet · thanh tiến độ · % · Chip "n trễ"/"Đúng tiến
  độ"; giữ kéo thả + link tới `/tracking/<slug>`), `systems` Hệ thi công (cùng kiểu hàng từ
  `systems`, link hub hệ như `CardLink` cũ), `map` Bản đồ (`ProgressMap`), `scurve` S-curve
  (`SCurveChart`), `evm` EVM (`EvmChart`), `chart` Biểu đồ (`DashboardBarChart`). Tab chưa mở
  không mount panel (giữ `dynamic()` import như hiện tại).
- **Đường găng**: `ScheduleControlPanel` nguyên trạng.
- **Bảng trễ** `id="delayed-table"`: `Section` + bộ lọc + bảng hiện có, nguyên trạng.
- `DashboardExtCards`, `BlockedPanel`, `NormsOverPanel` (điều kiện role như cũ) — nguyên trạng.

_Cột phải (rail 320px, `lg:sticky lg:top-4`):_

- **Trung tâm điều hành** (`Card raised`): 7 mục `HUBS` dạng hàng gọn 44px (icon 32px nền mờ màu
  phân hệ · tên · mô tả 1 dòng `truncate`), link giữ nguyên `href`. Không badge số (chưa có API).
  Dưới cùng: dải `LIFECYCLE` 6 đoạn (giữ logic giai đoạn hiện tại, thu thành thanh mảnh + nhãn).
- **Pareto** (`Card sunken`): nội dung hiện có, bấm thanh lọc bảng trễ như cũ.
- `SpiCards`, `ForecastCards` — nguyên trạng, xếp dọc.

## 6. Yêu cầu

- FR1 `Tabs` (`app/components/ui/Tabs.tsx`): `items: {id, label, icon?, badge?}[]`, `value`,
  `onChange`; hàng tab `flex gap-0.5 border-b border-zinc-800 overflow-x-auto scrollbar-none`,
  tab `min-h-10 px-3 text-sm font-medium text-zinc-400`, đang chọn
  `text-emerald-300 border-b-2 border-emerald-500` (emerald = đang chọn, ADR-0009), `role="tablist"`
  / `role="tab"` / `aria-selected`, bàn phím ←/→. Export qua `index.ts`.
- FR2 Kiểu hàng tiến độ dùng chung cho 2 tab đầu: 1 component nội bộ
  `app/components/ProgressRow.tsx` (`grid grid-cols-[minmax(0,1fr)_56px_auto] sm:grid-cols-[160px_minmax(0,1fr)_56px_auto]`).
- FR3 Toolbar/thanh đáy: mọi nút qua `Button`/`ButtonLink`; xoá class nút viết tay dòng 437–466.
- NFR: không `dark:`/hex; giữ `pb-24` chừa thanh đáy; tab mặc định không làm thay đổi kết quả e2e
  hiện có (các text e2e đang tìm phải còn hiển thị ở tab mặc định hoặc ngoài tab — worker kiểm
  spec trước khi chọn tab mặc định).

## 7. Acceptance criteria

- AC1: desktop 1280px — toolbar, 4 StatCard, thẻ tab, rail phải nhìn thấy trong màn hình đầu;
  bảng trễ bắt đầu trước 2 màn hình.
- AC2: `?tab=scurve` reload mở đúng tab; tab không chọn không gọi API riêng (kiểm Network).
- AC3: kéo thả thứ tự sheet (Admin/PM) vẫn PATCH như cũ; Pareto bấm vẫn lọc bảng.
- AC4: 390px — một cột, thanh đáy có Import/Excel/PDF, toolbar trên ẩn.
- AC5: lint/typecheck/build/check:contrast/check:mau-accent/test + e2e trang chủ xanh.
- AC6: `page.tsx` ngắn hơn hiện tại (mục tiêu ≤ 800 dòng) nhờ tách `ProgressRow` + rail.

## 8. Điểm chạm code

Sửa `app/page.tsx`; mới `app/components/ui/Tabs.tsx`, `app/components/ProgressRow.tsx`,
`app/components/HomeRail.tsx` (Trung tâm điều hành + lifecycle + Pareto nhận props); sửa
`app/components/ui/index.ts`; docs: ADR-0009 (mục Tabs), `PROGRESS.md`, `docs/nang-cap/README.md`.
Không chạm `lib/`, `app/api/`.
