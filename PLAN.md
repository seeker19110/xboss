# PLAN.md — M54 Giai đoạn 1: trục `org_id` + cô lập tenant (multi-tenant SaaS)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, giao **nguyên văn** cho `coordinator`
> (Opus · low) thi hành — dispatch từng việc theo nhãn `route:`, theo dõi, gọi `reviewer`,
> tích hợp, báo cáo lại; phiên chính duyệt cuối. Coordinator/worker KHÔNG thấy hội thoại
> trước đó — kế hoạch dưới đây tự chứa.

## Bối cảnh

Đặc tả gốc: `docs/nang-cap/M54-multi-tenant-saas.md`. Giai đoạn 0 (M51 — RLS theo dự án +
`organizations` + `withProjectScope`) đã **xong hoàn toàn** (M51 GĐ0 PR1/PR2/PR4 + M62 PR1/PR2
"khoá cửa" — xác nhận lại 2026-07-20, migration `0077_rls_lock.sql` đã merge `main`, điều kiện
vận hành production đã đủ). Không còn blocker phụ thuộc để bắt đầu Giai đoạn 1.

**Quyết định đã chốt với người dùng trước khi lập kế hoạch này (không tự đoán):**

- `users.email` UNIQUE **toàn cục** (không theo tenant) — 1 email chỉ dùng ở 1 tổ chức. Login
  không cần chọn tenant trước khi nhập mật khẩu.
- Mô hình giá/quota, secret store per-tenant cho Google Sheet/Telegram/SMTP, cron per-tenant —
  **đều thuộc Giai đoạn 2**, KHÔNG nằm trong phạm vi kế hoạch này, không tự làm.

**Đã xác nhận trước khi lập kế hoạch**: `git fetch origin`, `origin/main` khớp nhánh hiện tại
(sạch). Migration mới nhất trên `main`: `0077_rls_lock.sql`. **Số migration cho PR1 PHẢI xác
nhận lại bằng `ls migrations | sort -V | tail -3` ngay trước khi commit** (tại thời điểm lập kế
hoạch này là `0078`, có thể đã đổi — bài học lặp lại nhiều lần, xem `docs/nang-cap/README.md`
mục "LUẬT số migration").

**Đây là thay đổi mô hình dữ liệu lớn nhất từ đầu dự án — đi theo đúng 4 PR tuần tự của đặc tả
gốc, KHÔNG dồn vào 1 PR, KHÔNG tự rút gọn phạm vi.** PR1→PR2→PR3 phụ thuộc cứng lẫn nhau (mỗi
PR chỉ bắt đầu SAU khi PR trước đã merge vào `main` — không dùng worktree song song cho 3 PR
này). PR4 (object storage) phụ thuộc PR1 (cần cột `org_id` tồn tại trên `users`/`projects` để
tính prefix key) nhưng **độc lập với PR2/PR3** về mặt file — có thể dispatch song song với PR2
ngay sau khi PR1 merge.

## VIỆC 1 — PR1: Migration trục `org_id` (nền dữ liệu)

- `route: complex` — đặc tả đã nêu rõ mục tiêu và ràng buộc, nhưng từng bảng cụ thể cần tự đọc
  constraint thật (tên UNIQUE/PK hiện có khác nhau giữa các bảng, không đoán) rồi viết ALTER
  đúng — đúng "ranh giới quyết định được phép" mô tả bên dưới.
- Nhánh: `claude/feat-m54-gd1-pr1-org-trunk`
- **BẮT BUỘC qua staging trước production** (đụng dữ liệu — backfill + đổi UNIQUE/PK), theo DoD
  `CLAUDE.md`. Không tự áp production.
- Đặc tả đầy đủ: `docs/nang-cap/M54-multi-tenant-saas.md` mục "Giai đoạn 1 → PR1".

### Nội dung bắt buộc

1. **Xác nhận số migration thật** bằng `ls migrations | sort -V | tail -3` ngay trước khi tạo
   file — không dùng số `0078` cố định ghi trong kế hoạch này nếu đã có PR khác chiếm số đó.
2. `organizations` (đã có từ M51 PR4, `migrations/0070_organizations.sql`) — thêm cột:
   `slug TEXT UNIQUE NOT NULL` (định danh tenant, dùng slug tạm sinh từ tên cho org backfill
   nếu tên không hợp lệ làm slug — vd lowercase + thay khoảng trắng bằng `-`), `status TEXT
   NOT NULL DEFAULT 'active'`, `plan TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
3. Gắn `org_id INT NOT NULL REFERENCES organizations(id)` vào **đúng danh sách bảng gốc** liệt
   kê trong đặc tả — KHÔNG thêm bảng nào ngoài danh sách này, KHÔNG bỏ sót:
   `users`, `projects`, `suppliers`, `code_lists`, `role_permissions`, `custom_field_defs`,
   `feature_flags`, `alert_rules`, `approval_flows`, `api_keys`, `webhooks`, `integrations`,
   `saved_reports`, `boq_codes`.
   - Các bảng đã có cột nullable liên quan (vd `code_lists`/`role_permissions` đã có
     `project_id` từ M61) giữ nguyên cột đó — `org_id` là cột MỚI, độc lập, không thay thế.
   - Bảng có `project_id` (137 bảng còn lại — WBS/tài chính/vật tư...) **KHÔNG thêm `org_id`**
     — suy ra qua `project_id → projects.org_id` khi cần (đúng quyết định đặc tả, tránh
     denormalize + lớp bug đồng bộ 2 cột). Không tự ý mở rộng phạm vi.
4. **Backfill**: tạo 1 tổ chức mặc định (`slug='default'` hoặc tương đương, `status='active'`)
   nếu bảng `organizations` đang rỗng; mọi dòng cũ trong 14 bảng ở mục 3 nhận `org_id` = id tổ
   chức mặc định đó. Script backfill **idempotent** (chạy lại không đổi kết quả — `UPDATE ...
   WHERE org_id IS NULL` trước khi `SET NOT NULL`, không giả định org mặc định luôn `id=1`).
5. Đổi UNIQUE liên quan đến các bảng ở mục 3 sang có phạm vi tổ chức — **đọc constraint thật
   của từng bảng trước khi ALTER** (`grep -n "CREATE TABLE IF NOT EXISTS <bảng>\|UNIQUE" trong
   migrations/*.sql`, không đoán tên constraint — đúng pattern đã dùng ở `0066` cho
   `role_permissions`):
   - `boq_codes`: PK đổi từ `(code)` → `(org_id, code)`; `trigger boq_codes_sync()`
     (`migrations/0029_boq_codes.sql`) phải đọc `org_id` qua chuỗi JOIN đúng bảng nguồn của
     từng loại dòng (`tasks`/`work_packages`/`materials`/`boq_items` → `projects.org_id`);
     `lib/boq.ts::boqTakenBy` thêm tham số `orgId` bắt buộc, mọi call site cập nhật theo.
   - `projects.code`, định danh `suppliers` (kiểm cột định danh thật, có thể là `name` hoặc mã
     riêng — đọc `migrations/0001_baseline.sql`), và UNIQUE của các bảng còn lại trong danh
     sách mục 3 nếu có (`webhooks`, `api_keys`, `code_lists` domain+code, v.v.) → đổi thành
     UNIQUE `(org_id, <cột định danh cũ>)`.
   - `users.email` **GIỮ NGUYÊN UNIQUE toàn cục** — quyết định đã chốt, KHÔNG đổi thành
     `(org_id, email)`.
6. Migration **idempotent, append-only** (không sửa file đã áp production — ADR-0003); backfill
   phức tạp có thể tách thành script riêng trong `scripts/` nếu migration SQL thuần không đủ
   biểu cảm (đúng tiền lệ `scripts/backfill-boq.ts`).
7. `npm run gen:erd` cùng PR — ERD phải khớp schema mới.

### Tiêu chí chấp nhận VIỆC 1

- [ ] Cả 14 bảng gốc có cột `org_id NOT NULL` trỏ đúng tổ chức mặc định sau backfill; không có
      dòng nào `org_id IS NULL`.
- [ ] `boq_codes` PK `(org_id, code)`; trigger + `boqTakenBy` hoạt động đúng theo tổ chức (2 mã
      trùng nhau ở 2 org khác nhau đều tạo được — verify tay/test tích hợp).
- [ ] `users.email` vẫn UNIQUE toàn cục (không đổi).
- [ ] Migration chạy lại lần 2 trên cùng DB không lỗi, không đổi kết quả (idempotent).
- [ ] `npm run db:migrate -- --dry-run` sạch; đã chạy qua `bash deploy.sh --staging` xác nhận
      trước khi coi PR1 "sẵn sàng" (nhưng PR1 chỉ cần code + test xong, KHÔNG tự áp production —
      áp production là quyết định vận hành của người dùng sau khi review, đúng khuôn mẫu M62).
- [ ] `npm run lint`/`typecheck`/`test`/`build` xanh; `npm run gen:erd` khớp, CI gate không lệch.
- [ ] Test tích hợp mới (tối thiểu): tạo 2 tổ chức, xác nhận `boq_codes` trùng mã giữa 2 org
      không đụng nhau; `users.email` trùng vẫn bị chặn dù khác org.
- [ ] Cập nhật `PROGRESS.md` mục "Đã làm" — ghi rõ **CHƯA áp production**, chờ staging.

---

## VIỆC 2 — PR2: Auth + context org

- `route: complex` — chạm `lib/auth.ts`/`lib/session-token.ts` (**vùng rủi ro cao**,
  `docs/audit.md`). Đặc tả nêu rõ mục tiêu (org trong token, GUC `app.org_id`, chặn đổi project
  xuyên org) nhưng cách sửa từng call site cụ thể cần tự cân nhắc trong ranh giới: KHÔNG đổi
  ngữ nghĩa quyền hiện có (`CAN`, `canTouchTask`...) ngoài việc thêm điều kiện `org_id`.
- Nhánh: `claude/feat-m54-gd1-pr2-auth-org-context`
- **Phụ thuộc cứng vào VIỆC 1 đã merge vào `main`.**
- Đặc tả đầy đủ: `docs/nang-cap/M54-multi-tenant-saas.md` mục "Giai đoạn 1 → PR2".

### Nội dung bắt buộc

1. `lib/session-token.ts`: token phiên hiện là 6 phần
   (`userId.exp.pwFrag.flag.sessionVersion.HMAC`, xem code hiện tại). Thêm `orgId` vào payload
   ký (token 7 phần: `userId.exp.pwFrag.flag.sessionVersion.orgId.HMAC`) — **breaking có chủ
   đích**, đúng tiền lệ M56 PR2/V5 (`parseToken` cũ 6 phần bị coi KHÔNG hợp lệ sau đổi, mọi user
   bị đăng xuất 1 lần sau deploy — chấp nhận được, ghi rõ trong PR). `makeToken`/`parseToken`
   cập nhật chữ ký + mọi call site (`lib/auth.ts`, route `/api/auth/login*`).
2. `lib/auth.ts::getCurrentUser()` trả kèm `orgId` trong `User` type; `lib/request-context.ts`
   thêm field `orgId` (mirror `projectId` hiện có).
3. `lib/db/index.ts::withTransaction` — thêm `set_config('app.org_id', ...)` vào cùng câu lệnh
   `set_config` đã có sẵn (dòng đặt `app.project_id`/`app.user_id`/`app.role`/`app.request_id`)
   — tái dùng đúng cơ chế GUC hiện có, KHÔNG viết cơ chế mới.
4. `lib/projects.ts::visibleProjectIds`/`getCurrentProjectId`: lọc thêm theo `org_id` của user
   hiện tại — kể cả nhánh admin (`SELECT id FROM projects ORDER BY id`) phải giới hạn đúng
   `WHERE org_id = ?` (admin KHÔNG còn thấy xuyên tổ chức — vai trò admin là per-tenant từ nay,
   super-admin xuyên tổ chức là việc của Giai đoạn 2, ngoài phạm vi PR2). `resolveProjectId`
   (hàm thuần) không cần đổi nếu `visible` đã lọc đúng ở tầng gọi.
5. Test bất biến org-scope mới (`tests/org-scope-invariant.test.ts`, mirror
   `tests/project-scope-invariant.test.ts`): quét route GET+SELECT chạm 1 trong 14 bảng gốc mà
   thiếu điều kiện `org_id` → đỏ. Whitelist tường minh nếu có ngoại lệ hợp lý (ghi rõ lý do,
   đúng pattern whitelist của `project-scope-invariant`).
6. **KHÔNG** làm ở PR2 (thuộc PR3/PR4 hoặc GĐ2): policy RLS theo org, đổi `data/uploads/`,
   super-admin xuyên tổ chức, provisioning/signup.

### Tiêu chí chấp nhận VIỆC 2

- [ ] Token phiên chứa `orgId` đã ký (giả mạo bằng sửa cookie tay bị chặn — test xác nhận).
- [ ] `getCurrentUser()` trả đúng `orgId`; mọi route dùng `getCurrentProjectId` chỉ thấy project
      thuộc org của user (đoán ID project org khác → không thấy, không lỗi 500).
- [ ] `withTransaction` set đúng GUC `app.org_id` — verify bằng `current_setting('app.org_id')`
      trong 1 test tích hợp.
- [ ] `tests/org-scope-invariant.test.ts` chạy trong CI, whitelist (nếu có) tối thiểu và có lý
      do ghi rõ.
- [ ] Đăng nhập/đăng xuất/đổi mật khẩu/2FA/thu hồi phiên (các luồng đã có trước đó) không hồi
      quy — chạy lại toàn bộ `tests/auth*.test.ts`, `tests/totp.test.ts`.
- [ ] `npm run lint`/`typecheck`/`test`/`build` xanh.
- [ ] `reviewer` **bắt buộc** soát diff (đụng `lib/auth.ts`, vùng rủi ro cao theo
      `docs/audit.md`).
- [ ] Cập nhật `PROGRESS.md`.

---

## VIỆC 3 — PR3: RLS theo org

- `route: spec` — đặc tả kín SAU KHI PR1/PR2 đã chốt xong (cùng khuôn `migrations/0077_rls_lock.sql`
  của M62 PR2 — chỉ cần lặp lại đúng pattern policy 2 nhánh cho trục org).
- Nhánh: `claude/feat-m54-gd1-pr3-rls-org`
- **Phụ thuộc cứng vào VIỆC 2 đã merge vào `main`** (đọc GUC `app.org_id` do PR2 thiết lập).
- Đặc tả đầy đủ: `docs/nang-cap/M54-multi-tenant-saas.md` mục "Giai đoạn 1 → PR3".

### Nội dung

- Migration mới (số xác nhận lại bằng `ls migrations | sort -V | tail -3` ngay trước khi
  commit): `CREATE POLICY` trên 14 bảng gốc (mục 3 của VIỆC 1) — `org_id::text =
  current_setting('app.org_id', true)` (so text, KHÔNG cast int — lý do đã ghi ở
  `migrations/0077_rls_lock.sql`, không lặp lại sai lầm cast từng gặp ở M51 PR1).
- Bảng có `project_id` (nhóm 11 bảng tài chính đã có RLS theo project từ M51/M62) **giữ nguyên**
  policy hiện có — cô lập theo org đã bắc cầu qua `project_id → projects.org_id` (project thuộc
  đúng 1 org), KHÔNG thêm policy org trùng lặp lên các bảng đó.
- Theo đúng lộ trình chuyển tiếp đã dùng ở M51/M62 (`IS NULL cho qua` trong giai đoạn đầu →
  khoá bằng migration riêng sau khi đủ điều kiện vận hành) — **PR3 này áp dụng NGAY policy 2
  nhánh cuối cùng** (không cần giai đoạn chuyển tiếp trung gian riêng vì PR2 đã đảm bảo GUC
  luôn có mặt ở mọi transaction ghi/đọc quan trọng — khác bối cảnh M51 PR1 lúc đó chưa có
  `withProjectScope` cho route đọc). Nếu review phát hiện còn đường đọc thiếu GUC (ngoài
  transaction), báo lại phiên chính thay vì tự thêm giai đoạn chuyển tiếp.

### Tiêu chí chấp nhận VIỆC 3

- [ ] Test tích hợp: query 14 bảng gốc bằng role `xboss_app`, KHÔNG có GUC `app.org_id` → trả 0
      dòng; có GUC đúng → chỉ thấy tổ chức đó.
- [ ] `tests/org-isolation.test.ts` (đặc tả gốc mục "Test & tiêu chí chấp nhận xuyên suốt"): 2
      org × 2 project, xác nhận qua ROUTE THẬT (không chỉ lib) — user org A không đọc/ghi/đoán-ID
      được tài nguyên org B trên mẫu đại diện mỗi nhóm bảng; BOQCODE trùng giữa 2 org đều tạo
      được; RLS chặn khi cố tình bỏ WHERE ở tầng app.
- [ ] `npm run lint`/`typecheck`/`test`/`build` xanh.
- [ ] Cập nhật `PROGRESS.md` — ghi rõ trạng thái áp production (nếu có điều kiện vận hành cần
      chờ, ghi rõ như đã làm với M62 PR2, không tự nhận "xong hẳn" nếu chưa xác nhận).

---

## VIỆC 4 — PR4: Object storage (`data/uploads/` → S3-compatible)

- `route: complex` — đặc tả nêu kiến trúc (`storagePut/storageGet/storageDelete`) nhưng cách
  giữ nguyên toàn bộ hàng rào hiện có (mime sniffing, hash, max size) trong lúc trừu tượng hoá
  I/O cần tự cân nhắc; ranh giới: KHÔNG đổi bất kỳ rule validate/an toàn nào đang có trong
  `lib/photos.ts`, chỉ đổi nơi lưu trữ.
- Nhánh: `claude/feat-m54-gd1-pr4-object-storage`
- **Phụ thuộc VIỆC 1 đã merge** (cần cột `org_id` trên `projects` để tính prefix key) — **độc
  lập với VIỆC 2/VIỆC 3 về file chạm**, dispatch song song với VIỆC 2 ngay sau khi VIỆC 1 merge.
- Đặc tả đầy đủ: `docs/nang-cap/M54-multi-tenant-saas.md` mục "Giai đoạn 1 → PR4".

### Nội dung

1. `lib/photos.ts` (và mọi module ghi file tương tự — `lib/drawings.ts` nếu có logic file
   riêng, rà toàn bộ nơi ghi trực tiếp vào `data/uploads/`) trừu tượng hoá qua 3 hàm
   `storagePut(key, buf, mime)`/`storageGet(key)`/`storageDelete(key)` — giữ nguyên: path sinh
   ở server (không tin tên file client gửi), mime sniffing (`sniffMime`/`verifyFileMime`), hash
   sha256, kiểm dung lượng trước khi buffer hết `formData()`.
2. Backend mặc định: MinIO tự host (S3-compatible) qua biến môi trường mới (đặt tên theo quy
   ước hiện có, vd `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` — thiếu biến ⇒ rơi
   về ghi đĩa cục bộ như hiện tại, KHÔNG throw, để môi trường dev/CI không cần MinIO thật —
   đúng tinh thần "thiếu cấu hình tuỳ chọn = no-op/fallback" của các tích hợp khác trong dự án
   như `lib/push.ts`/`lib/google-sheets.ts`).
3. Key có prefix `org/<org_id>/...` (org lấy qua project của resource, hoặc `orgId` trong
   request-context khi route đã set).
4. Route serve file (`GET .../file`, `GET .../photos/:id`...) giữ nguyên URL/response — chỉ đổi
   nguồn đọc bytes (stream từ storage thay vì `fs.readFile`), client không cần đổi.
5. Script di trú file cũ (`scripts/migrate-uploads-to-s3.ts` hoặc tên tương tự) — đọc từng file
   trong `data/uploads/`, tính hash, upload, verify hash khớp trước khi coi là di trú xong; có
   chế độ `--dry-run`. **KHÔNG tự chạy trên production** — bàn giao cho vận hành, giống mọi
   script backfill khác trong dự án.

### Tiêu chí chấp nhận VIỆC 4

- [ ] Thiếu biến môi trường S3 → toàn bộ luồng upload/xem/xoá file hoạt động y hệt trước PR4
      (ghi đĩa cục bộ) — không hồi quy khi MinIO chưa cấu hình (CI/dev).
- [ ] Có biến môi trường S3 (test bằng MinIO cục bộ nếu môi trường CI cho phép, hoặc mock) →
      upload/xem/xoá qua storage mới hoạt động đúng, mime sniffing/hash/max-size không đổi hành
      vi.
- [ ] Script di trú có `--dry-run`, verify hash từng file, không xoá file gốc tới khi xác nhận
      upload + hash khớp.
- [ ] `npm run lint`/`typecheck`/`test`/`build` xanh.
- [ ] `DEPLOY.md` cập nhật mục vận hành MinIO/S3 (biến môi trường, cách chạy script di trú).
- [ ] Cập nhật `PROGRESS.md`.

---

## Điều phối

- **Thứ tự bắt buộc** (không dispatch song song ngoài ngoại lệ đã nêu):
  1. VIỆC 1 (PR1) một mình trước — mọi việc khác phụ thuộc nó.
  2. Sau khi VIỆC 1 merge vào `main`: dispatch **song song** VIỆC 2 (PR2) và VIỆC 4 (PR4) — 2
     worktree độc lập, không chạm file chung.
  3. Sau khi VIỆC 2 merge vào `main`: dispatch VIỆC 3 (PR3) — base worktree trên `main` mới
     nhất sau merge VIỆC 2 (không cần chờ VIỆC 4, độc lập file).
- Trước khi commit BẤT KỲ migration nào ở VIỆC 1/VIỆC 3: chạy
  `ls migrations | sort -V | tail -3` lấy số thật, không tin số ghi trong đặc tả gốc hay kế
  hoạch này.
- `reviewer` soát diff cả 4 việc trước khi merge; **VIỆC 2 bắt buộc reviewer xác nhận đạt**
  (đụng `lib/auth.ts`, vùng rủi ro cao theo `docs/audit.md`) — không merge nếu reviewer báo
  blocker.
- VIỆC 1 và VIỆC 3 chỉ coi là hoàn tất về mặt CODE — migration đụng dữ liệu/đổi policy RLS
  KHÔNG tự động nghĩa là đã áp production; ghi rõ trạng thái "chờ staging"/"chờ điều kiện vận
  hành" (nếu có) trong báo cáo cuối, để phiên chính/người dùng quyết định thời điểm áp
  production — đúng tiền lệ M62.
- Sau khi cả 4 việc merge: cập nhật `docs/nang-cap/README.md` (đổi trạng thái M54 từ "❌ chưa"
  sang đúng thực tế — có thể vẫn "GĐ1 code xong, chờ staging" nếu chưa áp production) và
  `PROGRESS.md` mục "Đã làm" + "Tiếp theo" (Giai đoạn 2 chỉ mới có phác thảo, cần viết đặc tả
  riêng khi đến lượt — không tự viết đặc tả GĐ2 trong đợt này).
- Báo cáo tổng hợp về phiên chính: kết quả từng việc, số PR, kết quả reviewer (đặc biệt VIỆC 2),
  và làm rõ trạng thái treo (staging/production) của VIỆC 1 và VIỆC 3 để phiên chính không nhầm
  là đã xong hoàn toàn.
