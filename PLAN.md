# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: M48 PR1 — Khung tích hợp `lib/integrations/` + trạng thái đồng bộ

### Bối cảnh & mục tiêu

Kế hoạch trước (4 nợ kỹ thuật từ audit PROGRESS.md — rò rỉ project_id, notifications
project scope, M46 approval badge, upload size precheck) **đã hoàn tất và merge**
(PR #202-#206). Bước tiếp theo theo thứ tự ưu tiên trong `docs/nang-cap/README.md`:
M43-M47 đã xong; M48 (P1, "Tích hợp tài chính") là module tiếp theo, đặc tả tại
`docs/nang-cap/M48-tich-hop-tai-chinh.md`.

M48 chia 3 PR: **PR2 (adapter kế toán) và PR3 (hoá đơn điện tử) đều ghi rõ "điều kiện
tiên quyết: chốt nhà cung cấp thật trước khi code"** (MISA/BRAVO cho kế toán,
meInvoice/Viettel SInvoice/VNPT cho HĐĐT) — công ty chưa xác nhận NCC nào, nên **KHÔNG
đưa PR2/PR3 vào kế hoạch này** (đúng luật cứng CLAUDE.md — không đoán tên NCC/API thật).
**PR1 (khung `lib/integrations/` core) đặc tả ghi rõ "code được ngay"** — không phụ
thuộc NCC, chỉ là hạ tầng chung (bảng, engine đồng bộ, trang admin, cron) chuẩn hoá từ
pattern `lib/material-sync.ts` đã chạy ổn. Kế hoạch này **chỉ làm PR1**.

Không có việc nào khác đổi cùng file — chạy 1 nhánh duy nhất.

### Việc

#### 1. M48 PR1 — khung `lib/integrations/core.ts` + migration + API + trang admin + cron

- `route:` `complex`
- agent: `complex-implementer`
- nhánh/worktree: `claude/feat-m48-integrations-pr1` (base `origin/main` mới nhất)
- đặc tả nền (từ `docs/nang-cap/M48-tich-hop-tai-chinh.md` mục PR1, đã xác minh số
  migration/pattern thật trong code — phần dưới đây đã đóng, không cần tự quyết):

  **Số migration thật**: đặc tả gốc ghi `0053_integrations.sql` nhưng `0053` đã bị
  chiếm bởi `migrations/0053_approvals.sql` (M46). Migration mới nhất hiện có là
  `migrations/0056_alert_rules.sql` → dùng **`migrations/0057_integrations.sql`**
  (xác nhận lại bằng `ls migrations/ | sort` lúc code, phòng trường hợp có PR khác
  merge trước — bài học M32/M33 ghi trong CLAUDE.md).

  **Migration `migrations/0057_integrations.sql`** — đúng y schema trong đặc tả (4
  bảng, idempotent `IF NOT EXISTS`):

  ```sql
  CREATE TABLE IF NOT EXISTS integrations (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    project_id INT REFERENCES projects(id),
    config JSONB NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(provider, project_id)
  );
  CREATE TABLE IF NOT EXISTS integration_runs (
    id SERIAL PRIMARY KEY,
    integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    stats JSONB, error TEXT
  );
  CREATE TABLE IF NOT EXISTS sync_cursors (
    integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    entity TEXT NOT NULL,
    last_local_id BIGINT, last_remote_key TEXT, last_at TIMESTAMPTZ,
    PRIMARY KEY(integration_id, entity)
  );
  CREATE TABLE IF NOT EXISTS remote_links (
    entity_type TEXT NOT NULL, entity_id BIGINT NOT NULL,
    integration_id INT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    remote_key TEXT NOT NULL, remote_status TEXT, synced_at TIMESTAMPTZ,
    PRIMARY KEY(entity_type, entity_id, integration_id)
  );
  ```

  Chạy `npm run gen:erd` cùng PR để cập nhật `docs/ERD.md` (CI gate kiểm khớp schema).

  **Chống chạy chồng — tái dùng `sync_locks` (bảng có sẵn từ M18, dùng bởi
  `lib/material-sync.ts`, KHÔNG tạo bảng khoá riêng):** đọc `lib/material-sync.ts`
  dòng ~90-102 (`acquireLock`/`releaseLock`) làm mẫu — cùng cơ chế
  `INSERT ... ON CONFLICT (name) DO UPDATE ... WHERE locked_at IS NULL OR locked_at <
  NOW() - INTERVAL '10 minutes'`. Khoá theo tên duy nhất mỗi (provider, project):
  `` `integration:${provider}:${projectId}` ``.

  **`lib/integrations/core.ts` (file mới):**

  ```ts
  export type Row = Record<string, unknown>;
  export type Config = Record<string, unknown>;
  export type PushResult = { remoteKey: string; remoteStatus?: string } | { error: string };
  export type Link = { entityId: number; remoteKey: string; remoteStatus: string | null };
  export type StatusUpdate = { entityId: number; remoteStatus: string };
  export type RunSummary = {
    ok: boolean;
    stats: Record<string, { pushed: number; pulled: number; errors: number }>;
    error?: string;
  };

  export type Adapter = {
    provider: string;
    pushEntities: string[];
    // Lấy các dòng LOCAL mới hơn cursor để đẩy đi — mỗi entity do adapter tự biết
    // truy vấn bảng nào (khung core không hard-code bảng nghiệp vụ cụ thể, giữ
    // core tách biệt khỏi domain — đúng tinh thần "khung chung" của đặc tả).
    // Trả về rỗng khi hết dữ liệu mới. `row.id` (number) BẮT BUỘC có để làm
    // last_local_id con trỏ tiến.
    fetchRows(entity: string, projectId: number, sinceId: number | null): Promise<Row[]>;
    push(entity: string, rows: Row[], cfg: Config): Promise<PushResult[]>; // 1-1 với rows
    pullStatus?(entity: string, links: Link[], cfg: Config): Promise<StatusUpdate[]>;
  };

  const registry = new Map<string, Adapter>();
  export function registerAdapter(adapter: Adapter): void; // ghi đè nếu trùng provider (test tiện re-register)
  export function getAdapter(provider: string): Adapter | undefined;

  export async function runSync(provider: string, projectId: number): Promise<RunSummary>;
  ```

  **Hành vi `runSync` (viết mới, không có hàm cũ để tái dùng — đây là phần thân
  chính của việc):**
  1. `getAdapter(provider)` không có → trả `{ ok: false, stats: {}, error: "Chưa đăng
     ký adapter cho provider này" }` (không throw ra ngoài route — route trả JSON lỗi
     422, không phải 500).
  2. Đọc `integrations` theo `(provider, project_id)` — không có hàng hoặc
     `active=false` → trả lỗi tương tự ("Tích hợp chưa được bật").
  3. `acquireLock` theo tên `integration:${provider}:${projectId}` — thất bại (đang
     chạy) → trả `{ ok: false, stats: {}, error: "Đang đồng bộ, thử lại sau" }`.
  4. `try/finally` bọc toàn bộ thân — `finally` luôn gọi `releaseLock`.
  5. Ghi 1 hàng `integration_runs` (`status='running'`) lúc bắt đầu — giữ `id` để
     `UPDATE` `status`/`finished_at`/`stats`/`error` lúc kết thúc (thành công lẫn lỗi
     — bọc `try/catch` quanh toàn bộ vòng lặp entity, lỗi tổng vẫn phải ghi
     `integration_runs.status='error'` trước khi trả về, không để hàng `running` treo
     mãi).
  6. Với mỗi `entity` trong `adapter.pushEntities`:
     - Đọc `sync_cursors` (integration_id, entity) lấy `last_local_id` (null nếu chưa
       từng chạy).
     - `adapter.fetchRows(entity, projectId, lastLocalId)` lấy các dòng mới hơn.
     - Rỗng → bỏ qua entity này, sang entity kế.
     - `adapter.push(entity, rows, config)` — **lỗi TỪNG DÒNG không chặn cả batch**:
       mỗi phần tử kết quả tương ứng 1-1 với `rows` theo thứ tự; phần tử có `error` →
       cộng `stats[entity].errors++`, KHÔNG lưu `remote_links`, KHÔNG tiến cursor qua
       dòng đó (dòng lỗi sẽ được `fetchRows` trả lại ở lần chạy sau vì cursor chưa
       vượt qua nó — nghĩa là `last_local_id` chỉ tiến đến **dòng thành công liền kề
       cuối cùng theo thứ tự**, không tiến nhảy qua dòng lỗi ở giữa; đơn giản hoá hợp
       lý: nếu dòng lỗi nằm giữa batch, các dòng sau nó tạm thời bị đẩy lại ở lần
       chạy kế tiếp cùng với dòng lỗi — chấp nhận trùng lặp vô hại vì `remote_links`
       upsert theo `(entity_type, entity_id, integration_id)` là idempotent).
       Phần tử thành công → `UPSERT remote_links` (`entity_type=entity, entity_id=
       row.id, integration_id, remote_key, remote_status, synced_at=now()`) +
       `stats[entity].pushed++`.
     - Sau vòng lặp, `UPSERT sync_cursors` với `last_local_id` = id dòng thành công
       cuối cùng theo thứ tự liên tục từ đầu (theo mô tả trên), `last_at=now()`.
     - Nếu `adapter.pullStatus` tồn tại: đọc toàn bộ `remote_links` của
       `(integration_id, entity)`, gọi `pullStatus(entity, links, config)`, với mỗi
       `StatusUpdate` trả về → `UPDATE remote_links SET remote_status=?, synced_at=
       now() WHERE entity_type=? AND entity_id=? AND integration_id=?`,
       `stats[entity].pulled++`.
  7. Trả `{ ok: true, stats }` (hoặc `ok:false` kèm `error` nếu có exception tổng ở
     bước 6, đã bắt ở bước 5).

  **`lib/auth.ts`** thêm 2 quyền vào map `CAN` (đồng bộ pattern `manageAlertRules`/
  `viewAlertRules` dòng ~271/gần đó):
  - `viewIntegrations: (r?: Role) => r === "admin" || r === "pm"` — xem trang admin +
    bấm "Đồng bộ ngay".
  - `manageIntegrations: (r?: Role) => r === "admin"` — bật/tắt, sửa `config` JSON.

  **API (bám đúng pattern `app/api/admin/alert-rules/route.ts` + `app/api/cron/
  sync-sheets/route.ts`):**
  - `GET /api/admin/integrations` — `viewIntegrations`, trả danh sách `integrations`
    JOIN `integration_runs` lấy lần chạy gần nhất mỗi hàng (`DISTINCT ON
    (integration_id) ... ORDER BY integration_id, started_at DESC`) — trả cả
    `provider`/`projectId`/`active`/`config`/`lastRun: {status, startedAt, finishedAt,
    stats, error} | null`.
  - `POST /api/admin/integrations` — `manageIntegrations`, body
    `{provider, projectId, config?, active?}` — validate `provider` **phải đã đăng
    ký** trong registry (`getAdapter(provider)` tồn tại) mới cho tạo/bật, else 422
    "Provider chưa được hỗ trợ" (PR1 chưa có adapter thật nào đăng ký — endpoint này
    chưa dùng được cho tới PR2, đúng thiết kế "khung trước, adapter sau"; **vẫn phải
    viết đủ validate này ngay từ PR1** để PR2 chỉ cần đăng ký adapter là hoạt động
    được, không sửa lại route). Upsert theo `(provider, project_id)` (`ON CONFLICT`).
  - `POST /api/integrations/:provider/sync` — `viewIntegrations` (Admin/PM theo đúng
    đặc tả), lấy `projectId` từ `getCurrentProjectId(user)` (bắt buộc phải có dự án
    đang chọn, `null` → 422 "Chưa chọn dự án"), gọi `runSync(provider, projectId)`,
    trả JSON `RunSummary` (200 nếu `ok`, 422 kèm `error` nếu không — không phải 500,
    đây là lỗi nghiệp vụ dự kiến được như "chưa bật"/"đang chạy").
  - `GET /api/cron/sync-integrations` — xác thực `checkCronSecret` HOẶC session
    `CAN.export` (copy đúng khối auth 2 dòng đầu của `app/api/cron/sync-sheets/
    route.ts`). Quét toàn bộ `SELECT id, provider, project_id FROM integrations WHERE
    active = true AND project_id IS NOT NULL`, gọi `runSync(provider, projectId)`
    tuần tự cho từng hàng (không Promise.all — tránh nhiều tiến trình cùng tranh
    `sync_locks`/quá tải DB), gộp kết quả thành mảng trả về, log lỗi từng cái qua
    `lib/log.ts` (`log.error`) nhưng không chặn các hàng còn lại.

  **Trang `app/admin/integrations/page.tsx`** (mới, bố cục tham khảo
  `app/admin/alert-rules/page.tsx` — client component, fetch qua
  `/api/admin/integrations`, KHÔNG import `lib/integrations/core.ts` trực tiếp vì kéo
  theo `lib/db`):
  - Bảng danh sách: provider, dự án, trạng thái bật/tắt (toggle switch —
    `manageIntegrations` mới bấm được, ẩn nút nếu không đủ quyền), lần chạy gần nhất
    (thời gian + badge màu theo status running/ok/error, kèm icon không chỉ dựa màu)
    + số liệu `stats` rút gọn (tổng pushed/pulled/errors), nút "Đồng bộ ngay" (gọi
    `POST /api/integrations/:provider/sync`, disable lúc đang gửi, toast kết quả).
  - Không có hàng nào (registry rỗng ở PR1, chưa có adapter thật) → `EmptyState`
    thông điệp tiếng Việt "Chưa có tích hợp nào — sẽ bổ sung ở các đợt sau (kế toán,
    hoá đơn điện tử)" — **đây là trạng thái BÌNH THƯỜNG của PR1**, không phải lỗi.
  - Thêm 1 dòng read-only riêng biệt (không phải hàng trong bảng `integrations`,
    chỉ là text tĩnh) hiển thị trạng thái đồng bộ Google Sheet vật tư hiện có — gọi
    `GET /api/materials/sync` **KHÔNG** (route đó là POST trigger, không phải GET
    status) — thay vào đó chỉ hiển thị dòng tĩnh "Đồng bộ Google Sheet (vật tư): xem
    chi tiết tại trang Vật tư" kèm link `/materials` (KHÔNG dựng thêm API status
    riêng cho việc này — YAGNI, đặc tả chỉ yêu cầu "hiển thị read-only trạng thái...
    cho đủ bức tranh", một dòng link là đủ).
  - Sidebar: thêm mục vào `app/lib/dashboardTree.ts` dưới nhóm "Hệ thống" (cùng nhóm
    node `dash.chuyen-doi-so` → `/tech` đã có) với `href: "/admin/integrations"`,
    gate hiển thị theo `viewIntegrations` (đọc cách các node admin khác trong file
    này tự ẩn/hiện theo quyền — bám đúng mẫu, không tạo cơ chế gate mới).

  **Test bắt buộc:**
  - `tests/integrations-core.test.ts` (mới, import `tests/setup.ts` đầu tiên) — dùng
    1 adapter giả in-memory tự viết trong file test (mảng `Row[]` cứng, `push` trả
    thành công cho tất cả hoặc giả lập 1 dòng lỗi tuỳ ca), `registerAdapter` trước
    mỗi test, tích hợp thật với `TEST_DATABASE_URL` (insert 1 hàng `integrations`
    active trước khi gọi `runSync`). Ca bắt buộc: (1) chạy lần đầu — cursor tiến từ
    null đến id dòng cuối, `remote_links` đủ số dòng, `integration_runs` ghi
    `status='ok'`; (2) chạy lại (re-run) không có dòng mới — không tạo `remote_links`
    trùng, `stats.pushed=0`; (3) 1 dòng giữa batch lỗi — dòng lỗi + các dòng sau nó
    không vào `remote_links`, cursor không vượt qua dòng lỗi, `stats.errors` đúng số;
    (4) 2 lệnh gọi `runSync` đồng thời cùng (provider, projectId) — 1 cái phải trả
    `ok:false, error` do khoá (verify bằng `Promise.all` gọi song song, hoặc gọi
    tuần tự có giữ khoá giả lập — chọn cách nào verify được thật sự tranh khoá, ghi
    rõ cách làm trong code comment); (5) `runSync` với provider chưa đăng ký → lỗi
    rõ ràng, không throw.
  - Thêm file test vào lệnh `npm test` trong `package.json` (mảng file test — bám
    đúng cách các file `.test.ts` khác đã được liệt kê).
  - `e2e/authed/admin.spec.ts` (mở rộng, không tạo file mới — đọc file hiện có để
    bám đúng cấu trúc checklist sidebar admin đã có sẵn) thêm 1 ca: trang
    `/admin/integrations` render đúng (tiêu đề + `EmptyState` vì registry rỗng) +
    axe sạch (desktop + mobile) — **không cần ca "bật/tắt/đồng bộ"** vì không có
    adapter thật để tạo dữ liệu qua UI ở PR1 (nếu muốn verify sâu hơn hành vi bảng có
    dữ liệu, dùng test tích hợp `integrations-core.test.ts` ở trên là đủ, tránh
    overengineer e2e cho tính năng chưa có dữ liệu thật).

- tiêu chí chấp nhận:
  - [ ] `npm run lint` + `npm run typecheck` + `npm test` (+ `npm run build`) xanh
  - [ ] `npm run gen:erd` chạy sạch, `docs/ERD.md` phản ánh đúng 4 bảng mới, CI gate
        `git diff --exit-code` không phát hiện lệch
  - [ ] `runSync` với provider chưa đăng ký, hoặc integration chưa bật, hoặc đang khoá
        → trả lỗi nghiệp vụ rõ ràng (không throw 500, không crash route)
  - [ ] Chạy lại `runSync` nhiều lần liên tiếp không tạo `remote_links` trùng
        (idempotent) — verify bằng test tích hợp
  - [ ] 1 dòng lỗi giữa batch không chặn các dòng còn lại trong CÙNG lần chạy đó (lỗi
        chỉ ảnh hưởng đúng dòng đó + các dòng sau nó bị đẩy lại lần sau, không panic
        toàn bộ `runSync`)
  - [ ] Trang `/admin/integrations` render đúng cho user Admin/PM (thấy trang, PM
        không thấy toggle bật/tắt), user khác vai trò không thấy mục sidebar và bị
        chặn ở route (kiểm tra qua `CAN`, không chỉ ẩn UI)
  - [ ] `GET /api/cron/sync-integrations` xác thực đúng `CRON_SECRET` Bearer hoặc
        session Admin/PM, không nhận secret qua query param

### Thứ tự & phụ thuộc

- Việc này độc lập, không đụng migration/route/file của việc khác đang mở song song
  nào (không có việc nào khác trong kế hoạch này).
- Không phụ thuộc M46/M43 về mặt code (dùng chung pattern `sync_locks`/`CAN`/
  `getCurrentProjectId` đã có sẵn từ trước, không cần chờ PR nào).

### Sau khi worker xong (coordinator thực hiện)

- [ ] Đối chiếu với tiêu chí chấp nhận (chạy lại lint/typecheck/test/build nếu cần)
- [ ] `reviewer` soát diff (skill `code-review`) — chú ý: (1) đúng logic idempotent
      cursor/remote_links khi có dòng lỗi giữa batch (dễ sai lệch off-by-one); (2)
      route `/api/integrations/:provider/sync` và `/api/cron/sync-integrations` không
      lộ secret trong `stats`/`error` trả về; (3) trang admin đúng gate quyền
      `viewIntegrations`/`manageIntegrations`, không chỉ ẩn UI mà route cũng chặn
- [ ] Va chạm lớn hoặc worker phát hiện đặc tả thiếu/sai (đặc biệt phần `fetchRows`/
      cách sourcing rows tự quyết định trong brief) → dừng, báo phiên chính, không tự
      đổi phạm vi
- [ ] Báo cáo tổng hợp về phiên chính: trạng thái việc, nhánh + commit, kết quả
      reviewer, quyết định worker tự đưa ra trong ranh giới cho phép (đặc biệt: cách
      cụ thể `fetchRows` được implement, cách verify tranh khoá đồng thời), điểm vướng

### Duyệt cuối (phiên chính thực hiện)

- [ ] Đối chiếu diff với đặc tả + báo cáo coordinator
- [ ] Cập nhật `PROGRESS.md` (mục M48 PR1) + `docs/nang-cap/README.md` nếu cần ghi
      chú tiến độ M48
- [ ] Push nhánh + mở PR draft theo template
- [ ] Nhắc người dùng: PR2 (adapter kế toán)/PR3 (HĐĐT) của M48 cần chốt nhà cung cấp
      thật trước khi lập kế hoạch tiếp — hỏi khi tới lượt, không tự chọn
