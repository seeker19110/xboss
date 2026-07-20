# PLAN.md — M54 Giai đoạn 1: trục `org_id` + cô lập tenant (multi-tenant SaaS)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, giao **nguyên văn** cho `coordinator`
> (Opus · low) thi hành — dispatch từng việc theo nhãn `route:`, theo dõi, gọi `reviewer`,
> tích hợp, báo cáo lại; phiên chính duyệt cuối. Coordinator/worker KHÔNG thấy hội thoại
> trước đó — kế hoạch dưới đây tự chứa.

## Bối cảnh

Đặc tả gốc: `docs/nang-cap/M54-multi-tenant-saas.md` mục "Giai đoạn 1". Giai đoạn 0 (M51
PR1/PR2/PR4 — RLS theo dự án + bảng `organizations`) **đã merge vào `main`** (PR #256).
Nợ còn lại của GĐ0 là bước "khoá cửa" RLS production (`docs/nang-cap/M62-rls-khoa-cua.md`)
— đó là thao tác vận hành/production riêng, **KHÔNG chặn** việc bắt đầu GĐ1 (GĐ1 xây trục
`org_id` mới, độc lập với việc khoá policy RLS dự án đã có).

**Quyết định đã chốt với người dùng trước khi lập kế hoạch này**: `users.email` giữ
**UNIQUE toàn cục** (không đổi thành `(org_id, email)`) — đơn giản, login không cần chọn
tenant. Chỉ thêm cột `org_id` vào `users` để biết user thuộc tổ chức nào; **không đổi**
ràng buộc UNIQUE hiện có trên `email`.

Đã xác nhận trước khi lập kế hoạch: `git fetch origin`, nhánh làm việc
`claude/thuc-thi-m54-gd1-89fddh` đã đồng bộ `origin/main`. Migration mới nhất trên
`main`: `0076_session_version.sql`. **Số migration thật cho PR1 phải xác nhận lại bằng
`ls migrations | sort -V | tail -3` ngay trước khi commit** — không tin số `0077` ghi cố
định dưới đây nếu có PR khác chiếm số trước khi dispatch.

**Kiểm kê đã xác nhận trên code thật** (không phải suy đoán từ đặc tả):
- `organizations` (migration `0070_organizations.sql`): hiện chỉ có `id, name, tax_code`.
  `projects.org_id` đã có (nullable, từ M51 PR4) — PR1 phải đổi thành `NOT NULL` (backfill
  trước), KHÔNG thêm cột trùng.
- `boq_codes` (migration `0029_boq_codes.sql`): PK hiện tại `(code)` — registry toàn cục
  qua trigger `boq_codes_sync()` chạy trên `tasks`/`work_packages`/`materials`/`boq_items`.
- `projects.code TEXT UNIQUE` (nullable) — cần đổi UNIQUE toàn cục → UNIQUE theo org.
- `suppliers` **không có cột định danh nào có UNIQUE constraint hiện tại** (chỉ
  `name/phone/email/address/note`) — khác giả định trong đặc tả gốc M54, **không cần đổi
  UNIQUE gì cho `suppliers`**, chỉ thêm cột `org_id`.
- `users.email TEXT UNIQUE NOT NULL` — **giữ nguyên UNIQUE toàn cục** theo quyết định trên.
- Token phiên hiện tại (`lib/session-token.ts`) đã 6 phần:
  `userId.exp.pwFrag.flag.sv.HMAC` (`sv` = `session_version`, thêm bởi đợt V5 trước đó).
  PR2 thêm phần thứ 7 `orgId` → token 7 phần.
- `withProjectScope` (`lib/db/index.ts`) đã có, dùng làm khuôn cho GUC `app.org_id` ở PR2.
- Vùng rủi ro cao theo `docs/audit.md` bị chạm: `lib/boq.ts` (PR1), `lib/auth.ts` (PR2) —
  **bắt buộc `reviewer` soát kỹ trước khi merge cả 2 PR này**, không tự merge nếu còn phát
  hiện chưa xử lý.

## Thứ tự bắt buộc — KHÔNG dispatch song song PR1-PR4

Đây là 1 dây chuyền schema phụ thuộc chặt: PR2 cần cột `org_id` từ PR1; PR3 (RLS) cần
GUC `app.org_id` do PR2 đặt; PR4 (object storage) cần `orgId` từ ngữ cảnh request (PR2)
để tạo prefix key. **Dispatch tuần tự, mỗi PR base trên `main` mới nhất SAU KHI PR trước
đã merge**:

1. **PR1** (migration trục org) — làm trước, một mình.
2. **PR2** (auth + context org) — base trên `main` sau khi PR1 merge.
3. **PR3** (RLS theo org) và **PR4** (object storage) — cả hai base trên `main` sau khi
   PR2 merge; **PR3 và PR4 có thể chạy song song với nhau** (không chạm chung file: PR3
   chỉ thêm migration + policy + test, PR4 chỉ chạm `lib/photos.ts` + route serve file).

Migration đụng dữ liệu (PR1) **bắt buộc qua staging trước production** theo DoD hiện
hành (`bash deploy.sh --staging`, xem `docs/ops/staging.md`) — coordinator không tự lên
production, chỉ tới bước merge PR + verify staging; việc chạy migration thật trên
production là thao tác vận hành của người dùng sau khi merge.

---

## PR1 — Migration trục `org_id` (`route: complex`, BẮT BUỘC qua staging)

- Nhánh: `claude/feat-m54-gd1-pr1-org-axis`
- Vùng rủi ro cao: `lib/boq.ts` — đọc kỹ `docs/audit.md` mục liên quan trước khi sửa.

### Ranh giới quyết định được phép (đây KHÔNG phải giấy phép tự do thiết kế)

- Được tự quyết cách viết script backfill (1 file migration SQL thuần hay kèm 1 bước
  `UPDATE` riêng) miễn: idempotent (`WHERE org_id IS NULL` guard), dry-run được qua
  `npm run db:migrate -- --dry-run`, và mọi dòng cũ nhận đúng `org_id = 1`.
- Được tự quyết thứ tự các câu `ALTER TABLE` trong file miễn tôn trọng phụ thuộc khoá
  ngoại (tạo `organizations` id=1 trước, rồi mới `ALTER ... REFERENCES organizations(id)`).
- KHÔNG được tự quyết đổi `users.email` sang UNIQUE theo org — đã chốt giữ toàn cục, xem
  mục Bối cảnh.

### Migration mới `migrations/00NN_org_axis.sql`

(`NN` xác nhận lại bằng `ls migrations | sort -V | tail -3` ngay trước khi commit)

1. **`organizations`** thêm cột: `slug TEXT UNIQUE`, `status TEXT NOT NULL DEFAULT 'active'`,
   `plan TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Backfill: nếu bảng đang
   rỗng hoặc không có dòng id=1, `INSERT` dòng mặc định
   `('Tổ chức mặc định', NULL, 'xboss-mac-dinh', 'active', NULL, now())` với `id = 1` —
   dùng `INSERT ... ON CONFLICT (id) DO NOTHING` hoặc `SELECT ... WHERE NOT EXISTS` (id
   cụ thể `1` cần ép bằng `OVERRIDING SYSTEM VALUE` nếu `SERIAL` đã tăng qua 1 — kiểm tra
   thực tế trước, KHÔNG giả định `id=1` còn trống nếu đã có dữ liệu organizations thật từ
   M51 GĐ0 chạy trên môi trường nào đó).
2. Thêm cột `org_id INT REFERENCES organizations(id)` (nullable trước) vào: `users`,
   `suppliers`, `code_lists`, `role_permissions`, `custom_field_defs`, `feature_flags`,
   `alert_rules`, `approval_flows`, `api_keys`, `webhooks`, `integrations`, `saved_reports`.
   `projects.org_id` **đã tồn tại** (nullable) — không thêm lại.
3. Backfill toàn bộ: `UPDATE <bảng> SET org_id = 1 WHERE org_id IS NULL` cho từng bảng ở
   bước 2 + `projects`.
4. Sau backfill, `ALTER COLUMN org_id SET NOT NULL` cho toàn bộ 13 bảng (12 bảng mới +
   `projects`).
5. `boq_codes`: đổi PK từ `(code)` sang `(org_id, code)` — cần thêm cột `org_id INT NOT
   NULL REFERENCES organizations(id)` trước, backfill qua JOIN suy ra org từ bảng nguồn
   (`tasks`/`work_packages`/`materials` → `work_packages`→`sheet_types`→`towers`→`projects`
   → `org_id`; `boq_items` → `work_packages` cùng chuỗi), rồi `DROP CONSTRAINT` PK cũ +
   `ADD PRIMARY KEY (org_id, code)`. Sửa `boq_codes_sync()`: hàm hiện dùng
   `to_jsonb(NEW) ->> TG_ARGV[0]` để lấy `new_code` — thêm logic suy `org_id` tương tự (mỗi
   bảng nguồn JOIN đúng chuỗi tới `projects.org_id`), đưa vào mọi câu `INSERT`/`DELETE`/
   `ON CONFLICT` trong hàm (khoá xung đột đổi từ `code` sang `(org_id, code)`). Giữ nguyên
   toàn bộ 4 trigger gắn trên `tasks/work_packages/materials/boq_items` (chỉ sửa thân hàm
   `boq_codes_sync()`, không đổi trigger definition).
6. `projects.code`: đổi `UNIQUE` toàn cục → `UNIQUE (org_id, code)` (drop constraint cũ,
   tạo lại). Xác nhận tên constraint thật bằng
   `\d projects` hoặc query `information_schema.table_constraints` trước khi `DROP
   CONSTRAINT <tên>` — không đoán tên.
7. **KHÔNG** đổi `users.email` (giữ `UNIQUE NOT NULL` toàn cục nguyên trạng).
8. **KHÔNG** thêm `org_id` vào `suppliers` với UNIQUE mới — bảng này không có cột định
   danh UNIQUE hiện tại (đã xác nhận bằng đọc `migrations/0001_baseline.sql`), chỉ thêm
   cột `org_id` như bước 2.
9. Chạy `npm run gen:erd` sau khi thêm.

### `lib/boq.ts::boqTakenBy`

Thêm tham số `orgId: number` (bắt buộc, không optional — theo đúng convention đã lập ở
M56/V5 cho các đổi chữ ký tương tự: dùng `grep -rn "boqTakenBy(" app/ lib/` tìm ĐỦ mọi
call-site trước khi sửa, không sót). Hàm truy vấn `boq_codes` thêm điều kiện
`AND org_id = ?`. Route gọi `boqTakenBy` (14 chỗ theo comment trong `0029_boq_codes.sql`)
lấy `orgId` từ user hiện tại đã đăng nhập qua `getCurrentUser()` — **giai đoạn này user
CHƯA có `orgId` trong session (đó là việc của PR2)**, nên tạm thời truyền hằng số
`1` (org mặc định) tại mọi call-site trong PR1 kèm `// TODO(M54 PR2): lấy orgId thật từ
session` — PR2 sẽ thay `1` bằng giá trị thật từ `getCurrentUser()`. Ghi rõ TODO này trong
`PROGRESS.md` khi báo cáo PR1 xong, để PR2 không bỏ sót.

### Test

Mở rộng/viết `tests/boq-codes.test.ts` (grep xem đã có file test boq_codes chưa trước
khi tạo mới): 2 org khác nhau tạo **CÙNG** mã BOQ trên 2 task khác nhau → cả hai thành
công (đúng mục tiêu cô lập tenant); cùng org, cùng mã trên 2 bảng khác nhau → vẫn bị
chặn như trước (hành vi cũ giữ nguyên trong phạm vi 1 org). Test backfill: sau migration,
mọi dòng cũ có `org_id = 1` (query trực tiếp).

### Tiêu chí chấp nhận PR1

- [ ] Migration mới thuần `ALTER`/backfill, dry-run qua (`npm run db:migrate --
      --dry-run`), chạy staging trước khi coi là xong theo DoD.
- [ ] `npm run gen:erd` cập nhật đúng số bảng/cột mới.
- [ ] `boqTakenBy` nhận `orgId`, mọi call-site cập nhật đủ (grep xác nhận không sót).
- [ ] 2 org tạo trùng mã BOQ đều thành công; trong cùng 1 org hành vi chặn trùng như cũ.
- [ ] `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] `reviewer` soát kỹ (chạm `lib/boq.ts`, vùng rủi ro cao) TRƯỚC khi merge.
- [ ] Cập nhật `PROGRESS.md` — ghi rõ TODO `orgId` tạm hằng số `1` để PR2 xử lý tiếp.

---

## PR2 — Auth + context org (`route: complex`, vùng rủi ro cao `lib/auth.ts`)

- Nhánh: `claude/feat-m54-gd1-pr2-auth-org-context`
- Base trên `main` SAU KHI PR1 đã merge.

### Ranh giới quyết định được phép

- Được tự quyết cách đọc `org_id` của user vào `getCurrentUser()` (thêm vào `SELECT`
  hiện có hay query riêng) — ưu tiên **không** thêm round-trip DB mới nếu hàm đã
  `SELECT` từ bảng `users`.
- Được tự quyết vị trí đặt GUC `app.org_id` trong `withTransaction` (cùng khối
  `set_config` đã có với `app.user_id`/`app.role`/`app.project_id`/`app.request_id`, xem
  `lib/db/index.ts` dòng ~179) — thêm vào CÙNG câu lệnh `set_config` nhiều tham số hiện
  có, không tạo câu lệnh riêng.
- KHÔNG được tự quyết đổi cấu trúc RLS policy — đó là PR3.

### `lib/session-token.ts`

Token hiện 6 phần `userId.exp.pwFrag.flag.sv.mac` → đổi thành 7 phần
`userId.exp.pwFrag.flag.sv.orgId.mac`. `makeToken` thêm tham số **bắt buộc thứ 5**
`orgId: number` (đúng convention không optional đã lập ở các đợt trước — tìm đủ call-site
bằng `grep -rn "makeToken(" app/ lib/`). `parseToken` trả thêm field `orgId: number`
trong `ParsedToken`, validate `orgId` là số nguyên dương hợp lệ (giống cách `sv` đang
validate bằng regex `^\d+$`). Token cũ (6 phần, phát hành trước đợt này) → `parseToken`
coi là không hợp lệ (breaking có chủ đích, đúng tiền lệ M56 PR2/V5 — mọi user bị đăng
xuất 1 lần sau deploy, ghi rõ trong `PROGRESS.md`).

### Cập nhật ĐỦ mọi call-site `makeToken`

Dùng `grep -rn "makeToken(" app/ lib/` xác nhận danh sách thật (đợt V5 trước liệt kê 5
chỗ: `login`, `login/2fa`, `password`, `totp/confirm`, `oidc/callback` — kiểm lại xem có
đổi/thêm chỗ nào từ đó tới nay không). Mỗi chỗ lấy `org_id` từ query `users` đã có sẵn
trong hàm đó (thêm cột vào `SELECT`, không thêm query riêng nếu tránh được) —
`lib/oidc.ts::SsoUser`/`upsertSsoUser` cũng cần `org_id` (giống cách đã thêm
`session_version` ở đợt V5 trước).

### `lib/auth.ts::getCurrentUser()`

Sau khi `parseToken` hợp lệ + đối chiếu `session_version`, đọc thêm `orgId` từ token và
gắn vào object `User` trả về (`User` type thêm field `orgId: number`, tìm định nghĩa
type `User` trong `lib/auth.ts` hoặc `lib/types.ts` — cập nhật đúng chỗ). **Không** cần
đối chiếu `orgId` với DB mỗi request (khác `session_version` — đổi org của user là thao
tác hiếm, hiếm hơn thu hồi phiên, chấp nhận độ trễ tới lần user login lại; nếu về sau cần
đổi org ngay lập tức thì đó là việc riêng ngoài phạm vi PR2 này).

### `withTransaction` (`lib/db/index.ts`)

Thêm `app.org_id` vào câu `set_config` nhiều tham số đã có (dòng ~179), lấy giá trị từ
ngữ cảnh actor hiện có (cùng cách `app.project_id`/`app.user_id` đang được truyền vào
hàm này — đọc kỹ chữ ký `withTransaction` thật trước khi sửa, không đoán).

### `getCurrentProjectId` (`lib/projects.ts`, theo import ở đầu `lib/auth.ts`)

Thêm xác nhận: project mà `current_project` cookie/state trỏ tới phải có
`org_id = user.orgId` — nếu không khớp (user cố đổi sang project thuộc org khác bằng đoán
ID), coi như không có project hiện tại (trả `null`, không throw — giữ nguyên kiểu trả về
`number | null` đã có).

### Mọi query trên 13 bảng nhóm gốc (PR1) — thêm điều kiện `org_id = ?`

Quét bằng test bất biến mới `tests/org-scope-invariant.test.ts` (mở rộng đúng pattern có
sẵn từ `tests/project-scope-invariant.test.ts` — đọc file đó làm mẫu): route GET SELECT
chạm 1 trong 13 bảng nhóm gốc (`users`, `projects`, `suppliers`, `code_lists`,
`role_permissions`, `custom_field_defs`, `feature_flags`, `alert_rules`,
`approval_flows`, `api_keys`, `webhooks`, `integrations`, `saved_reports`, `boq_codes`)
mà thiếu `org_id` trong WHERE → test đỏ. Route nào bị bắt lỗi thì sửa thêm điều kiện
`org_id = user.orgId` (không dùng `withProjectScope`/GUC bắt buộc ở PR2 này — đó là PR3,
PR2 chỉ đảm bảo app-level filter đúng, giống PR1 của M51 làm với `project_id`).

### Thay TODO tạm của PR1

Ở PR1, `boqTakenBy` mọi call-site tạm truyền hằng số `1`. PR2 thay bằng
`getCurrentUser()`/`user.orgId` thật tại đúng các call-site đó (grep lại comment
`TODO(M54 PR2)` để tìm đủ, không sót).

### Test + tiêu chí chấp nhận PR2

- Mở rộng test auth hiện có: token 7 phần với `orgId` đúng → hợp lệ; token 6 phần cũ →
  `null`; `getCurrentProjectId` chặn khi project thuộc org khác.
- `tests/org-scope-invariant.test.ts` mới, chạy trong CI như `project-scope-invariant`.
- [ ] `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] `reviewer` soát kỹ (vùng rủi ro cao `lib/auth.ts`) TRƯỚC khi merge, không tự merge
      nếu còn phát hiện chưa xử lý.
- [ ] Cập nhật `PROGRESS.md` — ghi rõ mọi user bị đăng xuất 1 lần sau deploy (token đổi
      định dạng).

---

## PR3 — RLS theo org (`route: spec` — đặc tả kín sau khi PR1/PR2 chốt)

- Nhánh: `claude/feat-m54-gd1-pr3-rls-org`
- Base trên `main` SAU KHI PR2 đã merge. Có thể chạy song song với PR4.
- Đặc tả kín — thi hành chính xác, KHÔNG sáng tạo thêm.

### Migration mới `migrations/00NN_rls_org.sql`

Đúng khuôn `migrations/0069_rls.sql` (M51 PR1) — đọc file đó làm mẫu chính xác trước khi
viết. Với mỗi bảng trong 13 bảng nhóm gốc (PR1, liệt kê ở PR2):

```sql
ALTER TABLE <bảng> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <bảng> FORCE ROW LEVEL SECURITY;
CREATE POLICY p_<bảng>_org ON <bảng>
  USING (org_id::text = current_setting('app.org_id', true)
         OR current_setting('app.org_id', true) = ''
         OR current_setting('app.org_id', true) IS NULL
         OR current_setting('app.org_id', true) = '*')
  WITH CHECK (org_id::text = current_setting('app.org_id', true)
         OR current_setting('app.org_id', true) = ''
         OR current_setting('app.org_id', true) IS NULL
         OR current_setting('app.org_id', true) = '*');
```

(So sánh `::text` thay vì cast GUC sang `int` — đúng lý do đã ghi trong
`migrations/0069_rls.sql`/`PROGRESS.md` mục M51 PR1: Postgres không đảm bảo short-circuit
AND/OR nên cast `''`/`'*'` sang int sẽ lỗi.)

Bảng có `project_id` (137 bảng còn lại) **giữ nguyên** policy theo project của M51 —
không đụng, cô lập org đã bắc cầu qua `projects.org_id`.

`boq_codes` là bảng có PK tổ hợp `(org_id, code)` từ PR1 — policy dùng cùng biểu thức
trên cột `org_id`, không cần xử lý gì đặc biệt thêm.

### Test

`tests/rls-org.test.ts` (integration, role `xboss_app`, đúng khuôn `tests/rls.test.ts`
của M51): (1) GUC org A không thấy dòng org B dù SQL không có WHERE `org_id`; (2) GUC
trống → vẫn đọc được (lộ trình chuyển tiếp, giống M51 PR1 — khoá cửa để dành đợt sau như
M62); (3) `'*'` thấy tất; (4) INSERT sai `org_id` với GUC khác → chặn bởi `WITH CHECK`.

### Tiêu chí chấp nhận PR3

- [ ] Migration theo đúng khuôn `0069_rls.sql`, 13 bảng nhóm gốc có RLS org.
- [ ] `tests/rls-org.test.ts` đủ 4 kịch bản, pass với Postgres cục bộ role `xboss_app`.
- [ ] `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] Cập nhật `PROGRESS.md` — ghi rõ nợ "khoá cửa" RLS org (bỏ nhánh thiếu-ngữ-cảnh) để
      dành đợt sau, giống mô hình M62 đã làm cho RLS theo project.

---

## PR4 — Object storage cho `data/uploads/` (`route: complex`)

- Nhánh: `claude/feat-m54-gd1-pr4-object-storage`
- Base trên `main` SAU KHI PR2 đã merge (cần `user.orgId` từ context request). Có thể
  chạy song song với PR3.

### Ranh giới quyết định được phép

- Được tự quyết chi tiết client S3 dùng (SDK `@aws-sdk/client-s3` hay thư viện MinIO
  chính thức) miễn tương thích cả MinIO tự host lẫn S3 thật qua đổi `endpoint`/region —
  không khoá cứng vào 1 nhà cung cấp.
- Được tự quyết cấu trúc file mới (`lib/storage.ts` mới hay mở rộng trong `lib/photos.ts`)
  miễn giữ đúng chữ ký trừu tượng `storagePut/storageGet/storageDelete` nêu dưới và
  KHÔNG đổi hành vi các hàm hiện có trong `lib/photos.ts` (mime sniffing, hash sha256, max
  size) — chỉ đổi nơi lưu byte cuối cùng.
- KHÔNG được tự quyết đổi URL route serve file hiện tại (client không đổi).

### `lib/storage.ts` (mới) hoặc mở rộng `lib/photos.ts`

```ts
export async function storagePut(key: string, buf: Buffer, mime: string): Promise<void>;
export async function storageGet(key: string): Promise<Buffer | null>;
export async function storageDelete(key: string): Promise<void>;
```

Key có prefix `org/<org_id>/...` (lấy `org_id` từ `user.orgId` tại route gọi, không đọc
GUC DB). Biến môi trường mới (thêm vào `lib/env.ts` theo đúng pattern `serverSchema` đã
có — optional, thiếu thì fallback filesystem cũ để dev không cần dựng MinIO):
`XBOSS_S3_ENDPOINT`, `XBOSS_S3_BUCKET`, `XBOSS_S3_ACCESS_KEY`, `XBOSS_S3_SECRET_KEY`,
`XBOSS_S3_REGION` (mặc định `us-east-1` cho MinIO). Thiếu đủ biến này →
`storagePut/storageGet/storageDelete` fallback về `fs` filesystem hiện có (path
`data/uploads/`) — giữ nguyên hành vi dev/staging chưa có MinIO, đúng pattern các tích
hợp tuỳ chọn khác trong dự án (`lib/push.ts`, `lib/google-sheets.ts`).

### Điểm chạm route hiện có

Mọi nơi hiện đang `fs.writeFile`/`fs.readFile`/`fs.unlink` trực tiếp vào
`data/uploads/` (grep `data/uploads` và `fs\.(writeFile|readFile|unlink)` trong
`app/api/`/`lib/photos.ts` để liệt kê đủ — bao gồm ảnh hiện trường `task_photos`, biên
bản nghiệm thu `task_documents`, tài liệu hợp đồng/dự án nếu có dùng cùng cơ chế lưu
file) — đổi sang gọi `storagePut/storageGet/storageDelete`, giữ nguyên toàn bộ hàng rào
đã có TRƯỚC bước ghi (verify mime, hash sha256, max size không đổi vị trí kiểm tra).

### Script di trú file cũ

`scripts/migrate-uploads-to-storage.ts` (mới) — quét toàn bộ file trong `data/uploads/`,
với mỗi file: tra bảng tương ứng (`task_photos`/`task_documents`/...) lấy `id` + tính
`org_id` (qua chuỗi JOIN từ task → project → org), upload qua `storagePut` với key
`org/<org_id>/<tên file cũ>`, verify hash sha256 sau khi đọc lại từ storage khớp hash gốc
trước khi coi là xong (không tự xoá file gốc trong script này — để người vận hành tự xoá
sau khi xác nhận thủ công, tránh mất dữ liệu nếu script có bug).

### Test

`tests/storage.test.ts` (mới, unit thuần không cần S3 thật nếu thiếu env — test fallback
filesystem; nếu có `TEST_S3_*` env thì test thật với MinIO local, tự skip nếu thiếu, đúng
pattern `TEST_DATABASE_URL`).

### Tiêu chí chấp nhận PR4

- [ ] `storagePut/storageGet/storageDelete` hoạt động cả 2 chế độ (S3 thật khi có env,
      fallback filesystem khi thiếu).
- [ ] URL route serve file không đổi với client.
- [ ] Script di trú chạy được, verify hash từng file, không tự xoá file gốc.
- [ ] `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] `DEPLOY.md` thêm mục cấu hình MinIO/S3 (biến môi trường mới, cách chạy script di
      trú) — chỉ tài liệu, không yêu cầu người dùng đổi hạ tầng ngay trong PR này.
- [ ] Cập nhật `PROGRESS.md`.

---

## Test & tiêu chí chấp nhận xuyên suốt (toàn GĐ1, chạy sau khi PR3+PR4 merge)

`tests/org-isolation.test.ts` (mới, integration, route thật — không chỉ lib): dựng 2 org
× 2 project, xác nhận qua ROUTE THẬT: user org A không đọc/ghi/đoán-ID được bất kỳ tài
nguyên org B nào trên mẫu đại diện mỗi nhóm bảng (tài chính, WBS, vật tư, tài liệu, cấu
hình); BOQCODE trùng nhau giữa 2 org đều tạo được; RLS chặn khi cố tình bỏ WHERE (query
trực tiếp bằng role `xboss_app`). Việc viết test tổng hợp này giao cho `coordinator` sau
khi cả 4 PR đã merge — không thuộc riêng PR nào ở trên (cần schema đầy đủ của cả 4 PR).

## Điều phối

- 4 PR, dispatch **tuần tự theo thứ tự PR1 → PR2 → {PR3, PR4}** (xem mục "Thứ tự bắt
  buộc" đầu file) — KHÔNG dispatch song song PR1/PR2 với nhau, chỉ PR3/PR4 song song sau
  khi PR2 merge.
- Trước khi merge mỗi PR có migration (PR1, PR3): chạy `ls migrations | sort -V | tail -3`
  lấy số thật, không tin số ghi trong kế hoạch này.
- `reviewer` soát diff MỌI PR trước khi merge; **PR1 (chạm `lib/boq.ts`) và PR2 (chạm
  `lib/auth.ts`) bắt buộc `reviewer` xác nhận đạt** trước khi merge (vùng rủi ro cao
  `docs/audit.md`) — không tự merge nếu còn phát hiện chưa xử lý.
- PR1 là migration đụng dữ liệu — bắt buộc qua staging trước khi coi PR1 "xong" theo DoD
  (`bash deploy.sh --staging`); coordinator merge PR sau khi verify staging xanh, việc áp
  migration lên production thật là thao tác vận hành riêng của người dùng.
- Sau khi PR2 merge: viết `tests/org-isolation.test.ts` tổng hợp (mục trên) — có thể giao
  cùng lúc với PR3/PR4 hoặc làm riêng sau khi cả 2 merge, coordinator tự quyết thời điểm.
- Sau khi cả 4 PR merge: cập nhật `docs/nang-cap/README.md` — đổi trạng thái
  `M54-multi-tenant-saas.md` từ "❌ chưa" sang "✅ GĐ1 xong", ghi số PR từng phần; cập nhật
  `PROGRESS.md` mục tổng kết GĐ1, liệt kê rõ nợ còn lại cho Giai đoạn 2 (provisioning,
  billing/quota, secret store per-org cho Google Sheet/Telegram/SMTP, cron per-tenant —
  đã ghi trong đặc tả gốc mục "Rủi ro & quyết định mở", KHÔNG tự thi hành GĐ2 trong đợt
  này).
- Báo cáo tổng hợp về phiên chính: kết quả từng PR, đặc biệt PR1/PR2 reviewer có phát
  hiện gì; việc nào worker báo vướng đặc tả (dừng lại, không tự chế) để phiên chính xử lý;
  xác nhận staging đã chạy migration PR1 thành công trước khi phiên chính duyệt cuối.
