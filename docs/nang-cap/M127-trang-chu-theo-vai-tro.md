# M127 — Trang chủ theo vai trò: "Điều hành" cho PM/BCH, "Hiện trường" cho kỹ sư/thầu phụ

| Thuộc tính       | Giá trị                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Issue / Goal     | Trang chủ `/` trả lời đúng câu hỏi của từng vai trò trong màn hình đầu, kể cả trên điện thoại |
| Spec owner       | Phiên chính (opusplan)                                                                   |
| State            | **Approved for implementation**                                                          |
| Người/ngày duyệt | Người dùng · 2026-09-22 (duyệt toàn bộ, ngưỡng "Đến hạn" theo `alert_rules`)             |
| Cập nhật         | 2026-09-22                                                                               |

> Kế thừa M125 (toolbar + dải số liệu + thân 2 cột). Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng (đọc code 2026-09-22)

- **Thầu phụ (`subcon`) vào `/` thấy trang gần trống**: `GET /api/dashboard` trả 403 cho subcon
  (`CAN.viewDashboard`), `app/page.tsx` nuốt lỗi (`r.ok ? r.json() : null`) → 4 StatCard đều 0,
  bảng trễ "Không có công việc trễ", các tab S-curve/EVM cũng 403. Không có thông điệp, không có
  đường tới việc được giao. Kỹ sư cũng phải tự tìm sang `/my-tasks` để biết việc hôm nay.
- **Một trang chủ cho 7 vai trò**: cùng bố cục M125 cho PM (cần tổng quan) lẫn kỹ sư hiện trường
  (cần "hôm nay tôi tick gì, cái gì sắp trễ") — kỹ sư trên điện thoại phải cuộn qua toolbar, 4 KPI
  tổng, thẻ tab biểu đồ mới tới thứ liên quan tới mình.
- **Số liệu thiếu chiều "sắp tới"**: dải KPI chỉ có tiến độ tổng / trễ / chờ duyệt / tổng công tác —
  không có "đến hạn ≤N ngày" (đã có ngưỡng `alert_rules.due_soon_days`, đã tính trong
  `lib/dich-vu/thong-bao.ts` nhưng chỉ để sinh thông báo) và không có "Δ so với tuần trước" dù
  API đã hỗ trợ `?range=week`.
- **Hình thức chưa đồng nhất**: `DashboardExtCards`, `SpiCards`, `ForecastCards`, `BlockedPanel`,
  `NormsOverPanel` vẫn dùng class `bento-card` viết tay (`rounded-2xl`, nền `zinc-950`) cạnh
  `StatCard`/`Card` chuẩn ADR-0009 (`rounded-xl`, 2 tông raised/sunken) → cùng một trang có 2 ngôn
  ngữ thẻ. Bộ lọc bảng trễ là `<select>` viết tay. Rail phải 320px sticky đẩy Pareto xuống dưới
  6 giai đoạn vòng đời (thuần điều hướng, ít dùng).

## 2. Outcome, metric và guardrail

- Mỗi vai trò mở `/` thấy trong **màn hình đầu** (desktop 1280 và mobile 390) đúng thứ mình cần:
  PM/BCH → tiến độ, trễ, đến hạn, chờ duyệt, bảng trễ; kỹ sư/thầu phụ → việc của tôi hôm nay
  (đến hạn/trễ/đang làm) + nút vào lưới tick.
- Thầu phụ không còn thấy trang trống: `/` không gọi API mình bị cấm.
- Guardrail: **không đổi** `lib/tien-do/recompute.ts`, `lib/bao-mat/auth.ts` (không thêm/bớt quyền),
  không đổi schema DB (không migration). Giữ e2e hiện có xanh **không sửa spec**: heading
  "Tổng quan dự án" và "S-curve" phải còn ở chế độ Điều hành (tài khoản e2e là admin/pm);
  `a[href="/system/acmv"]` còn trên `/` (`e2e/authed/system.spec.ts`). Axe 0 serious/critical.
  Không `dark:`, không hex, mọi nút qua `Button`/`ButtonLink`, thẻ qua `Card`/`StatCard`.

## 3. Nghiên cứu hiện trạng

- `app/page.tsx` (769 dòng): fetch `me`, `/api/dashboard`, `/api/sheets`, `/api/systems`,
  `/api/code-lists?domain=delay_reason`; `overview` tính client; Z0 `DocToolbar`; Z1 4 `StatCard`;
  Z2 `lg:grid-cols-[minmax(0,1fr)_320px]`; `HomeRail` (HUBS 6 mục + LIFECYCLE 6 + Pareto).
- `app/api/dashboard/route.ts`: 401/403 subcon; `?system=`, `?range=week|month` (thêm
  `avgProgressPrev`/`deltaProgress` cho từng `kpi[]`); khối `quality/procurement/workfront/vo/
bySystem/approvals` từ `lib/tien-do/dashboardext.ts`.
- `app/api/my-tasks/route.ts` (mọi vai trò, module `field`): `{tasks[], summary:{total, delayed,
done}}`, sắp theo hạn.
- `lib/dich-vu/thong-bao.ts` dòng 108–134: SQL "sắp đến hạn" (`due_soon_days`/`due_soon_progress`
  từ `getAlertThreshold`, `lib/van-hanh/alerts.ts`) — tái dùng điều kiện, không copy.
- Thanh đáy: `AppHeader` (`isHome` → luôn có ô tìm kiếm mobile; `bottomActions` truyền khi
  `compact`).
- Test route: `tests/route-dashboard-bao-cao.test.ts` (khuôn `dangNhap`/`taoDuAn`).

## 4. Phương án

| Phương án                                                    | Lợi ích                                               | Chi phí/rủi ro                                             | Kết luận |
| ------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------- | -------- |
| Không làm                                                    | 0                                                     | Subcon vẫn trang trống; kỹ sư vẫn đi vòng                  | Loại     |
| A. Redirect kỹ sư/subcon sang `/my-tasks`                    | Rẻ                                                    | `/` mất vai trò "cửa vào" (không có tìm kiếm, hub, thông báo tổng); kỹ sư mất dashboard | Loại     |
| **B. Một trang `/`, 2 chế độ theo vai trò, kỹ sư chuyển được** | Đúng việc từng người, subcon có trang chủ thật, giữ M125 | `page.tsx` phải tách thành 2 view + hook dữ liệu chung      | **Chọn** |

## 5. Scope / non-goals

**Scope:** (1) tách `app/page.tsx` thành `HomeDieuHanh` + `HomeHienTruong` chọn theo vai trò;
(2) mở rộng `/api/dashboard` thêm `dueSoon` + `weekDelta` (contract §10); (3) chế độ Hiện trường
dùng `/api/my-tasks` + `/api/notifications` sẵn có; (4) chuẩn hoá hình thức 5 panel `bento-card`
về `Card`/`StatCard`; (5) mobile: thứ tự khối + thanh đáy theo vai trò.
**Non-goals:** tuỳ biến bố cục theo từng người dùng (kéo thả widget); đổi sidebar/`dashboardTree`;
KPI tài chính trên trang chủ (quyết 2026-07-11 giữ nguyên); đổi nội dung `SCurveChart`/`EvmChart`/
`ProgressMap`/`ScheduleControlPanel`/`DashboardBarChart` (chỉ đổi lớp vỏ nếu cần).

## 6. User journeys và trạng thái

- **PM đăng nhập desktop** → chế độ Điều hành: toolbar → dải 5 số liệu (Tiến độ +Δ tuần · Trễ ·
  Đến hạn · Chờ duyệt · Công tác) → thẻ Tiến độ có tab (mặc định `scurve`) + Theo hệ → bảng trễ.
  Rail phải: Pareto (lên đầu) → Trung tâm điều hành (6 hàng) → vòng đời thu thành 1 hàng chip.
- **Kỹ sư đăng nhập điện thoại** → chế độ Hiện trường: lời chào + ngày → 3 số liệu (Đến hạn ≤N ·
  Trễ · Đang làm) → danh sách "Việc hôm nay" (đến hạn + trễ, tối đa 8, mỗi hàng bấm mở lưới đúng
  tầng) → nút lớn "Mở lưới tracking" / "Nhật ký hôm nay" / "Tất cả việc của tôi" → thông báo chưa
  đọc (3 dòng mới nhất). Góc phải toolbar có nút "Xem tổng quan" chuyển sang Điều hành (ghi
  `localStorage('xboss_home_mode')`, lần sau vào giữ lựa chọn).
- **Thầu phụ** → luôn Hiện trường, **không có** nút chuyển (không có `viewDashboard`), `/` không gọi
  `/api/dashboard`. Không có việc được giao → EmptyState "Bạn chưa được giao công việc — liên hệ PM".
- **Module `field` tắt** (`/api/my-tasks` trả lỗi `module_disabled`) → kỹ sư rơi về Điều hành;
  thầu phụ thấy EmptyState "Phân hệ Hiện trường đang tắt cho dự án này".
- Loading: `PageSkeleton`. Lỗi mạng: `ErrorState` + nút thử lại (không nuốt lỗi như hiện tại).
- Offline (PWA): API GET đã cache SWR trong `sw.js` → hiện dữ liệu cũ + nhãn "Cập nhật HH:mm".

## 7. Requirements

**Dữ liệu & vai trò**

- FR1 `app/lib/homeMode.ts` (client thuần): `resolveHomeMode(role, saved) → "dieu-hanh" | "hien-truong"`:
  `subcon` → luôn `hien-truong`; `engineer` → `saved ?? "hien-truong"`; còn lại → luôn `dieu-hanh`
  (bch/cdt/viewer không có việc được giao). Test unit `tests/home-mode.test.ts`.
- FR2 `/api/dashboard` thêm 2 khối (§10): `dueSoon` (đếm + 10 task gần hạn nhất, ngưỡng
  `alert_rules`), `weekDelta` (Δ % tổng có trọng số so với 7 ngày trước — tái dùng `progressAtDate`
  như nhánh `?range=week`, tính **server** để client không tự cộng). Không đổi hành vi khi có
  `?system=`/`?range=` (khối mới cũng lọc theo `system`).
- FR3 Chế độ Hiện trường chỉ gọi `/api/auth/me`, `/api/my-tasks`, `/api/notifications`,
  `/api/sheets` (để dựng link lưới). Không gọi `/api/dashboard`, `/api/systems`, `/api/code-lists`.

**Bố cục Điều hành** (kế thừa M125, chỉ nêu phần đổi)

- FR4 Z1 = 5 `StatCard` (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3`; ẩn "Chờ duyệt" khi
  `approvals` null → `lg:grid-cols-4`): Tiến độ tổng (badge `Chip` "▲ +2,3% / tuần" từ `weekDelta`,
  tone success/danger theo dấu, "—" khi null) · Hạng mục trễ (cuộn `#delayed-table`) · **Đến hạn
  ≤N ngày** (`dueSoon.count`, hint "`N` = ngưỡng cảnh báo", link `/lookahead?days=7`, tone warning
  khi > 0) · Chờ duyệt · Công tác theo dõi.
- FR5 Rail phải đổi thứ tự: **Pareto → Trung tâm điều hành → Vòng đời** (vòng đời thu thành 1 hàng
  6 `Chip` cuộn ngang, `title` = mô tả). Không còn `LIFECYCLE` lưới 2 cột.
- FR6 Bộ lọc bảng trễ: tách `app/components/ui/Select.tsx` (control `min-h-10 rounded-lg
bg-zinc-800 border-zinc-700 focus:border-emerald-500`, `aria-label`), dùng ở 3 bộ lọc; export qua
  `ui/index.ts`.
- FR7 Chuẩn hoá vỏ: `DashboardExtCards` → 4 `StatCard` (`href` giữ nguyên) + bảng chéo hệ trong
  `Card pad="none"`; `SpiCards`/`ForecastCards`/`BlockedPanel`/`NormsOverPanel`: thay `bento-card`
  bằng `cardClass({tone:"sunken"})`/`Card`, `rounded-2xl` → `rounded-xl`, `mb-6` bỏ (khoảng cách do
  cha `space-y-6`). Không đổi dữ liệu/fetch của các panel này. Sau bước này `bento-card` chỉ còn ở
  trang ngoài phạm vi (`attendance`, `correspondences`, `admin/permissions`, `ProgressMap`) — không
  chạm.

**Bố cục Hiện trường** (`app/components/home/HomeHienTruong.tsx`)

- FR8 Đầu trang: `Section` tiêu đề "Xin chào, {tên}" · mô tả "Thứ x, dd/mm · {dự án}" (tên dự án từ
  `/api/project` như `AppHeader` đang làm — tái dùng, không hard-code).
- FR9 Dải 3 `StatCard` (`grid grid-cols-3 gap-2 sm:gap-3`): Đến hạn ≤N (tính client từ
  `/api/my-tasks` với **N = 3 mặc định**; nếu `/api/my-tasks` được mở rộng trả `dueSoonDays` thì
  dùng — worker được phép thêm trường này vào summary, xem §10) · Trễ (`summary.delayed`, tone
  danger khi > 0) · Đang làm (`total - done - delayed`).
- FR10 "Việc hôm nay": danh sách ≤8 hàng qua `ProgressRow` (label = `code · name`, hint = `tầng ·
sheet`, % , badge `Chip` "Trễ n ngày"/"Còn n ngày"), `href` = `/tracking/<sheetSlug>?floor=` (như
  `trackingUrl` trong `page.tsx` — tách ra `app/lib/trackingUrl.ts` dùng chung 2 view). Ưu tiên
  trễ trước, rồi đến hạn gần nhất. Cuối danh sách: `ButtonLink` "Tất cả việc của tôi →
  `/my-tasks`".
- FR11 Hành động nhanh: 3 `ButtonLink` cao 48px xếp `grid grid-cols-3 gap-2`: "Lưới tracking"
  (`/tracking/<slug đầu tiên trong sheets>`), "Nhật ký hôm nay" (`/site?tab=tasks-diary`),
  "Thông báo" (`/notifications`, badge số chưa đọc). Thanh đáy mobile của chế độ này truyền đúng 3
  nút này qua `bottomActions` (thay Import/Excel/PDF vốn subcon/kỹ sư không có quyền).
- FR12 Thông báo: 3 dòng chưa đọc mới nhất từ `/api/notifications` (`Card sunken`), mỗi dòng có
  link sẵn của thông báo; rỗng → không render khối.
- FR13 Kỹ sư: nút "Xem tổng quan" (`Button variant="ghost"`, icon `LayoutDashboard`) ở góc phải đầu
  trang; ở chế độ Điều hành kỹ sư có nút ngược "Việc của tôi" cùng chỗ trong toolbar. Lưu
  `localStorage('xboss_home_mode')` (try/catch).

**NFR**

- NFR1 Mobile 390: Điều hành xếp dọc theo thứ tự Z1 → thẻ tab → Theo hệ → bảng trễ → rail (Pareto
  → hub); Hiện trường mọi khối 1 cột, không cuộn ngang ngoài bảng.
- NFR2 Tab không mở không mount (giữ M125). Hiện trường không import chunk recharts.
- NFR3 A11y: nút icon có `aria-label`; danh sách việc là `<ul>`; StatCard link có tên rõ.
- NFR4 Tương phản: chạy `check:contrast` + `check:mau-accent`.

## 8. Acceptance criteria

- AC1 Given tài khoản `subcon` có 2 task được giao (1 trễ) When mở `/` Then thấy "Xin chào", StatCard
  Trễ = 1, 2 hàng việc, không có request tới `/api/dashboard` (kiểm Network/e2e `page.on('request')`).
- AC2 Given `engineer` When bấm "Xem tổng quan" Then bố cục Điều hành hiện, reload vẫn giữ; bấm
  "Việc của tôi" quay lại.
- AC3 Given `pm` When mở `/` Then 5 StatCard, "Đến hạn ≤3 ngày" đếm đúng số task có
  `end_date ∈ [hôm nay, hôm nay+3]`, `progress < 0.7`, chưa hoàn thành (test route với dữ liệu dựng
  trong `tests/route-dashboard-bao-cao.test.ts`); Chip Δ tuần hiện khi có `task_history`.
- AC4 `?system=<code>` → `dueSoon` chỉ đếm task của hệ đó (test route).
- AC5 e2e hiện có (`dashboard`, `system`, `appshell`, `luoi-quet-axe`) xanh không sửa spec.
- AC6 `grep -rn bento-card app/components` chỉ còn `Card.tsx` (định nghĩa) và `ProgressMap.tsx`.
- AC7 lint/typecheck/build/test/check:contrast/check:mau-accent/check:dead-code xanh.
- AC8 `app/page.tsx` ≤ 250 dòng (chỉ còn chọn chế độ + hook dữ liệu chung); 2 view mỗi file ≤ 500.

## 9. Kiến trúc và điểm chạm code

- `app/page.tsx` → giữ `Suspense` + `fetchMe` + chọn view theo `resolveHomeMode`.
- Mới: `app/components/home/HomeDieuHanh.tsx` (chuyển toàn bộ nội dung M125 sang, sửa theo FR4–FR7),
  `app/components/home/HomeHienTruong.tsx` (FR8–FR13), `app/lib/homeMode.ts`, `app/lib/trackingUrl.ts`,
  `app/components/ui/Select.tsx`.
- Sửa: `app/components/HomeRail.tsx` (FR5), `DashboardExtCards.tsx`, `SpiCards.tsx`,
  `ForecastCards.tsx`, `BlockedPanel.tsx`, `NormsOverPanel.tsx` (FR7), `app/components/ui/index.ts`.
- API: `app/api/dashboard/route.ts` (+ hàm `dueSoonBlock`, `weekDeltaBlock` đặt trong
  `lib/tien-do/dashboardext.ts` — cùng tầng 4; điều kiện SQL "sắp đến hạn" tách thành hằng/hàm
  dùng chung với `lib/dich-vu/thong-bao.ts` đặt tại `lib/tien-do/due-soon.ts` để `dich-vu` (tầng 5)
  import xuống, không copy). `app/api/my-tasks/route.ts` (+ `summary.dueSoon`, `summary.dueSoonDays`).
- Không chạm `lib/bao-mat/`, `lib/tien-do/recompute.ts`, `migrations/`.

## 10. API contract

`GET /api/dashboard` (auth/RBAC như cũ) — response **thêm**:

```jsonc
{
  "dueSoon": {
    "days": 3,               // ngưỡng alert_rules.due_soon_days của dự án
    "count": 12,             // số TASK (không phải hạng mục) end_date ∈ [today, today+days],
                             // progress < due_soon_progress, status ∉ (hoan_thanh, nghiem_thu),
                             // lọc project + ?system=
    "tasks": [ { "id", "code", "name", "endDate", "progressPercent", "floorLabel",
                 "sheetType", "sheetSlug" } ]   // ≤10, ORDER BY endDate, id
  },
  "weekDelta": 0.023 | null  // pct tổng có trọng số hôm nay − 7 ngày trước (đơn vị 0..1);
                             // null khi không có task
}
```

`GET /api/my-tasks` — `summary` **thêm** `dueSoon` (số task của tôi thoả điều kiện trên, cùng ngưỡng
dự án) và `dueSoonDays`. Không đổi `tasks[]`.

Không có endpoint mới. Lỗi giữ nguyên mã hiện có.

## 11. Data contract và DDL

Không migration. Đọc `alert_rules` qua `getAlertThreshold` (đã có default 3 ngày / 0.7).

## 12. Security/privacy

Không thêm quyền. Chế độ Hiện trường chỉ dùng API mà subcon đã được phép. `weekDelta`/`dueSoon`
thuộc `/api/dashboard` (đã chặn subcon). Không lộ tên người khác cho subcon (my-tasks chỉ trả task
của chính họ).

## 13. UX/a11y/content

Dark-first, ADR-0009/0010. Từ ngữ: "Đến hạn ≤3 ngày", "Việc hôm nay", "Xem tổng quan", "Việc của
tôi". Mockup: `docs/nang-cap/mockup/M127-trang-chu.html` (mở file tĩnh trong trình duyệt) — đặc tả
là nguồn sự thật khi lệch mockup.

## 14. Observability

Không thêm log. Lỗi fetch hiện `ErrorState` (không nuốt).

## 15. Test plan

- Unit: `tests/home-mode.test.ts` (FR1), `tests/due-soon.test.ts` nếu tách hàm thuần.
- Route (Postgres): thêm case vào `tests/route-dashboard-bao-cao.test.ts` (AC3, AC4) và
  `tests/route-my-tasks*.test.ts` (summary.dueSoon).
- e2e mới `e2e/authed/home-hien-truong.spec.ts`: đăng nhập subcon demo (`tests/helpers` / fixture
  e2e sẵn có — worker tra `e2e/` cách đăng nhập theo vai trò), AC1; kỹ sư AC2. Axe trên cả 2 chế độ.

## 16. Kế hoạch slice

Xem `PLAN.md` (4 việc: API → Hiện trường → Điều hành + rail + vỏ panel → e2e/docs).
