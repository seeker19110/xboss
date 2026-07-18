# M49 — API mở, webhook ra ngoài & SSO OIDC (P3)

> **Mục tiêu**: biến XBoss thành điểm tích hợp được: bên thứ ba đọc dữ liệu qua API key,
> nhận sự kiện qua webhook có ký HMAC; doanh nghiệp đăng nhập bằng tài khoản công ty
> (Google Workspace / Microsoft Entra) và đồng bộ vai trò. Nâng trục Tích hợp lên ~4.0
> (cùng M48).
>
> **Bản viết lại 2026-07-16** (thay toàn bộ bản gốc): đã đối chiếu từng điểm chạm với
> code thật sau M43–M48 + chốt với người dùng dùng **`openid-client`** cho SSO (xem PR3).
> Khi file này và code lệch nhau về tên hàm/số dòng, code thắng — nhưng **hành vi đặc tả
> ở đây là chuẩn nghiệm thu**.

## Quyết định đã chốt & hiện trạng phụ thuộc

| Quyết định        | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thư viện SSO      | **`openid-client` v6** (người dùng chốt 2026-07-16). Lý do: client OIDC được OpenID Foundation certify, lo trọn discovery/PKCE/token/verify `id_token` (các "góc chết" `aud`/`azp`/`max_age`/chuẩn hoá lỗi OAuth); cùng tác giả và xây trên `jose`; chỉ là thư viện client — **không đụng hệ session `xboss_session` hiện có**. Không dùng `next-auth` (đòi sở hữu session, xung đột `lib/auth.ts`). Không cần ADR riêng — mục này là bản ghi quyết định. |
| Số migration      | Bản gốc ghi 0054 — đã bị chiếm. Hiện mới nhất là `0057_integrations.sql`; **0058 đã dành cho M50 PR1** (`PLAN.md`). Số trong file này (**0059/0060/0061**) là **tạm** — kiểm lại `ls migrations/                                                                                                                                                                                                                                                          | sort` lúc code (bài học M32/M33). |
| Phụ thuộc đã xong | M43 (bảng `audit_log` + trigger `audit_row_change()` + request context), M46 (`lib/approvals.ts::advanceApproval` — **flow đang dormant**, đường duyệt legacy vẫn là đường sống), M48 PR1 (trang `app/admin/integrations/page.tsx` — UI của PR1/PR2 gắn vào đây).                                                                                                                                                                                         |
| Thứ tự PR         | PR1 → PR2 → PR3 (PR2 tái dùng helper rate-limit generic viết ở PR1; PR3 độc lập về code nhưng đi sau cùng vì đụng luồng đăng nhập).                                                                                                                                                                                                                                                                                                                       |

---

## PR1 — API keys (đọc-only) + namespace `/api/v1`

### Migration `0059_api_keys.sql` (số tạm)

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,        -- sha256 hex của key thô; key thô chỉ hiện 1 lần lúc tạo
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = key toàn cục (mọi dự án)
  scopes TEXT[] NOT NULL DEFAULT '{read}',                   -- 'read' | 'read_finance'
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
-- Gắn audit trigger M43 (copy đúng khối DO $$ cuối migrations/0053_approvals.sql,
-- mảng bảng = ARRAY['api_keys']) — tạo/thu hồi key là thao tác nhạy cảm phải vào audit_log.
```

Thêm thuần (CREATE TABLE/TRIGGER) → đi thẳng production. Chạy `npm run gen:erd` cùng PR.

### THAY ĐỔI FILE CÓ SẴN — `lib/ratelimit.ts`: thêm helper generic

Hiện tại file chuyên cho login (hằng `WINDOW_MINUTES=15`, `MAX_PER_KEY=5` cứng, hàm
`bump()` private dùng bảng `login_rate_limits`). **Không đổi hành vi login.** Thêm:

```ts
// Rate limit generic tái dùng bảng login_rate_limits + pattern upsert atomic sẵn có.
// Trả về true nếu ĐÃ VƯỢT giới hạn (caller trả 429), false nếu còn quota (đã đếm +1).
export async function hitRateLimit(
  key: string, // vd `api:${keyId}` (PR1), `oidc:${ip}` (PR3)
  max: number, // số lần tối đa trong cửa sổ
  windowMinutes: number,
): Promise<boolean>;
```

Cài đặt: 1 câu `INSERT ... ON CONFLICT (key) DO UPDATE` y hệt `bump()` hiện có nhưng
nhận `windowMinutes` làm tham số và `RETURNING count` — so `count > max` ngay trong 1
round-trip (khác login: đếm-trước-chặn-sau là đủ cho API, không cần hàm check riêng).
Refactor `bump()` hiện tại gọi qua helper mới (giữ nguyên hằng số login, diff nhỏ);
test login rate-limit hiện có phải pass nguyên trạng.

### `lib/api-keys.ts` (file mới)

```ts
export function generateApiKey(): string; // `xbk_` + randomBytes(32).toString('hex')
export function hashApiKey(raw: string): string; // sha256 hex (node:crypto createHash)
export type ApiKeyAuth = { keyId: number; projectId: number | null; scopes: string[] };
// Đọc header `Authorization: Bearer xbk_...` → tra key_hash, check revoked_at IS NULL.
// Trả null khi sai/thiếu/revoked (route trả 401). So khớp bằng lookup UNIQUE key_hash
// (input đã qua sha256 — không cần constant-time so chuỗi).
// Cập nhật last_used_at có throttle: chỉ UPDATE khi last_used_at IS NULL hoặc cách
// hiện tại > 60s (WHERE kèm điều kiện, tránh ghi mỗi request).
export async function verifyApiKey(authHeader: string | null): Promise<ApiKeyAuth | null>;
// Gói dùng chung cho mọi route v1: verify → 401; check scope → 403; rate limit
// `api:${keyId}` 120 req/phút qua hitRateLimit → 429 + Retry-After; suy projectId
// hiệu lực (key.project_id ?? Number(searchParams.get('project')) — key toàn cục
// thiếu ?project= → 422). Trả Response lỗi hoặc ngữ cảnh hợp lệ.
export async function requireApiKey(
  req: NextRequest,
  scope: "read" | "read_finance",
): Promise<{ auth: ApiKeyAuth; projectId: number } | Response>;
```

### Namespace `app/api/v1/` — 5 route đọc-only, JSON ổn định

**KHÔNG mở 284 route hiện có** — v1 là contract riêng, shape không đổi theo UI. Mọi
route: `export const dynamic = "force-dynamic"`, auth bằng `requireApiKey` (KHÔNG
`getCurrentUser` — API key không có session), scope mặc định `read`:

| Route                                           | Nội dung trả (camelCase, phân trang `?page=` 100 dòng/trang, kèm `total`)                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/tasks?sheet=&floor=&status=&page=` | id, code, boqCode, name, floor, status, progress, startDate, endDate, packageId — JOIN `work_packages → sheet_types` lọc đúng `projectId` (qua `towers.project_id`, xem cách `app/api/tasks/route.ts` scope) |
| `GET /api/v1/packages?sheet=&page=`             | id, code, boqCode, name, floor, progress, status, sheetSlug                                                                                                                                                  |
| `GET /api/v1/materials?page=`                   | id, boqCode, name, unit, qtyBoq, qtyPlanned, qtyUsed, qtyStock, status                                                                                                                                       |
| `GET /api/v1/dashboard/kpi`                     | tổng hợp % theo hệ + đếm trạng thái — tái dùng query của `app/api/dashboard/route.ts` phần KPI (tách hàm dùng chung vào `lib/` nếu tiện, không copy-paste SQL dài)                                           |
| `GET /api/v1/payment-certs?page=`               | **scope `read_finance`** — id, code, contractId, periodNo, status, submittedAt, decidedAt (KHÔNG kèm số tiền chi tiết items ở v1)                                                                            |

Cột `DATE` trả nguyên chuỗi `YYYY-MM-DD` (đúng type parser của `lib/db`). Lỗi trả
`{ error: string }` tiếng Việt + status đúng nghĩa (401/403/422/429).

### API quản lý + UI

- `GET/POST /api/admin/api-keys`, `DELETE /api/admin/api-keys/:id` (revoke = set
  `revoked_at`, không xoá dòng — giữ audit): session admin (`CAN.manageIntegrations`
  — **tái dùng perm có sẵn từ M48 PR1**, không thêm perm mới; API keys thuộc nhóm
  tích hợp). POST trả `{ key: "xbk_..." }` đúng 1 lần kèm cảnh báo lưu lại; DB chỉ giữ
  hash.
- **THAY ĐỔI FILE CÓ SẴN — `app/admin/integrations/page.tsx`** (M48 PR1): thêm section
  "API keys" dưới bảng integrations: bảng (tên, dự án, scopes, tạo lúc, dùng lần cuối,
  trạng thái), nút "Tạo key" (modal: tên + dự án (select, để trống = toàn cục) + scope;
  sau tạo hiện key 1 lần trong ô copy được + cảnh báo), nút thu hồi (confirm qua
  `dialogs.tsx`, mẫu danger đặc). Section chỉ hiện cho `manageIntegrations` (admin).
- Tài liệu mới `docs/api-v1.md`: mô tả auth header, scope, phân trang, 5 endpoint +
  ví dụ `curl` — tiếng Việt.

### Test `tests/api-keys.test.ts` (integration, import `tests/setup.ts` đầu tiên)

(1) key đúng → 200; sai/revoked/thiếu header → 401. (2) key scope `read` gọi
`payment-certs` → 403; key `read_finance` → 200. (3) key dự án A không thấy dữ liệu dự
án B (dựng 2 dự án); key toàn cục thiếu `?project=` → 422. (4) gọi vượt 120 lần/phút →
429 kèm `Retry-After` (hạ `max` qua tham số `hitRateLimit` trong test cho nhanh — test
helper trực tiếp, route chỉ cần 1 ca xác nhận wire đúng). (5) `last_used_at` cập nhật
có throttle. Thêm file vào lệnh `npm test` trong `package.json`.

---

## PR2 — Webhook ra ngoài

### Migration `0064_webhooks.sql`

```sql
CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = mọi dự án
  url TEXT NOT NULL,
  secret TEXT NOT NULL,             -- HMAC-SHA256 ký payload. LỆCH QUY ƯỚC "secret qua env"
                                    -- CÓ CHỦ ĐÍCH: secret per-webhook do XBoss sinh, số lượng
                                    -- động theo cấu hình — không thể là biến môi trường.
  events TEXT[] NOT NULL,           -- whitelist EVENTS trong lib/webhooks.ts
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_id INT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
  ON webhook_deliveries(next_retry_at) WHERE status = 'pending';
-- Gắn audit trigger M43 cho bảng webhooks (cấu hình đẩy dữ liệu ra ngoài = nhạy cảm).
```

### `lib/webhooks.ts` (file mới)

```ts
export const WEBHOOK_EVENTS = [
  "task.approved",
  "variation.approved",
  "payment_cert.approved",
  "material.over_norm",
  "inspection.requested",
  "ping",
] as const;
// Fire-and-forget từ route nghiệp vụ: chỉ INSERT webhook_deliveries cho mọi webhook
// active có event khớp + (project_id IS NULL OR = projectId). KHÔNG gọi HTTP tại đây
// (không chặn request nghiệp vụ). Payload chuẩn: { event, sentAt, projectId, data }.
// Bọc try/catch nuốt lỗi + log.error — phát webhook hỏng không được làm hỏng nghiệp vụ.
export async function emitWebhook(
  event: (typeof WEBHOOK_EVENTS)[number],
  projectId: number | null,
  data: Record<string, unknown>,
): Promise<void>;
// Cron gọi: lấy tối đa 50 deliveries pending đến hạn (next_retry_at <= now, ORDER BY id,
// FOR UPDATE SKIP LOCKED — nhiều instance cron không giành nhau), gửi tuần tự từng cái.
export async function deliverDueWebhooks(): Promise<{ sent: number; failed: number }>;
```

Gửi 1 delivery: `fetch(url, { method: 'POST', body, headers, signal: AbortSignal.timeout(10_000) })`
— body = JSON.stringify(payload) đúng 1 lần, header `Content-Type: application/json`,
`X-Xboss-Event: <event>`, `X-Xboss-Delivery: <id>`,
`X-Xboss-Signature: sha256=<HMAC-SHA256 hex của body bằng webhooks.secret>`.
2xx → `status='ok'`; lỗi/timeout → `attempts+1`, `last_error`, backoff
`next_retry_at = now() + [5m, 30m, 2h, 2h, 2h][attempts-1]`; `attempts >= 5` →
`status='failed'` (dừng). Không follow redirect (`redirect: 'manual'`, 3xx tính là lỗi
— chống chuyển hướng về nội bộ).

**Chống SSRF khi tạo/sửa webhook (validate ở API quản lý, không phải lúc gửi):** `url`
bắt buộc `https://` (cho phép `http://` chỉ khi `NODE_ENV !== 'production'` để dev
test), hostname không phải IP private/loopback/link-local (parse bằng `new URL`, check
literal IP các dải 10./172.16-31./192.168./127./169.254./::1) — sai → 422 tiếng Việt.

### THAY ĐỔI FILE CÓ SẴN — điểm phát sự kiện (danh sách đóng, đã xác minh)

M46 flow đang **dormant** → phải phát ở cả nhánh legacy lẫn nhánh engine. Quy tắc
chung: **phát đúng tại chỗ trạng thái thực thể chuyển sang approved trong request đó**
(engine nhiều bước: duyệt bước giữa KHÔNG phát; `advanceApproval` trả kết quả — chỉ
phát khi kết quả cuối là approved):

| Sự kiện                 | File sửa                                     | Vị trí                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `task.approved`         | `app/api/tasks/[id]/approve/route.ts`        | sau khi set `nghiem_thu` thành công (cả nhánh legacy lẫn nhánh engine trong cùng route); `data` = {taskId, code, boqCode, name}                                                                                          |
| `task.approved`         | `app/api/approvals/route.ts` (duyệt lô)      | 1 emit/task duyệt thành công                                                                                                                                                                                             |
| `variation.approved`    | `app/api/variations/[id]/decide/route.ts`    | khi status chuyển `approved`/`partially_approved`; `data` = {voId, code, status}                                                                                                                                         |
| `payment_cert.approved` | `app/api/payment-certs/[id]/decide/route.ts` | khi status chuyển `approved`; `data` = {certId, code, contractId, periodNo}                                                                                                                                              |
| `material.over_norm`    | `app/api/notifications/route.ts`             | trong khối INSERT notification `material_over` (~dòng 249) — chỉ emit cho notification MỚI chèn (dedup sẵn có của notifications chính là dedup của webhook, không thêm cơ chế mới); `data` = {materialId, boqCode, name} |
| `inspection.requested`  | `app/api/inspection-requests/route.ts` POST  | sau tạo phiếu thành công; `data` = {requestId, taskId?}                                                                                                                                                                  |

`projectId` truyền vào `emitWebhook`: dùng đúng project của thực thể (đã có sẵn trong
từng route sau đợt vá scope PR #202–#209 — đọc biến sẵn có, không suy lại).

### Cron + API quản lý + UI

- `GET /api/cron/deliver-webhooks` (mới): auth y hệt `app/api/cron/sync-sheets/route.ts`
  (Bearer `CRON_SECRET` qua `checkCronSecret` HOẶC session Admin/PM) → gọi
  `deliverDueWebhooks()` trả `{sent, failed}`.
- **THAY ĐỔI FILE CÓ SẴN — `vercel.json`**: thêm `{ "path": "/api/cron/deliver-webhooks",
"schedule": "*/5 * * * *" }` vào mảng `crons`. **`DEPLOY.md`** mục cron: thêm dòng
  crontab mẫu tương ứng (self-host).
- `GET/POST /api/admin/webhooks`, `PATCH/DELETE /api/admin/webhooks/:id`,
  `POST /api/admin/webhooks/:id/test` (insert delivery event `ping` rồi gọi gửi ngay,
  trả kết quả) — đều `CAN.manageIntegrations`. GET kèm 10 deliveries gần nhất mỗi
  webhook (status/attempts/last_error/thời gian). **Secret chỉ trả 1 lần lúc POST tạo**
  (như API key); GET danh sách không bao giờ trả secret.
- **THAY ĐỔI FILE CÓ SẴN — `app/admin/integrations/page.tsx`**: thêm section "Webhook"
  (bảng URL/sự kiện/active/lần gửi gần nhất + badge màu kèm icon, nút test, CRUD modal
  — sự kiện chọn từ `WEBHOOK_EVENTS` bằng checkbox).
- **`public/sw.js`**: route mới đều dưới `/api/` GET network-first sẵn — không cần đổi;
  KHÔNG tăng version CACHE nếu không đổi logic cache.

### Test `tests/webhooks.test.ts` (integration)

(1) `emitWebhook` khớp event + project → tạo delivery pending; webhook inactive/khác
event/khác project → không. (2) `deliverDueWebhooks` với fetch mock (monkey-patch
`globalThis.fetch` trong test): 2xx → ok; 500 → attempts=1 + next_retry_at ≈ +5m; lần
4 vẫn lỗi → tiếp backoff; lần 5 → failed. (3) chữ ký: verify lại HMAC từ body mock
nhận được đúng bằng secret. (4) validate URL: http production/IP private → 422.
(5) emit trong route không throw khi bảng webhooks rỗng.

---

## PR3 — SSO OIDC bằng `openid-client`

### Nguyên tắc & phạm vi

- SSO là **cửa phụ**: callback thành công phát đúng cookie `xboss_session` qua
  `makeToken()` (`lib/auth.ts`) — **không có cơ chế phiên thứ hai**. Mật khẩu vẫn là
  fallback (admin thoát hiểm khi IdP hỏng).
- 1 IdP duy nhất cấu hình qua env (Google Workspace / Microsoft Entra đều là OIDC
  chuẩn). Thiếu env → nút SSO ẩn, mọi thứ như cũ (pattern VAPID/Google Sheets).
- Dependency mới: `npm i openid-client` (v6 — API function-based: `discovery`,
  `buildAuthorizationUrl`, `authorizationCodeGrant`, `randomState`/`randomNonce`/
  `randomPKCECodeVerifier`/`calculatePKCECodeChallenge`).

### THAY ĐỔI FILE CÓ SẴN — `lib/env.ts`

Thêm vào schema zod (mọi biến optional — fail-fast lúc DÙNG, không lúc build, đúng
pattern hiện có của file):

```
OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET,
OIDC_ROLE_CLAIM (tuỳ chọn — tên claim chứa role),
OIDC_DEFAULT_ROLE (tuỳ chọn — mặc định 'viewer', validate thuộc ROLES lib/roles.ts)
```

`APP_URL` **đã có sẵn** (optional) — OIDC dùng làm `redirect_uri` =
`${APP_URL}/api/auth/oidc/callback`. Quy tắc bật SSO: `ssoEnabled()` (trong
`lib/oidc.ts`) = đủ cả `OIDC_ISSUER + OIDC_CLIENT_ID + OIDC_CLIENT_SECRET + APP_URL`;
thiếu bất kỳ → coi như tắt (KHÔNG suy `redirect_uri` từ request origin — sau proxy dễ
sai, cấu hình tường minh).

### Migration `0061_sso_audit.sql` (số tạm)

Chỉ 1 việc: gắn audit trigger M43 cho bảng `users` (khối `DO $$` như 0053) — user tạo
qua SSO / đổi role từ claim tự vào `audit_log` (INSERT/UPDATE trên `users`), không cần
cơ chế audit riêng cho đăng nhập. Thêm thuần → đi thẳng production.

### `lib/oidc.ts` (file mới)

```ts
export function ssoEnabled(): boolean;
// Cache Configuration của openid-client ở module scope (discovery gọi 1 lần, gọi lại
// nếu lần trước lỗi). KHÔNG cache vĩnh viễn lỗi.
export async function getOidcConfig(): Promise<Configuration>;
// Thuần, test được: claims → quyết định user. KHÔNG chạm DB trong hàm này.
export function resolveSsoUser(claims: {
  email?: string; name?: string; [k: string]: unknown;
}): { email: string; name: string; roleFromClaim: Role | null } | { error: string };
//  - email thiếu/rỗng → error "IdP không trả email".
//  - email lowercase + trim.
//  - OIDC_ROLE_CLAIM đặt: đọc claims[claim] (string hoặc string[] — lấy phần tử đầu
//    khớp), map vào ROLES (lib/roles.ts); giá trị lạ → roleFromClaim = null (giữ role
//    cũ / dùng default) + caller log.warn.
// Chạm DB: tìm user theo email; có → UPDATE role nếu roleFromClaim khác null và khác
// role hiện tại (KHÔNG hạ cấp admin cuối cùng: nếu user là admin duy nhất còn lại và
// claim đòi hạ → giữ nguyên + log.warn — chống tự khoá hệ thống); chưa có → INSERT
// (name, email, role = roleFromClaim ?? OIDC_DEFAULT_ROLE ?? 'viewer',
//  password_hash = hashPassword(randomBytes(32).toString('hex'))).
// LƯU Ý ĐÃ XÁC MINH: users.password_hash là NOT NULL và token phiên nhúng pwFrag từ
// hash (lib/auth.ts:63) — hash ngẫu nhiên vừa thoả ràng buộc vừa để makeToken hoạt
// động; mật khẩu này không ai biết nên KHÔNG đăng nhập được bằng form (đúng chủ đích;
// admin có thể đặt lại mật khẩu cho user đó sau nếu cần fallback).
export async function upsertSsoUser(resolved: {...}): Promise<User>;
```

User mới **chưa gán dự án** (`user_projects` trống) — đăng nhập được, thấy trạng thái
"chưa được gán dự án" như user thường admin tạo mà chưa gán; admin gán sau. Không code
gì thêm cho trạng thái này (hành vi sẵn có).

### 2 route mới

**`GET /api/auth/oidc/login`** (`dynamic = "force-dynamic"`):

1. `!ssoEnabled()` → 404.
2. Sinh `state = randomState()`, `nonce = randomNonce()`,
   `verifier = randomPKCECodeVerifier()`, `challenge = await calculatePKCECodeChallenge(verifier)`.
3. Set cookie tạm `xboss_oidc` = JSON `{state, nonce, verifier}` — httpOnly,
   `sameSite: "lax"`, `secure` theo production, `path: "/api/auth/oidc"`, `maxAge: 600`.
   (Không cần ký: cookie httpOnly chỉ chủ trình duyệt sửa được và sửa chỉ tự hại phiên
   của chính họ — openid-client so khớp server-side.)
4. Redirect 302 tới `buildAuthorizationUrl(config, { redirect_uri, scope: "openid email profile",
state, nonce, code_challenge: challenge, code_challenge_method: "S256" })`.

**`GET /api/auth/oidc/callback`** (`dynamic = "force-dynamic"`):

1. `!ssoEnabled()` → 404. Đọc + XOÁ ngay cookie `xboss_oidc` (dùng 1 lần); thiếu →
   redirect `/login?error=oidc_expired`.
2. Rate limit lỗi: trước khi xử lý, `hitRateLimit("oidc:" + clientIp, 10, 15)` (helper
   PR1; `clientIp` copy hàm từ `app/api/auth/login/route.ts` — cân nhắc tách lên
   `lib/` dùng chung, sửa cả login route import theo) → vượt → redirect
   `/login?error=oidc_rate`. Chỉ ĐẾM khi callback KẾT THÚC lỗi (gọi ở các nhánh lỗi),
   không đếm lần thành công.
3. `tokens = await authorizationCodeGrant(config, new URL(req.url), { pkceCodeVerifier:
verifier, expectedState: state, expectedNonce: nonce })` — throw (state/nonce/chữ
   ký/aud sai, IdP trả error) → log.warn + redirect `/login?error=oidc_failed` (KHÔNG
   lộ chi tiết lỗi ra query — chi tiết chỉ vào log).
4. `claims = tokens.claims()` → `resolveSsoUser` → error → redirect
   `/login?error=oidc_noemail`. → `upsertSsoUser`.
5. Phát cookie phiên: `makeToken(user.id, user.password_hash)` + flags y hệt login
   route (`httpOnly, path:"/", maxAge: COOKIE_MAX_AGE, sameSite:"lax", secure` prod).
6. Redirect 302 về `/` cố định — **KHÔNG nhận `returnTo`/`redirect` từ query** (chống
   open-redirect).

### THAY ĐỔI FILE CÓ SẴN — trang login + cờ public

- `GET /api/auth/oidc/status` (mới, public như `/api/project`): trả
  `{ enabled: boolean }` — client không đọc được env.
- `app/login/page.tsx`: fetch status khi mount; `enabled` → hiện nút "Đăng nhập bằng
  SSO công ty" (link thường tới `/api/auth/oidc/login`, KHÔNG fetch — cần redirect
  trình duyệt) dưới form, phân cách "hoặc"; đọc `?error=oidc_*` từ URL → hiện thông
  điệp tiếng Việt tương ứng (bảng 4 mã lỗi trên). Form mật khẩu giữ nguyên.

### Test

- `tests/oidc.test.ts`: **unit thuần** cho `resolveSsoUser` (email thiếu/hoa-thường,
  role claim đúng/lạ/mảng, default role) — không cần mock IdP. **Integration** cho
  `upsertSsoUser` (tạo mới đủ ràng buộc NOT NULL + đăng nhập lại không tạo trùng +
  update role theo claim + KHÔNG hạ cấp admin cuối cùng).
- Flow HTTP với IdP thật không test tự động được trong CI — bù bằng: (a) test route
  `login`/`callback` khi `ssoEnabled()=false` → 404; (b) callback thiếu cookie →
  redirect đúng `error=oidc_expired`; (c) verify thủ công với 1 IdP thật trước khi
  merge (ghi kết quả vào PR description).

### Bảo mật (checklist nghiệm thu PR3)

- [ ] state + nonce + PKCE bắt buộc mọi lần (openid-client enforce — không tự tắt)
- [ ] Cookie `xboss_oidc` dùng 1 lần, xoá ngay đầu callback, maxAge 600
- [ ] Không open-redirect (đích cố định `/`), không lộ chi tiết lỗi IdP ra URL
- [ ] Rate limit callback lỗi theo IP (10/15 phút) qua bảng Postgres (đúng chuẩn
      multi-instance như login)
- [ ] User SSO mới không đăng nhập được bằng form (hash ngẫu nhiên), không leo quyền
      (role từ claim validate ROLES, giá trị lạ bị bỏ, admin cuối không bị hạ)
- [ ] `XBOSS_SECRET` vẫn là gốc ký phiên duy nhất; secret OIDC chỉ nằm trong env

---

## Chia PR & gợi ý route (cho PLAN.md khi lập kế hoạch)

| PR  | Nội dung                                                                   | Gợi ý `route:`                                                                                                                   |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PR1 | api_keys + helper rate-limit generic + `/api/v1/*` + UI + `docs/api-v1.md` | `spec` (đặc tả kín; lượng file nhiều nhưng máy móc)                                                                              |
| PR2 | webhooks + hàng đợi + cron deliver + 6 điểm emit + UI                      | `complex` (điểm emit rải trên route nghiệp vụ đang sống — cần phán đoán tại chỗ trong ranh giới "phát đúng lúc chuyển approved") |
| PR3 | openid-client + `lib/oidc.ts` + 2 route + login page + audit users         | `complex` (luồng auth — vùng rủi ro cao `docs/audit.md`)                                                                         |

Mỗi PR theo DoD `CLAUDE.md` (lint/typecheck/test/build, PR draft, cập nhật
`PROGRESS.md`). PR2/PR3 đụng `vercel.json`/`DEPLOY.md`/`.env.example` (nếu có) — nhớ
cập nhật tài liệu env trong cùng PR.
