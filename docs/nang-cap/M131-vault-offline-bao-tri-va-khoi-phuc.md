# M131 — Vault offline: rewrap KEK, retire khoá, khôi phục khi mất proof

> Trạng thái: **Approved for implementation** — quyết định chủ dự án 2026-10-09 (AskUserQuestion):
> (1) rewrap bằng **role bảo trì riêng + script**; (2) retire **tự động**; (3) mất proof → **khôi phục
> có admin duyệt**. Đóng 3 mục "Cần quyết" của S05/S07 (`PROGRESS.md`, mục S07).
> Spec cha: `AUDIT-2026-09-25/DATA-CONTRACTS.md` §4, `DATA-MIGRATIONS.md` dòng 40-54, 141-149,
> `AUDIT-S05-OFFLINE-VAULT.md`, ADR-0005.

## 0. Bất biến (không được phá)

- Server **không bao giờ** trả DEK/khoá cho ai ngoài **chính chủ dữ liệu trên thiết bị của chủ** (đã
  đăng ký, proof hợp lệ). Admin duyệt khôi phục **không** nhận khoá/draft (DATA-MIGRATIONS:40-41).
- Unlock vẫn bắt buộc proof thiết bị (không nới `thietBiCuaToi`/`chotBoiCanhVault`).
- Runtime `xboss_app` vẫn **không** UPDATE `wrapped_key`/`kek_version`/`retired_at`, không DELETE
  (DATA-MIGRATIONS:141). Chỉ role bảo trì làm, không BYPASSRLS.
- **Không xoá khoá theo ngày**; retire chỉ là đánh dấu (unlock khoá retired của thiết bị còn hiệu lực vẫn
  chạy như hiện nay, cờ `retired: true`).
- Không log vật liệu khoá (`wrapped_key`, DEK, proof) — kể cả trong audit_log.

## 1. DDL — `migrations/0170_offline_vault_bao_tri.sql`

Cùng kiểu 0163: chặn chạy bằng `xboss_app`/non-owner, idempotent, `set_config` phạm vi nếu ghi dữ liệu.

1. **Role** `xboss_vault_maint`: `CREATE ROLE xboss_vault_maint LOGIN NOBYPASSRLS PASSWORD
'CHANGE_ME_ON_DEPLOY'` trong `DO $$ IF NOT EXISTS (pg_roles) …` (mẫu 0069). Nếu role migrate không có
   CREATEROLE → `RAISE EXCEPTION` thông điệp tiếng Việt chỉ cách tạo tay (DEPLOY.md). GRANT USAGE schema
   public; `SELECT` trên `offline_devices`, `offline_vault_recovery_requests`, `organizations`;
   `SELECT, UPDATE (wrapped_key, kek_version, retired_at)` trên `offline_vault_keys`; `INSERT` trên
   `audit_log` (+ USAGE sequence nếu có). Không gì khác.
2. **Policy** cho role đó (FORCE RLS đã bật): `offline_vault_maint_read` SELECT `TO xboss_vault_maint
USING (true)` và `offline_vault_maint_update` UPDATE `TO xboss_vault_maint USING (true) WITH CHECK
(true)` trên `offline_vault_keys`; `offline_device_maint_read` SELECT `TO xboss_vault_maint` trên
   `offline_devices`; tương tự SELECT trên bảng recovery. Các cột bất biến (id, device_id, user_id,
   org_id, project_id, key_version, manifest, manifest_hash, permission_fingerprint) **không** được
   grant UPDATE → không sửa được dù policy `true`.
3. **Index**: `idx_offline_vault_keys_kek_live ON offline_vault_keys (kek_version) WHERE retired_at IS
NULL`; `idx_offline_vault_keys_device ON offline_vault_keys (device_id) WHERE retired_at IS NULL`.
4. **Audit không lộ khoá**: trigger `AFTER UPDATE ON offline_vault_keys` gọi hàm riêng
   `audit_offline_vault_key_change()` chỉ ghi `audit_log` với `changes` gồm `kek_version`/`retired_at`
   (cũ→mới) — **không** dùng `audit_row_change()` (nó dump mọi cột đổi, có `wrapped_key`). `entity_type
= 'offline_vault_keys'`, `entity_key = id::text`, actor lấy từ GUC (`app.user_id` có thể rỗng khi
   script) + `actor_role = current_setting('app.role')`.
5. **Bảng khôi phục** `offline_vault_recovery_requests`:
   ```sql
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   org_id int NOT NULL REFERENCES organizations(id),
   user_id int NOT NULL REFERENCES users(id),
   old_device_id uuid NOT NULL,
   new_device_id uuid NOT NULL,
   status text NOT NULL DEFAULT 'pending'
     CHECK (status IN ('pending','approved','rejected','completed','expired')),
   reason text CHECK (reason IS NULL OR length(reason) <= 500),     -- lý do người dùng
   decided_by int REFERENCES users(id), decided_at timestamptz, decide_note text,
   completed_at timestamptz, keys_recovered int, keys_skipped int,
   requested_at timestamptz NOT NULL DEFAULT now(),
   FOREIGN KEY (old_device_id, user_id, org_id) REFERENCES offline_devices(id, user_id, org_id),
   FOREIGN KEY (new_device_id, user_id, org_id) REFERENCES offline_devices(id, user_id, org_id),
   CHECK (old_device_id <> new_device_id),
   CHECK (status NOT IN ('approved','rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
   CHECK (decided_by IS NULL OR decided_by <> user_id)                  -- SoD: không tự duyệt
   ```
   Unique một phần: tối đa 1 yêu cầu `pending|approved` cho mỗi `old_device_id`. ENABLE + FORCE RLS;
   policy `xboss_app`: SELECT khi `org_id` = GUC và (`user_id` = GUC hoặc `app.role='admin'`); INSERT khi
   org/user = GUC và `status='pending'` và các cột quyết định NULL; UPDATE khi org = GUC và (admin, hoặc
   chủ chỉ để chuyển `approved → completed`). GRANT `SELECT, INSERT, UPDATE (status, decided_by,
decided_at, decide_note, completed_at, keys_recovered, keys_skipped)` cho `xboss_app`; không DELETE.
   Audit: `audit_row_change()` AFTER INSERT/UPDATE (bảng không có vật liệu khoá).
6. `tests/rls.test.ts` nhóm OFFLINE + `docs/ERD.md` (`npm run gen:erd`) cập nhật theo.

## 2. Bảo trì (script, không phải route HTTP)

`scripts/vault-maint.ts`, lệnh `npm run vault:maint -- [--rewrap] [--retire] [--apply]` (mặc định
**dry-run**, in số liệu; `--apply` mới ghi). Kết nối bằng biến mới **`XBOSS_VAULT_MAINT_DATABASE_URL`**
(role `xboss_vault_maint`) — khai trong `lib/nen/env.ts` (tuỳ chọn); thiếu → script throw fail-fast.
Không thêm vào runtime app (không route nào dùng; DEPLOY.md: chạy bằng crontab hệ thống hằng ngày).
Mỗi transaction đặt `app.role = 'vault_maint'` để trigger audit ghi được actor role.

- **Rewrap**: với mỗi dòng `retired_at IS NULL AND kek_version <> keyring.active.version`, theo lô 200,
  khoá advisory **cùng khoá** `capKhoaVault` dùng (`offline-vault|<device>|<project>`), `SELECT … FOR
UPDATE`, giải bọc bằng KEK cũ với AAD cũ, bọc lại bằng KEK active với AAD **cùng trường nhưng
  `kekVersion` mới** (`aadBocKhoa`, `lib/nen/offline-crypto.ts`), UPDATE `wrapped_key, kek_version`.
  KEK cũ thiếu trong keyring hoặc giải bọc lỗi → bỏ qua dòng đó, đếm vào báo cáo (không throw cả lô),
  `log.warn` không chứa khoá. Cuối in bảng còn lại theo `kek_version` để người vận hành biết lúc nào gỡ
  version cũ khỏi `XBOSS_OFFLINE_KEK`.
- **Retire** (đánh dấu `retired_at = now()`): khoá của thiết bị `revoked_at < now() - cửa sổ khôi phục`
  (biến `XBOSS_VAULT_RECOVERY_DAYS`, mặc định 30, min 1) **và** không có yêu cầu khôi phục
  `pending|approved` trỏ tới thiết bị đó làm `old_device_id`. Đồng thời đổi yêu cầu `pending` quá cửa
  sổ thành `expired` (script cần UPDATE cột `status` của bảng recovery → grant thêm đúng cột đó).
- Retire **không** dựa vào tuổi khoá. Khoá sau rewrap là version active nên không có "khoá version cũ"
  sống song song — rewrap thay tại chỗ.

## 3. Khôi phục khi mất proof (route + UI)

Luồng (chủ dữ liệu khởi tạo = "chủ dữ liệu xác nhận"; admin duyệt = "xác minh riêng"):

1. **Người dùng** trên thiết bị mới (đã `POST /api/offline/devices`, proof hợp lệ) gửi
   `POST /api/offline/recovery { oldDeviceId, reason? }`: kiểm phiên, same-origin, KEK bật,
   rate-limit (`hitRateLimit`, 5 lần/ngày/người), thiết bị mới = thiết bị proof hiện tại, thiết bị cũ
   thuộc **chính user + org**, khác thiết bị mới. Trùng yêu cầu mở → 409 `recovery_exists`. Tạo
   `pending`; thông báo (notifications + push nếu có) cho admin cùng org. `GET /api/offline/recovery`:
   chủ thấy yêu cầu của mình; admin thấy cả org.
2. **Admin** `PATCH /api/offline/recovery/:id { decision: "approve"|"reject", note? }`: admin +
   `CAN.manageUsers` + 2FA (như `PATCH devices/:id`), cùng org, **không phải chính người yêu cầu**,
   chỉ từ `pending`. Approve ⇒ trong cùng transaction **thu hồi thiết bị cũ** nếu chưa (dùng lại logic
   `capNhatThietBi` revoke: tăng `session_version`, `revoked_at`) và đặt `approved`. Phản hồi không chứa
   khoá.
3. **Người dùng** trên **đúng thiết bị mới** gọi `POST /api/offline/recovery/:id/complete`: yêu cầu
   `approved`, `new_device_id` = thiết bị proof hiện tại. Với mỗi khoá chưa retired của thiết bị cũ, theo
   từng dự án (GUC `app.project_id` của dự án đó), **chỉ khi quyền hiện tại vẫn qua `boKiemManifest`**:
   giải bọc với AAD cũ → tạo **dòng khoá mới** cho thiết bị mới (id mới, `key_version` = MAX+1 theo
   (thiết bị mới, dự án), cùng manifest/hash/fingerprint, bọc bằng KEK active với AAD mới). Khoá mất quyền
   → bỏ qua, đếm `keys_skipped`. Đặt `completed`. Trả `{ mapping: [{ oldKeyId, newKeyId }], skipped }` —
   chỉ id, không khoá; client dùng `vault/unlock` như thường để mở.
4. **UI**:
   - Trang admin mới `/admin/thiet-bi-offline` (Admin): bảng thiết bị org (đã có `GET devices`) với nút
     đổi profile/thu hồi (đã có `PATCH devices/:id`), và tab "Yêu cầu khôi phục" duyệt/từ chối. Bộ
     component `app/components/ui/`, 4 trạng thái màn hình, tiếng Việt, a11y, mobile ≥40px. Thêm vào
     nav admin.
   - Phía người dùng: trong `OfflineRecoveryPanel` khi có draft không mở được vì khoá không thuộc thiết
     bị này → nút "Yêu cầu khôi phục" (chọn thiết bị cũ từ `GET devices` của chính mình); khi yêu cầu
     `approved` → nút "Hoàn tất khôi phục" gọi `complete` rồi gắn lại `keyId` của draft theo `mapping`.
   - e2e + axe cho trang admin mới (desktop + mobile).

## 4. Tiêu chí chấp nhận

- Migration 0170 áp sạch trên DB mới và DB đã có 0163; chạy lại không lỗi; `xboss_app` vẫn không
  UPDATE được `wrapped_key`/`kek_version`/`retired_at` (test RLS/grant đỏ nếu lỡ cấp).
- `vault:maint --rewrap --apply`: khoá v1 → v2, unlock sau rewrap vẫn ra đúng DEK; dry-run không ghi;
  KEK cũ thiếu → dòng bị bỏ qua, có báo cáo; audit_log có dòng đổi `kek_version` và **không** chứa
  `wrapped_key`.
- `--retire`: khoá thiết bị thu hồi quá cửa sổ bị đánh dấu; còn trong cửa sổ hoặc có yêu cầu mở thì
  không; yêu cầu pending quá hạn → expired.
- Recovery: user khác/org khác/thiết bị không thuộc mình → 404/403; admin tự duyệt yêu cầu của mình → 403;
  approve thu hồi thiết bị cũ; complete từ thiết bị khác thiết bị mới → 403; khoá mất quyền bị bỏ qua;
  khoá mới mở được bằng `vault/unlock` từ thiết bị mới; không phản hồi nào chứa vật liệu khoá.
- Test route thật (mẫu `tests/offline-vault-route.test.ts`, chạy bằng role `xboss_app`); ca chính đỏ
  trên code cũ khi áp dụng được. `npm run gate` xanh; `DEPLOY.md` (role, biến, crontab, đổi mật khẩu
  role), `PROGRESS.md`, ADR-0005 (đoạn rewrap) cập nhật.
