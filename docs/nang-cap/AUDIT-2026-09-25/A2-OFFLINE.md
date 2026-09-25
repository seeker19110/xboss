# A2 — Offline an toàn và không tự mất bản nháp

State: **Approved for implementation**, QUALITY-FINAL-1, 2026-09-25; thi hành sau.
Decisions D02/D03/D04; API/DDL/crypto ở DATA-CONTRACTS, nguồn thực tế ở SOURCE-MAP.

## 1. Hiện trạng, phương án và outcome

SW v19 cache API/HTML theo URL, queue v1 không owner/org/project, diary dedup theo ngày;
IDB chờ request success; singleton flush chỉ một tab; 4xx bị bỏ.
Chọn network-only cho nhạy cảm, context version hóa, vault mã hóa và server receipt.
Không chọn cache chung, logout xóa draft mặc định hoặc chỉ thêm Cache-Control rồi coi đã sửa.
Không thay framework hoặc phụ thuộc browser chạy background mãi mãi.

## 2. Cache/context requirements

A2-FR01: auth/quyền/users/tài chính/payment/payroll/export/private documents/signed URLs/
HTML-RSC cá nhân hóa/SSE/health/version network-only. 401/403/409 từ mạng không được trả
stale200. Chỉ same-origin200 đúng content type, không redirect/opaque mới đủ điều kiện cache.
Cache-Control được SW chủ động kiểm; không tự động cache mọi /api rồi duy trì denylist.

A2-FR02: immutable assets và /offline không PII cache riêng; chỉ purge namespace XBoss cũ.
Allowlist tracking tối thiểu có schemaVersion, contextId, generation, resourceKey, query,
fetchedAt và expiresAt. Response muộn của generation cũ không render/cache/flush.
Không dùng ignoreSearch, không lưu token trên URL. Payload cá nhân được bảo vệ như vault,
không dùng HTML offline chứa dữ liệu session.

A2-FR03: một active project chung cho browser do cookie dùng chung. Tab A switch thì tab B
khóa context, hủy fetch/SSE và tải lại sau xác minh. Server kiểm X-XBoss-Context, không ghi
request cũ sang project cookie mới. MessageChannel ACK, BroadcastChannel và storage fallback
chỉ mang correlation/epoch, không mang PII. ACK timeout3s khóa, không coi cleanup đã xong.

A2-FR04: shared-safe lease15min; field-personal lease8h chỉ admin cùng org chấp thuận device
đúng owner. New/cold browser, SW mất context hoặc clock rollback phải online xác minh lại.
Context mapping SW theo clientId và generation, không chỉ một biến global cho mọi tab/user.
Online revalidate trước đọc/flush khi app resume; offline hết lease khóa cả read và sender.
Không hứa biết server đã revoke khi mạng hoàn toàn mất; profile8h là đánh đổi có kiểm soát.

## 3. Vault và queue contract

A2-FR05: payload mới mã hóa AES-256-GCM, khóa memory-only, ownership và AAD theo DATA-CONTRACTS.
Logout giữ ciphertext chưa giải quyết, xóa cache đọc và khóa session của mọi tab; chính chủ
online xác thực lại để unlock. Không persist token/raw key/non-extractable CryptoKey vào IDB.
Không tự export draft; explicit discard có xác nhận. Đổi KEK/password không tự làm mất draft.
Quyền tài nguyên bị thu hồi phải chặn unlock dữ liệu không còn được phép, không chỉ so userId.

Envelope đích cho bốn kind tick/tick_batch/photo/diary_note:

```ts
type QueueEnvelope = {
  schemaVersion: 2;
  operationId: string;
  vaultKeyId: string;
  ownerUserId: number;
  orgId: number;
  projectId: number;
  deviceId: string;
  sequence: number;
  queuedAt: number;
  tries: number;
  nextAttemptAt: number;
  state: "pending" | "sending" | "paused_auth" | "conflict" | "rejected";
  iv: string;
  ciphertext: string;
};
```

BaseVersion, resource/date/caption/blob metadata và business payload ở bên trong ciphertext;
không lưu cả bản plaintext để tiện dedup. Khi active, giải mã trong memory để dedup; metadata
index tối thiểu có thể dùng opaque digest không tiết lộ resource. Sequence được cấp trong
cùng IDB transaction; không lấy clock client làm thứ tự đáng tin cho nghiệp vụ server.

A2-FR06: dedup chỉ cùng owner/org/project/resource, chưa có thể gửi. Op đã gửi/không rõ ACK
không được sửa payload dưới cùng operationId. Batch giao một phần không được xóa cả batch
mất ô khác; giữ thứ tự theo resource. Op đang conflict/đợi retry chặn op sau cùng resource,
không chặn resource độc lập vô ích.

A2-FR07: dedup+enqueue cùng IDB transaction; chỉ báo “đã lưu trên thiết bị” sau complete.
Abort/quota/blocked-upgrade trả lỗi, giữ form không báo thành công; connection đóng khi
versionchange. Upgrade v1/v2 chỉ sau kiểm phiên bản catalog local thật; không drop DB cưỡng bức.
Giữ quota ảnh50MiB, kiểm tổng vault đang tồn, không xóa dữ liệu người khác để lấy chỗ.
Storage eviction/mất máy có thể mất draft local; UI không gọi nó là server backup.

A2-FR08: legacy v1/localStorage thiếu owner được quarantine, không auto-assign/flush/delete.
Không trình bày plaintext legacy cho người mới. Cutover yêu cầu đối soát legacy trên từng
thiết bị; không biết chủ thì giữ cách ly và báo blocker riêng, không bịa ownership từ date/ID.

## 4. Replay, conflict và nhiều tab

A2-FR09: actor/org/project/device/permission server xác minh trước lookup receipt. Cùng key/
hash replay ACK, hash khác409; mutation/audit/receipt cùng transaction. Photo staging có
orphan reconciliation; không tuyên bố exactly-once delivery, chỉ một hiệu ứng cho cùng key.
Không xóa dedup key khi replay vẫn được chấp nhận. Kho không phải receipt thay cho queue này.

A2-FR10:2xx đúng operationId rồi mới xóa local sau transaction complete.401 paused_auth;
403/404/422 rejected có lý do bền vững, không retry vô hạn hoặc mất draft âm thầm;
409/412 conflict giữ local;428 yêu cầu phiên bản;429 giữ op theo Retry-After giây/HTTP-date;
network/408/5xx retry backoff exponential+jitter, trần5min. Không retry mù lỗi business.

A2-FR11: nhật ký PUT full-replace yêu cầu If-Match strong version, record mới If-None-Match:*;
server so version dưới lock rồi mutate. Conflict hiển thị local/server chỉ sau kiểm quyền,
người dùng quyết định merge/replace và tạo operationId mới. Không timestamp client-as-version.
Receipt replay hợp lệ trước kiểm If-Match hiện tại, tránh từ chối thao tác đã commit.

A2-FR12: lease IDB cross-tab30s, renew10s, fencing token; check token trước/sau network.
Tab chết/lease hết/mất ACK có thể tạo duplicate delivery nhưng receipt không tạo duplicate
business effect. Dùng foreground/online/poll fallback; không dựa vào Web Locks/Background Sync.

## 5. Journeys, acceptance và observability

UNKNOWN → VERIFYING → ACTIVE → INVALIDATING → VERIFYING; failure → LOCKED.
Chỉ ACTIVE đọc dữ liệu/flush. Loading không lóe data trước; empty khác vault bị khóa;
hiển thị local/server/sending/conflict/rejected. Màn recovery có keyboard/focus/aria-live,
mobile và theme đúng. Logout local offline không được mô tả như server đã revoke token.

A2-AC01: A logout/B login cùng URL/offline không thấy dữ liệu/draft/khóa của A.
A2-AC02: switch khi response/SSE đang bay không áp data cũ hoặc ghi nhầm project.
A2-AC03: diary cùng ngày khác project/owner và batch giao nhau không mất thao tác.
A2-AC04: hai tab/crash/mất ACK/20 replay cùng key chỉ một hiệu ứng; đổi payload bị409.
A2-AC05: IDB request success rồi abort không báo lưu; dedup+enqueue nguyên tử.
A2-AC06:401/409/412/428/429/5xx/rejected đúng state, không toast xong rồi mất draft.
A2-AC07: legacy unknown-owner/upgrade/quota không auto nhận chủ/xóa/mất batch.
A2-AC08: SW restart/timeout/broadcast thiếu/Safari foreground vẫn an toàn.
A2-AC09: hết lease hoặc online bị revoke không stale200; tài chính luôn network-only.
A2-AC10: diary conflict không overwrite; photo retry/orphan có đối soát.
Q-AC02/03 kiểm vault wrong-owner, thay AAD, profile giả, key rotation và expiry.

Metrics: context_mismatch, cleanup_timeout, idb_abort, receipt_replay, queue_state, archive
of unresolved conflicts; không log key/payload. Thu hồi quyền không tự xóa ciphertext chưa
đối soát. Telemetry báo vault/key không thể mở, không giả nội dung đã mất vĩnh viễn.

## 6. Rollout/rollback

S04 network-only/purge trước; S05 server context/vault rồi S06 receipt/precondition;
S07 migration/encrypted queue; S08 UI/allowlist/browser acceptance sau. Chưa backend đúng
contract thì không bật queue mới. Legacy plan là gate vận hành, không hạ thành warning bỏ qua.
Rollback về client hiểu queue2 hoặc dừng sender, giữ vault/receipt/schema; không quay về SW
cache chung hay client xóa draft. Dừng khi rò dữ liệu, sai ownership, crypto failure hoặc mất
thao tác đã ACK lưu do lỗi ứng dụng. Mọi test browser/DB thật theo TEST-MATRIX, chưa chạy
thì NOT_RUN chứ không lấy CI của PR tài liệu làm bằng chứng.
