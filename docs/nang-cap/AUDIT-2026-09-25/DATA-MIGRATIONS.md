# Phụ lục dữ liệu và vault — QUALITY-FINAL-1

State: **Approved for implementation**, ngày2026-09-25; thi hành sau.
Đọc cùng DATA-CONTRACTS.md. DDL ở đây là thiết kế, chưa chạy trên DB nào.
Đây là định nghĩa chuẩn vault/snapshot/quantity của phiên bản này; không triển khai một bảng
rút gọn thiếu policy, manifest hoặc dữ liệu provenance rồi coi đã hoàn tất.

## 1. Offline đọc dùng vault, không cache JSON cá nhân dạng rõ

Cache Storage của SW chỉ giữ shell/static asset đã chứng minh không có dữ liệu cá nhân.
Authenticated API GET đi network-only ở SW. Allowlist đọc tracking offline được ứng dụng
lưu dưới dạng snapshot mã hóa trong IndexedDB/vault, không Cache.put response JSON nguyên bản.
Khi offline, ứng dụng mở snapshot đúng context/manifest/generation/lease rồi hiển thị;
không để SW trả cache200 thay server401/403. Điều này làm rõ cách lưu vật lý của allowlist A2,
không mở một cơ chế cache dữ liệu cá nhân thứ hai.

Snapshot đọc và draft ghi có cùng nguyên tắc khóa/resource authorization, nhưng khác retention:
read snapshot có expiry và được purge khi logout; draft chưa đồng bộ không tự bị xóa.
Không hiển thị cached HTML/RSC có nội dung cá nhân. Browser cache/CDN response authenticated
cũng private,no-store; không coi header này tự thay kiểm logic ứng dụng.

## 2. Key gắn resource manifest, không chỉ project

Key cho toàn project có thể giải mã draft task vừa bị thu hồi quyền. Chốt key theo resource
manifest bất biến do server cấp: task/nhóm task đã tải hoặc capability nhật ký có phạm vi
ngày/project cụ thể. Manifest có IDs/actions/date range đã kiểm, canonical hash SHA-256.
Client không được tự mở rộng. Key càng nhỏ theo nhóm tài nguyên thì thu hồi một tài nguyên
càng ít ảnh hưởng draft độc lập; không gom mọi project vào một key.

Trước unwrap sau xác thực lại, server kiểm **tất cả** tài nguyên/capability trong manifest
với quyền và assignment hiện tại. Một tài nguyên bị cấm thì không trả key manifest đó;
không trả key rồi hy vọng UI che phần cấm. Manifest khác hợp lệ được mở độc lập.
Thêm tài nguyên cần online cấp manifest/key mới; không sửa manifest cũ tại chỗ.

Offline chỉ tạo operation trong capability đã tải còn lease; tick batch phải thuộc tập
manifest hợp lệ và server vẫn kiểm từng task lúc replay. Resource/date/caption ở ciphertext;
AAD gắn manifestHash/keyId/owner/org/project/device/version/operation/kind/sequence.

Quyền thay đổi nhưng vẫn cho toàn manifest thì chính chủ được mở key cũ sau kiểm mới.
Quyền bị thu hồi giữ ciphertext cách ly; không tự xóa hoặc cấp key recovery cho người không
còn quyền. Recovery đặc biệt cần chủ dữ liệu xác nhận/audit, không endpoint admin tải mọi draft.
Mã hóa không chống XSS trong phiên đã mở khóa và không thay auth server khi đồng bộ.

## 3. Device proof trong browser dùng chung

Cookie HttpOnly/Secure/SameSite=Lax chứa proof ngẫu nhiên32byte, không user/key. Proof là
browser binding, không credential đăng nhập. Server có record device riêng theo actor/org,
cùng browser có thể dùng cùng proof_hash cho record A và B. Register B không ghi đè proof
khiến A mất khả năng phục hồi. Unique(user_id,org_id,proof_hash) bảo đảm register lặp không
nhân record. Mọi unlock cần session đúng chủ và quyền manifest, không chỉ có proof.

Logout session giữ proof khi còn vault cần phục hồi nhưng xóa context/key memory.
B cùng thiết bị không mở A. Mất proof do xóa cookie thì không tự gán vault cũ cho device mới;
recovery được xác minh riêng, không bỏ kiểm proof ở endpoint unlock.

## 4. DDL vault và policy

Một migration append-only dùng các định nghĩa này; số lấy tại lúc code, không giữ trước.
Object trùng tên phải so catalog/định nghĩa, không IF NOT EXISTS để nuốt schema sai.

```sql
CREATE TABLE offline_devices (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  org_id integer NOT NULL REFERENCES organizations(id),
  proof_hash bytea NOT NULL CHECK (octet_length(proof_hash) = 32),
  profile text NOT NULL DEFAULT 'shared-safe'
    CHECK (profile IN ('shared-safe', 'field-personal')),
  approved_by integer REFERENCES users(id),
  approved_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id, org_id),
  UNIQUE (user_id, org_id, proof_hash),
  CHECK (profile <> 'field-personal' OR
    (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE offline_vault_keys (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL,
  user_id integer NOT NULL,
  org_id integer NOT NULL,
  project_id integer NOT NULL REFERENCES projects(id),
  key_version integer NOT NULL CHECK (key_version > 0),
  resource_manifest jsonb NOT NULL CHECK (jsonb_typeof(resource_manifest) = 'object'),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  permission_fingerprint text NOT NULL
    CHECK (permission_fingerprint ~ '^[0-9a-f]{64}$'),
  wrapped_key bytea NOT NULL,
  kek_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  FOREIGN KEY (device_id, user_id, org_id)
    REFERENCES offline_devices(id, user_id, org_id),
  UNIQUE (device_id, user_id, org_id, project_id, key_version)
);
ALTER TABLE offline_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE offline_vault_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_vault_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_device_read ON offline_devices FOR SELECT
  USING (
    org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND (user_id = NULLIF(current_setting('app.user_id', true), '')::integer
      OR current_setting('app.role', true) = 'admin')
  );
CREATE POLICY offline_device_register ON offline_devices FOR INSERT
  WITH CHECK (
    org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    AND profile = 'shared-safe'
    AND approved_by IS NULL AND approved_at IS NULL AND revoked_at IS NULL
  );
CREATE POLICY offline_device_admin_update ON offline_devices FOR UPDATE
  USING (
    org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND current_setting('app.role', true) = 'admin'
  )
  WITH CHECK (
    org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND current_setting('app.role', true) = 'admin'
  );
CREATE POLICY offline_vault_read ON offline_vault_keys FOR SELECT
  USING (
    user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    AND org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND project_id = NULLIF(current_setting('app.project_id', true), '')::integer
  );
CREATE POLICY offline_vault_create ON offline_vault_keys FOR INSERT
  WITH CHECK (
    user_id = NULLIF(current_setting('app.user_id', true), '')::integer
    AND org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND project_id = NULLIF(current_setting('app.project_id', true), '')::integer
  );
GRANT SELECT, INSERT ON offline_devices TO xboss_app;
GRANT UPDATE (profile, approved_by, approved_at, revoked_at)
  ON offline_devices TO xboss_app;
GRANT SELECT, INSERT ON offline_vault_keys TO xboss_app;
```

Không runtime DELETE, sửa owner/org/proof/manifest hoặc UPDATE wrapped_key. Admin endpoint
còn kiểm CAN.manageUsers/2FA/cùng org; app.role là context server xác thực, không clientheader.
Listing không trả proof_hash/wrapped_key/manifest người khác. RLS chỉ lọc row; unwrap vẫn
phải kiểm resource manifest. FK project không tự chứng minh project.org trùng user.org.

Maintenance rewrap có role/cột/policy riêng, kiểm scope và audit, không mặc định BYPASSRLS.
Giữ manifest/DEK và key versions có draft/recovery phụ thuộc; không xóa vì key cũ theo ngày.
Deployment phải kiểm effective grants, kể cả privileges đã cấp qua role kế thừa; không chỉ
chạy GRANT rồi giả không còn quyền DELETE từ cấu hình cũ.

## 5. Crypto envelope

DEK256bit từ CSPRNG. AES-GCM với IV96bit ngẫu nhiên mới mỗi encrypt và tag128bit; không
reuse IV cùng key. Server wrap DEK bằng KEK version hóa và AAD key/owner/org/project/device/
version/manifestHash. Không lấy password hoặc XBOSS_SECRET làm key derivation.

Unlock chỉ HTTPS/no-store sau session/proof/context/manifest. Client import non-extractable
CryptoKey memory-only, không persist raw/CryptoKey. XSS trong phiên vẫn có thể tiếp cận dữ
liệu/response key: giữ CSP/XSS defenses, không gọi non-extractable là bảo vệ tuyệt đối.
Logout chỉ bỏ tham chiếu memory, không hứa xóa vật lý toàn bộ RAM của JavaScript.

Payload/AAD canonical/versioned, base64url có validation và size limit; authentication fail
khóa record/báo lỗi, không thử fallback plaintext. Không ghi decrypted content vào logs.
Quota tính ciphertext thật. Key recovery được diễn tập cùng DB/files, không chỉ khôi phục
một bảng wrapped_key mà thiếu KEK.

## 6. Quantity float — DDL expand theo từng trường

ERD xác nhận các cột float dưới đây. Exact shadow dùng numeric không ép scale legacy.
Provenance **theo từng cột**, không đổi cả hàng thành exact chỉ vì một quantity được sửa.

```sql
ALTER TABLE purchase_requests
  ADD COLUMN qty_requested_exact numeric,
  ADD COLUMN qty_requested_provenance text;
ALTER TABLE po_items
  ADD COLUMN qty_ordered_exact numeric,
  ADD COLUMN qty_ordered_provenance text,
  ADD COLUMN qty_received_exact numeric,
  ADD COLUMN qty_received_provenance text;
ALTER TABLE receipt_items
  ADD COLUMN qty_received_exact numeric,
  ADD COLUMN qty_received_provenance text;

ALTER TABLE purchase_requests
  ADD CONSTRAINT pr_qty_origin CHECK
    (qty_requested_provenance IN ('legacy_float_text', 'exact_input_v1')),
  ADD CONSTRAINT pr_qty_finite CHECK
    (qty_requested_exact::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  ADD CONSTRAINT pr_qty_new_range CHECK
    (qty_requested_provenance <> 'exact_input_v1' OR
      (qty_requested_exact IS NOT NULL
       AND qty_requested_exact BETWEEN 0 AND 999999999999999999.999999
       AND scale(qty_requested_exact) <= 6));
ALTER TABLE po_items
  ADD CONSTRAINT po_ordered_origin CHECK
    (qty_ordered_provenance IN ('legacy_float_text', 'exact_input_v1')),
  ADD CONSTRAINT po_received_origin CHECK
    (qty_received_provenance IN ('legacy_float_text', 'exact_input_v1')),
  ADD CONSTRAINT po_ordered_finite CHECK
    (qty_ordered_exact::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  ADD CONSTRAINT po_received_finite CHECK
    (qty_received_exact::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  ADD CONSTRAINT po_ordered_new_range CHECK
    (qty_ordered_provenance <> 'exact_input_v1' OR
      (qty_ordered_exact IS NOT NULL
       AND qty_ordered_exact BETWEEN 0 AND 999999999999999999.999999
       AND scale(qty_ordered_exact) <= 6)),
  ADD CONSTRAINT po_received_new_range CHECK
    (qty_received_provenance <> 'exact_input_v1' OR qty_received_exact IS NULL OR
      (qty_received_exact BETWEEN 0 AND 999999999999999999.999999
       AND scale(qty_received_exact) <= 6));
ALTER TABLE receipt_items
  ADD CONSTRAINT receipt_qty_origin CHECK
    (qty_received_provenance IN ('legacy_float_text', 'exact_input_v1')),
  ADD CONSTRAINT receipt_qty_finite CHECK
    (qty_received_exact::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  ADD CONSTRAINT receipt_qty_new_range CHECK
    (qty_received_provenance <> 'exact_input_v1' OR
      (qty_received_exact IS NOT NULL
       AND qty_received_exact BETWEEN 0 AND 999999999999999999.999999
       AND scale(qty_received_exact) <= 6));
```

Expand cho NULL để backfill có checkpoint; CHECK với NULL không chứng minh backfill đã xong.
Cutover phải validate required source không còn thiếu exact/provenance rồi thêm NOT NULL
cho provenance và những quantity nguồn vốn required. qty_received của po_items vốn nullable
được giữ semantics đó. Chưa đủ dữ liệu sạch thì không mở reader exact bằng fallback float.
Không DROP cột cũ hoặc ALTER trực tiếp làm tròn lịch sử trong bước expand.

Backfill qty hữu hạn bằng qty::text::numeric, đánh dấu legacy_float_text dưới row lock.
Đó là biểu diễn float đã lưu, không chứng minh decimal input gốc. Không round thêm để che
sai khác. Null hợp lệ giữ Null; nonfinite/negative không hợp lệ nghiệp vụ vào reconciliation,
không thành0. Command có dry-run/batch/checkpoint và so old-value trước ghi; rerun không
đè exact_input_v1. Nguyên nhân sai tiền gốc cần đối soát chứng từ, không “sửa đúng” bằng đoán.

New PO/receipt quantity canonical decimal không âm, tối đa18 chữ số phần nguyên/6 số lẻ,
không exponent; trim trailing zeros về canonical trước ghi. Validator giữ các hạn chế
nghiệp vụ cũ như ordered phải dương khi rule yêu cầu. BOQ/IPC qty(15,3) và norm(15,4) không
đổi scale theo PO. Updating received không đổi ordered_provenance từ legacy thành exact.

Writer cụm chuyển đồng bộ: input canonical vào exact source, cột float chỉ cho reader legacy
nếu cần. Không để writer cũ ghi float làm shadow stale; drain/khóa đường ghi cụm khi cutover
nếu chưa có adapter tương thích. Cost SUM(qty_ordered_exact*unit_price)::text; missing exact
sau cutover là lỗi readiness/data-quality, không tự fallback float. Kho/PO totals và receipt
ghi trong transaction/idempotency hiện hữu. Lịch sử chốt không reprice từ backfill mới.

materials/sync/quantity khác phải inventory nếu tham gia cùng phép tính trước mở miền đó.
Ba ALTER không chứng minh mọi quantity toàn repo đã exact. Không hỏi chủ dự án chọn lại
cách xử lý float, nhưng phải kiểm caller thực tế, dữ liệu và precision artifacts.

## 7. Snapshot quyết định IPC khi chưa có cơ chế tương đương

```sql
CREATE TABLE payment_cert_decision_snapshots (
  id uuid PRIMARY KEY,
  cert_id integer NOT NULL REFERENCES payment_certs(id),
  contract_id integer NOT NULL REFERENCES contracts(id),
  project_id integer NOT NULL REFERENCES projects(id),
  org_id integer NOT NULL REFERENCES organizations(id),
  actor_id integer NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result_status text NOT NULL CHECK (result_status IN ('pending', 'approved', 'rejected')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cert_id, operation_id)
);
ALTER TABLE payment_cert_decision_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_cert_decision_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY ipc_snapshot_read ON payment_cert_decision_snapshots FOR SELECT
  USING (
    org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND project_id = NULLIF(current_setting('app.project_id', true), '')::integer
  );
CREATE POLICY ipc_snapshot_insert ON payment_cert_decision_snapshots FOR INSERT
  WITH CHECK (
    org_id = NULLIF(current_setting('app.org_id', true), '')::integer
    AND project_id = NULLIF(current_setting('app.project_id', true), '')::integer
    AND actor_id = NULLIF(current_setting('app.user_id', true), '')::integer
  );
GRANT SELECT, INSERT ON payment_cert_decision_snapshots TO xboss_app;
```

pending là kết quả bước approval engine trong snapshot, không thêm pending vào enum IPC.
Mỗi quyết định mới operationId mới; retry key/hash cũ trả cùng kết quả bước, không tự chạy
bước sau. Không UPDATE snapshot pending thành approved. API kiểm CAN/SoD trước cả replay.

Snapshot có warningVersion/ack/reason, entity/source versions, step, qty/price/rate/basis/
amount strings và ruleVersion. Transition, audit và snapshot cùng transaction dưới contract/
cert locks. Khác payload cùng key conflict. FK đơn không chứng minh cert/contract/org/project
cùng nhau; service kiểm mọi parent dưới khóa và cấm reparent hồ sơ chốt phá nguồn gốc.

Không HTTP UPDATE/DELETE snapshot, audit effective grants. Privileged maintenance có audit,
không sửa history để khớp giá hôm nay. Nếu engine hiện có thực sự đáp ứng toàn bộ contract,
dùng adapter và test tương đương; ghi kết quả so sánh ở S00, không hai nguồn truth độc lập.

## 8. Bàn giao

Mọi migration phải fresh/repeat/catalog check, RLS role app, exact provenance/biên DB,
manifest/revocation/rotation và immutable snapshots được test. ERD sinh tự động khi áp thật.
Không phát hành DDL thiếu validator/policy/grants/transaction/caller migration. Role xboss_app
đã có nhưng phải kiểm effective quyền thực, không tự cấp BYPASSRLS để test chạy được.

Đây vẫn là thiết kế chưa chạy. Catalog/data reconciliation, benchmark,54AC và production
readiness cần bằng chứng lúc thi hành; không biến việc có SQL cụ thể thành dữ liệu đã sạch.
