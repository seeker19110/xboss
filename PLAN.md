# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: M51 GĐ0 — RLS phòng tuyến DB (PR1 + PR2 + PR4, PR3 đã xong)

### Bối cảnh & mục tiêu

Thi hành `docs/nang-cap/M51-da-du-an-rls.md` — đặc tả đã KÍN (migration SQL mẫu, điểm
chạm code, test đều có sẵn trong file). **PR3 (clone-config) đã merge từ trước (#224) —
KHÔNG làm lại.** Đợt này chỉ làm PR1 (RLS + role `xboss_app`), PR2 (`withProjectScope` +
chuyển route theo lô — KHÔNG làm bước "khoá cửa" cuối vì cần 1 tuần theo dõi production
trước, để lại backlog), PR4 (bảng `organizations` nền).

**Xác minh trên code 2026-07-18 trước khi lập kế hoạch (LUẬT):** chưa có dấu vết nào của
M51 — không có role `xboss_app`, không có `withProjectScope`, không có bảng
`organizations`, migration cao nhất là `0065_totp.sql`, ADR cao nhất `0004-multi-project.md`
(0005 còn trống). `withTransaction` (`lib/db/index.ts`) **đã** `SET LOCAL app.project_id`
qua request-context (M43, xong từ trước) — phụ thuộc của M51 PR1 đã thoả, worker PR1
không cần đụng cơ chế set GUC, chỉ cần viết migration + policy dùng đúng GUC đã có sẵn.

**Mọi worker PHẢI đọc `docs/nang-cap/M51-da-du-an-rls.md` trọn vẹn trước khi code** — kế
hoạch này chỉ đính chính + phân việc, không lặp lại đặc tả. Lệch nhau → kế hoạch này thắng.

### Đính chính so với đặc tả (xác minh trên code 2026-07-18)

- **Số migration thật tại thời điểm code**: chạy `ls migrations/ | sort -V | tail -5`
  ngay trước khi tạo file — đặc tả ghi `0056_rls.sql` nhưng migration cao nhất hiện tại
  đã là `0065_totp.sql`, worker PR1 dùng số kế tiếp thật (dự kiến `0066_rls.sql`, xác
  minh lại lúc code vì các đợt khác có thể chạy song song).
- **ADR**: tạo `docs/adr/0005-rls.md` (số 0005 còn trống, xác minh `ls docs/adr/`).
- **`app_password` trong migration**: KHÔNG hardcode mật khẩu trong file SQL migration
  (file này chạy tự động qua `ensureSchema()`/`db:migrate`, sẽ vào git). Viết migration
  tạo role KHÔNG kèm password cố định — dùng `DO $$ BEGIN IF NOT EXISTS (SELECT FROM
  pg_roles WHERE rolname = 'xboss_app') THEN CREATE ROLE xboss_app LOGIN NOBYPASSRLS
  PASSWORD 'CHANGE_ME_ON_DEPLOY'; END IF; END $$;` kèm comment rõ: người vận hành BẮT
  BUỘC đổi password thật bằng `ALTER ROLE xboss_app PASSWORD '...'` lúc deploy trước khi
  trỏ `DATABASE_URL` sang role này (ghi rõ trong ADR-0005, không phải bí mật thật nằm
  trong git).
- **Danh sách 12 bảng tài chính phạm vi đợt 1** đúng theo đặc tả: `contracts, variations,
  payment_certs, invoices, costs, advances, cash_transactions, payrolls,
  insurance_bonds, claims, tenders, purchase_orders`. Worker PR1 tự xác minh cả 12 bảng
  đều có cột `project_id` trực tiếp (không NULL-able theo kiểu tuỳ ý) bằng
  `\d <table>` hoặc grep migration tương ứng trước khi viết `ALTER TABLE`; bảng nào
  không tồn tại/không có cột `project_id` trực tiếp → dừng, báo coordinator (đừng tự bịa
  cách xử lý).
- **`WITH CHECK`**: đặc tả mẫu chỉ có `USING`; test PR1 mục (4) đòi hỏi chặn INSERT sai
  `project_id` — worker PHẢI thêm `WITH CHECK` cùng biểu thức như `USING` cho mỗi policy
  (đặc tả có nhắc ở mục Test nhưng thiếu trong DDL mẫu — đây là đính chính bắt buộc).
- **`getRequestContext()`/`app.project_id`**: PR1 chỉ cần đảm bảo GUC đã được set đúng
  (đã xong từ M43) — không sửa `withTransaction`. Test `tests/rls.test.ts` phải tự set
  context qua cơ chế test hiện có (`runWithRequestContext` hoặc tương đương trong
  `lib/request-context.ts`) trước khi gọi query trong `withTransaction`.
- **PR2 phạm vi**: chỉ chuyển route **GET** đọc dữ liệu của đúng 12 bảng phạm vi đợt 1
  sang bọc `withProjectScope`. KHÔNG động route PATCH/POST/DELETE (giữ nguyên transaction
  ghi hiện có — RLS policy đã áp app.project_id set trong mọi `withTransaction` từ M43
  nên ghi đã được bảo vệ, PR2 chỉ bổ khuyết đường đọc ngoài transaction). KHÔNG làm bước
  "khoá cửa" (bỏ nhánh `IS NULL` trong policy) — để lại ghi nợ trong PROGRESS.md, cần 1
  tuần theo dõi production trước khi làm (đúng như đặc tả mục PR2 cuối).
- **PR4**: bảng `organizations` + cột `projects.org_id` là migration **thêm thuần tuý**
  (`CREATE TABLE`/`ADD COLUMN` nullable) — đi thẳng production theo DoD, không cần
  staging trước. Chỉ thêm filter `?org=` ở `/api/portfolio` khi có sẵn dữ liệu >1 org
  (thực tế hiện tại luôn 1 org mặc định NULL) — UI select tổ chức CHỈ hiện khi
  `count(distinct org_id) > 1`, tránh thêm UI rối cho trường hợp chưa có nhu cầu thật.

### Việc

#### 1. M51 PR1 — RLS trên nhóm bảng tài chính + ADR-0005

- route: `spec`
- nhánh: `claude/feat-m51-pr1-rls`
- đọc trước: `docs/nang-cap/M51-da-du-an-rls.md` (mục "PR1" + "Test" mục 1/3/4 trọn vẹn)
  + Đính chính ở trên + `lib/db/index.ts` (`withTransaction`, cách set GUC hiện có) +
  `lib/request-context.ts` + `tests/setup.ts` (quy ước test chạm DB).
- việc:
  - Migration `<số thật>_rls.sql`: tạo role `xboss_app` (theo Đính chính, không hardcode
    password thật) + GRANT + `ALTER DEFAULT PRIVILEGES` + với mỗi bảng trong 12 bảng
    phạm vi: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + policy
    `USING (...) WITH CHECK (...)` đúng biểu thức 3 nhánh trong đặc tả (match / NULL cho
    qua / `'*'`).
  - `docs/adr/0005-rls.md` theo mẫu `docs/adr/0000-template.md`: ghi rõ quyết định dùng
    RLS làm lưới an toàn thứ 2, role `xboss_app` NOBYPASSRLS, GUC `app.project_id`, nhắc
    người vận hành đổi password role lúc deploy + đổi `DATABASE_URL` sang `xboss_app`.
  - `lib/db/migrate.ts`: đọc `MIGRATE_DATABASE_URL` ưu tiên, fallback `DATABASE_URL`
    (đúng đặc tả mục "Điểm chạm app") — chỉ ảnh hưởng script `db:migrate`, không đổi
    hành vi app runtime.
  - `tests/setup.ts`: nếu `TEST_DATABASE_URL` trỏ tới DB test dùng 2 role như prod —
    theo đúng đặc tả; nếu môi trường CI hiện tại chỉ có 1 role (owner) thì
    `tests/rls.test.ts` tự tạo/dùng role `xboss_app` trong `TEST_DATABASE_URL` nếu chưa
    có (migration đã tạo role này idempotent) — không cần sửa CI workflow trừ khi bắt
    buộc, worker tự kiểm `.github/workflows/ci.yml` xem Postgres service có đủ quyền tạo
    role không, báo coordinator nếu vướng.
  - `tests/rls.test.ts` (mới): đúng 4 kịch bản mục "Test" PR1 của đặc tả (query GUC dự án
    A không thấy dự án B dù SQL không WHERE; GUC trống đọc được ở PR1 (chưa khoá); `'*'`
    thấy tất; INSERT sai project_id bị chặn qua `WITH CHECK`).
- **KHÔNG được quyết khác**: 12 bảng phạm vi cố định đúng danh sách đặc tả, không thêm
  bớt bảng; không bỏ `FORCE ROW LEVEL SECURITY`; không đổi ngữ nghĩa 3 nhánh policy.
- tiêu chí chấp nhận: `tests/rls.test.ts` xanh (skip nếu không có `TEST_DATABASE_URL`,
  đúng quy ước dự án); lint/typecheck/build xanh; `npm run db:migrate -- --dry-run` chạy
  sạch; ADR-0005 tồn tại và đúng mẫu; diff không chạm route app (PR1 chỉ hạ tầng DB).

#### 2. M51 PR2 — `withProjectScope` + chuyển route GET theo lô

- route: `standard`
- nhánh: `claude/feat-m51-pr2-project-scope` (base = kết quả PR1 đã tích hợp — phụ thuộc
  cứng vì cần role/policy tồn tại để test có ý nghĩa, dù runtime app vẫn dùng
  `DATABASE_URL` cũ nếu chưa deploy đổi role)
- đọc trước: `docs/nang-cap/M51-da-du-an-rls.md` mục "PR2" + Đính chính + `lib/db/index.ts`
  (`withTransaction` để bám đúng pattern) + danh sách route GET đọc 12 bảng phạm vi (tự
  `grep -rl` theo tên bảng trong `app/api`).
- việc:
  - `lib/db/index.ts` thêm `withProjectScope<T>(projectId: number | '*', fn: () =>
    Promise<T>): Promise<T>` — implement bằng `withTransaction` + `SELECT
    set_config('app.project_id', ..., true)` (tái dùng pattern đã có, KHÔNG viết cơ chế
    set GUC mới); nếu chỉ đọc, dùng `SET TRANSACTION READ ONLY` bên trong transaction.
  - Chuyển từng route GET của 12 bảng phạm vi sang bọc
    `withProjectScope(await getCurrentProjectId(user), fn)` — cơ học, đúng pattern đã có
    ở các route ghi hiện tại. Route nào đã tự scope kỹ bằng WHERE `project_id = ?` vẫn
    giữ nguyên WHERE đó (RLS là lưới thứ 2, không thay check app — theo nguyên tắc đầu
    đặc tả).
  - Không sửa route WBS sâu (`tasks`, `progress_dimensions`) — ngoài phạm vi PR2.
- tiêu chí chấp nhận: mọi route GET đã chuyển vẫn trả đúng dữ liệu cũ (test tích hợp hiện
  có của các route đó xanh không sửa assertion, trừ khi phải thêm setup role/GUC cho
  test — báo rõ trong PR); lint/typecheck/build xanh; `npm test` xanh; PROGRESS.md ghi nợ
  rõ bước "khoá cửa" (bỏ nhánh `IS NULL`) còn treo, cần 1 tuần theo dõi production trước
  khi làm — KHÔNG tự làm bước đó trong PR2 này.

#### 3. M51 PR4 — Nền đa pháp nhân (`organizations`)

- route: `spec`
- nhánh: `claude/feat-m51-pr4-organizations`
- đọc trước: `docs/nang-cap/M51-da-du-an-rls.md` mục "PR4" + Đính chính.
- việc:
  - Migration thêm thuần tuý: `CREATE TABLE IF NOT EXISTS organizations (id SERIAL
    PRIMARY KEY, name TEXT NOT NULL, tax_code TEXT)` + `ALTER TABLE projects ADD COLUMN
    IF NOT EXISTS org_id INT REFERENCES organizations(id)` (nullable). Chạy
    `npm run gen:erd` cùng PR.
  - `/api/portfolio`: thêm filter `?org=`; chỉ hiện select tổ chức trên UI portfolio khi
    `count(distinct org_id) > 1` (theo Đính chính — tránh UI thừa khi chưa có nhu cầu
    thật).
  - Không làm hợp nhất tài chính đa pháp nhân / cây tổ chức (ngoài phạm vi, đã ghi nợ
    trong đặc tả gốc).
- tiêu chí chấp nhận: migration idempotent, đi thẳng production (thêm thuần tuý, không
  cần staging); lint/typecheck/build xanh; test liên quan `/api/portfolio` xanh; ERD sinh
  lại khớp.

### Thứ tự & phụ thuộc

Tuần tự, KHÔNG song song: PR1 → `reviewer` (bắt buộc rà "Vùng rủi ro cao" `docs/audit.md`
vì PR1 đổi cách app nói chuyện với DB, PR2 chạm route tài chính) → tích hợp → PR2 (base =
PR1 đã tích hợp) → `reviewer` → tích hợp → PR4 (có thể base từ `main` sau khi PR1/PR2 đã
merge, độc lập nội dung với PR1/PR2 nhưng giữ tuần tự cho đơn giản điều phối) →
`reviewer` → tích hợp → báo cáo phiên chính duyệt cuối. Trước khi tạo mỗi nhánh:
`git fetch origin` + base khớp `origin/main` mới nhất.

### Lưu ý migration & deploy (coordinator ghi vào mô tả PR, KHÔNG tự deploy)

- **PR1**: migration tạo role + RLS — không `UPDATE`/backfill dữ liệu nên về kỹ thuật là
  "thêm thuần tuý", NHƯNG đổi `DATABASE_URL` sang role `xboss_app` là thao tác vận hành
  rủi ro cao (role thiếu quyền/policy sai → app trắng dữ liệu). Ghi rõ trong mô tả PR1:
  BẮT BUỘC test trên staging trước (`bash deploy.sh --staging`), đổi `DATABASE_URL` từng
  bước, xác minh mọi route tài chính vẫn đọc/ghi đúng trước khi áp production. Không tự
  đổi `DATABASE_URL` production trong PR — đó là việc người vận hành sau khi merge.
- **PR2/PR4**: migration thêm thuần tuý, đi thẳng production theo DoD.

### Tiêu chí duyệt cuối (phiên chính kiểm khi coordinator báo xong)

(1) RLS bật + FORCE trên đúng 12 bảng phạm vi, có `WITH CHECK`; (2) role `xboss_app`
NOBYPASSRLS, ADR-0005 ghi đủ; (3) `withProjectScope` tồn tại, route GET nhóm bảng phạm vi
đã chuyển, route WBS không bị động tới; (4) bảng `organizations` + `projects.org_id`
migration thêm thuần tuý, portfolio filter hoạt động; (5) lint/typecheck/build/test xanh
toàn bộ 3 PR; (6) PROGRESS.md ghi rõ nợ "bước khoá cửa" PR2 còn treo (chờ 1 tuần theo dõi
production) + cập nhật `docs/nang-cap/README.md` M51 → trạng thái GĐ0 xong, PR2 khoá cửa
còn nợ.
