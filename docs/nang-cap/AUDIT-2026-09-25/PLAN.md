# PLAN — Thi hành các phần audit còn lại

State: In review. Đây là kế hoạch bàn giao cho lần thi hành sau, không là lệnh chạy ngay.
Đọc cùng [README](README.md), [APPROVAL](APPROVAL.md), [matrix](TEST-MATRIX.md) và
[goal](../../goals/audit-2026-09-25.md). Không ghi đè PLAN.md gốc đang phục vụ công việc khác.

## 1. Cổng trước khi bắt đầu

Đọc AGENTS.md, CLAUDE.md và docs/AI_DELIVERY_LOOP.md từ main thật. Đồng bộ remote, kiểm
working tree sạch; không reset hoặc ghi đè công việc chưa commit của người dùng. Ghi main SHA,
PR đang mở, phiên bản Node/npm trong CI và lockfile; không dùng số phiên bản trong README cũ
thay nguồn cấu hình thật. Không nâng dependency hoặc sửa lockfile ngoài scope.

Xác minh bất biến #529 đã có trên main. Khi viết kế hoạch, #529 vẫn mở và có HEAD đã kiểm
2641b6f733ae157a188168aba162fb8c081c3e2f. Không coi PR đã merge chỉ vì CI xanh; squash có
thể đổi SHA, phải đối chiếu nội dung/test. Nếu chưa merge, chỉ nghiên cứu/duyệt, chưa code
phần phụ thuộc và không tự merge/cherry-pick #529.

S00 là bước hoàn thiện mapping theo main mới. Chỉ khi chương liên quan được chủ dự án ghi
Approved for implementation và không còn blocking decision thì slice đó được READY.
Phê duyệt tài liệu không cấp quyền production, đổi dữ liệu, merge hoặc chi phí dịch vụ.

## 2. Quy tắc chia việc

Một slice là một outcome có thể kiểm chứng, không nhất thiết một chương. Các slice có
hậu tố a/b/c phải được tách nếu quá nhiều miền hoặc làm thay đổi contract khác nhau.
Mỗi PR phải có file allowlist cụ thể, test từ matrix, rollback và evidence SHA.
Không gom sửa auth, toàn bộ API, tiền, queue và release vào một PR lớn.

Chỉ song song khi hai việc không sửa cùng file, dependency contract đã ổn định và số worker
không vượt số luồng có ích. Khảo sát/test-fixture độc lập có thể song song; integration vẫn
qua một người. Auth, projects.ts, request-context, lib/db, money.ts, schema/ERD, lockfile,
registry và cấu hình CI là tài nguyên khóa, không để hai worker cùng sửa.
Không giả định đã gọi subagent khi môi trường không cung cấp khả năng đó.

Nhãn route tuân CLAUDE.md: complex cho auth/DB/tiền/race cần review sâu, spec cho thi hành
contract đã kín, standard cho test/runbook theo mẫu, mechanical chỉ format/đổi tên có kiểm.
Chọn đúng agent đang cấu hình trong repo, không hardcode tên model hoặc chi phí API ở đây.

## 3. Danh mục slice và dependency

### S00 — Reconcile và inventory, route: standard

Đọc main, PR529, nguồn của README và các consumer thật. Không sửa application code.
Đầu ra tài liệu mới dưới docs/nang-cap/AUDIT-2026-09-25/evidence/ tại lần thực hiện:
route-scope-inventory, monetary-column-map, cache-queue-inventory, business-transition-map,
recovery-inventory và baseline-checkpoint. Không tạo báo cáo rỗng rồi đánh dấu hoàn tất.

Mỗi route/method phải ghi auth mechanism, CAN/assignment, scope/org, bảng/parent join,
service/file, response/masking/cache, test hiện có và khoảng trống. Monetary map ghi
precision/scale/basis/rounding/client/export. Transition map ghi trạng thái thật, khóa,
qty/amount basis, idempotency và audit. Cache map ghi HTML/RSC/API/IDB/React/SSE.
Từ catalog thật chọn tái dùng receipt/version/snapshot hiện hữu hay cần DDL A2; quyết định
phải có bằng chứng và phê duyệt, không triển khai song song hai cơ chế.

Ghi số query, p95 và fixture/env để so sánh; không lấy số dự đoán làm baseline. Điền chính
xác các file test/code sẽ sửa cho mỗi slice. Nếu phát hiện khác baseline, sửa phụ lục và
xin duyệt delta; không tự đổi đặc tả trong worker. S00 hoàn tất là cổng mapping, không phải
bằng chứng đã sửa hết route hay đã diễn tập restore.

### S01 — Resolver, membership và org-session, route: complex

Phụ thuộc S00, #529 trên main, quyết định D01 trong APPROVAL.
Khóa lib/ha-tang/projects.ts, lib/bao-mat/auth.ts, lib/nen/request-context.ts;
có thể thêm project-scope.ts theo A1. Thống nhất kiểu actor/scope/ID validation, kiểm org
phiên và loại fallback 1/global-empty ở logic đích. Chưa bật strict production.
Test A1-AC01/02/03/05/07. Tài liệu membership dry-run và admin recovery đi cùng PR.

### S03 — Transaction, scope lồng và RLS, route: complex

Phụ thuộc S01. Làm trước chuyển hàng loạt caller ở S02.
Khóa lib/db/index.ts và request-context; cùng scope tái sử dụng, khác scope từ chối;
read-only nesting và pool cleanup đúng. Cross-project cùng org có API tường minh, không
lấy '*' từ client. Test A1-AC04/06 và regression các consumer DB hiện có.
Không sửa global numeric parser ở slice này. Schema/RLS thay đổi phải qua migration riêng.

### S02 — Chuyển caller theo cụm, route: spec sau contract A1

Phụ thuộc S01/S03. Tách S02a tài chính/nghiệm thu; S02b tracking/vật tư/hồ sơ;
S02c danh sách/export/cron/device/API key/cross-project. Mỗi cụm lại chia theo file allowlist
khi có vùng chồng nhau. Route #529 phải giữ bảo vệ và contract hiện có.
Mục tiêu: mọi dòng inventory có resolver, resource-parent scope, permission đúng và test.
Không đánh dấu cả cụm xong vì check:project-scope không tìm thấy pattern nguy hiểm.
Test A1 toàn bộ, chọn negative tests theo từng method/auth mechanism.

### S04 — Chặn cache nhạy cảm và purge cache cũ, route: complex

Phụ thuộc S00 và #529; có thể ưu tiên trước S01 để giảm rủi ro đọc cache ngay.
Khóa public/sw.js, registry cache hiện có và test tương ứng. Network-only cho dữ liệu
nhạy cảm/HTML cá nhân hóa, chống response muộn ghi lại cache đã purge, không xóa cache ứng
dụng khác. Giữ draft; xử lý draft thuộc S07. Test A2-AC01/02/08/09 ở chế độ network-only.
Không bật allowlist nghiệp vụ offline tại bước này.

### S05 — Context server và đồng bộ nhiều tab, route: complex

Phụ thuộc S01/S03/S04. Khóa các route auth/context, app/lib/me.ts, switcher/logout/SSE
consumer đúng inventory; không sửa giao thức login/2FA ngoài field bổ sung tương thích.
Bootstrap context online, expected-context trên request, invalidation/generation/ACK và
fallback theo A2. Một project hoạt động chung trong browser, không giả hai cookie khác nhau.
Test A2-AC01/02/08/09, kể cả response chậm và tab cũ gửi sau switch.

### S06 — Receipt, precondition và endpoint replay, route: complex

Phụ thuộc S02a và các route queue thuộc S02b, S03/S05; D03/D04 đã duyệt.
Schema có một owner đánh số migration kế tiếp, DDL được đối chiếu catalog và ERD cập nhật.
Tái dùng hoặc thêm receipt như S00 quyết định; diary If-Match, batch nguyên tử, photo staging
và cleanup có đối soát. Bốn kind offline, không mở rộng thành payment API ngoài scope.
Test A2-AC04/06/10, RLS receipt, migration mới/chạy lại/rollback code giữ dữ liệu.

### S07 — Queue v2 và bảo đảm lưu cục bộ, route: complex

Phụ thuộc S06, D02/D03/D04. Khóa app/components/offlineQueue/{logic,store,index}.ts và test.
Ownership, dedup nguyên tử, tx.oncomplete, trạng thái lỗi, FIFO theo resource, lease/fencing
nhiều tab. Legacy không owner chỉ quarantine, không tự gán người đang đăng nhập.
Test A2-AC03/04/05/06/07; quota/versionchange/upgrade-blocked và crash giữa request/commit.

### S08 — UI conflict, allowlist offline và kiểm browser thật, route: spec

Phụ thuộc S05/S07. Contract queue/context đã ổn định mới giao các UI consumer theo file.
Hoàn thiện trạng thái lưu cục bộ/đã đồng bộ, logout còn draft, khôi phục conflict diary và
allowlist cache tracking. Không bật caching nhạy cảm. Safari và Chromium có đường foreground
fallback; không yêu cầu Background Sync như điều kiện correctness.
Test toàn bộ A2, keyboard/axe/theme/mobile và bảng browser/version có bằng chứng.

### S09 — Utility tiền exact và golden tests, route: complex

Phụ thuộc S00, D05. Khóa lib/nen/money.ts và các test được chỉ định.
Thêm API exact hợp lệ TypeScript theo A3, giữ tương thích caller chưa chuyển và giới hạn rõ
adapter number. Không đổi parser oid 1700/20 toàn hệ. Test A3-AC01/02/03/04/06.
Có thể làm song song khảo sát A2 nhưng không sửa shared code của worker khác.

### S10 — Monetary SQL/DTO/client/export, route: complex

Phụ thuộc S02 cụm liên quan/S09. Chia theo miền: costs; contracts/IPC/payment; các miền tiền
còn lại trong inventory. SQL exact ::text, wire opt-in, masking, UI/Excel/PDF đồng nhất.
Mỗi miền là một PR hoặc chuỗi nhỏ tương thích ngược; không đổi mọi numeric JSON thành string
trong một lần. DDL chỉ khi mapping cột cụ thể được duyệt. Test A3 toàn bộ và consumer contracts.

### S11 — Canonical cost report, route: complex

Phụ thuộc S10 miền costs, A1 hoàn tất cho route/report; D06 đã duyệt.
Khóa lib/tai-chinh/cost.ts, route costs và consumers được chỉ định. Grain/pre-aggregate,
unassigned, selectedTotals khác projectTotals, snapshot nhất quán và không lặp costSummary.
Test A4-AC01/02/03/04/06/08, tính tiền A3; ghi query count và p95 trước/sau trên cùng fixture.

### S12 — Portfolio KPI theo task và filter, route: spec

Phụ thuộc S01/S02c/S03 và D06. Chỉ chạy khi khóa projects.ts đã được giải phóng.
List/KPI cùng org/visibility/filter, denominator task đúng, no-data rõ, ngày VN đúng.
Khóa lib/ha-tang/projects.ts, route/consumer portfolio từ inventory. Không thay progress
của task để sửa KPI. Test A4-AC05/06/07/08 và A1 cross-org negative cases.

### S13 — Chuỗi nghiệp vụ và vá hẹp theo failure, route: complex

Phụ thuộc S02/S06/S10/S11, D05/D07 và transition map S00 đã được duyệt.
S13a dựng fixture liên miền A5 và xác nhận failure thật; S13b/c chỉ vá từng boundary đã tái
hiện: import/sync; tiến độ/nghiệm thu; lũy kế IPC/điều chỉnh. Mỗi failure có regression trước.
Khóa các file nguy cơ cao theo A5, không song song sửa recompute/approvals/paymentcerts.
Test A5 toàn bộ, concurrency bằng PostgreSQL thật, không giả lock bằng mutex test.
Nếu thiếu rule tài chính/nghiệm thu, BLOCKED ở slice liên quan, không bịa trạng thái/schema.

### S14 — Manifest, verifier và restore drill, route: complex

Thiết kế/tests verifier được bắt đầu sau S00, độc lập các file ứng dụng; diễn tập snapshot
cuối cần các hợp đồng A1/A3/A4/A5 đã ổn định. D08 và quyền môi trường đích phải đủ.
Khóa scripts/verify-dr-restore.ts, scripts/verify-audit-chain.ts nếu cần, test và runbook;
không chạy lên production. Verifier read-only có preflight không auto-migrate, output evidence
PASS/FAIL/NOT_RUN. Restore tổng hợp vào disposable và fault injection A6-AC01…06.
Snapshot thật, hạ tầng/lưu trữ trả phí hoặc credential mới cần quyền riêng; không có thì báo
NOT_RUN cho phần đó, không coi fixture tổng hợp là diễn tập production đã thành công.

### S15 — Final audit và bàn giao release candidate, route: standard + reviewer

Phụ thuộc S01–S14, không còn blocking AC. Chạy matrix/CI đúng SHA, UAT đủ vai trò và browser,
đối soát tiền, replay, scope và restore evidence. Đóng các phát hiện hoặc ghi rõ BLOCKED.
Chỉ khi code/test đạt mới CODE_COMPLETE; chưa có quyền phát hành thì WAITING_RELEASE.
Cập nhật goal/PROGRESS sau các mốc thực tế, không ghi claim kiểm chứng vào commit chưa chạy.

### S16 — Thi hành production bởi người vận hành, không tự động

Phụ thuộc S15 và phê duyệt production riêng D09. Theo A6: recovery set đã thử, membership/
legacy queue preflight, migration tương thích, staging/pilot, đối soát, mở rộng và quan sát.
Chỉ đánh dấu RELEASE_VERIFIED khi evidence và owner xác nhận. Không có quyền thì dừng ở
bàn giao runbook; không tự bật lịch theo dõi, cấp secret, merge hay gọi deploy.

## 4. Thứ tự tích hợp mặc định

S00 → S04 → S01 → S03 → S02 → S05 → S06 → S07 → S08.
Sau S00 có thể triển khai S09 khi được duyệt; S10 phải đợi scope miền liên quan. Sau đó
S11/S12 → S13. S14 verifier/runbook có thể đi riêng từ S00, nhưng restore/final validation
phải kiểm bản release candidate. S15 → S16 chỉ sau tất cả dependencies và approvals.

Không chạy S01 và S12 đồng thời vì chung projects.ts; không chạy S03 và thay parser DB
ở S10 đồng thời; không chạy S07 và S08 cùng sửa offlineQueue/index.ts. Mỗi bước tích hợp
reload main và đổi file lock, không tin rằng tên worker khác nghĩa là độc lập.

## 5. Mẫu brief tự chứa cho mỗi PR

```text
Slice ID / chương / AC:
Main SHA và dependency đã merge:
Approver, ngày, decisions liên quan:
Outcome / non-goals:
Files được sửa và files bị khóa:
Contract vào/ra và schema version:
Bảng/cột, migration number được cấp ở lần thi hành:
Fixture, auth methods, role DB, browser:
Targeted tests và full gates:
Rollout / rollback / stop conditions:
Evidence cần bàn giao:
Quyền KHÔNG được thực hiện: main merge / production / chi phí / secrets.
```

Trước BUILD, brief không được còn placeholder về file, schema, business state hoặc approval.
Worker trả danh sách file đổi, lệnh thật đã chạy, số pass/fail/skip, rủi ro, commit SHA và
mục còn thiếu. Coordinator review diff trước khi chạy gates; không merge thiếu quyền.

## 6. Kiểm chứng và lệnh

Chỉ dùng DB disposable đã xác minh. Không source .env production vào shell test. Cấp
TEST_DATABASE_URL riêng; E2E_DATABASE_URL riêng khi chạy Playwright có DB. Role ứng dụng
NOBYPASSRLS khác owner migration; mọi test DB import tests/setup.ts đầu tiên.
Node/npm theo CI hiện hành, npm ci theo lockfile. Bước cài dependencies không cấp quyền nâng
package hoặc gọi provider thật. Lệnh có sẵn ở package.json baseline:

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

Đây là checklist cho lần thi hành, không là tuyên bố những lệnh trên đã chạy trong PR tài
liệu. Chạy targeted tests có đường dẫn thật trước full gate. npm run test:mutation cần
PostgreSQL test và áp đúng điều kiện workflow; không bỏ qua mutation critical của slice chỉ
vì workflow PR hiện không tự chạy bước đó. Restore scripts không tự có cờ/contract A6 trước S14.

## 7. Checkpoint, repair và điểm dừng

Mỗi iteration ghi main/HEAD, slice, code/test evidence, trạng thái approvals, khoảng cách
Goal DoD, rủi ro và slice kế tiếp. Cùng failure tối đa ba lần sửa theo AI_DELIVERY_LOOP;
hết budget hoặc contract đổi thì BLOCKED kèm nguyên nhân, không vòng lặp vô hạn.

Dừng ngay khi scope/money/data/gate vi phạm, cần production/secret/chi phí mới, main đổi làm
mapping không còn đúng, hoặc chưa được duyệt quyết định nghiệp vụ. Không hạ coverage,
skip test, nới permission hoặc xóa dữ liệu để lấy CI xanh.

## 8. Prompt bàn giao cho phiên thi hành sau

```text
Repo seeker19110/xboss. Đọc AGENTS.md, CLAUDE.md và
 docs/nang-cap/AUDIT-2026-09-25/{README,PLAN,APPROVAL,TEST-MATRIX}.md,
 docs/goals/audit-2026-09-25.md và chương của slice.
Đồng bộ main và xác minh trạng thái PR #529 bằng repo thật, không dựa vào chat.
Đối chiếu approval; chưa Approved for implementation thì chỉ reconcile/S00 và báo blocker.
Khi được duyệt, chọn một slice READY nhỏ nhất theo dependency, chốt file locks,
thi hành đúng contract, viết regression, chạy gates và mở một PR.
Không tự đổi chính sách tiền, membership, draft legacy hoặc schema ngoài đặc tả.
Không merge/deploy/chạy production nếu chưa có quyền riêng.
Bàn giao SHA, diff, evidence, AC còn thiếu và next slice; không báo xong khi chưa kiểm chứng.
```
