# PLAN.md — Đợt nâng cấp chuyên nghiệp hoá (audit 2026-07-19)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, giao **nguyên văn** cho `coordinator`
> (Opus · low) thi hành — dispatch từng việc theo nhãn `route:`, theo dõi, gọi `reviewer`,
> tích hợp, báo cáo lại; phiên chính duyệt cuối. Coordinator/worker KHÔNG thấy hội thoại
> trước đó — kế hoạch dưới đây tự chứa.

## Bối cảnh

Nguồn: 3 audit song song (bảo mật+logic nghiệp vụ / UI-UX+vận hành / tech-stack+CI-CD)
chạy 2026-07-19 theo `docs/audit.md` §2 mục "Audit nâng cấp chuyên nghiệp hoá" (vừa bổ
sung). Người dùng chốt: **thi hành hết trong 1 đợt**. 14 phát hiện gộp thành **9 việc**
(nhóm theo file/chủ đề liên quan để giảm số worktree). **1 việc bị loại khỏi đợt này**
(xem mục "Loại khỏi đợt" cuối file) vì thiếu đặc tả kín — đúng luật cứng `CLAUDE.md`.

Đã xác nhận trước khi lập kế hoạch: `git fetch origin`, `origin/main` = nhánh hiện tại
(sạch). Migration mới nhất trên `main`: `0072_material_tx_idempotency.sql`. **⚠ PR #270
(M55 BI Metabase, đang mở) chiếm số `0073` trên nhánh riêng — CHƯA merge `main`.** Số
migration thật cho các việc dưới đây (V2, V5) phải xác nhận lại bằng
`ls migrations | sort -V | tail -3` **ngay trước khi commit từng migration**, không dùng
số cố định ghi sẵn trong kế hoạch này.

## Cảnh báo xung đột file giữa các việc (đọc trước khi dispatch)

- `app/api/auth/password/route.ts` bị chạm bởi **V1** (rate-limit), **V5** (session
  revocation — đổi `makeToken` call), **V6** (CSRF same-origin). Dispatch **tuần tự**:
  V1 trước (nhỏ nhất, xong nhanh) → merge → V6 base trên `main` mới → merge → V5 base
  trên `main` mới nhất (V5 vốn đã phải làm sau cùng vì rủi ro cao nhất). **Không chạy
  V1/V5/V6 song song trên 3 worktree cùng lúc.**
- `lib/auth.ts`/`lib/session-token.ts` (vùng rủi ro cao theo `docs/audit.md` §8) chỉ V5
  chạm — không xung đột với việc khác.
- Các việc còn lại (V2, V3, V4, V7, V8, V9) không chạm file chung với nhau hoặc với
  V1/V5/V6 — dispatch song song bình thường.

---

## V1 — Vá nhỏ bảo mật + cấu hình (gộp 3 phát hiện nhỏ, cùng mức "mechanical")

- `route: mechanical`
- Nhánh: `claude/chore-security-config-patches`
- **Dispatch đầu tiên trong nhóm password route** (xem cảnh báo xung đột trên).

### 1a. Rate-limit đổi mật khẩu

`app/api/auth/password/route.ts` — thêm rate-limit theo `user.id` trước khi verify
`oldPassword`, dùng đúng `hitRateLimit` đã có (`@/lib/ratelimit`, xem cách `login/2fa`
dùng). Giới hạn: 5 lần sai / 15 phút / user. Khi vượt → `429` kèm body
`{ error: "Thử lại sau ít phút" }` (tiếng Việt, không lộ số giây chính xác — đủ thông
tin cho UI). Đặt SAU bước lấy `me` (đã có `me.id`), TRƯỚC query `queryOne` lấy
`password_hash`. Không đổi response thành công.

### 1b. Dependabot theo dõi GitHub Actions

`.github/dependabot.yml` — thêm entry thứ 2:

```yaml
- package-ecosystem: "github-actions"
  directory: /
  schedule:
    interval: weekly
  open-pull-requests-limit: 5
```

### 1c. Validate secret lúc boot (fail-fast)

`lib/env.ts` — thêm `.refine()` vào `serverSchema` (hoặc `superRefine` nếu cần nhiều
điều kiện) cho `XBOSS_SECRET`: khi `NODE_ENV === "production"` VÀ có giá trị, bắt buộc
độ dài ≥ 32 ký tự (secret yếu là lỗi cấu hình thật, nên fail-fast giống các bắt buộc
khác trong file — không đổi bất biến "XBOSS_SECRET optional ở schema, bắt buộc do
`lib/auth` giữ" đã ghi trong comment đầu file, chỉ thêm điều kiện độ dài KHI đã có giá
trị). Tương tự cho `CRON_SECRET` nếu có giá trị: độ dài ≥ 16 ký tự. Viết thông báo lỗi
tiếng Việt rõ ràng ("XBOSS_SECRET quá ngắn, cần tối thiểu 32 ký tự production").
Test: thêm ca trong `tests/env.test.ts` nếu file đã tồn tại (grep trước khi tạo file
mới) — secret ngắn ở production → throw; secret ngắn ở development → không throw (giữ
đúng bất biến "dev không bắt buộc").

### Tiêu chí chấp nhận V1

- [ ] 3 thay đổi trên, không đụng file nào khác.
- [ ] `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] Cập nhật `PROGRESS.md` mục "Đã xong".

---

## V2 — Idempotency ảnh (`task_photos`)

- `route: standard`
- Nhánh: `claude/feat-photos-idempotency`
- Bối cảnh: `offlineQueue/index.ts` đã có `enqueuePhoto`/`sendOp` (kind `photo`, từ M58
  PR2) gửi `POST /api/tasks/:id/photos` nhưng route đích **chưa có cơ chế chống trùng**
  — khác vật tư đã có (`migrations/0072_material_tx_idempotency.sql`). Việc này CHỈ vá
  server-side idempotency, KHÔNG wire UI offline cho ảnh (đó là M58 PR3, việc riêng
  trong `docs/nang-cap/M58-qr-offline-hien-truong.md`, không thuộc đợt này).

### Migration mới

File `migrations/00NN_task_photos_hash.sql` (số `NN` xác nhận qua
`ls migrations | sort -V | tail -3` **ngay trước khi commit** — KHÔNG dùng `0073` cố
định vì PR #270 có thể đã chiếm):

```sql
ALTER TABLE task_photos ADD COLUMN IF NOT EXISTS sha256 TEXT;
CREATE INDEX IF NOT EXISTS idx_task_photos_task_hash
  ON task_photos(task_id, sha256) WHERE sha256 IS NOT NULL;
```

Chạy `npm run gen:erd` sau khi thêm.

### Route `app/api/tasks/[id]/photos/route.ts` (POST)

Sau đoạn `verifyFileMime(fileBuf, file.type)` (buffer `fileBuf` đã có sẵn trong file),
tính `const hash = sha256Hex(fileBuf)` — nếu `sha256Hex` chưa tồn tại trong `lib/photos.ts`,
thêm hàm thuần `export function sha256Hex(buf: Buffer): string` dùng
`crypto.createHash("sha256").update(buf).digest("hex")` (import `node:crypto`). Trước
khi `writeFile`+`insertId`, query:

```sql
SELECT id, caption, size_bytes AS "sizeBytes"
  FROM task_photos
 WHERE task_id = ? AND sha256 = ? AND created_at > now() - interval '24 hours'
 ORDER BY id DESC LIMIT 1
```

Có kết quả → **không ghi file, không insert dòng mới**, trả
`NextResponse.json({ id: existing.id, taskId, caption: existing.caption, sizeBytes: existing.sizeBytes, deduped: true }, { status: 200 })`.
Không có kết quả → giữ nguyên luồng cũ, thêm cột `sha256` (giá trị `hash`) vào câu
`INSERT INTO task_photos`.

### Test

`tests/task-photos-dedupe.test.ts` (mới, import `tests/setup.ts` đầu tiên): POST cùng
buffer ảnh 2 lần liên tiếp cùng task → lần 2 trả `200` + cùng `id`, `COUNT(*)` bảng
`task_photos` không tăng; POST buffer khác hoặc task khác → tạo dòng mới bình thường
(không dedupe chéo task).

### Tiêu chí chấp nhận V2

- [ ] Migration thêm thuần tuý (`ADD COLUMN`/`CREATE INDEX`), `gen:erd` cập nhật.
- [ ] POST ảnh trùng hash cùng task trong 24h → 200 + không nhân đôi dòng DB.
- [ ] `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] Cập nhật `PROGRESS.md`.

---

## V3 — Xử lý lỗi UI: trang tracking + error boundary theo segment

- `route: standard`
- Nhánh: `claude/fix-error-handling-ui`

### 3a. Lỗi mạng bị nuốt ở trang tracking

`app/tracking/[sheet]/useTrackingData.ts`, hàm `load()` (dòng ~21-31): thêm state mới
`const [loadError, setLoadError] = useState(false)`. Trong `.catch()` của `load()`:
set `loadError = true` (giữ nguyên comment cũ, không xoá `data` đang có nếu là lần
refresh — chỉ hiển thị lỗi khi **lần đầu load `data === null`**). Trong `.then()` khi
thành công: `setLoadError(false)`. Export `loadError` trong return object của hook.

`app/tracking/[sheet]/page.tsx` (dòng ~258, ngay sau `if (loading) return <PageSkeleton />;`):
thêm `if (loadError && !data) return <ErrorState message="Không tải được dữ liệu — kiểm tra kết nối mạng" onRetry={load} />;`
— nếu component `ErrorState` chưa tồn tại trong `app/components/`, tạo mới (đơn giản:
icon `WifiOff` từ `lucide-react`, thông điệp, nút "Thử lại" gọi `onRetry`) theo đúng
style Tailwind zinc dark-first đã dùng trong file (không hardcode hex, không `dark:`).
Nếu trang đã có `data` cũ (refresh lỗi, không phải lần đầu) → **giữ nguyên hành vi cũ**
(hiện dữ liệu cũ, không chèn error state đè lên) — chỉ chặn màn hình khi thật sự
`data === null`.

### 3b. Error boundary theo route segment

Thêm `app/error.tsx` (mới, `'use client'`) bọc trong `<body>` (khác `global-error.tsx`
đã có — file đó thay cả root layout khi lỗi ở tầng cao nhất, `app/error.tsx` bắt lỗi ở
tầng con mà vẫn giữ được `AppHeader`/sidebar nếu lỗi nằm trong page cụ thể). Props
`{ error, reset }`. Gọi `Sentry.captureException(error)` trong `useEffect` (cùng pattern
`global-error.tsx`). UI: thông điệp tiếng Việt "Trang này gặp sự cố", nút "Thử lại"
(`reset()`) + nút "Về Dashboard" (`<Link href="/">`). Không cần thêm error.tsx riêng cho
từng segment con (`tracking/[sheet]/error.tsx`...) trong đợt này — `app/error.tsx` ở gốc
đã đủ để không phá toàn bộ layout, ngoại trừ AppHeader (chỉ có nếu nằm trong
`app/(authed)/layout.tsx` hay tương đương — kiểm cấu trúc thư mục thật trước khi quyết
định `app/error.tsx` có kế thừa được header/sidebar hay không; nếu layout hiện tại không
tách nhóm route `(authed)`, `app/error.tsx` ở gốc sẽ mất luôn header/sidebar giống
`global-error.tsx` — nếu vậy, GHI RÕ NỢ trong `PROGRESS.md` thay vì tự tái cấu trúc
layout ngoài phạm vi việc này).

### Test + tiêu chí V3

- Verify tay: tắt mạng trước khi mở `/tracking/<sheet>` lần đầu (DevTools offline) →
  thấy `ErrorState` + nút Thử lại hoạt động; mở lại có mạng bình thường không bị ảnh
  hưởng; ném lỗi giả (throw trong 1 component con tạm thời) → `app/error.tsx` bắt được,
  không crash trắng trang.
- `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] Cập nhật `PROGRESS.md`, ghi rõ nợ nếu `app/error.tsx` không giữ được header/sidebar.

---

## V4 — An toàn CI/CD: health-check deploy + gate CI thật

- `route: standard`
- Nhánh: `claude/chore-deploy-safety`

### 4a. Health-check + rollback trong `deploy.sh`

Sau bước `7/7 pm2 reload` (trước dòng `rm -rf "$OLD_DIR"` hiện tại là dòng cuối cùng),
thêm bước kiểm tra sức khoẻ: đọc cổng app từ `.env.local`/`.env.staging` đang dùng (biến
`PORT`, mặc định `3000` nếu không có — kiểm file env thật để biết tên biến đúng, đừng
đoán) hoặc dùng URL cục bộ `http://localhost:$PORT/api/health`. Retry tối đa 5 lần, mỗi
lần cách 3 giây (`curl -sf ... || sleep 3`). Thành công (`curl` exit 0) → xoá `OLD_DIR`
như cũ, in "Deploy hoàn tất". Thất bại sau 5 lần → **rollback**: `mv "$OLD_DIR" .next`
(khôi phục bản cũ), `pm2 reload "$PM2_NAME" --update-env`, in lỗi rõ ràng "Health-check
thất bại — đã rollback về bản trước", `exit 1` (script vốn đã `set -e`, nhưng bước
health-check dùng `curl` cần tự bắt lỗi bằng vòng lặp, không để `set -e` dừng giữa
chừng vòng retry). Không đổi hành vi khi health-check pass (giữ nguyên các bước 1-7 y
hệt).

### 4b. `deploy.yml` gate theo CI xanh thật

Đổi trigger từ `on: push: branches: [main]` sang
`on: workflow_run: workflows: ["CI"], types: [completed]`, thêm điều kiện job:

```yaml
jobs:
  deploy:
    if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main'
    runs-on: ubuntu-latest
```

Sửa lại comment đầu file (hiện đang giải thích lý do KHÔNG chờ CI — comment này sẽ sai
sau khi đổi, viết lại ngắn gọn: "Deploy khi workflow CI trên main hoàn tất VÀ pass —
loại bỏ phụ thuộc ngầm vào branch-protection setting ngoài repo, khớp đúng comment đã
ghi sẵn trong `ci.yml` dòng ~85 nhắc `workflow_run` nhưng trước đây chưa áp dụng thật").
Giữ nguyên khối `concurrency`/`permissions: {}`.

### Tiêu chí chấp nhận V4

- [ ] `deploy.sh` có health-check + rollback, không đổi hành vi khi thành công.
- [ ] `deploy.yml` dùng `workflow_run` đúng điều kiện `success` + đúng `head_branch`.
- [ ] Không cần chạy CI thật để verify (không có VPS trong môi trường code) — verify bằng
      đọc kỹ logic bash (dry-run cú pháp `bash -n deploy.sh`) + `actionlint`/YAML lint
      nếu có sẵn trong repo (kiểm `package.json`/CI xem có action lint yaml không, nếu
      không có thì bỏ qua bước này, không tự cài mới).
- [ ] Cập nhật `PROGRESS.md`, `DEPLOY.md` (mục mô tả hành vi deploy) nếu có đoạn mô tả cũ
      cần sửa theo hành vi mới.

---

## V5 — Session revocation (thu hồi phiên chủ động)

- `route: complex` — vùng rủi ro cao (`lib/auth.ts`/`lib/session-token.ts`), có điểm
  phải tự quyết trong ranh giới nêu dưới (KHÔNG phải tự do thiết kế lại auth).
- Nhánh: `claude/feat-session-revocation`
- **Dispatch sau cùng trong nhóm password route** — base trên `main` mới nhất sau khi
  V1 + V6 đã merge (xem cảnh báo xung đột đầu file).

### Ranh giới quyết định được phép

- Cách đặt tên cột/tham số có thể điều chỉnh cho khớp convention thật của file (không
  bắt buộc đúng y tên dưới đây nếu code hiện có convention khác), miễn giữ đúng ngữ
  nghĩa: mỗi user có 1 bộ đếm phiên, tăng bộ đếm = mọi token cũ phát hành trước đó hết
  hiệu lực ngay lần request kế tiếp.
- Được tự quyết vị trí thêm bước so sánh `session_version` trong `getCurrentUser()` (đọc
  cùng query hiện có lấy role hay thêm query riêng) — ưu tiên **không** thêm round-trip
  DB mới nếu `getCurrentUser()` đã query bảng `users` sẵn cho mỗi request.

### Migration mới

File `migrations/00NN_session_version.sql` (số xác nhận lại trước khi commit, PHẢI SAU
số đã dùng bởi V2 nếu V2 đã merge — chạy `ls migrations | sort -V | tail -3`):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0;
```

### `lib/session-token.ts`

Token hiện tại 5 phần `userId.exp.pwFrag.flag.mac` (từ M56 PR2). Đổi sang 6 phần
`userId.exp.pwFrag.flag.sv.mac` — `sv` = `session_version` tại thời điểm phát token.
`makeToken(userId, passwordHash, mustSetup2fa, sessionVersion)` — **tham số thứ 4 bắt
buộc** (đúng convention đã lập ở M56: không optional, để không sót call-site — dùng
`grep -rn "makeToken(" app/ lib/` để tìm đủ mọi call-site trước khi sửa chữ ký).
`parseToken` trả thêm field `sessionVersion: number` trong object kết quả. Token cũ
(5 phần, phát hành trước đợt này) → `parseToken` coi là không hợp lệ (đổi format là
breaking thay đổi có chủ đích, đúng tiền lệ M56 PR2 khi thêm cờ `mustSetup2fa` — mọi
người dùng bị đăng xuất 1 lần sau khi deploy, chấp nhận được, ghi rõ trong
`PROGRESS.md`).

### `lib/auth.ts::getCurrentUser()`

Sau khi parse token hợp lệ (chữ ký đúng, chưa hết hạn), đối chiếu `sessionVersion` trong
token với `session_version` hiện tại của user trong DB (đọc từ query đã có sẵn cho
user đó, hoặc thêm cột vào `SELECT` hiện có nếu đang query `users`) — không khớp → coi
như chưa đăng nhập (trả `null`, giống các nhánh invalid khác trong hàm này).

### 4 call-site `makeToken` — cập nhật đủ cả 4 (đối chiếu M56 PR2 đã liệt kê đúng 4 chỗ)

`login`, `login/2fa`, `password` (V1 rate-limit + V6 CSRF nếu đã merge trước đó — đọc
lại file thật trước khi sửa, không giả định thứ tự merge), `oidc/callback`, `totp/confirm`
— mỗi chỗ đọc `session_version` từ query `users` đã có sẵn trong hàm đó (hầu hết đã
`SELECT` từ bảng `users` để lấy password_hash/role/totp — thêm `session_version` vào
`SELECT`, không thêm query riêng nếu tránh được).

### API mới: thu hồi phiên

`app/api/users/[id]/revoke-sessions/route.ts` (mới) — `POST`, quyền `CAN.manageUsers`
(Admin, đúng quyền quản lý user hiện có, KHÔNG tạo perm key mới). `getCurrentUser()` → 401. Check quyền → 403. `UPDATE users SET session_version = session_version + 1 WHERE id = ?`.
Trả `{ ok: true }`. **Không tự revoke chính session admin đang gọi nếu `id === me.id`**
— nếu admin tự thu hồi phiên chính mình, request tiếp theo (kể cả response hiện tại)
vẫn nên thành công bình thường (không cần đặc biệt chặn, chỉ cần accept rằng admin sẽ
bị đăng xuất ở request KẾ TIẾP — hành vi đúng, không phải bug, không cần code thêm gì
đặc biệt cho ca này).

### UI

Trang quản lý user hiện có (tìm `app/admin/users` hoặc tương đương qua
`grep -rl "manageUsers" app/`) — thêm nút "Thu hồi phiên đăng nhập" cạnh nút đổi mật
khẩu đã có (nếu có), gọi API trên, `confirm()` trước khi gửi (hành động có tác động —
đăng xuất user khỏi mọi thiết bị), toast kết quả.

### Test + tiêu chí V5

- Mở rộng test auth hiện có (tìm file test đụng `getCurrentUser`/`makeToken`, vd
  `tests/auth.test.ts`/`tests/totp.test.ts` — grep trước khi tạo file mới): token với
  `sessionVersion` cũ (sau khi tăng `session_version` trong DB) → `getCurrentUser()` trả
  `null`; token với `sessionVersion` khớp → hợp lệ như cũ; `POST /revoke-sessions` tăng
  đúng cột, chỉ Admin gọi được (403 cho role khác qua test tích hợp DB thật).
- `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- Verify tay: đăng nhập 2 tab (hoặc 2 trình duyệt), gọi thu hồi phiên từ tab Admin khác
  → tab đã đăng nhập trước đó bị 401 ở request kế tiếp, phải đăng nhập lại.

### Tiêu chí chấp nhận V5

- [ ] Migration thêm thuần tuý.
- [ ] 5 call-site `makeToken` đều cập nhật đủ tham số mới (grep xác nhận không sót).
- [ ] Token cũ (5 phần) bị coi là không hợp lệ sau deploy — ghi rõ vào `PROGRESS.md`.
- [ ] `POST /api/users/:id/revoke-sessions` chỉ Admin gọi được, tăng đúng session_version.
- [ ] `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] `reviewer` soát kỹ (vùng rủi ro cao) TRƯỚC khi merge, không tự merge khi reviewer
      còn phát hiện chưa xử lý.

---

## V6 — CSRF phòng thủ theo chiều sâu (same-origin check)

- `route: standard`
- Nhánh: `claude/feat-csrf-same-origin`
- **Dispatch sau V1, trước V5** (xem cảnh báo xung đột đầu file).

### `lib/csrf.ts` (mới)

```ts
import type { NextRequest } from "next/server";

// Same-origin check bổ sung cho sameSite:"lax" — chặn thêm 1 lớp cho route mutating
// nhạy cảm nhất. Origin header vắng mặt (một số client cũ/tool nội bộ) → cho qua, dựa
// vào sameSite làm lớp chính; Origin có mặt nhưng khác host hiện tại → chặn.
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
```

### Áp dụng vào 4 route nhạy cảm nhất (không mở rộng toàn bộ ~335 route — phạm vi đúng

đặc tả "route mutating nhạy cảm nhất")

Ngay đầu mỗi handler, SAU `getCurrentUser()` (401 trước, same-origin check sau — không
lộ thông tin xác thực trước khi check nguồn gốc request):

```ts
if (!isSameOrigin(req))
  return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
```

- `app/api/auth/password/route.ts` (PATCH)
- `app/api/users/[id]/route.ts` (DELETE — tìm đúng method, nếu route xoá user nằm ở
  path khác thì áp đúng chỗ đó)
- `app/api/tasks/[id]/approve/route.ts` (POST, DELETE)
- `app/api/approvals/route.ts` (POST)

### Test + tiêu chí V6

- Test tích hợp mới hoặc mở rộng file test route sẵn có: gọi handler với header `origin`
  giả mạo khác host → 403; không có header `origin` → qua bình thường (như request cùng
  origin thật từ browser đôi khi không gửi); `origin` đúng host → qua bình thường.
- `npm run lint`/`typecheck`/`build` xanh, `npm test` xanh toàn bộ.
- [ ] Cập nhật `PROGRESS.md`.

---

## V7 — Mở rộng axe coverage (22 trang còn thiếu)

- `route: mechanical` — bám khuôn `e2e/authed/*.spec.ts` đã có sẵn rất nhiều, chỉ lặp
  lại đúng mẫu cho trang mới, không cần quyết định kiến trúc.
- Nhánh: `claude/test-axe-coverage-expand`

### Việc cần làm

Với MỖI trang trong danh sách dưới, viết `e2e/authed/<ten-trang>.spec.ts` theo đúng
khuôn đã có (mở 1 file bất kỳ trong `e2e/authed/` làm mẫu — `goto` → chờ nội dung chính
render → `new AxeBuilder({ page }).withTags([...]).analyze()` → assert không có vi phạm
`serious`/`critical`, chạy cả desktop + mobile theo cấu hình `playwright.config.ts` đã
tách project sẵn — không cần sửa config):

`/offline`, `/account`, `/password`, `/order`, `/reports`, `/scurve`, `/schedule-control`,
`/progress/[system]` (dùng 1 system id thật có trong seed test), `/hub/[id]` (dùng 1 id
thật có trong seed test), `/r/[kind]/[id]` (test redirect — nếu axe không áp dụng được
do trang chỉ redirect, GHI CHÚ trong file test lý do bỏ qua thay vì ép viết ca vô nghĩa),
`/materials/order-form`, `/materials/suppliers`, `/payments/print`,
`/admin/integrations` (đã có test click theo audit — bổ sung **assertion axe** vào đúng
test đó, không tạo file trùng).

Nếu trang cần dữ liệu seed chưa có trong `e2e/global-setup.ts` (vd `/progress/[system]`,
`/hub/[id]` cần id thật), kiểm fixture hiện có trước — nếu thiếu, thêm tối thiểu 1 dòng
seed cần thiết vào `global-setup.ts` theo đúng pattern đang dùng (không viết fixture
riêng cho từng trang).

### Tiêu chí chấp nhận V7

- [ ] Đủ 14 trang trong danh sách có spec axe (hoặc ghi chú rõ lý do bỏ qua cho `/r/[kind]/[id]`
      nếu không áp dụng được).
- [ ] `npm run test:e2e` xanh toàn bộ (không chỉ file mới — không phá spec cũ).
- [ ] Cập nhật `PROGRESS.md`.

---

## V8 — `test:coverage` script + ratchet ghi mốc

- `route: standard`
- Nhánh: `claude/chore-test-coverage-gate`
- Theo đúng hướng dẫn đã có sẵn trong `docs/audit.md` §6 (chưa làm, giờ đóng lại).

### Việc cần làm

Thêm script vào `package.json`:

```json
"test:coverage": "node --experimental-test-coverage scripts/run-tests.mjs"
```

Chạy thử, đọc kết quả `stmts/branches/funcs/lines` cho phạm vi `lib/**` + `app/api/**`
(coverage built-in Node 22 báo theo file — nếu công cụ không tự lọc theo thư mục, viết
thêm bước lọc output trong `scripts/run-tests.mjs` hoặc 1 script nhỏ mới
`scripts/coverage-summary.mjs` tổng hợp đúng 2 phạm vi này, bỏ qua file UI/test). **Đây
là bước đo/ghi mốc, KHÔNG phải cổng CI cứng** (đúng đặc tả `docs/audit.md` §6 — "nếu
muốn chốt thành cổng CI thì mở thay đổi riêng"). Ghi số đo được vào `PROGRESS.md` mục
mới "Coverage cơ sở (lib/**, app/api/**)" kèm ngày đo — đây là mốc **ratchet đầu tiên**
để các đợt sau đối chiếu "không tệ hơn lần trước".

### Tiêu chí chấp nhận V8

- [ ] `npm run test:coverage` chạy được, in ra số liệu 4 chỉ số.
- [ ] Mốc đo đầu tiên ghi vào `PROGRESS.md`.
- [ ] Không thêm gate CI cứng trong việc này (ngoài phạm vi, để đợt sau nếu cần).
- [ ] `npm run lint`/`typecheck`/`build` xanh.

---

## V9 — CHANGELOG.md tự sinh từ conventional commits

- `route: mechanical`
- Nhánh: `claude/chore-changelog-gen`

### Việc cần làm

`CHANGELOG.md` hiện chỉ có `[Unreleased]` rỗng + `[0.1.0]`, lệch xa `package.json`
đang ở `0.3.0`. Thêm script `scripts/gen-changelog.mjs` (mới, dùng `tsx` hoặc Node
thuần — không thêm dependency mới nếu tránh được, `git log` đủ dữ liệu): đọc
`git log --oneline` theo conventional prefix (`feat:`, `fix:`, `chore:`, `docs:`...)
kể từ tag/commit mốc gần nhất, nhóm theo loại, in ra block Markdown theo đúng format
Keep a Changelog đã có trong file (đối chiếu 2 mục cũ làm mẫu). Thêm npm script
`"changelog": "tsx scripts/gen-changelog.mjs"` vào `package.json`.

Chạy thử script để **backfill 1 lần** mục `[0.2.0]`/`[0.3.0]` (dựa `git log` thật giữa
các mốc version bump trong lịch sử — tìm commit đổi `package.json` `version` field làm
mốc chia) — điền vào `CHANGELOG.md`, giữ mục `[Unreleased]` rỗng ở đầu cho lần release
kế tiếp. Không cần tự động hoá chạy trong CI/release flow (ngoài phạm vi, chỉ cần công
cụ sẵn sàng dùng tay mỗi lần release).

### Tiêu chí chấp nhận V9

- [ ] `CHANGELOG.md` có mục `[0.2.0]` và `[0.3.0]` (hoặc gộp hợp lý nếu ranh giới version
      trong git log không rõ — ghi chú cách chia trong `PROGRESS.md`).
- [ ] Script `npm run changelog` chạy được không lỗi.
- [ ] `npm run lint`/`typecheck` xanh (script mới phải qua TS nếu dùng `.ts`, hoặc thuần
      `.mjs` không cần typecheck).

---

## Loại khỏi đợt này — cần quyết định thêm, không tự chế đặc tả

**Chuẩn hoá data-fetching (`useApiResource`/SWR/TanStack Query)** — audit phát hiện mỗi
trang tự viết `fetch`+`useState` lặp lại, dễ lệch xử lý lỗi (đúng nguyên nhân gốc của
V3a). Đây là quyết định kiến trúc ảnh hưởng nhiều trang, KHÔNG có đặc tả kín (chưa chọn
thư viện, chưa chốt phạm vi — toàn bộ app hay chỉ trang mới). Theo luật cứng
`CLAUDE.md`, việc này cần hỏi người dùng chốt trước khi lập kế hoạch riêng — KHÔNG đưa
vào đợt này để tránh việc worker tự quyết kiến trúc thay người dùng. **Đề xuất khi hỏi
lại**: SWR (nhẹ, phù hợp pattern fetch hiện có) vs tự viết 1 hook `useApiResource` dùng
nội bộ (không thêm dependency) — và phạm vi: chỉ trang mới từ nay hay refactor dần các
trang hiện có.

Storybook/visual regression testing (nhắc trong audit UI/UX) — cùng lý do, chưa có
quyết định công cụ + chi phí duy trì, để backlog.

---

## Điều phối

- 9 việc, dispatch theo 2 lô để tránh xung đột file (xem cảnh báo đầu file):
  - **Lô 1 (song song)**: V1, V2, V3, V4, V7, V8, V9 (7 worktree độc lập).
  - **Lô 2 (tuần tự, sau khi V1 merge)**: V6 (base `main` mới) → merge → V5 (base `main`
    mới nhất, dispatch sau cùng vì rủi ro cao nhất).
- Trước khi merge V2 hoặc V5 (2 việc có migration): chạy `ls migrations | sort -V | tail -3`
  lấy số thật, không tin số ghi trong kế hoạch này.
- `reviewer` soát diff MỌI việc trước khi merge; **V5 bắt buộc reviewer xác nhận đạt**
  trước khi merge (vùng rủi ro cao `docs/audit.md` §8) — không tự merge nếu còn phát
  hiện chưa xử lý.
- Sau khi cả 9 việc merge: cập nhật `PROGRESS.md` 1 mục tổng "Đợt nâng cấp chuyên nghiệp
  hoá (audit 2026-07-19)" liệt kê đủ 9 việc + số PR + kết quả reviewer, và dọn nợ đã ghi
  (nếu `app/error.tsx` không giữ được header ở V3, ghi rõ).
- Báo cáo tổng hợp về phiên chính: kết quả từng việc, PR nào cần phiên chính tự soát kỹ
  hơn (đặc biệt V5), việc nào worker báo vướng đặc tả (dừng lại, không tự chế) để phiên
  chính xử lý.
