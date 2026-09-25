# A2 — Cache, offline queue và đổi ngữ cảnh an toàn

State: In review. Phụ thuộc A1 cho context server; S00 cho registry cache/queue/endpoint.
Hợp đồng chung và nguồn S03/S04/E01/E02: README.md. Chưa triển khai trong PR tài liệu.

## 1. Vấn đề và lựa chọn

SW baseline dùng một cache `xboss-v19`, API GET stale-while-revalidate theo URL.
CLEAR_CACHE chỉ xóa mục /api/; HTML cũng được cache. Queue `xboss-offline` v1 có store ops,
QueuedOp không có user/org/project; nhật ký dedup theo date; phần gửi dùng cookie hiện tại.
Logic coi mọi 4xx không retry. Store chờ request success, chưa chờ transaction complete.
Singleton chống flush chỉ trong một tab. Đây là điểm cần tái hiện với hai tài khoản/dự án/tab.

Không làm hoặc chỉ thêm no-store không đủ. Chọn hai lớp: bản chặn cache nhạy cảm trước;
sau đó allowlist cache theo context và queue có ownership/idempotency. Không chuyển framework,
không hứa đồng bộ nền khi mọi tab đóng hoặc khi browser không hỗ trợ.

## 2. Chính sách cache đích

A2-FR01: auth/me/login/logout/2FA, users/permissions, tài chính, payment, payroll, file export,
URL ký truy cập, tài liệu riêng tư, SSE/version/health luôn network-only, không stale fallback.
Trả 401/403/409 từ mạng thì phải tôn trọng ngay; không che bằng bản cache 200 cũ.
Cache-Control no-store được SW kiểm chủ động; không cho rằng Cache Storage tự thi hành nó.

A2-FR02: asset immutable và /offline không chứa PII được cache riêng. Không cache HTML/RSC
có nội dung cá nhân hóa. S00 xác minh từng response; chưa chứng minh vô danh thì network-only.
Lần nâng cấp xóa đúng cache namespace XBoss cũ, không xóa dữ liệu ứng dụng khác trên cùng origin.
Phải chặn response đang bay ghi lại vào namespace vừa bị xóa bằng generation/tombstone.

A2-FR03: offline đọc nghiệp vụ chỉ bật cho allowlist nhỏ, trước hết dữ liệu tracking tối thiểu
đã kiểm quyền. Không mở wildcard /api/*. Mỗi entry có schemaVersion, contextId, generation,
resourceKey, fetchedAt và expiresAt; query string đầy đủ tham gia khóa, không ignoreSearch.
Chỉ nhận response same-origin 200, loại nội dung đúng, không redirected/opaque; không lưu
response lỗi, stream hoặc request có credential/token trong URL.

A2-FR04: context được bootstrap online từ server sau auth và resolve project; gồm opaque
contextId gắn user+org+session_version+project+permission revision. Không dùng userId do client
tự khai làm bằng chứng xác thực. ContextId chỉ là ràng buộc/correlation, không thay cookie/token.
Mỗi response cacheable có contextId/generation mà client đang đợi; mismatch thì bỏ, không
hiển thị và không cache. Với request queue dùng context mới sau khi xác thực lại ownership.

A2-FR05: bản đầu hỗ trợ **một dự án hoạt động chung trong cùng phiên browser**, phù hợp cookie
lựa chọn dùng chung; không giả vờ hai tab đang có hai cookie project riêng. Đổi project ở tab A
phải invalidation tab B, hủy request/SSE và UI cũ trước khi tải mới. Tab B cũ gửi expectedContext
thì server trả 409 context_changed, tuyệt đối không ghi vào project mới theo cookie mới.

A2-FR06: offline đọc chỉ trong context đã xác minh của phiên đang mở; đề xuất lease tối đa
15 phút từ lần xác minh online. Hết lease hoặc SW restart mà mất context map: fail closed,
hiện shell không dữ liệu, yêu cầu mạng để xác minh lại. Không suy danh tính từ cache /auth/me.
Đây là đánh đổi an toàn cho thiết bị dùng chung; offline đọc qua restart dài hạn ngoài scope.
Thu hồi quyền trên server không thể được biết ngay khi thiết bị mất mạng; lease là giới hạn
phơi lộ đề xuất, không là lời hứa thu hồi tức thời. Owner duyệt lease trong APPROVAL.

## 3. Đổi tài khoản, project, logout và SSE

State machine: UNKNOWN → VERIFYING → ACTIVE → INVALIDATING → VERIFYING; lỗi → LOCKED.
Chỉ ACTIVE được đọc cache/flush. Trình tự đổi context: tăng generation và khóa UI/sender;
hủy fetch/SSE cũ; broadcast tới các tab; xác minh server; nhận ACK SW theo requestId;
chỉ sau đó tải dữ liệu mới. Response muộn thuộc generation cũ luôn bị bỏ.
ACK timeout 3 giây là mục tiêu đề xuất: dùng network-only/LOCKED, không giả định xóa đã xong.
Dùng MessageChannel ACK, BroadcastChannel khi có và fallback sự kiện storage không mang PII.
SSE connect lại sau khi context hợp lệ; sự kiện context cũ không được áp lên UI mới.

Logout khi còn draft: cho hủy logout để đồng bộ/giải quyết trước, hoặc xác nhận bỏ draft và
xóa local. Không tự xuất nhật ký/ảnh nhạy cảm ra file. Khi người dùng chọn logout thật, khóa
các tab, dừng sender, xóa cache cá nhân/draft cũ, hủy session server khi có mạng và xác nhận
cleanup trước khi mở nội dung tài khoản mới. Lỗi cleanup giữ LOCKED và hướng dẫn xóa dữ liệu
site; không báo thành công giả. Khi mất mạng, logout cục bộ không được mô tả là đã thu hồi
session server. Lần online tiếp theo phải hoàn tất xác thực/logout server trước cấp context.
Không giữ plaintext draft người A cho người B xem; namespace không chống XSS/devtools và
không được quảng cáo như mã hóa. Gia cố XSS vẫn thuộc hàng rào chung.

## 4. Contract queue, ownership và storage

Giữ bốn kind hiện có: tick, tick_batch, photo, diary_note. Bản ghi đích bổ sung:

```ts
type QueueEnvelope = {
  schemaVersion: 2;
  operationId: string; // UUID, không thay qua các lần retry
  ownerUserId: number;
  orgId: number;
  projectId: number;
  sessionGeneration: string;
  baseVersion: string | null; // strong ETag tài nguyên, không phải client clock
  sequence: number;
  state: "pending" | "sending" | "paused_auth" | "conflict" | "rejected";
  queuedAt: number;
  tries: number;
  nextAttemptAt: number;
};
```

Envelope nối với union payload hiện có, không dùng any và không lưu token/mật khẩu.
Dedup chỉ cùng owner/org/project/resource, chưa gửi và chưa có receipt; không dedup hai nhật
ký cùng date khác project. Batch tick giao nhau giữ FIFO để không mất ô ngoài phần giao.
Op cùng resource bị chặn thì các op sau cùng resource không vượt lên; resource độc lập được tiếp.
Không thay payload của một operationId đã có thể gửi; chỉnh sau conflict tạo operationId mới.

IndexedDB nâng v2 sau đối chiếu phiên bản thật; store ops vẫn tương thích migration transaction,
thêm index context+state+sequence và store meta cho lease/epoch. Chỉ báo “Đã lưu trên thiết bị”
khi transaction.oncomplete. onabort/quota/versionchange phải trả lỗi và giữ form trong bộ nhớ;
không hiển thị thành công. Các thay đổi dedup+enqueue nằm trong một transaction nguyên tử.
Đóng connection khi versionchange; xử lý upgrade blocked có thông báo, không xóa DB cưỡng bức.

Queue v1/localStorage không có owner: không gán tự động cho tài khoản đang login. Quarantine,
không flush và không hiển thị nội dung cho người mới. Owner vận hành phải chọn cách xử lý
trước rollout: ở thiết bị cũ đồng bộ hết trước upgrade; phần còn lại cần xác nhận bỏ hoặc
quy trình khôi phục được kiểm chứng riêng. Không hứa nhận diện chủ draft chỉ từ dimId/date.
Giữ giới hạn ảnh hiện có 50 MiB, kiểm quota chung lẫn theo context; không âm thầm xóa draft.

## 5. Gửi lại, cạnh tranh và contract HTTP

Mỗi request migrated gửi `Idempotency-Key: <operationId>` và expected context server cấp.
Project trong envelope phải qua A1; actor lấy từ session server và phải bằng ownerUserId.
Session đổi nhưng cùng actor/org/project: xác minh online và lấy context mới trước retry;
không tự chuyển op sang actor khác. Server kiểm auth/quyền trước cả lookup receipt.

2xx: chỉ xóa op sau ACK đúng operationId và lưu trạng thái local thành công.
401: paused_auth, giữ draft. 403/404/422: rejected, không retry tự động, có lý do và thao tác
bỏ rõ ràng; che payload nếu quyền bị mất. 409/412: conflict, không ghi đè; nhật ký cho so sánh
bản server với bản local sau kiểm quyền. 429: giữ op, tôn trọng Retry-After.
Network/408/5xx: retry backoff exponential hiện có, trần 5 phút, thêm jitter; không busy loop.
Retry-After parse cả số giây/HTTP-date, giá trị lỗi dùng backoff; không xóa khi rate limited.

Nhật ký full-replace bắt buộc strong ETag/If-Match; token tính từ trạng thái canonical server
trong cùng khóa transaction với write. Record mới dùng điều kiện create-if-absent. Missing
precondition trên đường offline migrated trả 428. Không dùng thời điểm client làm version.
Tick batch vẫn nguyên tử và vẫn qua hold-point/assignment; offline không được vượt gate.
Ảnh dùng operationId/digest cho upload staging; commit metadata và receipt nguyên tử, file
mồ côi được thu gom có kiểm tra, không tuyên bố transaction DB bao trùm object storage.

Mutex một tab chưa đủ: lease IndexedDB có ownerTabId, expiry và fencing token để hai tab
không cùng flush; lease 30 giây/renew 10 giây là default đề xuất. Check token trước/sau send;
server idempotency là hàng rào cuối khi lease hết hoặc tab chết. Không đặt toàn bộ correctness
lên Web Locks/Background Sync. Kiểm Safari thật và đường fallback foreground khi mở lại app.

## 6. DDL đề xuất cho receipt nếu chưa có cơ chế tương đương

S00 phải kiểm idempotency hiện hữu trước khi thêm. DDL sau là migration thiết kế mới,
không chạy trong PR tài liệu; cần owner schema và policy RLS review:

```sql
CREATE TABLE audit_operation_receipts (
  operation_id uuid NOT NULL,
  user_id bigint NOT NULL REFERENCES users(id),
  org_id bigint NOT NULL REFERENCES organizations(id),
  project_id bigint NOT NULL REFERENCES projects(id),
  operation_kind text NOT NULL CHECK (operation_kind IN
    ('tick', 'tick_batch', 'photo', 'diary_note')),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  result_version text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, project_id, user_id, operation_id)
);
CREATE INDEX audit_operation_receipts_completed_idx
  ON audit_operation_receipts (completed_at);
ALTER TABLE audit_operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_operation_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_receipts_context ON audit_operation_receipts
  USING (
    user_id = NULLIF(current_setting('app.user_id', true), '')::bigint
    AND org_id = NULLIF(current_setting('app.org_id', true), '')::bigint
    AND project_id = NULLIF(current_setting('app.project_id', true), '')::bigint
  )
  WITH CHECK (
    user_id = NULLIF(current_setting('app.user_id', true), '')::bigint
    AND org_id = NULLIF(current_setting('app.org_id', true), '')::bigint
    AND project_id = NULLIF(current_setting('app.project_id', true), '')::bigint
  );
```

Dùng role ứng dụng chỉ có SELECT/INSERT cần thiết; không cho client UPDATE/DELETE receipt.
Policy không có nhánh '*'. Service xác minh user.org và project.org trong cùng transaction;
FK độc lập ở đây không tự chứng minh ba đối tượng cùng org. Tên/kiểu FK cần đối chiếu catalog.
Migration idempotent theo runner hiện có, kiểm object tồn tại có đúng định nghĩa; không dùng
IF NOT EXISTS để bỏ qua schema khác mong đợi.

Protocol: advisory transaction lock theo tuple key → kiểm receipt → nếu cùng hash thì trả
ACK replay sau auth; khác hash trả 409 idempotency_conflict → nếu chưa có thì kiểm business
precondition, thực hiện mutation, INSERT receipt hoàn tất, COMMIT. Không commit placeholder
“đang xử lý”. Mất ACK sau COMMIT rồi retry chỉ trả lại kết quả, không làm lại side effect.
Hash canonical gồm kind+scope+target+payload+baseVersion; ảnh dùng SHA-256 bytes và metadata.
Không lưu nguyên nội dung nhật ký/ảnh trong receipt. Không xóa key receipt trong thời gian
còn dữ liệu nghiệp vụ có thể replay; compact thành tombstone tối thiểu nếu cần retention.
TTL xóa dedup key mà vẫn nhận replay cũ bị cấm; đề xuất retention phải có owner duyệt riêng.

## 7. Acceptance, test và vận hành

A2-AC01: A tải tracking, logout, B login cùng URL/offline: B không thấy data/draft của A.
A2-AC02: cùng user đổi project, response cũ về sau switch: không render/cache/flush sai scope.
A2-AC03: nhật ký cùng ngày ở hai project giữ riêng; đổi cookie không đổi project của op.
A2-AC04: hai tab, crash sender/mất ACK, 20 lần retry cùng key: một hiệu ứng DB/audit/ảnh.
A2-AC05: transaction IDB abort sau request success không được báo đã lưu.
A2-AC06: 401/409/429 giữ đúng state; op rejected không biến mất bằng một toast thoáng qua.
A2-AC07: v1 không owner không được tự nhận chủ; migration lặp không nhân đôi op; quota đầy
không xóa data. Không xóa batch nhiều ô chỉ vì giao một ô với thao tác mới.
A2-AC08: SW restart, tab cũ, mất BroadcastChannel/Background Sync, Safari/Chromium đều fail
closed hoặc dùng fallback đã nêu; không có ACK thì không coi cleanup thành công.
A2-AC09: quyền bị thu hồi online thì không stale fallback; offline lease hết khóa dữ liệu.
A2-AC10: conflict diary không full-replace bản người khác; ảnh mồ côi được báo và thu gom an toàn.

File hiện có: public/sw.js, app/components/offlineQueue/{index,logic,store}.ts,
app/lib/me.ts, lib/ha-tang/projects.ts và các endpoint từ opEndpoint trong logic.ts.
Context bootstrap/header, receipt service, UI conflict và test mới là hạng mục cần xây.
S00 xác định call-site đăng nhập/logout/switcher/SSE thực tế, không grep thay test browser.
Metric: context_mismatch, cache_blocked, queue_paused/conflict/retry, receipt_replay,
cleanup_timeout, idb_abort. Không log nội dung op. UX phân biệt lưu cục bộ/đã đồng bộ.

Rollout: chặn cache nguy hiểm và dọn cache cũ trước; backend context/receipt trước queue v2;
client migrated sau; allowlist cache offline chỉ mở cuối khi matrix xanh. Có khoảng chuyển
sang network-only được thông báo, không gọi đó là mất draft chấp nhận được.
Rollback client chỉ về phiên bản hiểu queue v2 hoặc tạm ngừng flush; không quay về SW v19
phục vụ cache chung. Giữ receipt schema/data khi rollback code. Xử lý queue legacy là go/no-go.
Approval: lease đọc, chính sách logout/draft legacy và receipt retention phải được ký ở APPROVAL.
