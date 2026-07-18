# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: M53 (Scale headroom, 4 PR) song song M57 PR1 (Tìm kiếm toàn văn)

### Bối cảnh & mục tiêu

Người dùng chọn 2 việc chạy song song trong số các module đã có đặc tả kín nhưng chưa
thi hành (`PROGRESS.md` dòng 22, thứ tự đã chốt: M53 → M52 PR4 [đã xong, PR #234] → M56
→ M51 GĐ0 → M55 → M57 → M58 → M54 GĐ1 → M59):

- **M53 — Scale headroom** (`docs/nang-cap/M53-scale-headroom.md`, P1): đo tải hệ thống
  hiện tại, thay watermark SSE O(1) cho aggregate JOIN mỗi 3s/client, siết pool/timeout
  qua env, audit cluster-ready. Đúng thứ tự kế tiếp theo kế hoạch đã chốt.
- **M57 PR1 — Tìm kiếm toàn văn** (`docs/nang-cap/M57-tim-kiem-toan-van.md`, P2): hạ
  tầng FTS có index (GIN + `unaccent`) phủ toàn kho hồ sơ, nâng `/api/search` hiện có.
  **Chỉ làm PR1** — PR2 (extract text PDF) là tuỳ chọn, quyết định sau khi PR1 dùng
  thật, KHÔNG đưa vào đợt này.

2 module **không đụng chung file** (M53 chạm `lib/db/index.ts`/`lib/version.ts`/
`app/api/health/*`/`app/api/events/*`; M57 chạm `lib/search.ts`/`app/api/search/*`/
`app/components/GlobalSearch.tsx`) — chạy song song an toàn qua worktree riêng.

**Mọi worker PHẢI đọc đúng file đặc tả nguồn trước khi code**: `docs/nang-cap/M53-scale-headroom.md`
(cả 4 PR), `docs/nang-cap/M57-tim-kiem-toan-van.md` (chỉ mục PR1) — kế hoạch này chỉ ghi
**đính chính** so với đặc tả (đặc tả viết trước, code đã đổi từ đó tới nay) + quyết định
đã chốt. Khi kế hoạch và file đặc tả lệch nhau, **kế hoạch này thắng**.

### Đính chính chung so với đặc tả (áp cho mọi việc bên dưới)

- **Số migration hiện tại cao nhất trên `main`: `0063_feature_flags.sql`.** Đặc tả M53
  ghi `0064`, M57 ghi `0067` — đều là số tạm. **Mỗi worker PHẢI tự chạy
  `ls migrations/ | sort -V | tail -5` ngay trước khi tạo migration mới** để lấy đúng số
  tại thời điểm code — 2 việc chạy song song trên cùng base `origin/main` nên **sẽ đụng
  số nhau** (M53 PR2 và M57 PR1 cùng cần 1 migration mới); coordinator renumber lúc tích
  hợp theo thứ tự merge thực tế (xem mục Thứ tự & phụ thuộc).
- **`lib/log.ts`**: hàm log là `log.warn(msg, fields?)` (object `log` gộp `info/warn/error`),
  **không phải `logWarn`** như đặc tả M53 PR1 ghi — worker PR1 dùng đúng `log.warn`.
  `fields` là `Record<string, unknown>` tuỳ ý (vd `{ sql, durationMs }`).
- **`app/api/health/route.ts` hiện public thật** (không `getCurrentUser()`), gọi thẳng
  `checkHealth()` từ `lib/health.ts` (đã tách hàm thuần khỏi route, có test riêng) — trả
  4 trường `status/db/migration/uptime_s`. Đặc tả M53 PR1 đúng như dự đoán: phần ping DB
  (`status/db/migration/uptime_s`) giữ nguyên public; phần metrics mới (`pool`,
  `sseStreams`) chỉ trả khi có session Admin/PM (`getCurrentUser()` + check role trong
  route, KHÔNG đổi `checkHealth()` — hàm đó giữ thuần/test được, ghép field ở route).
- **`lib/version.ts::sheetVersion(slug)` hiện tại** đúng như mô tả trong đặc tả M53 PR2
  (aggregate `MAX(updated_at)+COUNT` JOIN 3 bảng) — worker PR2 viết lại đúng thân hàm
  theo đặc tả, giữ nguyên chữ ký `(sheetSlug: string): Promise<string>`.
  callers: `app/api/events/route.ts`, `app/api/tasks/version/route.ts` (đọc trước khi
  sửa để chắc không đổi chữ ký).
- **`lib/db/index.ts::getPool()` hiện tại**: `new Pool({ connectionString: url, max: 10 })`
  — không có `statement_timeout`/`idle_in_transaction_session_timeout`/
  `connectionTimeoutMillis` nào. `lib/db/migrate.ts` dùng client riêng cho migration —
  worker PR3 đọc file này trước khi thêm timeout, đảm bảo client migration đặt
  `statement_timeout=0` (không bị timeout khi backfill dài).
- **`lib/env.ts`**: `serverSchema` dùng `zod`, hiện KHÔNG có field số nào qua
  `z.coerce.number()` — mọi biến hiện có đều `z.string().optional()`. Worker PR3 thêm 3
  biến mới (`XBOSS_PG_POOL_MAX`, `XBOSS_PG_STMT_TIMEOUT_MS`, `XBOSS_SLOW_QUERY_MS`, dùng
  cho cả PR1 lẫn PR3) theo đúng pattern `z.string().optional()` hiện có — parse
  `Number(...)` + validate khoảng giá trị + áp mặc định ngay tại nơi dùng
  (`lib/db/index.ts`), không cần đổi cách khai báo schema hiện tại.
- **`app/api/search/route.ts` hiện tại** đã dùng `plainto_tsquery('simple', ...)` trên
  `to_tsvector('simple', ...)` **tính inline không index** cho `tasks.name`/
  `work_packages.name` (đúng mô tả "điểm nghẽn" trong đặc tả M57) + prefix match
  ILIKE cho mã/BOQCODE/hệ + lọc theo `getCurrentProjectId(user)` (JOIN `towers`).
  Route **KHÔNG có `unaccent`** hiện tại. Worker M57 PR1 giữ nguyên shape kết quả cũ cho
  `kind: "task"|"package"` (client `GlobalSearch.tsx` không đổi đột ngột theo đúng đặc
  tả), thêm nhóm nguồn mới qua `lib/search.ts`.
- **Đọc `docs/ERD.md` (đã sinh tự động, `npm run gen:erd`) để lấy đúng tên cột thật**
  của `site_diaries`, `correspondences`, `meetings`, `ncrs`, `drawings`,
  `project_documents`, `task_comments`, `contracts` trước khi viết migration FTS M57
  PR1 — đặc tả chỉ liệt kê cột theo trí nhớ, có thể lệch tên cột thật.

---

### Việc

#### 1. M53 PR1 — Quan trắc tải (nền, không phụ thuộc)

- route: `standard`
- nhánh: `claude/feat-m53-pr1-quan-trac-tai`
- đọc trước: `docs/nang-cap/M53-scale-headroom.md` mục PR1 + đính chính ở trên (đặc biệt
  `log.warn` không phải `logWarn`, health route public thật)
- việc:
  - `lib/db/index.ts`: export `poolStats()` trả `{ total, idle, waiting }` từ
    `pool.totalCount/idleCount/waitingCount` (API sẵn có của `pg`).
  - `lib/db/index.ts`: trong `query`/`run`/`insertId` (3 hàm export chính, đọc file để
    xác nhận đủ 3 chỗ gọi `pool.query`/`tx.query`), đo `Date.now()` quanh câu query;
    vượt ngưỡng `XBOSS_SLOW_QUERY_MS` (env, mặc định 500ms, giá trị `0` = tắt hẳn) thì
    gọi `log.warn("slow_query", { sql: sql.slice(0,120), durationMs })` — **KHÔNG log
    params** (tránh lộ dữ liệu nhạy cảm).
  - `app/api/events/route.ts`: đếm SSE stream đang mở qua counter module-level
    (`let openStreams = 0`, tăng lúc `start` của `ReadableStream`, giảm lúc đóng/huỷ
    connection — đọc kỹ code hiện tại để gắn đúng chỗ cleanup, không rò rỉ counter khi
    client ngắt kết nối đột ngột); export getter `getOpenStreamCount()`.
  - `app/api/health/route.ts`: thêm nhánh — nếu có session Admin/PM
    (`getCurrentUser()` + role check trực tiếp trong route, không tạo `CAN.*` mới cho
    việc này) thì gộp thêm `{ pool: poolStats(), sseStreams: getOpenStreamCount() }` vào
    JSON trả về của `checkHealth()`; không có session/không phải Admin-PM thì trả y hệt
    4 trường cũ (giữ public, không đổi status code/behavior hiện có).
- tiêu chí chấp nhận:
  - `GET /api/health` không đăng nhập → y hệt hành vi cũ (4 trường, public, 200/503).
  - `GET /api/health` với session Admin → có thêm `pool`/`sseStreams` đúng số liệu thật
    (verify thật: mở 3 tab tracking → `sseStreams: 3`, đóng cả 3 → về 0 sau ≤35s).
  - Giả lập `SELECT pg_sleep(1)` qua 1 câu query nội bộ (test/script) sinh đúng 1 dòng
    `log.warn` không chứa params.
  - Không đổi hành vi nào khác; `npm run lint`/`npm run typecheck`/`npm run build`/
    test liên quan xanh.

#### 2. M53 PR2 — Watermark SSE O(1) (`sheet_versions` + trigger)

- route: `complex` — chạm đường nóng tracking (SSE mọi client tracking), vùng rủi ro
  cao theo `docs/audit.md` (đường ghi `tasks`/`work_packages`); ranh giới quyết định
  được phép: cách viết thân trigger PL/pgSQL (miễn giữ đúng bất biến "mọi INSERT/UPDATE/
  DELETE trên `tasks` hoặc đổi `sheet_type_id`/`package_id` trên `work_packages` đều
  bump đúng (các) sheet liên quan"), tên các biến trung gian trong trigger.
- nhánh: `claude/feat-m53-pr2-sheet-versions`
- đọc trước: `docs/nang-cap/M53-scale-headroom.md` mục PR2 (đầy đủ, kể cả khối SQL mẫu)
  + đính chính ở trên (`lib/version.ts` hiện tại, số migration thật)
- việc:
  - Migration mới (số lấy đúng theo `ls migrations/ | sort -V | tail -5` lúc code):
    bảng `sheet_versions(sheet_type_id PK, version BIGINT DEFAULT 1, updated_at)` +
    trigger `bump_sheet_version()` trên `tasks` (AFTER INSERT/UPDATE/DELETE — UPDATE đổi
    `package_id` bump CẢ sheet cũ lẫn mới, dùng `NEW`/`OLD` đúng theo `TG_OP`) + trigger
    tương tự trên `work_packages` (UPDATE đổi `sheet_type_id` — bump cả sheet cũ và
    mới). Backfill 1 dòng `version=1` cho mọi `sheet_types` hiện có
    (`ON CONFLICT DO NOTHING`). Tham khảo pattern trigger có tiền lệ:
    `boq_codes_sync` (migration `0029`), `audit_row_change` (migration `0049`).
  - `lib/version.ts::sheetVersion(slug)`: đổi thân hàm thành
    `SELECT version::text FROM sheet_versions sv JOIN sheet_types st ON sv.sheet_type_id = st.id WHERE st.slug = ?`;
    sheet chưa có dòng (phòng thủ, không nên xảy ra sau backfill) → trả `'0'`. Giữ
    nguyên chữ ký hàm, không đổi bất kỳ caller nào.
- test:
  - `tests/sheet-versions.test.ts` (integration, import `tests/setup.ts` đầu tiên đúng
    quy ước dự án): (1) tick dimension qua `recomputeTask` → version bump; (2) tạo/xoá
    task → bump; (3) move task sang package thuộc sheet khác → CẢ 2 sheet bump; (4) move
    work_package sang sheet khác → cả 2 sheet bump; (5) sửa task không đổi tiến độ (vd
    note) vẫn bump là CHẤP NHẬN ĐƯỢC (false-positive rẻ, chỉ khiến client refresh thừa —
    ghi comment giải thích rõ trong test).
  - Đo `EXPLAIN ANALYZE` trước/sau trên DB seed thật, ghi kết quả vào phần báo cáo của
    worker (không cần file riêng — nêu trong tóm tắt gửi coordinator).
  - Verify thật: 2 trình duyệt/2 tab mở cùng sheet, tick ở A → B nhận event `version`
    trong ≤3s (hành vi y hệt trước khi đổi).
- tiêu chí chấp nhận: test trên xanh; verify SSE 2 tab thật; lint/typecheck/build xanh;
  `npm test` toàn bộ không có test cũ nào đỏ do đổi hành vi `sheetVersion`.

#### 3. M53 PR3 — Pool cứng cáp qua env

- route: `standard` — độc lập PR2, không đụng file chung với việc 2.
- nhánh: `claude/feat-m53-pr3-pool-env`
- đọc trước: `docs/nang-cap/M53-scale-headroom.md` mục PR3 + đính chính `lib/env.ts`/
  `lib/db/index.ts` ở trên
- việc:
  - `lib/db/index.ts::getPool()`: `max` đọc từ env `XBOSS_PG_POOL_MAX` (parse số, mặc
    định 10, clamp về khoảng 1–100 nếu ngoài khoảng — không throw, chỉ ghim về biên).
    Thêm vào config `Pool`: `options: "-c statement_timeout=<N> -c idle_in_transaction_session_timeout=15000"`
    với N từ env `XBOSS_PG_STMT_TIMEOUT_MS` (mặc định 30000). Thêm
    `connectionTimeoutMillis: 10_000`.
  - `lib/db/migrate.ts`: client chạy migration (đọc file để xác nhận có tạo `Pool`/
    `Client` riêng hay dùng chung `getPool()`) phải đặt `statement_timeout=0` — nếu
    dùng chung `getPool()` thì cần `SET LOCAL statement_timeout=0` trong phiên chạy
    migration hoặc tạo client riêng cho migration, chọn cách nào ít thay đổi nhất sau
    khi đọc code thật.
  - `lib/env.ts`: thêm 3 field `z.string().optional()` vào `serverSchema`:
    `XBOSS_PG_POOL_MAX`, `XBOSS_PG_STMT_TIMEOUT_MS`, `XBOSS_SLOW_QUERY_MS` (field thứ 3
    dùng chung với việc 1 — nếu việc 1 đã merge trước, chỉ cần xác nhận không khai báo
    trùng; nếu 2 nhánh song song cùng thêm, coordinator gộp tay lúc tích hợp — xung đột
    nhỏ, không phải logic).
  - `DEPLOY.md`: thêm mục liệt kê 3 biến env mới (mô tả ngắn + mặc định).
- test: integration — query `pg_sleep` vượt `statement_timeout` → lỗi Postgres `57014`,
  connection được trả về pool đúng (`poolStats().waiting` về 0 sau khi lỗi, không rò rỉ
  connection).
- tiêu chí chấp nhận: không đặt env nào → hành vi mặc định y hệt trước (10 connection) +
  có timeout mới; test trên xanh; `DEPLOY.md` cập nhật; lint/typecheck/build xanh.

#### 4. M53 PR4 — Cluster-ready: audit state in-process + tài liệu vận hành

- route: `standard` — làm SAU việc 1–3 (đọc kết quả 3 việc trước để audit, đặc biệt
  counter SSE của việc 1).
- nhánh: `claude/feat-m53-pr4-cluster-audit` (tạo sau khi việc 1–3 đã tích hợp vào
  nhánh tổng hợp của đợt này — xem Thứ tự & phụ thuộc)
- đọc trước: `docs/nang-cap/M53-scale-headroom.md` mục PR4
- việc:
  - Quét `lib/` + `app/api/` tìm state module-level ghi-được (`Map`/`let`/biến global)
    ngoài các chỗ đã biết an toàn (`lib/permissions.ts` SWR cache — thiết kế sẵn cho đa
    instance; biến "pool ready"/"schema ready" per-process — đúng thiết kế). Mỗi phát
    hiện: phân loại an-toàn/không-an-toàn cho chạy nhiều instance; sửa nếu nhỏ (vd đổi
    sang đọc DB), ghi vào `PROGRESS.md` mục Nợ kỹ thuật nếu lớn/cần thiết kế lại. Counter
    SSE của việc 1 ghi rõ là per-process (health mỗi instance chỉ trả số của chính nó —
    chấp nhận, ghi chú trong code).
  - Rà 6 endpoint `app/api/cron/*` (đọc danh sách file thật): xác nhận idempotent +
    chống chạy chồng khi có ≥2 instance (sync vật tư đã có `sync_locks`; xác nhận
    daily-report/weekly-report gửi trùng có hại thật không — nếu có, thêm khoá
    `sync_locks` cùng pattern có sẵn, không tạo cơ chế khoá mới).
  - `DEPLOY.md`: thêm mục "Chạy nhiều instance" — lệnh `pm2 start npm -i 2 --name xboss -- start`,
    điều kiện tiên quyết (hạ `XBOSS_PG_POOL_MAX` mỗi process hoặc dùng PgBouncer
    transaction-pooling, lưu ý `withTransaction` dùng `SET LOCAL` nên tương thích
    PgBouncer transaction mode), xác nhận cron chỉ gọi từ ngoài 1 lần (không tự nhân đôi
    khi có nhiều instance).
  - `PROGRESS.md`: thêm khối mục "Điều kiện kích hoạt các việc đang hoãn" y nguyên nội
    dung cuối file đặc tả M53 (object storage, SSE bậc 2/3, PgBouncer, read-replica) vào
    mục Nợ kỹ thuật — đây là ghi chú, không phải code.
- tiêu chí chấp nhận: báo cáo quét kèm theo (liệt kê state phát hiện + phân loại); chạy
  `pm2 -i 2` cục bộ + smoke test thủ công (login, tick 1 dimension, xác nhận SSE 2 tab
  vẫn nhận event đúng) xanh; lint/typecheck/build xanh.

#### 5. M57 PR1 — Hạ tầng FTS + nâng `/api/search`

- route: `complex` — quyết định biểu thức index thống nhất (ranh giới được phép quyết:
  cách viết `ftsExpr()`/tên hàm `xboss_unaccent`/thứ tự cột trong từng nguồn, miễn mọi
  index và mọi câu query dùng **đúng cùng 1 biểu thức** — đây là bất biến cứng, lệch 1
  ký tự là planner bỏ index; KHÔNG được tự quyết đổi phạm vi quyền xem theo nguồn —
  phần đó đã chốt trong đặc tả, xem dưới).
- nhánh: `claude/feat-m57-pr1-fts`
- đọc trước: `docs/nang-cap/M57-tim-kiem-toan-van.md` mục PR1 (đầy đủ) + đính chính ở
  trên (đọc `docs/ERD.md` lấy đúng tên cột thật trước khi viết migration; trạng thái
  thật của `app/api/search/route.ts` hiện tại)
- việc:
  - Migration mới (số lấy đúng theo `ls migrations/ | sort -V | tail -5` lúc code, thuần
    thêm → CREATE EXTENSION/FUNCTION/INDEX, không đụng dữ liệu):
    `CREATE EXTENSION IF NOT EXISTS unaccent;` + hàm `xboss_unaccent(text)` IMMUTABLE
    bọc `unaccent('unaccent', $1)` (bắt buộc bọc vì `unaccent` gốc là STABLE, Postgres
    từ chối index trực tiếp trên hàm STABLE). Index GIN biểu thức
    `to_tsvector('simple', xboss_unaccent(coalesce(col1,'') || ' ' || coalesce(col2,'') ...))`
    cho đợt 1: `tasks(code_excel, boq_code, name)`, `work_packages(code_excel, boq_code, name)`,
    `contracts(code, name, contractor)`, `correspondences(code, subject, content)`,
    `meetings(title, minutes)`, `site_diaries(...)` (đọc ERD lấy đúng cột nội dung thật),
    `ncrs(code, title, description)`, `materials(boq_code, name)`, `drawings(code, name)`,
    `project_documents(name)`, `task_comments(content)`. Nếu bảng nào lớn và runner
    migration (`lib/db/migrate.ts`) chạy trong 1 transaction (đọc code xác nhận trước) —
    `CREATE INDEX CONCURRENTLY` không chạy được trong transaction → tách bước
    CONCURRENTLY thành script riêng trong `scripts/` (chạy tay lúc thấp điểm), migration
    chỉ tạo extension/hàm + index thường cho bảng nhỏ; ghi rõ quyết định này trong báo
    cáo worker gửi coordinator.
  - `lib/search.ts` (mới): registry nguồn tìm kiếm — mỗi nguồn khai báo bảng, cột index
    (dùng chung `ftsExpr(cols)` sinh đúng biểu thức khớp index, neo comment 2 chiều với
    migration), cột hiển thị, URL đích, quyền xem (tái dùng triết lý whitelist của
    `lib/reports.ts` — đọc file đó trước để bám đúng pattern). **Quyền đã chốt (không tự
    quyết)**: nguồn `contracts` chỉ hiện cho `PAYMENT_VIEW_ROLES`; mọi nguồn lọc theo
    `project_id` (trực tiếp hoặc qua chuỗi JOIN đúng bài học "project-scope-invariant"
    đã áp cho `/api/notifications` ở M22) + loại bản ghi đã soft-delete (nếu bảng có cột
    soft-delete — kiểm ERD). Xếp hạng theo `ts_rank` + ưu tiên khớp mã chính xác (mã
    hiệu vẫn qua nhánh ILIKE prefix hiện có cho `code`/`boq_code` — GIỮ NGUYÊN nhánh này,
    không thay bằng FTS, vì FTS tách token kém với mã dạng `A1,03`).
  - `app/api/search/route.ts`: giữ nguyên `SearchHit` shape cũ cho `kind: "task"|"package"`
    (không đổi contract với `GlobalSearch.tsx` hiện có), thêm nhóm kết quả mới theo từng
    nguồn trong registry — mỗi nguồn tự lọc quyền/project scope theo đúng khai báo.
  - `app/components/GlobalSearch.tsx`: nhóm kết quả hiển thị theo loại (icon `lucide-react`
    theo module — bám bảng icon đã dùng ở sidebar `app/lib/nav.ts` cho nhất quán), điều
    hướng đúng trang đích từng loại, giữ nguyên keyboard navigation + `aria-*` hiện có
    (đọc file trước khi sửa, không viết lại từ đầu).
- test:
  - `tests/search.test.ts` (integration): (1) gõ "nghiem thu" khớp bản ghi chứa
    "nghiệm thu" và ngược lại (gõ có dấu ra bản ghi không dấu); (2) kết quả tôn trọng
    project scope — 2 dự án dựng riêng trong test không lẫn kết quả — + không trả bản
    ghi đã soft-delete; (3) role `engineer` không thấy nhóm `contracts`, `admin` thấy;
    (4) `EXPLAIN` xác nhận dùng index GIN (assert plan output chứa `Bitmap Index Scan`
    trên ít nhất 1 bảng seed đủ lớn để planner chọn index thay vì seq scan).
  - Verify UI thật: gõ có dấu/không dấu ra cùng tập kết quả trong `GlobalSearch`; đo thời
    gian phản hồi trên DB seed < 200ms (ghi số đo vào báo cáo worker).
- tiêu chí chấp nhận: test trên xanh; `SearchHit` cũ không đổi field (không phá client
  cũ nếu có nơi khác dùng shape này — grep trước khi sửa); axe không phát sinh vi phạm
  mới trên `GlobalSearch.tsx`; lint/typecheck/build xanh.

---

### Thứ tự & phụ thuộc

- **Việc 1 (M53 PR1)** không phụ thuộc gì — dispatch ngay.
- **Việc 2 (M53 PR2)** và **việc 3 (M53 PR3)** không phụ thuộc việc 1 về mặt code (chỉ
  đụng file khác nhau trong `lib/db/`), nhưng **cùng có khả năng thêm field vào
  `lib/env.ts`** với việc 1/việc 3 (biến `XBOSS_SLOW_QUERY_MS` dùng chung việc 1+3) — có
  thể dispatch cả 3 việc 1/2/3 song song ngay từ đầu (base cùng `origin/main`), xung đột
  nhỏ ở `lib/env.ts` xử lý lúc tích hợp (gộp tay, không phải logic).
- **Việc 4 (M53 PR4)** dispatch SAU KHI việc 1, 2, 3 đã tích hợp xong vào 1 nhánh tổng
  hợp của đợt M53 — vì cần đọc code thật của cả 3 việc trước (đặc biệt counter SSE của
  việc 1) để audit đúng.
- **Việc 5 (M57 PR1)** hoàn toàn độc lập với cả 4 việc M53 — dispatch song song ngay từ
  đầu cùng lúc với việc 1/2/3.
- Việc 2 (`sheet_versions`) và việc 5 (FTS) đều cần thêm 1 migration mới, base cùng
  `origin/main` → **sẽ đụng số migration** — coordinator renumber theo thứ tự merge
  thực tế lúc tích hợp (ghi rõ số cuối cùng trong báo cáo tổng hợp).

### Sau khi worker xong (coordinator thực hiện)

- Đối chiếu kết quả từng việc với tiêu chí chấp nhận ghi trong việc đó; chạy lại
  `npm run lint`/`npm run typecheck`/test liên quan để xác nhận độc lập với báo cáo
  worker.
- Gọi `reviewer` soát diff từng nhánh — **đặc biệt chú ý việc 2 (M53 PR2, `route: complex`,
  đường nóng tracking — bám checklist "vùng rủi ro cao" `docs/audit.md`)** và **việc 5
  (M57 PR1, `route: complex`, quyền xem theo nguồn tìm kiếm — xác nhận không rò rỉ chéo
  dự án/vai trò qua kết quả search)**.
- Tích hợp: renumber migration theo đúng thứ tự merge thực tế; gộp tay xung đột nhỏ
  `lib/env.ts` nếu việc 1/3 cùng thêm field; dispatch việc 4 chỉ sau khi việc 1-3 đã
  tích hợp xong.
- Báo cáo tổng hợp về phiên chính theo từng việc — trạng thái (xong/vướng/bỏ), nhánh +
  commit, kết quả reviewer, quyết định worker tự đưa ra (việc 2 và việc 5, route
  `complex`), số migration cuối cùng sau renumber, và danh sách điểm vướng cần phiên
  chính xử lý.

### Duyệt cuối (phiên chính thực hiện)

- [ ] Đối chiếu diff 5 việc với đặc tả nguồn (`M53-scale-headroom.md` cả 4 PR,
      `M57-tim-kiem-toan-van.md` mục PR1) + báo cáo coordinator
- [ ] Xác nhận việc 2 (watermark SSE) verify thật bằng 2 tab trình duyệt (không chỉ tin
      test) — đây là đường nóng ảnh hưởng mọi người dùng tracking đồng thời
- [ ] Xác nhận việc 5 (FTS) không rò rỉ chéo dự án/vai trò qua `GlobalSearch` (tự thao
      tác thử với 1 tài khoản `engineer` + 1 tài khoản `admin`)
- [ ] Cập nhật `PROGRESS.md` (thêm mục đợt này) + đối chiếu thứ tự đã chốt (dòng 22) —
      việc kế tiếp sau đợt này là **M56 (2FA/TOTP)**
- [ ] Push nhánh + mở PR draft theo template cho từng việc (5 PR, hoặc gộp M53 thành 1
      PR nếu coordinator thấy hợp lý hơn khi tích hợp — quyết định lúc đó, ghi rõ lý do)
