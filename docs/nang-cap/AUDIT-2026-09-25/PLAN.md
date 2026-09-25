# PLAN — QUALITY-FINAL-1, thi hành sau

State: **Approved for implementation**, quyết định D01–D09 tại APPROVAL.md đã chốt.
Không cần hỏi lại lựa chọn đã chốt. Lần lập bản này không chạy application code/production.
Baseline 8336918 có cả PR529 và PR530; reload main trước thực thi, không dùng checkpoint cũ.
Đọc README, APPROVAL, SOURCE-MAP, DATA-CONTRACTS, chương và TEST-MATRIX như một brief thống nhất.

## 1. Phân tách phê duyệt thiết kế và điều kiện chạy

Đặc tả đã duyệt không chứng minh caller/schema/membership/legacy queue/benchmark đã được kiểm.
S00 kiểm fact thật và tính đầy đủ của phạm vi slice; không tự điền bằng phỏng đoán hoặc PR body.
Production, secret, thay dữ liệu thật, mua dịch vụ và merge cần quyền riêng, không suy từ chữ Approved.
Giữ working tree của người dùng, không reset --hard hoặc force-push để đồng bộ.

## 2. Thứ tự và outcome của 17 bước

### S00 — Reconcile, inventory và baseline; route: standard

Đọc main/diff thật, quy ước repo và SOURCE-MAP đã bổ sung. Dựng catalog trên disposable,
đối chiếu ERD, đọc toàn bộ caller thuộc slice; AST inventory mọi route/method, kể cả export
alias, wrapper, cron/device/API-key, export và UI consumer. Tạo danh mục route-scope, monetary
columns, cache/queue, business transitions, recovery assets và baseline benchmark theo từng miền.
Ghi source SHA/file/line, auth/permission/scope/parent join, DTO/masking, file test và verdict.

S00 chỉ xong cho một miền khi không còn dòng NOT_MAPPED trong miền đó. Source map hiện có
không được coi đã quét toàn repository. Queries/count/p95 phải đo, không lấy target làm baseline.
Dữ liệu output không chứa secret/PII. Số migration chọn tại lúc thi hành; tên mới đã chốt trong
DATA-CONTRACTS phải so catalog trước khi tạo, không tự triển khai hai cơ chế tương đương.

### S01 — Resolver, actor và cache quyền theo org; route: complex

Khóa lib/ha-tang/projects.ts, lib/bao-mat/auth.ts, lib/bao-mat/permissions.ts,
lib/nen/request-context.ts và adapter mới cần thiết. Scope/context trước permission,
await snapshot quyền hợp lệ, không cold-start default allow; key và CRUD có org.
Chuyển unique key role_permissions theo DATA-CONTRACTS bằng migration hẹp, kiểm mixed-version
writer và rollback; không tự sửa membership production. Test A1 và Q-AC01.

### S03 — Transaction/RLS và tách migration runtime; route: complex

Làm sau S01, trước chuyển rộng caller S02. Khóa lib/db/index.ts, lib/db/migrate.ts và env
schema khi cần. Nested khác scope bị từ chối, readOnly/isolation đặt tại BEGIN; RLS app role
không bypass, multi-project finite IDs cùng org. Production không auto-DDL qua request;
health/diagnostic cũng không gọi auto-migration. Giữ đường dev/test chủ động rõ ràng.
Test A1-AC04/06, Q-AC07; không đổi global numeric parser.

### S02 — Chuyển caller theo cụm; route: spec

Sau S01/S03. S02a tài chính/nghiệm thu; S02b tracking/vật tư/ảnh/nhật ký;
S02c portfolio/export/cron/device/API key. Mỗi PR một boundary có inventory và negative test.
Mọi resource child-ID phải cùng org/project; helper không có org không được shim default.
Không dùng grep xanh để chứng minh mọi route đã chuyển. Giữ hợp đồng auth của #529.

### S04 — Chặn cache nhạy cảm và purge có generation; route: complex

Có thể ưu tiên ngay sau S00. Khóa public/sw.js, registry cache và test. API nhạy cảm,
HTML/RSC cá nhân hóa network-only; không xóa cache app khác trên cùng origin.
Response muộn không được ghi lại namespace đã purge. Không tự xóa hoặc gửi queue legacy.
Chưa bật offline allowlist mới trước context/vault/replay hoàn tất.

### S05 — Device, context và vault key service; route: complex

Sau S01/S03/S04 và scope endpoint cần thiết. Tạo thiết kế offline_devices/offline_vault_keys,
RLS/grants, origin/CSRF và API context/unlock. Profile mặc định shared-safe; chỉ admin cùng org
cho field-personal. Khóa auth/context client, me, switcher/logout/SSE đúng inventory.
Không persist raw key, không dùng XBOSS_SECRET làm KEK. Kiểm rotation/revocation và recovery.
S05 phải có security review crypto/ownership trước S07; test A2/Q-AC02/Q-AC03.

### S06 — Receipt và precondition ở endpoint thật; route: complex

Sau S02a và các endpoint queue S02b, S03/S05. Receipt/schema theo DATA-CONTRACTS,
strong version diary, idempotent batch/photo, metadata DB và orphan cleanup.
Bốn kind hiện hữu; không gắn một idempotency header lên mọi route rồi coi đã chống trùng.
Test concurrency/mất ACK/payload đổi/permission bị thu hồi, A2-AC04/06/10.

### S07 — Queue vault và IndexedDB nguyên tử; route: complex

Sau S05/S06. Khóa app/components/offlineQueue/{logic,store,index}.ts.
Mã hóa payload/AAD, ownership, transaction complete, dedup+enqueue nguyên tử, lease/fencing,
FIFO theo resource và persistent conflict/rejected. Quarantine legacy, không tự nhận chủ.
Quota/abort/upgrade-blocked không báo lưu thành công; không TTL xóa draft. Test A2 đầy đủ.

### S08 — UI phục hồi và browser acceptance; route: spec

Sau S05/S07. Hiển thị rõ trạng thái local/server/locked/conflict, unlock đúng chính chủ,
logout giữ ciphertext nhưng xóa đọc nhạy cảm. Cho offline allowlist tối thiểu theo profile,
không cache tài chính. Safari/iOS thật và Chromium; foreground fallback, không hứa Background
Sync lúc app đóng. Kiểm focus/axe/themes/mobile, hai tài khoản/two-tab/delayed response.

### S09 — Money exact và golden tests; route: complex

Sau S00. Khóa lib/nen/money.ts và test. Giữ VND×100; helper exact/rational,
amount/quantity/rate khác scale, adapter legacy có biên. Không đổi global parser DB.
Golden IPC giữ SUM rồi round tổng theo rule ipc-sum-v1, không đổi sang per-line.
Test A3, Q-AC06; có thể làm song song workstream không chạm cùng file.

### S10 — SQL/DTO/UI/export tiền theo miền; route: complex

Sau S09 và S02 miền tương ứng. Costs trước; contracts/IPC/payment; rồi monetary inventory
còn lại. Cast cả numeric bên trong JSON aggregate, không chỉ SELECT ngoài cùng.
Giữ amount(15,2), qty(15,3), ratio(5,2) thực tế; không mass ALTER khi không cần.
Chuyển caller opt-in decimal-string-v1, masking/sort/Excel/PDF; bảo toàn lịch sử. Test A3/Q-AC04.

### S11 — Canonical cost report; route: complex

Sau S10 costs và scope miền báo cáo. Khóa cost.ts, route/consumer liên quan.
Direct project_id và lineage payment nhất quán; unassigned không mất tiền; group theo khóa
thật; selectedTotals khác projectTotals; cùng snapshot, không lặp bộ costSummary.
Source conflicts là data-quality failure, không ép tổng bằng sửa DB. Test A4/Q-AC05.

### S12 — Portfolio task-weighted; route: spec

Sau S02c/S03, chỉ khi projects.ts được giải phóng khóa. List/KPI cùng org/filter;
weighted task, empty/unavailable rõ; task progress không bị sửa bởi báo cáo.
Test A4-AC05/06/07/08, và A1 negative cases. Không nhầm metric này với EVM.

### S13 — Chain và quyết định IPC; route: complex

Sau S02/S06/S10/S11. Fixture state/transition thật, không thêm cancelled giả vào enum IPC.
S13a regression chain; S13b vá tiến độ/nghiệm thu/import; S13c serialize contract/IPC,
warning acknowledgement, snapshot bất biến và adjustment. Mỗi PR một boundary.
Giữ over-contract là cảnh báo như quyết định 2026-09-04; không hard-cap từ v1.
Duyệt đồng thời không dùng lũy kế draft cũ; không reprice hoặc xóa audit. Test A5/Q-AC06.

### S14 — PITR, manifest và verifier; route: complex

Thiết kế verifier/runbook sau S00 có thể độc lập; nghiệm thu phải kiểm release candidate.
Tái dùng verify-dr-restore và verify-audit-chain, thêm preflight read-only/no auto-migrate,
manifest DB+WAL+attachments+key, PASS/FAIL/NOT_RUN có exit đúng. RPO5m/RTO60m/35days.
Restore vào disposable không egress; test backup hỏng, thiếu file/key, archive lag và wrong
target. Fixture tổng hợp trước; snapshot thật chỉ khi có phép. Test A6/Q-AC08.

### S15 — Final audit và release candidate; route: standard + reviewer

Tất cả S01–S14 và 54 AC có evidence đúng main/release SHA. Test DB bằng app role thật,
CI không skip critical, desktop/mobile/axe/Safari, exact money, chain và restore. Reviewer
không tự ký thay người khác. Chỉ code/test đạt mới CODE_COMPLETE; thiếu release quyền thì
WAITING_RELEASE, không giả production verified.

### S16 — Production do người vận hành được cấp quyền thực hiện

Chỉ khi có release SHA, environment/secret/chi phí/quyền merge/deploy rõ. Theo D09:
backup đã thử → migration/membership/legacy preflight → pilot48h → 25%24h → mở rộng và theo
dõi7ngày. Thực hiện emergency stop/rollback tương thích, không down-migrate phá dữ liệu.
Ghi evidence rồi owner xác nhận RELEASE_VERIFIED. Không tạo automation trong phiên đặc tả.

## 3. Thứ tự tích hợp và phân công

S00 → S04 → S01 → S03 → S02 → S05 → S06 → S07 → S08.
S09 có thể sau S00; S10 chờ scope từng miền; S11/S12 rồi S13. S14 nghiên cứu/runbook có thể
song song nhưng restore cuối theo release candidate. S15 → S16 sau mọi evidence/quyền.

Không chạy S01/S12 cùng sửa projects.ts, S03/S10 cùng sửa DB, S07/S08 cùng sửa queue.
Migrations/ERD/lockfile/CI do một đầu mối tích hợp, không phân công trùng số migration.
Worker không có tool subagent thì làm tuần tự, không nói đã chạy song song giả.

Brief bắt buộc: slice/spec version; main SHA; scope outcome; files allowlist/khóa;
contract/DDL thật; tests/fixtures; commands; rollout/rollback; stop conditions; evidence owner.
Tên test mới có thể chọn lúc tạo file, nhưng phải map AC và đọc tests hiện hữu trước;
không cần xin chủ dự án chọn lại tên file hoặc thuật toán đã chốt.

## 4. Verification

Chỉ DB disposable có identity được kiểm, tests/setup.ts trước import DB; không dùng env thật.
Node/npm theo CI và lockfile đang có, không nâng deps ngoài scope. Targeted tests trước rồi:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run check:sw-exclude
npm run check:migrations
npm run check:route-perms
npm run check:project-scope
npm run check:db-params
npm run check:test-fk-ids
npm run check:lib-layers
npm run check:dead-code
npm run check:dead-routes
npm run check:contrast
npm run check:mau-accent
npm run check:hex-hardcode
npm test -- --release-gate
npm run check:coverage
npm run build
npm run test:e2e
```

Mutation các bất biến critical phải thực sự bắt lỗi; ghi điều kiện chạy, không dùng CI của
SHA trước thay SHA mới. Docs-only CI không chứng minh vault/PITR/54 AC đã được implementation.
Cùng failure tối đa3 repair attempts; cần đổi contract thì báo delta, không nới guardrail.

## 5. Prompt bàn giao

```text
Repo seeker19110/xboss. Đọc AGENTS/CLAUDE và bộ đặc tả
 docs/nang-cap/AUDIT-2026-09-25/ ở phiên bản QUALITY-FINAL-1.
D01–D09 đã được chủ dự án giao chốt theo chất lượng cao nhất ngày 2026-09-25.
Không hỏi lại các lựa chọn đó. Reload main, thực hiện S00 kiểm fact/caller/catalog
cho slice; không ghi kiểm chứng chưa chạy thành PASS. Giữ quy tắc IPC cảnh báo
vượt khối lượng, không hard-cap. Chọn một slice đủ dependency, chốt file locks,
thi hành/test/review và mở PR khi có lệnh bắt đầu từ chủ dự án.
Không merge/deploy/chạy production hoặc mua dịch vụ nếu chưa có quyền riêng.
Báo SHA, AC/evidence, rủi ro và next slice; không tuyên bố hoàn tất toàn dự án từ CI.
```
