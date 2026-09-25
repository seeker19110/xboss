# Test matrix — 54 AC của QUALITY-FINAL-1

State: **Approved for implementation**, ngày 2026-09-25; thi hành sau.
**Trạng thái bằng chứng của toàn bộ AC dưới đây: NOT_RUN trong đợt chốt tài liệu này.**
Không lấy CI của PR docs hoặc các test đợt1 làm bằng chứng đã triển khai A1–A6/vault/PITR.

54 AC gồm 46 AC nền đã chỉnh đúng quyết định nghiệp vụ và 8 AC chất lượng bổ sung.
Đặc biệt A5-AC04/05 thay hard-cap IPC của v1 bằng cảnh báo, acknowledgement và serialization;
không xóa test để giảm yêu cầu, mà sửa tiêu chí đang trái quyết định người dùng 2026-09-04.

## 1. Lớp bằng chứng và record

U: unit/property; P: PostgreSQL thật; H: HTTP/auth thật; B: browser SW/IDB/network thật;
M: UAT trên thiết bị/browser ghi phiên bản; O: restore/operation đích được phép.
Stub/VM không thay P/H/B; Chromium emulation không thay Safari/iOS thật.

Mỗi record: AC ID, slice, spec version, main/HEAD SHA, test name/path, command, fixture
seed/hash, DB role/version, browser/OS, expected/actual, PASS/FAIL/NOT_RUN, artifact URL,
thời điểm và reviewer. Critical NOT_RUN/skip không được tính PASS. Không nhận evidence SHA
cũ sau đổi code/fixture. Không tự ghi chữ ký reviewer hoặc người vận hành.

S00 tạo fixtures bằng IDs DB cấp, không hardcode FK1, không tắt constraint để dựng lỗi giả.
Tests chạm DB import tests/setup.ts trước; owner chuẩn bị fixture và app NOBYPASSRLS thi hành.
Test đúng quyền phải có dữ liệu đúng, không chỉ test sai quyền trả rỗng. Provider thật/paid
provider/production DB không được dùng trong tests. Evidence không chứa keys/PII/payload.

## 2. Fixtures chung

F-SCOPE: hai org, mỗi org ít nhất hai project; đủ7 role; memberships/override deny khác nhau;
empty membership, role/scope trùng tên giữa org, token đổi org/revoked, parent lineage mâu thuẫn.

F-OFFLINE: hai account, hai tab trong cùng browser cookie và browser contexts tách biệt;
URL/ngày nhật ký trùng; delayed response/SSE; switch/logout; SW restart/update, IDB abort/
quota/upgrade-blocked, thiếu broadcast/background sync, lease expiry và clock rollback.
Vault đúng/sai owner, resource manifest bị sửa/quyền resource bị thu hồi, key rotation,
proof browser dùng chung nhưng device record khác actor, legacy không owner.

F-MONEY: amount0/âm/±0.005, aggregate vượt safe integer, row numeric15,2 biên,
10.000 dòng0.01, quantity3/4/6 chữ số, float legacy hữu hạn/nonfinite, nested JSON numeric;
two lines qty0.001 nhân price5.00 kiểm ipc-sum-v1 period0.01 không0.02.

F-REPORT: nguồn BOQ/VO/PO/payment trùng amount khác ID, unassigned đúng scope khác invalid
scope, payment không sheet, VO trạng thái khác, PO cancelled, advance, floor proxy.
P1 một task progress1, P2 chín task progress0, P3 rỗng; fixture performance10.000task/20phiên
đồng thời cùng hạ tầng, ghi warmup, sample count và p95 tuyệt đối.

F-CHAIN: contract100, previous approved90, hai kỳ20/10; warnings thay đổi dưới concurrency,
out-of-order period, correct/incorrect acknowledgements, duplicate request; QA199/200 và
200/200; flow pending/final; approval_source riêng/tầng; advance và adjustment có nguồn.

F-RESTORE: recovery set tổng hợp DB+base/WAL+files/keyrefs/manifest đúng snapshot; bản hỏng,
thiếu WAL ở mép35ngày, missing key/attachment, checksum/migration mismatch, role sai và target
trùng nguồn giả lập. Không thử ghi vào production để chứng minh preflight.

## 3. A1 — 7 AC

- A1-AC01 — P/H/B: admin cùng role khác org không đọc/ghi/chọn/export chéo; resource không đổi,
  response không lộ tên/ID ngoài scope, bao phủ các auth method thực của inventory.
- A1-AC02 — P/H/M: membership rỗng không mở toàn hệ; UI chưa được gán và admin recovery cùng
  org hoạt động, không auto-grant mọi project để làm test xanh.
- A1-AC03 — U/P/H: missing/invalid ID và child-ID ngoài scope không query nghiệp vụ/ghi project1;
  bool/array/object/hex/exponent/vượt safe integer đều sai, kể cả batch/import.
- A1-AC04 — P: nested khác actor/scope/tập project hoặc nâng quyền transaction bị từ chối;
  COMMIT/ROLLBACK và ít nhất20 request concurrent qua pool không rò context.
- A1-AC05 — P/H: override deny theo project/org thắng visibility; cold-start, DB error và
  stale snapshot không tạo default allow; memoization không dùng nhầm actor/candidate.
- A1-AC06 — P/H: app role không owner/superuser/BYPASSRLS; đúng scope thấy đúng dữ liệu,
  sai/missing scope không đọc/ghi; role owner không được thay bằng chứng RLS.
- A1-AC07 — P/H: đổi org/session_version/mật khẩu làm token cũ vô hiệu; giữ login/2FA contract,
  không dùng credential service/device vượt scope đã cấp.

## 4. A2 — 10 AC

- A2-AC01 — B/M: A logout, B login cùng URL/offline không thấy data/draft/key của A;
  ciphertext A còn để chính chủ phục hồi, cleanup lỗi LOCKED, không báo thành công giả.
- A2-AC02 — B/H/P: response/SSE cũ sau switch bị bỏ; request tab cũ expected-context bị409,
  không ghi nhầm project mới theo cookie chung.
- A2-AC03 — U/B/P: diary cùng date khác owner/project độc lập; batch giao một phần không mất
  các ô còn lại; pending dedup không sửa payload của operationId có thể đã gửi.
- A2-AC04 — P/H/B: hai tab/lease hết/crash/mất ACK sau COMMIT/20 retry cùng key cho một effect;
  payload khác cùng key conflict, không thêm audit business hoặc ảnh metadata trùng.
- A2-AC05 — B: request IDB success rồi transaction abort không báo đã lưu; dedup+enqueue
  cùng transaction; quota/error giữ form để xử lý, không toast thành công.
- A2-AC06 — U/H/B:401 paused,409/412 conflict,428 precondition,429 Retry-After giữ op;
  403/404/422 rejected bền vững; network/5xx backoff, không mất draft hoặc retry business vô hạn.
- A2-AC07 — B/M: unknown-owner legacy/upgrade-blocked/versionchange/quota không tự nhận chủ,
  xóa draft hoặc drop DB; upgrade rerun không nhân bản hay mất batch.
- A2-AC08 — B/M: SW restart/ACK timeout/không broadcast hoặc Background Sync/Safari foreground
  vẫn đúng context/lease; không giả mọi browser có thể gửi khi app đóng.
- A2-AC09 — H/B/M: online bị revoke không stale200, offline lease hết khóa; auth/financial
  endpoints luôn network-only, không suy actor từ cache auth/me.
- A2-AC10 — P/H/B: diary If-Match và create-if-absent không ghi đè nguồn mới; receipt replay
  sau mất ACK không fail precondition giả; photo orphan/retry có đối soát an toàn.

## 5. A3 — 6 AC

- A3-AC01 — U/P/H/M:90071992547409.91+0.01=90071992547409.92 trên utility/aggregate/API/export;
  per-row numeric15,2 reject input vượt cột, không covert float hoặc mass nâng schema.
- A3-AC02 — U/P:±0.005 thành±0.01, mulRatio(-1n,1n,2n)=-1n; zero canonical,
  denominator0/NaN/Infinity/locale/exponent sai bị từ chối rõ.
- A3-AC03 — U/P:10.000 amount0.01 tổng100.00; chia partition rồi gộp vẫn bằng tổng trực tiếp;
  không dedup hai dòng chỉ vì số tiền bằng nhau.
- A3-AC04 — U/P: seeded property tests round-trip/triệt tiêu/giao hoán/parity PostgreSQL
  numeric; oracle không dùng float để kiểm bigint.
- A3-AC05 — H/B/M: opt-in decimal DTO, legacy trong biên và ngoài biên rõ; ID/progress không
  đổi kiểu ngoài scope; masked role không nhận exact amount qua API/chart/export.
- A3-AC06 — P/H/M: quantity giữ scale riêng; IPC sum rồi round, history giữ snapshot/rule;
  thay giá/rate hiện tại không sửa chứng từ đã chốt; legacy provenance được ghi trung thực.

## 6. A4 — 8 AC

- A4-AC01 — P/H: join nguồn cùng grain không nhân actual, hai payment cùng amount khác ID
  tính đủ; floor contract fixture tuân PK/unique thật, không tắt constraints để tạo case giả.
- A4-AC02 — P/H: nguồn unassigned đúng project vẫn ở tổng; payment không sheet/contract tầng
  không bị rơi do inner join; invalid-scope khác unassigned và cần reconciliation.
- A4-AC03 — P/H: includeVo/VO status/cancelled PO/advance đúng semantics và exact quantity,
  không đổi cơ sở tính để ép đối soát.
- A4-AC04 — P/H: chèn payment đồng thời không tạo rows/totals/alerts hai snapshot;
  selectedTotals đúng rows, projectTotals không bị ép bằng floor proxy.
- A4-AC05 — U/P/H/B:1task100%+9task0%=10%, không50%; project rỗng không đổi denominator;
  toàn bộ rỗng trả unavailable, không NaN/100% giả.
- A4-AC06 — P/H/B: org/status/visibility cùng filter list/KPI; labels trùng không ghép nhầm;
  không lộ tiền qua alerts/metadata/drill-down/export.
- A4-AC07 — P/H: quanh00:00 ngày VN đúng delayed, dimension join không nhân task;
  progress lỗi được báo coverage, không sửa nguồn từ báo cáo.
- A4-AC08 — P/H/M: SQL/API/export exact khớp, query count không theo số group;
  đo p95/baseline/workload, đạt D09 mới PASS, thiếu benchmark là NOT_RUN.

## 7. A5 — 9 AC, giữ đúng chính sách overrun

- A5-AC01 — P/H: import/sync retry không nhân dữ liệu, remote-write/ACK fault không ghi
  snapshot trước sự thật hoặc làm mất sửa của người khác; fake provider, không gọi thật.
- A5-AC02 — P/H:199/200 không nghiệm thu,100% QA fail vẫn chặn; flow pending/rejected
  giữ status, final mới nghiem_thu/history. Không mở đường bypass admin.
- A5-AC03 — P/H/B: tick/approve/batch/offline concur không lost update/duplicate/bypass;
  hủy duyệt tầng giữ task duyệt riêng đúng approval_source.
- A5-AC04 — P/H/B: contract100/approved90/kỳ20 tạo cumulative110 và warning; draft/trình
  được phép, approve với current warningVersion+ack+reason hợp lệ theo quyền/flow được phép;
  không hard-cap100 do test tự tạo. Unauthorized/ack thiếu hoặc stale bị chặn đúng lý do.
- A5-AC05 — P/H: hai kỳ20/10 sau90 serialize thành110 rồi120 khi thứ tự hợp lệ và được xác
  nhận warning mới; không lost update/double effect/cumulative draft cũ. Out-of-order trước
  kỳ đã-approved cần reconcile/adjust, không sửa lịch sử kỳ sau hoặc chặn vì một cap tự đặt.
- A5-AC06 — P/H/M: advance hợp lệ không cần giả đã nghiệm thu, không thu hồi/deduct hai lần;
  fixture rates/basis theo hợp đồng, không hardcode thuế suất chưa có.
- A5-AC07 — P/H/M: downstream chốt chặn hủy upstream; adjustment có quyền/audit;
  đổi BOQ giá không reprice history, resource cross-project không liên kết được.
- A5-AC08 — P/H/B: approved khác paid; tiền và nguồn báo cáo đối soát;
  errors/export/audit-view không lộ thương mại cho role bị cấm.
- A5-AC09 — B/M:7role, desktop/mobile/keyboard, cảnh báo dễ thấy và xác nhận chủ động;
  retry/conflict không tự acknowledged=true hoặc hiện như đã duyệt.

## 8. A6 — 6 AC

- A6-AC01 — O/P/H: restore recovery set đủ DB/base/WAL/files/keyrefs/quyền/money/audit;
  app/migration đúng và không gửi outbound thật.
- A6-AC02 — O: hỏng backup/checksum, missing critical file/key, migration mismatch phải FAIL;
  query thành công không che thiếu dữ liệu hoặc attachment.
- A6-AC03 — U/O: target không rõ/trùng nguồn/production/thiếu marker bị chặn trước ghi;
  verifier read-only không auto-migrate, raw URI/secret không vào output.
- A6-AC04 — P/O: fixture cross-org/orphan/audit tamper/role bypass sai bị phát hiện;
  count0 vì RLS che không PASS giả.
- A6-AC05 — O/M: RPO5min/RTO60min có timestamp/LSN/timeline/workload/độ phân giải nguồn;
  thiếu đo là NOT_RUN, không gán “đạt SLA”. Operator khác lặp runbook không cần chat cũ.
- A6-AC06 — O: restore lỗi giữ evidence, không phá nguồn/backup tốt; cleanup có quyền và
  retention đã định, không xóa để giấu một lần thất bại.

## 9. Bổ sung chất lượng — 8 AC

- Q-AC01 — P/H/U: unique key/CRUD/cache permission có org; hai org cùng global role/action
  giữ deny/allow khác nhau, delete A không ảnh hưởng B. Cold-start/error không fallback allow;
  writer cũ/mới không cùng hoạt động với conflict target sai sau cutover.
- Q-AC02 — P/H/B/M: vault đúng owner mới unlock; B dùng cùng browser proof vẫn không mở A;
  manifest/AAD/ciphertext bị sửa fail authentication; revoke một task trong manifest không
  được trả key của manifest đó. Logout giữ ciphertext, không key/plaintext; chính chủ online
  có quyền phục hồi, KEK rotation và password change không tự làm mất draft.
- Q-AC03 — H/B/M: client không tự nâng field-personal; admin đúng org/2FA mới duyệt;
  shared15min/personal8h, expiry/clock rollback/cold restart/device revoked đúng LOCKED.
  A→B→A cùng browser không mất proof của A do register B và không cho B truy cập A.
- Q-AC04 — P/H/B/M: numeric bên trong json_build_object/json_agg đi DTO string exact,
  không chỉ cast SELECT ngoài; masking và biên row/aggregate/legacy đúng mọi consumer.
- Q-AC05 — P/H: payment_bills.project_id được đối chiếu với contract/cert/sheet parents;
  mismatch bị chặn/reconciliation, không chọn lineage thuận lợi; thiếu sheet nhưng đúng
  project vẫn có ở totals/unassigned, không mất hoặc lộ khoản tiền.
- Q-AC06 — P/U/H: float quantity shadow numeric giữ legacy_float_text trung thực, nonfinite
  không thành0; writer/row locks không để shadow stale; exact_input_v1 giữ scale/biên.
  IPC hai dòng qty0.001*price5.00 ra0.01 chứ không0.02; không reprice lịch sử bằng backfill.
- Q-AC07 — P/H/O: HTTP login/me/health/readiness production bằng app role không DDL,
  schema thiếu báo lỗi đúng; migration job riêng với quyền riêng, không che thiếu schema
  bằng seed/auto-migrate hoặc chạy diagnostics có tác dụng phụ.
- Q-AC08 — O/P/H/M: PITR điểm mới và mép35ngày có base/WAL/object versions/key đúng;
  missing một mắt xích FAIL; canary+archive/object lag và end-to-end RTO chứng minh5min/60min
  trên workload công bố. Không đổi target/hạ test để PASS hoặc gọi pg_dump là PITR.

## 10. Final gate

54 AC là tối thiểu, không thay test hiện có. Một AC có nhiều assertions/lớp bằng chứng phải
đủ, không chỉ HTTP200. Independent review/UAT/restore ghi người thực hiện thật.
Báo đầy đủ fail/skip/NOT_RUN, không kết luận toàn hệ từ một file test hoặc CI docs.

Performance fixture10.000tasks/20sessions warmed, p95 tương tác500ms và reports2s,
regression không quá10% cùng môi trường; sample count/variance/query count có trong evidence.
LCP/INP/CLS/a11y giữ các gate hiện có, không bị bỏ để đo backend nhanh hơn.

Release candidate cần main/release SHA, AC evidence index, source/manifest versions và
no P0/P1. Production verification/pilot/restore thật là cổng riêng có quyền, không suy từ
việc chủ dự án đã chốt đặc tả. Không tạo automation hoặc môi trường production trong PR này.
