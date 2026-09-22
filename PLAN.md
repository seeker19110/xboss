# PLAN.md — M127: Trang chủ theo vai trò ("Điều hành" / "Hiện trường")

**Cập nhật:** 2026-09-22 · **Nguồn đặc tả:** `docs/nang-cap/M127-trang-chu-theo-vai-tro.md` (ĐỌC TOÀN BỘ trước khi làm — FR/AC/API contract nằm ở đó; mockup `docs/nang-cap/mockup/M127-trang-chu.html`).
**Nhánh làm việc:** `claude/focused-cannon-d4x1ty` (= `origin/main` `9023cd6` + commit đặc tả M127). **Trạng thái:** CHỜ THI HÀNH.

## Ràng buộc CỨNG (mọi việc)

- Worker không thấy hội thoại. Đọc trước: `CLAUDE.md` (Auth, ADR-0007 tầng `lib/`, mục "Thiết kế giao diện", Quy ước), spec M127, `docs/adr/0009-bo-component-ui-nen.md`, `app/components/ui/*`.
- **Không chạm** `lib/bao-mat/`, `lib/tien-do/recompute.ts`, `migrations/`. Không thêm/bớt quyền trong `CAN`. Không đổi nội dung/fetch của `SCurveChart`/`EvmChart`/`ProgressMap`/`ScheduleControlPanel`/`DashboardBarChart`.
- UI: dark-first, **không `dark:`/hex**, dùng `Button`/`ButtonLink`/`Card`/`cardClass`/`StatCard`/`Chip`/`Section`/`Tabs`/`ProgressRow`, nút ≥40px, `aria-label` cho nút icon, hover nền đậm dần (ADR-0010). Mọi chữ tiếng Việt.
- e2e hiện có phải xanh **không sửa spec**: `e2e/authed/dashboard.spec.ts` (heading "Tổng quan dự án" + "S-curve" ở tab mặc định), `system.spec.ts` (`a[href="/system/acmv"]` trên `/`), `appshell.spec.ts`, `luoi-quet-axe.spec.ts`. Tài khoản e2e là admin → chế độ Điều hành.
- SQL qua helper `lib/db` placeholder `?`. Route: `getCurrentUser()` 401, `force-dynamic`. Test chạm DB: `import { HAS_TEST_DB } from "./setup"` dòng đầu; chạy `TEST_DATABASE_URL=postgres://ci:ci@localhost:5432/xboss_test npx tsx --test tests/<file>.test.ts` (không có DB thì test tự skip — vẫn phải chạy lint/typecheck).
- Cổng trước khi báo xong: `npm run lint`, `npm run typecheck`, test của việc, `npm run check:contrast`, `npm run check:mau-accent`; việc thêm module `lib/` chạy thêm `npm run check:lib-layers`; việc xoá/tách file chạy `npm run check:dead-code`.
- Worker commit trên nhánh/worktree của mình, **không push**, không sửa `PROGRESS.md`/`docs/nang-cap/README.md` (phiên chính cập nhật). Commit message conventional + tiếng Việt, ghi `(M127 việc N)`.

## Thứ tự & song song

- **Đợt 1 (song song, 2 worktree):** Việc 1 (API, chỉ `lib/` + `app/api/` + `tests/`) ∥ Việc 2 (vỏ panel + `ui/Select` + `HomeRail`, chỉ `app/components/`). Không chạm `app/page.tsx` ở đợt này.
- **Đợt 2:** gộp 1 + 2 vào nhánh làm việc → Việc 3 (tách `page.tsx`, 2 view) base trên kết quả gộp.
- **Đợt 3:** Việc 4 (e2e + ADR) base trên Việc 3.
- Sau mỗi việc gọi `reviewer` soát diff; xung đột nhỏ tự giải, xung đột logic thì dừng và báo.

## Việc 1 — API `dueSoon` + `weekDelta` + `summary.dueSoon` — `route: spec`

Spec §7 FR2, §9, §10. Điểm chạm:

- Mới `lib/tien-do/due-soon.ts`: export điều kiện SQL "sắp đến hạn" (chuỗi `DUE_SOON_COND` + hàm trả `params` theo `today/soon/progress`) và `loadDueSoonThresholds(projectId)` gọi `getAlertThreshold("due_soon_days"|"due_soon_progress")` (`lib/van-hanh/alerts.ts`, cùng tầng 4 — OK theo ADR-0007, không tạo chu trình: kiểm `npm run check:lib-layers`). `lib/dich-vu/thong-bao.ts` dòng ~108–134 chuyển sang dùng module này (hành vi y hệt, test `tests/` liên quan thông báo vẫn xanh).
- `lib/tien-do/dashboardext.ts`: thêm `dueSoonBlock({projectId, systemId})` → `{days, count, tasks[≤10]}` (task-level, lọc project như `delayedTasks` trong `app/api/dashboard/route.ts`, `ORDER BY endDate, id`) và `weekDeltaBlock({projectId, systemId})` → `number|null`: pct có trọng số hôm nay (`Σ avgProgress·total / Σ total` từ `sheetProgressKpi`) trừ pct 7 ngày trước tái dựng từ `progressAtDate(daysFromTodayISO(-7), …)` (`lib/tien-do/report.ts`, mẫu dùng ở nhánh `?range=week` cùng route); `null` khi tổng task = 0.
- `app/api/dashboard/route.ts`: gọi 2 khối trong `Promise.all` sẵn có, trả `dueSoon`, `weekDelta`. Không đổi các trường cũ.
- `app/api/my-tasks/route.ts`: `summary` thêm `dueSoon` (đếm trên `tasks` đã tải, cùng ngưỡng dự án qua `loadDueSoonThresholds`) và `dueSoonDays`.
- Test: thêm case vào `tests/route-dashboard-bao-cao.test.ts` (AC3: dựng 1 task hạn hôm nay+2 progress 0.5 → `dueSoon.count=1`, task progress 0.9 không đếm, task hạn +10 ngày không đếm; AC4 `?system=`), và `tests/route-tien-do-3.test.ts` mục `GET /api/my-tasks` (summary.dueSoon).

Tiêu chí: AC3, AC4; contract §10 đúng từng tên trường; `check:lib-layers` xanh.
Commit: `feat(dashboard): khối dueSoon + weekDelta cho /api/dashboard, summary.dueSoon cho /api/my-tasks (M127 việc 1)`.

## Việc 2 — Vỏ panel về Card/StatCard, `ui/Select`, thứ tự rail — `route: standard`

Spec FR5, FR6, FR7. Điểm chạm (KHÔNG chạm `app/page.tsx`):

- Mới `app/components/ui/Select.tsx`: bọc `<select>` với class `min-h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-xs text-zinc-100 outline-none focus:border-emerald-500 transition`, props `value/onChange(value: string)/options: {v,l}[]/placeholder/aria-label/className`; export qua `app/components/ui/index.ts`. (Việc 3 sẽ dùng nó ở bộ lọc bảng trễ.)
- `app/components/HomeRail.tsx`: thứ tự **Pareto → Trung tâm điều hành → vòng đời**; `LIFECYCLE` thành 1 hàng `Chip` cuộn ngang (`flex gap-1.5 overflow-x-auto scrollbar-none`, mỗi chip là `<a>` với `title`=desc; giữ `href`). Giữ props hiện có.
- `DashboardExtCards.tsx`: 4 thẻ đầu (Chờ duyệt / NCR / VO / Mặt bằng·PO — giữ đúng nội dung, `href`, điều kiện role hiện có) chuyển sang `StatCard` (`label`, `value`, `hint`, `badge` = `Chip`, `tone`, `href`); bảng chéo hệ bọc `Card pad="none"`. Không đổi type export.
- `SpiCards.tsx`, `ForecastCards.tsx`, `BlockedPanel.tsx`, `NormsOverPanel.tsx`: thay `bento-card` bằng `cardClass({tone:"sunken"|"raised"})`/`Card`, `rounded-2xl`→`rounded-xl`, bỏ `mb-6` ở gốc (cha đã `space-y-6`). Không đổi dữ liệu/fetch/lưới cột.
- Sau khi xong: `grep -rn bento-card app/components` chỉ còn `ui/Card.tsx` và `ProgressMap.tsx` (AC6).

Tiêu chí: AC6; `check:contrast` + `check:mau-accent` xanh; nhìn bằng mắt ở dark + light (`html.light`) không vỡ.
Commit: `refactor(trang-chu): vỏ panel dashboard về Card/StatCard, thêm ui/Select, rail Pareto lên đầu (M127 việc 2)`.

## Việc 3 — Tách trang chủ 2 chế độ theo vai trò — `route: complex`

Spec FR1, FR3, FR4, FR8–FR13, NFR1–NFR3, §6, §8 AC1, AC2, AC8. Base: nhánh làm việc sau khi gộp Việc 1 + 2.

- Mới `app/lib/homeMode.ts` (`resolveHomeMode`, `HOME_MODE_KEY = "xboss_home_mode"`, `readSavedMode`/`saveMode` với try/catch) + `tests/home-mode.test.ts` (thuần, không DB).
- Mới `app/lib/trackingUrl.ts`: tách `trackingUrl(sheetSlug, sheetType, floorLabel)` từ `app/page.tsx` (dùng `slugFromCode`).
- Mới `app/components/home/HomeDieuHanh.tsx`: chuyển **nguyên** nội dung M125 của `app/page.tsx` sang (fetch, state, toolbar, tabs, kéo thả, bảng trễ, rail), rồi: FR4 dải 5 `StatCard` (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, 4 cột khi `approvals` null; Tiến độ tổng có `badge` Chip Δ tuần từ `weekDelta` — format `▲ +2,3% / tuần` dùng `toLocaleString("vi-VN")`, tone success khi >0, danger khi <0, không badge khi null; thẻ "Đến hạn ≤{days} ngày" từ `dueSoon`, `href="/lookahead?days=7"`, tone warning khi >0); 3 bộ lọc bảng trễ dùng `ui/Select`; nút "Việc của tôi" (`Button variant ghost`, icon `ClipboardList`) trong `DocToolbar` chỉ khi `me.role === "engineer"` → gọi `onSwitchMode("hien-truong")`. Fetch lỗi (không phải 401) → `ErrorState` + nút thử lại thay vì nuốt.
- Mới `app/components/home/HomeHienTruong.tsx` (FR8–FR13): fetch `/api/my-tasks`, `/api/notifications`, `/api/sheets`, `/api/project`; **không** import recharts/panel nặng; lời chào; 3 `StatCard`; "Việc hôm nay" ≤8 `ProgressRow` (trễ trước — badge `Chip danger "Trễ n ngày"`, rồi đến hạn gần — `Chip warning "Còn n ngày"`/"Hôm nay"; `href` qua `trackingUrl`); `ButtonLink` "Tất cả việc của tôi" → `/my-tasks`; 3 `ButtonLink` 48px (Lưới tracking → `/tracking/<slug sheet đầu>`, Nhật ký hôm nay → `/site?tab=tasks-diary`, Thông báo → `/notifications` + badge chưa đọc); 3 thông báo chưa đọc mới nhất (`Card sunken`; ẩn khi rỗng); EmptyState khi không có task; `module_disabled` → engineer rơi về Điều hành, subcon EmptyState "Phân hệ Hiện trường đang tắt cho dự án này"; nút "Xem tổng quan" (chỉ engineer). Thanh đáy mobile truyền 3 nút nhanh qua `bottomActions` (mẫu `useIsCompact` đang có trong `page.tsx` — chuyển hook này ra `app/lib/useIsCompact.ts` dùng chung 2 view).
- `app/page.tsx` ≤ 250 dòng: `Suspense` + `fetchMe` + `resolveHomeMode` + render view; `PageSkeleton` khi chưa có `me`.
- **Ranh giới được phép quyết:** (a) cách chia state/hook giữa 2 view (được tạo `app/components/home/useHomeData.ts` nếu cần); (b) format ngày lời chào (`lib/nen/date.ts` có sẵn — ưu tiên tái dùng); (c) nếu `/api/project` không có trường cần → dùng cách `AppHeader` đang lấy tên dự án; (d) ngưỡng "đến hạn" ở Hiện trường: dùng `summary.dueSoon`/`dueSoonDays` từ Việc 1 (không tự tính lại ở client). Không được quyết: thêm API mới, đổi quyền, đổi e2e cũ.

Tiêu chí: AC1 (kiểm tay: đăng nhập `subcon@xboss.vn`/`sub123` dev — không có request `/api/dashboard`), AC2, AC5 (chạy `npx playwright test e2e/authed/dashboard.spec.ts e2e/authed/system.spec.ts e2e/authed/appshell.spec.ts` nếu môi trường có; không có thì nêu rõ trong báo cáo), AC8; `check:dead-code` xanh.
Commit: `feat(trang-chu): 2 chế độ theo vai trò — Điều hành (5 KPI, Δ tuần, đến hạn) và Hiện trường (việc của tôi hôm nay) (M127 việc 3)`.

## Việc 4 — e2e 2 chế độ + ADR-0009 — `route: standard`

Base: sau Việc 3.

- Mới `e2e/authed/home-hien-truong.spec.ts`: dùng `browser.newContext()` **không** `storageState` admin, đăng nhập qua form `/login` như `e2e/auth.setup.ts` với `subcon@xboss.vn`/`sub123` (tài khoản demo dev, xem `lib/bao-mat/auth.ts` `ensureDefaultUsers`) → kiểm heading "Xin chào", **không** có request tới `/api/dashboard` (`page.on("request")`), không có nút "Xem tổng quan"; đăng nhập `engineer@xboss.vn`/`eng123` → bấm "Xem tổng quan" → thấy heading "Tổng quan dự án", reload vẫn giữ; bấm "Việc của tôi" quay lại. Axe (`@axe-core/playwright`, mẫu `dashboard.spec.ts`) 0 serious/critical ở cả 2 chế độ. Viewport 390 cho ca subcon.
- `docs/adr/0009-bo-component-ui-nen.md`: thêm mục "Trang chủ 2 chế độ + `Select` — M127" (ngắn: quy ước `Select`, dải StatCard 5 cột, rail thứ tự).

Tiêu chí: spec mới xanh cục bộ nếu chạy được (Postgres + `npm run build`), lint/typecheck xanh.
Commit: `test(e2e): trang chủ Hiện trường cho thầu phụ/kỹ sư + ADR-0009 mục M127 (M127 việc 4)`.
