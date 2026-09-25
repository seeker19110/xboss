# Contract kỹ thuật — QUALITY-FINAL-1

State: **Approved for implementation**, theo APPROVAL.md ngày 2026-09-25; thi hành sau.
Đây là API/DDL đích, không phải bảng/route đã tồn tại hay code đã thực thi.
Đọc bắt buộc cùng [DATA-MIGRATIONS](DATA-MIGRATIONS.md): DDL vault, scope manifest, chính sách
RLS, quantity exact legacy và immutable IPC snapshots được định nghĩa đầy đủ tại đó.
Không triển khai phiên bản rút gọn thiếu policies, resource manifest hoặc kiểm owner.

## 1. Scope và transaction

```ts
type VerifiedActor = {
  id: number;
  orgId: number;
  role: string;
  sessionVersion: number;
};
type VerifiedScope = {
  kind: "project";
  actor: VerifiedActor;
  projectId: number;
  permissionFingerprint: string;
};
type PortfolioScope = {
  kind: "portfolio";
  actor: VerifiedActor;
  projectIds: readonly number[];
  permissionFingerprint: string;
};
type TransactionOptions = {
  readOnly: boolean;
  isolation: "read committed" | "repeatable read" | "serializable";
};
```

Factory server kiểm actor, membership, org, quyền và tài nguyên trước khi tạo scope;
TypeScript type/brand không thay runtime authorization. authorizeProject và authorizePortfolio
không đọc cookies bên trong; adapter Next đọc rồi chuyển candidate chưa tin vào resolver.
ID là số nguyên an toàn dương hoặc chuỗi chữ số canonical không leading zero; không bool,
object, array, exponent, hex, Infinity hoặc fallback project 1.

withAuthorizedTransaction(scope, options, fn) đặt isolation/readOnly tại BEGIN, sau đó SET
LOCAL actor/org/project/request. Callback chỉ dùng cùng connection. Nested khác scope/actor
hoặc yêu cầu nâng isolation/quyền ghi vượt cha bị từ chối; không mutate GUC rồi phục hồi trong
Promise.all. COMMIT/ROLLBACK không rò context qua pool.

Retry serialization/deadlock tối đa ba lần cho toàn transaction có operationId ổn định,
backoff+jitter; không replay side effect ngoài DB mù. Không SELECT metadata rồi mới đặt
isolation. Đọc permission và nguồn báo cáo phải phù hợp semantics snapshot đã chốt.

Portfolio chỉ tập IDs hữu hạn cùng org. Context server có thể truyền app.project_ids dạng
JSON array validated; policy đọc kiểm project thuộc tập và org đúng. Write chỉ single-project.
Mọi query vẫn có WHERE scope; không nhận wildcard hoặc GUC từ client.

## 2. Permission key theo org

Nguồn role_permissions đã đối chiếu trong SOURCE-MAP. Index đích:

```sql
CREATE UNIQUE INDEX uq_role_perm_org_scope
  ON role_permissions (org_id, role, perm_key, COALESCE(project_id, 0));
```

Mọi list/reload/cache/upsert/delete có org. ON CONFLICT dùng đúng index expression mới;
DELETE dùng org_id và project_id IS NOT DISTINCT FROM. Bỏ index cũ uq_role_perm_scope sau
khi writer đã chuyển; tránh mixed-version bằng khóa tạm đường cấu hình quyền, drain worker
cũ, triển khai schema/code tương thích rồi mở lại. Không xóa data/đổi org để giải conflict.

Cold-start có deny phải deny; snapshot lỗi không mặc định allow. Kiểm hai org có cùng
role/action/global-scope độc lập; app role NOBYPASSRLS. Migration lặp kiểm định nghĩa catalog,
không chỉ IF NOT EXISTS. Không rollback về code thiếu org sau khi đã có dữ liệu nhiều org.

## 3. Device và context APIs mới

POST /api/offline/devices: session hợp lệ, origin/CSRF, tạo device UUID gắn actor/org.
Browser proof 32 byte trong cookie HttpOnly/Secure/SameSite=Lax; server chỉ lưu hash.
Proof browser dùng chung cho các device records của các actor khác nhau như DATA-MIGRATIONS,
không bị B đăng nhập ghi đè khiến A mất quyền phục hồi. Response không có proof/raw key.
Profile mặc định shared-safe; idempotent register và rate limit không tạo vô hạn records.

PATCH /api/offline/devices/:id: admin cùng org, CAN.manageUsers và 2FA hợp lệ;
chỉ profile/approval/revocation, không đổi owner/org/proof. Profile shared-safe hoặc
field-personal, client không tự nâng bằng localStorage. Actor bị mất quyền không unlock được.

POST /api/offline/context: kiểm session, proof, device, project qua A1, permission hiện hành.
Response private,no-store gồm contextId, generation, projectId, profile, issuedAt,
expiresAt, cacheSchemaVersion và serverTime. Lease 15 phút hoặc 8 giờ theo D02.
Context được server ký/ràng buộc actor/org/project/sessionVersion/permissionFingerprint/device,
không là credential thay session. Generation không phải timestamp client đáng tin.

Request queue migrated gửi X-XBoss-Context và Idempotency-Key; mismatch409 context_changed.
Thiếu header trên legacy caller chỉ được adapter chuyển đổi có scope/quyền đúng, không làm
bypass endpoint migrated. Một browser project cookie chung: switch phải invalidate mọi tab.
Clock rollback, cold restart/mất context hoặc hết lease khóa; online xác minh trước resume.

## 4. Vault APIs và bảo vệ bản nháp

POST /api/offline/vault/unlock: session+device proof+context hợp lệ; server xác minh **toàn bộ
resource manifest bất biến** của key, không chỉ membership project. Trước đi offline, tạo key
cho manifest tài nguyên đã tải; không cho client tự mở rộng manifest hoặc tự nhận chủ legacy.
Nếu bất kỳ resource trong manifest bị thu hồi quyền thì không trả key đó; các manifest độc
lập hợp lệ có thể mở. Xem DDL và crypto contract trong DATA-MIGRATIONS.

DEK 256 bit từ CSPRNG; payload AES-GCM IV 96 bit ngẫu nhiên mới mỗi lần, tag 128 bit.
Server wrap bằng KEK riêng version hóa, không XBOSS_SECRET/password; AAD gắn key/manifest/
owner/org/project/device/version. Client nhận key chỉ HTTPS/no-store, import memory-only,
không persist raw key/CryptoKey vào IDB/localStorage/Cache Storage. Không log key/payload.

Logout khóa vault, bỏ key memory và read caches, giữ ciphertext draft chưa giải quyết;
chính chủ xác thực online lại để phục hồi. Không tự xóa/export. Metadata client chỉ tối thiểu
định tuyến, resource/date/caption ở ciphertext; IDB complete mới báo lưu. Thiết bị mất/storage
bị xóa vẫn có thể mất draft chưa backup server. Mã hóa không thay XSS/authorization.

KEK rotation rewrap có maintenance quyền riêng và audit; giữ key/version cần cho draft và
recovery window. Password/session changes không tự hủy ciphertext. Legacy không owner chỉ
quarantine, không wrap/gán theo user đang mở. Device proof mất cần recovery có xác minh riêng.

## 5. Receipt cho bốn thao tác offline

DDL mới, nếu inventory xác minh chưa có cơ chế tương đương đáp ứng toàn bộ contract:

```sql
CREATE TABLE audit_operation_receipts (
  operation_id uuid NOT NULL,
  user_id integer NOT NULL REFERENCES users(id),
  org_id integer NOT NULL REFERENCES organizations(id),
  project_id integer NOT NULL REFERENCES projects(id),
  operation_kind text NOT NULL CHECK
    (operation_kind IN ('tick', 'tick_batch', 'photo', 'diary_note')),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  result_version text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, project_id, user_id, operation_id)
);
ALTER TABLE audit_operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_operation_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_receipts_context ON audit_operation_receipts
  USING (
    user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    AND org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND project_id = NULLIF(current_setting('app.project_id', true), '')::integer
  )
  WITH CHECK (
    user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    AND org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND project_id = NULLIF(current_setting('app.project_id', true), '')::integer
  );
GRANT SELECT, INSERT ON audit_operation_receipts TO xboss_app;
```

Không wildcard policy, không runtime UPDATE/DELETE receipt. FK đơn không tự chứng minh org
các parent; service kiểm và tests parent mismatch bắt buộc. Hash SHA-256 canonical gồm
version/kind/scope/target/payload/baseVersion, photo digest bytes+metadata không multipart boundary.

Protocol: auth/quyền/scope → transaction lock tuple → lookup receipt → same hash ACK replay,
khác hash409 → nếu chưa có thì kiểm precondition/gate → mutate/audit/receipt → COMMIT → ACK.
Không commit placeholder pending. ACK có operationId/replayed/resource/version, không payload
nhạy cảm. Trả replay vẫn kiểm quyền hiện tại; không cho receipt bypass resource vừa bị revoke.

Diary full-replace If-Match strong version, tạo mới If-None-Match:*; kiểm/ghi cùng lock,
missing precondition428. Receipt replay hợp lệ xét trước If-Match hiện tại để mất ACK không
thất bại giả. Photo storage dùng staging/metadata transaction và orphan reconciliation.
Lease IDB nhiều tab không thay backend idempotency. Không TTL xóa dedup key khi replay còn nhận.

Warehouse_receipts đã có idempotency theo po_id/key; giữ cơ chế riêng cho kho, không dùng
bảng kho làm receipt tick/photo/diary. Không tuyên bố exactly-once network delivery.

## 6. Money, quantity và IPC

A3 chốt numeric/bigint/decimal-string-v1; cast cả numeric bên trong JSON aggregate.
Quantity legacy float phải đi qua expand/backfill/provenance ở DATA-MIGRATIONS, không cast
sản phẩm float thành text rồi gọi exact. BOQ/IPC quantity15,3 và money15,2 giữ scale thật.

IPC giữ ipc-sum-v1 (SUM rồi round tổng), không tự round từng dòng. Golden hai dòng qty0.001,
price5.00 cho periodValue0.01, không0.02. Snapshot chốt giá/rates/basis/warnings/rule,
không rebuild history bằng dữ liệu hôm nay.

Endpoint quyết định IPC hiện hữu bổ sung Idempotency-Key, warningVersion/acknowledged/reason.
Khóa contract/cert trước lookup/recompute; warnings thay đổi409 warning_changed;
ack hiện tại hợp lệ thì cho nghiệp vụ overrun theo quyền/flow, không hard-cap tự đặt.
Không có warning không bắt ack rỗng. Snapshot và transition/audit cùng transaction.

Snapshot DDL, schema kết quả bước pending/approved/rejected và uniqueness(cert_id,operation_id)
ở DATA-MIGRATIONS. Đây không thêm pending vào enum payment_certs. Mỗi quyết định bước mới dùng
key mới; retry trả kết quả bước cũ, không tự chạy bước kế. Existing audit tương đương phải
chứng minh đủ contract trước khi dùng adapter thay bảng mới, không hai nguồn sự thật độc lập.

## 7. Lỗi, bảo mật và kiểm chứng

401 thiếu auth;403 thiếu quyền;404 resource ngoài scope;400/422 input sai;409 context/
idempotency/warning;412 version;428 thiếu precondition;429 Retry-After;503 hạ tầng.
Không lộ resource/actor cấm trong errors. Preserve need2fa/pending và makeToken của #529.

Migration append-only số kế tiếp lúc thực thi, fresh/repeat/compare catalog, RLS app role,
ERD sinh lại, compatibility writer/schema và recovery. Tất cả DDL ở đây/phụ lục chỉ thiết kế;
implementation phải chạy và lưu evidence trước đóng AC. Production runtime không auto-DDL.
