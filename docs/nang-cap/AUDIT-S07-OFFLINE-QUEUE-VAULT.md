# S07 — hàng đợi offline v2: vault và IndexedDB nguyên tử

State: **Approved for implementation**.
Chủ dự án duyệt QUALITY-FINAL-1 (2026-09-25) và yêu cầu thi hành tiếp lộ trình ngày 2026-10-08.
Spec cha: [A2 Offline](AUDIT-2026-09-25/A2-OFFLINE.md) (A2-FR05, FR09..FR12), [DATA-MIGRATIONS §2, §5](AUDIT-2026-09-25/DATA-MIGRATIONS.md),
[DATA-CONTRACTS §5, §7](AUDIT-2026-09-25/DATA-CONTRACTS.md), APPROVAL D03/D04, PLAN §S07, TEST-MATRIX
A2-AC01..AC07/AC10, Q-AC02. Nền: [S05](AUDIT-S05-OFFLINE-VAULT.md) (thiết bị/context/khoá vault),
[S06](AUDIT-S06-OFFLINE-RECEIPT.md) (receipt/precondition). Đây là phạm vi con, không thay contract của
đặc tả cha. Không thêm dependency, không migration server.

## Phạm vi và contract

- Chỉ client: `app/components/offlineQueue/{logic,store,index,vault}.ts` + điểm gọi tối thiểu ở lưới
  tracking/ảnh/modal nhật ký. **Không** làm UI phục hồi đầy đủ (S08): trạng thái đọc được qua
  `useOfflineQueueStatus` (pending/failed/conflict/rejected/pausedAuth/locked/legacy/vault) + toast.
- **Envelope v2** (A2-FR05) mỗi op một bản ghi: `operationId` (UUID, = `Idempotency-Key`),
  `vaultKeyId`, `ownerUserId`, `orgId`, `projectId`, `deviceId`, `sequence`, `queuedAt`, `tries`,
  `nextAttemptAt`, `state` (`pending|sending|paused_auth|conflict|rejected`), `iv`, `ciphertext`. Trường
  định tuyến rõ thêm: `owner` (`user|org|device` cho index), `kind`, `bytes` (quota), `sendingToken`,
  `lastResult` (chỉ HTTP status + mã lỗi máy, không lưu message). Payload (kể cả byte ảnh, ngày nhật
  ký, etag, dimId) chỉ nằm trong ciphertext.
- **Mã hoá** AES-GCM bằng DEK của S05 (`/api/offline/vault/unlock`, `nhapDekBoNho` non-extractable,
  chỉ trong bộ nhớ, byte DEK thô bị xoá sau import). AAD = `aadPayload` của `lib/nen/offline-crypto`
  (keyId/manifestHash/owner/org/project/device/keyVersion/operationId/kind/sequence). Giải mã sai chủ
  → từ chối trước khi chạm crypto; sửa trường AAD → hỏng xác thực, không fallback bản rõ.
- **Vault client** (`vault.ts`): chỉ ACTIVE sau khi xác minh online `/api/auth/me` → `/api/offline/context`
  (403 `device_unregistered` → `POST /api/offline/devices` rồi thử lại) → unlock → `/api/auth/me` lần
  nữa (actor phải trùng). Lease context đo bằng đồng hồ đơn điệu + đồng hồ tường; đồng hồ lùi > 5 s
  hoặc hết lease → khoá; còn < 60 s thì làm mới context (có mạng). Đổi ngữ cảnh (`ngheDoiNguCanh`) →
  khoá vault + dừng gửi. Khoá cho tài nguyên: manifest S05 (≤ 500 task, `taskActions ["photo","tick"]`;
  nhật ký cửa sổ theo tháng) xin trước khi mất mạng; subcon chỉ task được giao.
- **IndexedDB** `xboss-offline` v2: thêm `ops2` (keyPath `operationId`, index `owner`, `ownerUserId`) và
  `meta` (keyPath `k`: `queue` = rev/lastSeq/photoBytes, `lease|…` = lease). Store v1 `ops` **giữ nguyên,
  không đọc nội dung, không xoá, không tự nhận chủ** — chỉ đếm để báo `legacy`. Nâng cấp kiểm catalog
  (keyPath/index sai → huỷ nâng cấp); `blocked`/`VersionError` → lỗi rõ; `versionchange` → đóng kết nối.
- **Nguyên tử**: "đã lưu" chỉ khi transaction `complete`; abort sau request success (quota/đĩa) →
  thất bại. Mã hoá không chạy được trong transaction IDB → dedup+enqueue dùng **OCC trên `meta.rev`**:
  đọc snapshot → mã hoá ngoài → một transaction kiểm rev + sequence = lastSeq+1, xoá op bị thay và
  ghi op mới; lệch → làm lại (tối đa 6 lần). Dedup chỉ thay op **chưa từng gửi** (`pending`, tries 0).
- **Lease/fencing** trong `meta` (không dựa Web Locks): TTL 30 s, gia hạn 10 s, token tăng ở mỗi kỳ
  lease mới (người khác, hoặc chính tab sau khi lease hết/đã trả). Kỳ mới đưa op `sending` mồ côi về
  `pending` với cùng operationId (server dedup bằng receipt). Mọi ghi kết quả kiểm holder+token.
- **Gửi**: `Idempotency-Key` = operationId (cố định qua mọi retry), `X-XBoss-Context`; nhật ký gửi
  `If-Match` bằng etag lúc enqueue (không có etag → `If-None-Match: *`). FIFO theo tài nguyên
  (`dim:<id>`, `diary:<ngày>`, `photo:<operationId>`): op `pending` chưa tới hạn/`sending`/`conflict`/
  `paused_auth` chặn op sau cùng tài nguyên; `rejected` và op không giải mã được không chặn.
- **Phân loại kết quả** (A2-FR10): 2xx có `receipt.operationId` khớp → xoá; 2xx không receipt khớp →
  `conflict` (giữ); 401 → `paused_auth`; 409 `context_*` → khoá/xác minh lại context, giữ `pending`;
  409/412/428 khác → `conflict`; 429/503 → theo `Retry-After` (giây hoặc HTTP-date); 408/5xx/lỗi mạng
  → backoff mũ có jitter (2 s·2^(n−1), trần 5 phút); 4xx khác (400/403/404/413/422) → `rejected` (giữ).
  Không TTL, không tự xoá op `conflict`/`rejected`. Xoá chỉ khi người dùng lưu online thành công bản
  nhật ký cùng ngày (`discardDiaryDraft`, hành động tường minh).
- Quota ảnh 50 MiB (tính trên ciphertext thật) kiểm trong transaction enqueue.
- `OFFLINE_QUEUE_QUARANTINED` = **false** (gỡ quarantine) — giữ làm công tắc dừng khẩn cấp: bật lại thì
  không đọc/ghi storage, không mở vault, không gửi, enqueue báo thất bại.

## Tiêu chí chấp nhận

- Q-AC02/A2-AC01: B cùng trình duyệt không giải mã/đọc/gửi được op của A; IDB không chứa bản rõ.
- A2-AC04: hai tab flush đồng thời → mỗi op gửi đúng một lần; lease hết giữa chừng → tab mới gửi lại
  cùng key, kết quả muộn của tab cũ bị bỏ; mất ACK → replay route thật một hiệu ứng.
- A2-AC05: request success rồi abort/quota → không báo lưu, không ghi gì; dedup+enqueue nguyên tử.
- A2-AC06/AC10: 401/409/412/428/429/5xx/rejected đúng state, conflict/rejected bền qua khởi động lại;
  nhật ký 412 trên route thật giữ op `conflict`.
- A2-AC07: legacy v1 không tự nhận chủ/không xoá; nâng cấp catalog sai/blocked/VersionError báo lỗi.
- Đổi dự án → op dự án cũ không bị gửi bằng context mới.
- `test:mutation`: 10 mutation S07 (conflict, receipt 2xx, dedup chưa gửi, key cố định, If-Match,
  FIFO, chủ vault, commit IDB, lease, fencing) đều bị bắt.

## Cần quyết (chưa làm trong S07)

- Server đối chiếu op hàng đợi với manifest khoá vault (`keyId`) — contract chưa định header/trường
  mang keyId lên server; không tự chế.
- Request online (không header) chưa kiểm `X-XBoss-Context` server-side (S08 hoặc lát riêng).
- Op không giải mã được (khoá cũ đã thu hồi/rotate) không chặn FIFO → op mới hơn cùng ô có thể đi
  trước; chờ quyết định "khoá FIFO hay bỏ qua" cùng UI phục hồi S08.
- UI xử lý `conflict`/`rejected`/`legacy` (xem, gửi lại, huỷ có xác nhận) và đối soát legacy theo thiết
  bị (D03) — S08/vận hành.
- E2E trình duyệt (mất mạng → enqueue → có mạng → flush) **NOT_RUN** ở S07 (build production cục bộ
  không dựng được trong worktree); job e2e của CI chưa có `XBOSS_OFFLINE_KEK` nên vault tắt — cần
  thêm biến này trước khi viết spec browser (S08 browser acceptance).
