# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: Đợt "lên tầm ERP" phần còn lại — M51 PR3, M52 (5 PR), M49 PR1+PR2 (8 PR)

### Bối cảnh & mục tiêu

Rà toàn bộ `docs/*.md` (xem `docs/danh-gia-nang-cap-con-lai-2026-07-17.md` — đánh giá
tổng hợp vừa viết cùng đợt này) xác nhận: **không còn ý tưởng nâng cấp nào thiếu đặc
tả** — mọi đề xuất trong `docs/nghien-cuu-nang-cap-erp-2026-07.md` đã có file `M<xx>-*.md`
riêng. Phần **chưa triển khai** còn lại:

- **M51 (Đa dự án cấp 2 — RLS)**: PR1/PR2 đụng cấu hình Postgres production (role mới
  `xboss_app`, tách `MIGRATE_DATABASE_URL`, cần ADR-0005) — đợt kế hoạch M50 trước đã
  ghi rõ luật "không code khi chưa xác nhận sẵn sàng đổi cấu hình prod". Hỏi lại người
  dùng đợt này, câu trả lời ("nào tốt thì triển khai") **không phải xác nhận rõ ràng**
  sẵn sàng đổi role Postgres production → **KHÔNG đưa PR1/PR2 vào đợt này**, chỉ đưa
  **PR3 (template dự án)** — không đụng RLS/production, đặc tả kín. PR4 (organizations)
  đặc tả ghi rõ "ngoài phạm vi — YAGNI", không đưa vào.
- **M52 (Mở rộng cấu hình)**: cả 5 PR thuần code, không đụng production, đặc tả kín —
  đưa đủ cả 5 PR vào đợt này.
- **M49 PR1 (API keys + `/api/v1`) + PR2 (Webhook ra ngoài)**: phát hiện thêm khi rà —
  đặc tả đã kín từ trước nhưng chưa từng được đưa vào kế hoạch triển khai nào (chỉ PR3
  SSO đã làm, PR #218 draft). Thuần code, không đụng auth/production — đưa vào đợt này.
  (M49 PR3 đã xong, PR #218 đang chờ người dùng tự verify với IdP thật — không đụng gì
  thêm ở đây.)

**8 việc, chạy song song tối đa qua worktree riêng**, trừ **M52 PR4 phải chạy sau PR3**
(đọc registry PR3 tạo ra) — xem mục Thứ tự & phụ thuộc.

**Mọi worker PHẢI đọc đúng file đặc tả nguồn trước khi code**:
`docs/nang-cap/M51-da-du-an-rls.md` (chỉ mục PR3), `docs/nang-cap/M52-mo-rong-cau-hinh.md`,
`docs/nang-cap/M49-api-mo-sso.md` (chỉ mục PR1/PR2) — kế hoạch này chỉ ghi **đính chính**
so với đặc tả (đặc tả viết trước, code đã đổi từ đó tới nay) + quyết định đã chốt. Khi
kế hoạch và file đặc tả lệch nhau, **kế hoạch này thắng**.

### Đính chính chung so với đặc tả (áp cho mọi việc bên dưới)

- **Số migration hiện tại cao nhất trên `main`: `0058_role_permissions.sql`.** Số tạm
  trong các đặc tả (M51 ghi `0056`, M52 ghi `0057/0058`, M49 ghi `0059/0060/0061`) đều
  đã lệch — **mỗi worker PHẢI tự chạy `ls migrations/ | sort -V | tail -5` ngay trước
  khi tạo migration mới** để lấy đúng số tiếp theo tại thời điểm code (bài học lặp lại
  nhiều lần: M32/M33/M34, M47/M48/M49/M50) — đặc biệt vì 8 việc chạy song song, mỗi
  worktree base trên cùng `origin/main` nên **sẽ đụng số nhau**; coordinator renumber
  lúc tích hợp tuần tự theo thứ tự PR merge (xem mục Thứ tự & phụ thuộc).
- **Nhánh dự phòng đã tồn tại `PR #218` (`claude/feat-m49-pr3-sso-oidc`, chưa merge)**
  dùng `migrations/0059_sso_audit.sql` trên nhánh riêng của nó — **không có trên `main`
  nên không đụng trực tiếp** 8 việc dưới đây, nhưng khi #218 merge sau này có thể phải
  renumber tiếp — ghi chú vào `PROGRESS.md` khi báo cáo, không phải việc coordinator xử
  lý ngay.
- `lib/auth.ts` hiện có **49 hàm trong map `CAN`** (đếm thật `grep -c "^\s*[a-zA-Z]*: (r"`),
  không phải số ước lượng trong đặc tả cũ — worker PR M52-PR3/PR4 cứ đọc trực tiếp file
  thật, không dựa số trong đặc tả.
- `app/tracking/[sheet]/page.tsx` hiện có **3215 dòng** (đếm thật) — khớp mô tả "~3000
  dòng" của đặc tả M52 PR5, không cần đính chính thêm.
- `public/sw.js` hiện `CACHE = "xboss-v11"`; loại trừ cache đã có `/api/photos/` và
  `/api/events` (đúng mô tả đặc tả M52 PR3 mục `swExclude`) — worker PR3 đối chiếu đúng
  2 pattern này khi viết `scripts/check-sw-exclude.ts`.
- `migrations/0026_nav_settings.sql` (bảng `nav_settings` hiện có) là bảng M52 PR4 sẽ
  "di trú" — worker PR4 đọc đúng file này trước khi viết migration `feature_flags`.

---

### Việc

#### 1. M51 PR3 — Template dự án (clone-config)

- route: `spec`
- nhánh: `claude/feat-m51-pr3-template-du-an`
- đọc trước: `docs/nang-cap/M51-da-du-an-rls.md` mục "PR3 — Template dự án" (dòng 51-55)
  + `PROGRESS.md` mục M22 (đa dự án — cấu trúc `projects`/`user_projects` hiện có)
- việc:
  - `POST /api/projects/:id/clone-config` (quyền admin, dùng `getCurrentUser()` +
    check role admin trực tiếp — không có perm `manageProjects` riêng, xác nhận trong
    `lib/auth.ts` trước khi code; nếu đã có perm tương ứng thì dùng lại, không tạo mới
    trùng chức năng).
  - Sao chép **cấu hình**, không sao chép dữ liệu giao dịch: `sheet_types` (kèm hệ/
    `discipline_id`), `towers`, cost codes/norms mẫu (bảng `norms`/`cost_codes` nếu đã
    tồn tại — kiểm bằng `grep -rn "CREATE TABLE.*norms\|CREATE TABLE.*cost_codes"
    migrations/`), `nav_settings`, `approval_flows` (M46, nếu bảng tồn tại), `alert_rules`
    (M47 PR4). **KHÔNG** copy role overrides (`role_permissions`, M50 — toàn cục theo
    đúng đặc tả).
  - Chạy trong 1 `withTransaction`; map id cũ→mới giữ trong biến JS cục bộ trong request
    (không lưu bảng mapping riêng — dữ liệu tạm thời dùng 1 lần).
  - BOQCODE của các bản ghi mẫu (nếu `sheet_types`/norms có mã) phải tôn trọng unique
    toàn hệ — gọi `boqTakenBy`/registry `boq_codes` (migration `0029`) đúng cách hiện
    có, không tự sinh mã trùng.
  - UI: bước "Sao chép cấu hình từ dự án có sẵn" trong flow tạo dự án ở `/projects`
    (đọc file trang hiện có trước khi thêm — tái dùng modal/form pattern sẵn có, không
    tạo trang mới).
- test: `tests/clone-config.test.ts` (integration) — clone đủ nhóm cấu hình đã liệt kê,
  BOQCODE không trùng, xác nhận KHÔNG copy dữ liệu giao dịch (vd `tasks`, `contracts`
  của dự án nguồn không xuất hiện ở dự án đích).
- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] Clone 1 dự án có ≥2 sheet + 1 alert_rule → dự án mới có đủ cấu hình, 0 dòng dữ
        liệu giao dịch (test integration xác nhận bằng đếm dòng)
  - [ ] BOQCODE mẫu không đụng mã đã tồn tại (test tạo trùng → 409 hoặc tự đổi mã theo
        đúng cơ chế registry hiện có, không throw không rõ nghĩa)
  - [ ] `npm run gen:erd` không có drift nếu có thêm cột/bảng (PR này không migration
        mới theo đặc tả — xác nhận không cần)

#### 2. M52 PR1 — Danh mục mềm `code_lists`

- route: `spec`
- nhánh: `claude/feat-m52-pr1-code-lists`
- đọc trước: `docs/nang-cap/M52-mo-rong-cau-hinh.md` mục PR1 (dòng 5-25) + `lib/delay.ts`
  (`DELAY_REASON_LABEL` — hằng số thật cần seed, đã xác nhận tồn tại đúng tên)
- việc:
  - Migration `migrations/00XX_code_lists.sql` (XX = số thật tại thời điểm code, xem
    "Đính chính chung"): bảng `code_lists` đúng schema trong đặc tả.
  - Seed từ `DELAY_REASON_LABEL` (`lib/delay.ts`) vào `domain='delay_reason'`; rà thêm
    2-3 hằng số enum-mềm rõ ràng khác đang hard-code rải trong `lib/*.ts` (loại tài
    liệu, nhóm chi phí, đơn vị tính) — nếu không tìm thấy hằng số tương ứng rõ ràng thì
    **chỉ seed `delay_reason`**, không tự bịa domain khác (đúng luật "không đoán khi
    thiếu đặc tả cụ thể").
  - `lib/code-lists.ts`: `getList(domain)` cache memory + watermark version (pattern
    `sheetVersion` đã dùng ở SSE — đọc `app/api/events/route.ts` để bám đúng pattern).
  - `GET /api/code-lists?domain=` (mọi role đọc), `GET/POST/PATCH/DELETE
    /api/admin/code-lists` (Admin CRUD) — DELETE chặn khi domain/code đang được tham
    chiếu (kiểm theo domain tương ứng, vd `delay_reason` tham chiếu ở `tasks.delay_reason`)
    → 409 kèm số bản ghi.
  - Chuyển call-site: **chỉ chuyển 1 nơi rõ ràng nhất trong đợt này** — nơi hiển thị/
    chọn lý do trễ (UI dashboard Pareto + form gán lý do trễ) đọc qua `getList('delay_reason')`
    thay vì import `DELAY_REASON_LABEL` trực tiếp. **KHÔNG chuyển `lib/status.ts`**
    (giữ cứng theo đúng đặc tả — enum có logic recompute).
  - UI `/admin/code-lists`: bảng theo domain, kéo sắp `sort` (dùng cùng cơ chế
    drag-reorder nếu dự án đã có sẵn pattern nào tương tự — nếu không có, làm bằng nút
    ↑↓ đơn giản, không thêm thư viện drag-drop mới), bật/tắt `active`.
- test: `tests/code-lists.test.ts` — CRUD, chặn xoá đang tham chiếu, cache version đúng
  invalidate khi ghi.
- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] Seed `delay_reason` khớp đúng 6 lý do hiện có trong `DELAY_REASON_LABEL`
  - [ ] Xoá code đang dùng bởi ≥1 task → 409; xoá code không dùng → 200
  - [ ] `lib/status.ts` không bị đụng (kiểm diff)
  - [ ] `npm run gen:erd` cập nhật, không drift

#### 3. M52 PR2 — Custom fields

- route: `spec`
- nhánh: `claude/feat-m52-pr2-custom-fields`
- đọc trước: `docs/nang-cap/M52-mo-rong-cau-hinh.md` mục PR2 (dòng 27-52)
- việc: đúng theo đặc tả — migration `custom_field_defs` + cột `custom JSONB` trên 4
  bảng (`tasks`, `contracts`, `materials`, `work_packages`); `lib/custom-fields.ts`
  (`validateCustom`); UI `CustomFieldsSection` gắn vào modal chi tiết 4 entity (đọc
  đúng modal hiện có của từng trang trước khi chèn — không tạo modal mới); trang
  `/admin/custom-fields` CRUD defs.
  - **Không PATCH toàn bộ entity chỉ để đổi `custom`**: field `custom` merge shallow
    khi PATCH entity qua route PATCH **hiện có** của từng entity (`/api/tasks/:id`,
    `/api/contracts/:id`, `/api/materials/:id`, `/api/workpackages/:id`) — không tạo
    route PATCH riêng cho `custom`.
- test: `tests/custom-fields.test.ts` — validate type/options/required; PATCH merge
  đúng (không đè các field khác); đổi `type` khi đã có dữ liệu tham chiếu key đó → 409.
- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] PATCH `custom` trên 1 task không ảnh hưởng field khác của task đó
  - [ ] Đổi `type` của 1 def đã có ≥1 entity dùng key đó → 409
  - [ ] `npm run gen:erd` cập nhật, không drift

#### 4. M52 PR3 — Module registry (refactor nội bộ, không đổi hành vi)

- route: `spec`
- nhánh: `claude/feat-m52-pr3-module-registry`
- đọc trước: `docs/nang-cap/M52-mo-rong-cau-hinh.md` mục PR3 (dòng 54-70) + `app/lib/dashboardTree.ts`
  (601 dòng thật) + `lib/auth.ts` (49 hàm `CAN` thật) + `public/sw.js` (2 pattern loại
  trừ cache thật: `/api/photos/`, `/api/events`)
- việc:
  - `lib/modules.ts` (mới): mảng `MODULES: ModuleDef[]` đúng shape trong đặc tả.
    **Không bắt buộc liệt kê hết 100% module ngay trong PR này** — bắt đầu với nhóm
    module mới nhất/rõ ràng nhất (M43-M50 + node "Sắp có" hiện tại trong `dashboardTree`)
    để chứng minh cơ chế hoạt động đúng, không đổi hành vi hiện tại; ghi rõ trong PR
    description module nào đã đưa vào registry, module nào chưa (để PR sau tiếp tục).
  - **Điều kiện nghiệm thu cứng: hành vi UI/API sau PR phải giống hệt trước PR** — mọi
    thay đổi ở `dashboardTree`/`lib/auth.ts`/notifications chỉ là đổi NGUỒN đọc (từ
    hard-code sang đọc `MODULES`), không đổi kết quả render/quyền.
  - `scripts/check-sw-exclude.ts` (mới, CI check) đối chiếu `swExclude` khai báo trong
    `lib/modules.ts` với 2 pattern thật đã xác nhận trong `public/sw.js`.
  - Cập nhật `docs/nang-cap/README.md` mục "Quy ước chung" thêm dòng: thêm module mới
    phải thêm 1 entry `MODULES`.
- test: chạy lại **toàn bộ** `e2e/authed/appshell.spec.ts` (đủ menu theo vai trò) +
  test liên quan `CAN`/notifications hiện có — đây chính là bằng chứng "không đổi hành
  vi", không viết test mới riêng cho registry (theo đúng ghi chú đặc tả "PR3: script
  check-sw-exclude chính là gate").
- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] `e2e/authed/appshell.spec.ts` (desktop + mobile) xanh nguyên trạng — 0 thay đổi
        assertion, chỉ xác nhận hành vi cũ giữ nguyên
  - [ ] `scripts/check-sw-exclude.ts` chạy được, phát hiện đúng khi cố tình gỡ 1 pattern
        loại trừ khỏi `sw.js` lúc test tay (rồi khôi phục lại)
  - [ ] Diff không đổi bất kỳ chuỗi hiển thị/quyền nào (review bằng mắt của `reviewer`)

#### 5. M52 PR4 — Feature flags theo dự án

- route: `spec`
- nhánh: `claude/feat-m52-pr4-feature-flags` (base trên nhánh PR3 đã xong — xem Thứ tự
  & phụ thuộc, PR này đọc `lib/modules.ts` từ PR3)
- đọc trước: `docs/nang-cap/M52-mo-rong-cau-hinh.md` mục PR4 (dòng 72-76) +
  `migrations/0026_nav_settings.sql` (bảng đang di trú)
- việc: đúng đặc tả — migration `feature_flags`; helper `assertModuleEnabled(moduleKey,
  projectId)` gọi đầu route thuộc `routePrefix` (đọc từ `lib/modules.ts` của PR3) → 404
  khi tắt; sidebar ẩn nav module tắt; `nav_settings` giữ API cũ 1 bản release (đánh dấu
  `@deprecated` trong comment, không xoá ngay); UI `/admin/features` ma trận module ×
  dự án.
  - **Mặc định không có dòng = bật** (đúng đặc tả) — xác nhận test không có flow nào bị
    404 khi bảng rỗng (tương thích ngược tuyệt đối).
- test: `tests/feature-flags.test.ts` — route module tắt → 404; bật lại → 200; bảng
  rỗng → mọi route 200 (mặc định bật).
- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] Bảng `feature_flags` rỗng → không route nào đổi hành vi so với trước PR (test +
        review diff)
  - [ ] Tắt 1 module thật (vd module vừa đăng ký ở PR3) → route con trả 404, sidebar ẩn
  - [ ] `npm run gen:erd` cập nhật, không drift

#### 6. M52 PR5 — Trả nợ tách `app/tracking/[sheet]/page.tsx` (~3215 dòng)

- route: `complex`
- nhánh: `claude/refactor-m52-pr5-tracking-split`
- đọc trước: `docs/nang-cap/M52-mo-rong-cau-hinh.md` mục PR5 (dòng 78-81) + toàn bộ
  `app/tracking/[sheet]/page.tsx` (3215 dòng — đọc hết trước khi tách, không tách theo
  đoán) + `app/components/offlineQueue.ts` (`useOfflineTickQueue`)
- **ranh giới quyết định được phép** (đây là lý do route `complex` thay vì `spec`):
  đặc tả chỉ nêu tên 4 thành phần cần tách (`TrackingToolbar`, `TrackingGrid`,
  `BulkEditModal`, `DateEditModal`, `useTrackingData`) nhưng KHÔNG vẽ ranh giới state
  chính xác (state nào ở component con, state nào phải nâng lên page cha để chia sẻ
  giữa toolbar/grid/modal) — worker tự quyết ranh giới này miễn **hành vi render y hệt
  trước tách** (không đổi UX, không đổi thứ tự gọi API, không đổi cách SSE/offline
  queue hoạt động).
  - **Điều kiện nghiệm thu tuyệt đối**: diff hành vi = 0. Không sửa bug nhân tiện, không
    tối ưu nhân tiện — chỉ tách file. Nếu phát hiện bug trong lúc đọc code, ghi lại
    trong báo cáo, KHÔNG sửa trong PR này.
  - `useTrackingData`: giữ nguyên logic fetch + SSE (`/api/events?sheet=`) + offline
    queue wiring từ `offlineQueue.ts` — copy logic, không viết lại.
  - Page còn lại (~300 dòng theo ước tính đặc tả, không bắt buộc đúng số) chỉ lắp ghép
    component con + truyền props.
- test: chạy lại **toàn bộ** e2e tracking sẵn có (`e2e/authed/tracking.spec.ts` +
  mọi spec khác chạm `/tracking/[sheet]`) — đây là bằng chứng chính "không đổi hành vi".
  Không cần viết e2e mới.
- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] `e2e/authed/tracking.spec.ts` (desktop + mobile) xanh nguyên trạng, 0 sửa
        assertion
  - [ ] Test tay: mở 1 sheet, tick checkbox offline rồi online lại → tự PATCH đúng như
        trước (offline queue không đổi hành vi)
  - [ ] SSE version-refresh vẫn hoạt động (mở 2 tab, sửa 1 tab, tab kia tự cập nhật)
  - [ ] Page cha còn lại là file lắp ghép, không còn logic nghiệp vụ nặng

#### 7. M49 PR1 — API keys (đọc-only) + namespace `/api/v1`

- route: `spec`
- nhánh: `claude/feat-m49-pr1-api-keys`
- đọc trước: `docs/nang-cap/M49-api-mo-sso.md` mục PR1 (dòng 24-129) toàn bộ + `lib/ratelimit.ts`
  (hàm `bump()` hiện có, cần refactor cẩn thận không đổi hành vi login)
- việc: đúng đặc tả — migration `api_keys` (kèm audit trigger M43 theo đúng khối `DO $$`
  mẫu `migrations/0053_approvals.sql`); helper generic `hitRateLimit` trong
  `lib/ratelimit.ts` (refactor `bump()` gọi qua helper mới, **test rate-limit login hiện
  có phải pass nguyên trạng — chạy lại trước khi coi PR xong**); `lib/api-keys.ts`
  (`generateApiKey`/`hashApiKey`/`verifyApiKey`/`requireApiKey`); 5 route `app/api/v1/*`
  đúng bảng trong đặc tả; API quản lý `GET/POST /api/admin/api-keys` +
  `DELETE /api/admin/api-keys/:id` (dùng lại `CAN.manageIntegrations` có sẵn từ M48 PR1
  — xác nhận đã tồn tại trong `lib/auth.ts:283-284`, không tạo perm mới); UI thêm section
  "API keys" vào `app/admin/integrations/page.tsx` (trang đã tồn tại từ M48 PR1 — đọc
  file thật trước khi chèn); `docs/api-v1.md` mới.
- test: `tests/api-keys.test.ts` đúng 5 ca trong đặc tả. **Đặc biệt quan trọng**: chạy
  lại toàn bộ test rate-limit login hiện có (`tests/*rate*limit*` hoặc test auth có ca
  rate-limit) để xác nhận refactor `bump()` không đổi hành vi.
- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] Test rate-limit login hiện có (trước PR) vẫn pass nguyên trạng sau refactor
        `lib/ratelimit.ts`
  - [ ] Key đúng/sai/revoked/thiếu header đúng 401; scope sai → 403; key toàn cục thiếu
        `?project=` → 422; vượt 120 req/phút → 429 + `Retry-After`
  - [ ] `npm run gen:erd` cập nhật, không drift

#### 8. M49 PR2 — Webhook ra ngoài

- route: `complex`
- nhánh: `claude/feat-m49-pr2-webhooks` (base trên nhánh PR1 đã xong nếu PR1 merge
  trước — xem Thứ tự & phụ thuộc; nếu chạy song song thì base `origin/main`, coordinator
  rebase lúc tích hợp)
- đọc trước: `docs/nang-cap/M49-api-mo-sso.md` mục PR2 (dòng 132-246) toàn bộ, **đặc
  biệt bảng "5 điểm phát sự kiện" (dòng 207-217)** — đọc đúng 5 route nghiệp vụ thật
  trước khi sửa (`app/api/tasks/[id]/approve/route.ts`, `app/api/approvals/route.ts`,
  `app/api/variations/[id]/decide/route.ts`, `app/api/payment-certs/[id]/decide/route.ts`,
  `app/api/notifications/route.ts`, `app/api/inspection-requests/route.ts`)
- **ranh giới quyết định được phép** (lý do route `complex`): đặc tả đã liệt kê đúng 5-6
  điểm emit nhưng **không biết trước cấu trúc code thật của từng route đó ở thời điểm
  code** (có thể đã đổi từ lúc viết đặc tả) — worker tự xác định đúng vị trí chèn
  `emitWebhook(...)` trong ranh giới nguyên tắc: **chỉ phát khi trạng thái thực thể
  CHUYỂN SANG approved thật trong chính request đó** (không phát khi không đổi trạng
  thái, không phát ở bước giữa của flow nhiều bước M46 dormant).
  - `lib/webhooks.ts`, migration `webhooks`/`webhook_deliveries`, chống SSRF (validate
    URL khi tạo/sửa — không phải lúc gửi), cron `GET /api/cron/deliver-webhooks`,
    API quản lý + UI (section "Webhook" trong `app/admin/integrations/page.tsx`) đúng
    đặc tả.
  - `vercel.json` + `DEPLOY.md` cập nhật cron mẫu theo đúng đặc tả (dòng 224-226).
- test: `tests/webhooks.test.ts` đúng 5 ca trong đặc tả (mock `globalThis.fetch`).
- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] `emitWebhook` chỉ tạo delivery khi entity thật sự chuyển approved trong request
        (test qua từng điểm emit — duyệt VO test qua `POST /api/variations/:id/decide`
        thật, không chỉ unit hàm)
  - [ ] Validate URL chặn `http://` production + IP private → 422
  - [ ] Backoff đúng bảng `[5m, 30m, 2h, 2h, 2h]`, `attempts>=5` → `status='failed'`
  - [ ] Chữ ký HMAC `X-Xboss-Signature` verify lại đúng bằng secret
  - [ ] `npm run gen:erd` cập nhật, không drift

---

### Thứ tự & phụ thuộc

- **Chạy song song ngay từ đầu** (7 worktree độc lập, base `origin/main` mới nhất tại
  lúc dispatch): việc 1 (M51 PR3), việc 2 (M52 PR1), việc 3 (M52 PR2), việc 4 (M52 PR3),
  việc 6 (M52 PR5), việc 7 (M49 PR1), việc 8 (M49 PR2).
- **Việc 5 (M52 PR4) chờ việc 4 (M52 PR3) merge/hoàn tất** — đọc `lib/modules.ts` do PR3
  tạo ra. Coordinator dispatch việc 5 SAU khi việc 4 qua reviewer + tích hợp xong (rebase
  nhánh việc 5 lên nhánh/kết quả việc 4).
- **Va chạm số migration dự kiến chắc chắn xảy ra** (6/8 việc đều thêm migration, tất cả
  base cùng `origin/main` 0058): coordinator xử lý renumber tuần tự theo thứ tự PR merge
  thực tế (không có thứ tự ưu tiên bắt buộc giữa việc 1/2/3/6/7/8 — merge được cái nào
  trước renumber cái đó, cái sau rebase nhận số tiếp theo) — đúng pattern đã làm nhiều
  lần trong `PROGRESS.md` (M24-M31, xem cách renumber `0031_hr.sql` → ... → `0038`).
- Việc 8 (M49 PR2) sửa 5 route nghiệp vụ đang sống — **có khả năng đụng nhánh khác nếu
  người dùng có sửa gì khác đồng thời trên các route đó** (ngoài phạm vi 8 việc này) —
  coordinator kiểm `git log` các file đó trước khi dispatch, báo phiên chính nếu thấy
  hoạt động khác đang chạm cùng file.

### Sau khi worker xong (coordinator thực hiện)

- Đối chiếu kết quả từng việc với tiêu chí chấp nhận ghi trong việc đó; chạy lại
  `npm run lint`/`npm run typecheck`/test liên quan để xác nhận độc lập với báo cáo
  worker.
- Gọi `reviewer` soát diff từng nhánh — đặc biệt chú ý việc 4 (M52 PR3) và việc 6 (M52
  PR5): tiêu chí chính là "0 thay đổi hành vi", reviewer phải xác nhận diff không lẫn
  logic mới ngoài mục đích tách/đăng ký.
  - Việc 8 (M49 PR2): reviewer đối chiếu đúng 5-6 điểm emit với nguyên tắc "chỉ phát khi
    chuyển approved thật trong request đó" — đây là điểm dễ sai nhất (phát nhầm ở bước
    giữa flow nhiều bước, hoặc phát trùng khi route có 2 nhánh xử lý cùng kết quả).
- Tích hợp: xử lý renumber migration theo đúng thứ tự merge thực tế; việc 5 chỉ dispatch
  sau khi việc 4 tích hợp xong.
- Báo cáo tổng hợp về phiên chính theo đúng 8 việc — trạng thái, nhánh + commit, kết quả
  reviewer, quyết định worker tự đưa ra (việc 6 và việc 8, route `complex`), điểm vướng.

### Duyệt cuối (phiên chính thực hiện)

- [ ] Đối chiếu diff 8 việc với đặc tả nguồn (`M51-da-du-an-rls.md` PR3,
      `M52-mo-rong-cau-hinh.md` cả 5 PR, `M49-api-mo-sso.md` PR1+PR2) + báo cáo coordinator
- [ ] Xác nhận việc 4 (module registry) và việc 6 (tách tracking) đúng "0 đổi hành vi"
      bằng chạy tay thêm 1 lượt (không chỉ tin CI)
- [ ] Cập nhật `PROGRESS.md` (thêm mục đợt này, ghi rõ M51 chỉ làm PR3 — PR1/PR2/PR4 để
      dành, lý do) + `docs/nang-cap/README.md` (đổi trạng thái các module đã xong)
- [ ] Push nhánh + mở PR draft theo template cho từng việc (8 PR)
- [ ] Nhắc người dùng quyết định đang chờ: **M51 PR1/PR2 (RLS)** cần xác nhận RÕ RÀNG
      sẵn sàng tạo role Postgres `xboss_app` + tách `MIGRATE_DATABASE_URL` trên
      production trước khi lập kế hoạch đợt sau cho phần này.
