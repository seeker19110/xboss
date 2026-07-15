# M49 — API mở, webhook ra ngoài & SSO OIDC (P3)

> **Mục tiêu**: biến XBoss thành điểm tích hợp được: bên thứ ba đọc dữ liệu qua API key, nhận sự kiện qua webhook có ký HMAC; doanh nghiệp đăng nhập bằng tài khoản công ty (Google Workspace / Microsoft Entra) và đồng bộ vai trò. Nâng trục Tích hợp lên ~4.0 (cùng M48).

## PR1 — API keys (đọc-only)

### Migration `0054_api_keys.sql`

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,        -- sha256(key); key thô chỉ hiện 1 lần lúc tạo
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,   -- NULL = mọi dự án
  scopes TEXT[] NOT NULL DEFAULT '{read}',                    -- v1 chỉ 'read'
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
);
```

- `lib/api-keys.ts`: `verifyApiKey(authHeader)` — `Authorization: Bearer xbk_<random 32 bytes hex>`; so sha256, check revoked, cập nhật `last_used_at` (throttle 1 phút/lần để khỏi ghi mỗi request).
- Phạm vi v1 (**không** mở toàn bộ 284 route): namespace mới `app/api/v1/` chỉ đọc, trả JSON ổn định (không đổi shape theo UI):
  - `GET /api/v1/tasks?sheet=&floor=&status=&page=` · `GET /api/v1/packages` · `GET /api/v1/materials` · `GET /api/v1/dashboard/kpi` · `GET /api/v1/payment-certs` (scope tài chính đòi key có scope `read_finance` — thêm giá trị scope này ngay từ v1).
  - Mỗi route: `verifyApiKey` → 401; scope thiếu → 403; áp `project_id` của key (key toàn cục phải truyền `?project=`); rate-limit theo key qua `lib/ratelimit.ts` (tái dùng bảng, khoá `api:<keyId>`, 120 req/phút).
- Quản lý: `GET/POST /api/admin/api-keys`, `DELETE /api/admin/api-keys/:id` (revoke) — chỉ admin; UI mục trong `/admin/integrations` (M48): tạo (hiện key 1 lần, cảnh báo lưu lại), danh sách kèm last_used, thu hồi.
- Tài liệu: `docs/api-v1.md` mô tả endpoint + ví dụ curl (tiếng Việt).

## PR2 — Webhook ra ngoài

### Migration

```sql
CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL, secret TEXT NOT NULL,      -- ký HMAC-SHA256 payload
  events TEXT[] NOT NULL,                       -- whitelist bên dưới
  active BOOLEAN DEFAULT TRUE, created_by INT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_id INT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL, payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | ok | failed
  attempts INT DEFAULT 0, next_retry_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
```

- Sự kiện v1 (whitelist trong `lib/webhooks.ts`): `task.approved`, `variation.approved`, `payment_cert.approved`, `material.over_norm`, `inspection.requested`. Điểm phát: chèn `emitWebhook(event, payload)` tại các route/hàm tương ứng (sau M46 thì điểm approve đã gom về `advanceApproval` — chỉ 1 chỗ).
- Giao hàng **bất đồng bộ qua bảng hàng đợi** (không chặn request): `emitWebhook` chỉ INSERT `webhook_deliveries`; cron `GET /api/cron/deliver-webhooks` (CRON_SECRET, chạy mỗi 5 phút — hoặc gộp vào cron sync M48) gửi POST kèm header `X-Xboss-Signature: sha256=<hmac>`, retry backoff (5m/30m/2h, tối đa 5 lần → failed).
- UI: mục Webhook trong `/admin/integrations` — CRUD + bảng deliveries gần nhất (status/attempts) + nút gửi thử (event `ping`).

## PR3 — SSO OIDC

- Chuẩn: OIDC Authorization Code + PKCE, provider cấu hình qua env: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ROLE_CLAIM` (tuỳ chọn — claim chứa role), `OIDC_DEFAULT_ROLE` (mặc định `viewer`). Thiếu env → nút SSO ẩn, mọi thứ như cũ (pattern VAPID).
- Không thêm thư viện nặng: flow chuẩn chỉ cần 2 route + fetch (discovery document, token endpoint, xác minh id_token qua JWKS — dùng `jose`, thư viện nhỏ chuẩn ngành; ghi ADR ngắn nếu team muốn zero-dep).
- Route: `GET /api/auth/oidc/login` (redirect + state/nonce/PKCE trong cookie tạm) → `GET /api/auth/oidc/callback`: xác minh id_token → match user theo email:
  - Có user → cập nhật role nếu `OIDC_ROLE_CLAIM` bật (map giá trị claim → `lib/roles.ts`, giá trị lạ → giữ role cũ + log warn).
  - Chưa có → tạo user role `OIDC_DEFAULT_ROLE`, chưa gán dự án (admin gán sau qua `user_projects`) — đăng nhập được nhưng thấy trạng thái "chưa được gán dự án".
  - Phát cookie `xboss_session` như login thường (tái dùng `lib/auth.ts` — không tạo cơ chế phiên thứ hai).
- Login page: nút "Đăng nhập bằng SSO công ty" khi env đủ; mật khẩu vẫn là fallback (admin thoát hiểm khi IdP hỏng).
- Bảo mật: state + nonce bắt buộc; `login_rate_limits` áp cho callback lỗi; audit đăng nhập SSO ghi `assignment_log`-style hoặc `audit_log` (M43).

## Test

- `tests/api-keys.test.ts` (integration): key đúng/sai/revoked; scope finance; rate-limit 429; project scoping của key.
- `tests/webhooks.test.ts`: emit → delivery pending; cron gửi (mock fetch) → ok; fail → retry backoff đúng; chữ ký HMAC verify được.
- `tests/oidc.test.ts` (unit): map claim → role, state/nonce mismatch → 401; integration callback với JWKS mock.

## Chia PR

1. **PR1**: api_keys + `/api/v1/*` đọc-only + rate-limit + docs.
2. **PR2**: webhooks + hàng đợi + cron deliver + UI.
3. **PR3**: OIDC login/callback + nút UI + audit.
