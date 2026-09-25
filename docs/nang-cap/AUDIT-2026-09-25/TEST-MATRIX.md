# Test matrix — Truy vết 46 acceptance criteria

State: kế hoạch kiểm chứng, **tất cả AC dưới đây hiện NOT_RUN trong PR đặc tả**.
Code/test của PR #529 có bằng chứng riêng, không được gán kết quả đó cho A1–A6 chưa triển khai.
Đọc các Given/When/Then đầy đủ trong chương tương ứng và hợp đồng chung README.md.

## 1. Quy ước bằng chứng

U: unit/property test hàm thuần. P: PostgreSQL integration thật. H: HTTP route với server/
auth thật. B: browser E2E với SW/IndexedDB/network thật. M: UAT/thao tác trên browser/thiết bị
được ghi phiên bản. O: vận hành restore/manifest/đối soát môi trường được phép.
Stub/VM unit test hữu ích nhưng không thay P/H/B. Một screenshot hoặc grep không thay test
concurrency/RLS. Tests mới dưới đây là đường dẫn đề xuất cho lần implementation, chưa tồn tại
chỉ vì được nêu trong tài liệu. S00 chọn tên/path cuối và tái dùng test hiện hữu khi phù hợp.

Mỗi AC cần evidence record: AC ID, slice, main/HEAD SHA, spec version, test name/path, command,
fixture seed/hash, DB role/phiên bản, browser/OS nếu cần, expected/actual, PASS/FAIL/NOT_RUN,
artifact/CI URL, thời điểm và reviewer. Nếu số test bị skip thì ghi lý do cụ thể; critical skip
không được tính PASS. Không dùng report của SHA trước sau khi code/fixture đã đổi.

## 2. Bộ fixture tối thiểu

F-SCOPE: hai org, mỗi org ít nhất hai project; đủ 7 role, membership khác nhau, admin cùng
org và org khác, override deny; thêm bản không membership, token đổi org/thu hồi phiên.
ID do DB cấp, không hardcode FK=1. Với tests RLS, owner chỉ tạo fixture; app thực thi bằng
role không owner, không superuser, NOBYPASSRLS. Xác minh role và GUC trước assertion.

F-OFFLINE: hai browser context cho tài khoản, hai tab cùng context cho cookie dùng chung;
project trùng URL/ngày nhật ký, response trì hoãn, đổi project/login/logout giữa request;
SW restart/update, IDB abort/quota/upgrade blocked, mất ACK sau DB commit, sender bị đóng,
header 401/403/409/412/422/428/429/5xx, không có BroadcastChannel/Background Sync.
Network failure khác server error. Chặn outbound/provider; không dùng dữ liệu người thật.

F-MONEY: 0, số âm, ±0.005, chuỗi lớn vượt safe minor và safe đồng, 10.000 dòng 0.01,
qty nhiều số lẻ, ratio hữu tỉ, mẫu 0, locale/exponent/NaN/Infinity bị từ chối. Seed property
test được lưu. Golden chứng từ được owner tài chính duyệt, không giả tax/contract rule.

F-REPORT: nguồn BOQ/VO/PO/floor-contract/payment với trùng amount nhưng khác ID, unassigned,
payment chưa có contract tầng, nguồn cross-project, includeVo và PO cancelled; fixture chỉ
chứa tổ hợp hợp lệ theo unique/FK thật. P1 1 task tiến độ 1; P2 9 task tiến độ 0; P3 không task.
Dữ liệu 10k task cho performance, cùng môi trường/concurrency để so baseline.

F-CHAIN: contract qty 100, nghiệm thu 60, đã duyệt 40, hai draft 15 chạy đồng thời;
QA fail/pass, 199/200 và 200/200 dimensions, approval nhiều bước, task/tầng có nguồn duyệt
khác nhau; advance, adjustment, chứng từ đã chốt. Dữ liệu tổng hợp theo mapping trạng thái
thực của S00, không tự thêm status test mà product không hỗ trợ.

F-RESTORE: recovery set tổng hợp DB+attachments+manifest+key reference và bản cố ý hỏng;
đích disposable riêng, không egress. Hash/rowcount/money/audit baseline tạo cùng snapshot;
thiếu file, sai checksum/migration, audit tamper, cấu hình role sai, target trùng production.
Không thử ghi thật vào production để chứng minh preflight hoạt động.

## 3. A1 — Scope: 7 AC

File đề xuất: tests/audit-scope-regression.test.ts, tests/audit-scope-transaction.test.ts,
e2e/authed/audit-scope.spec.ts. Tái dùng tests/rls.test.ts với role đúng, không chỉ thêm stub.

- A1-AC01 — P/H/B, F-SCOPE: admin khác org không đọc/ghi/chọn/export được project; resource
  không thay đổi và response không lộ tên/ID ngoài scope. Bao phủ các auth method đã inventory.
- A1-AC02 — P/H/M: user_projects rỗng không mở toàn hệ; UI chưa được gán và admin phục hồi
  cùng org hoạt động. So membership trước/sau đúng bảng owner duyệt.
- A1-AC03 — U/P/H: thiếu scope, project 0/âm/bool/array/hex/exponent/vượt safe integer
  đều không gây query nghiệp vụ hoặc ghi vào project 1; cả single/batch/import/child-ID.
- A1-AC04 — P: nested scope A→B hoặc numeric↔wildcard bị từ chối; rollback và tái sử dụng
  pool không rò scope. Tối thiểu 20 request concurrent, có barrier kiểm đúng thời điểm.
- A1-AC05 — P/H: project override deny thắng visibility; failure resolve không fallback
  global allow. Test khác actor/candidate cùng process không dùng nhầm memoized context.
- A1-AC06 — P: RLS chặn read/write chéo scope bằng app role thật; owner role chạy cùng query
  không được dùng làm evidence cách ly. Test missing GUC và invalid scope đều fail closed.
- A1-AC07 — P/H: org thay đổi/phiên bị thu hồi làm token cũ vô hiệu, giữ giao thức 2FA #529;
  không đọc/ghi org cũ qua cookie ký cũ hoặc API credential quá quyền.

## 4. A2 — Offline: 10 AC

File đề xuất: tests/audit-offline-logic.test.ts, tests/audit-operation-receipts.test.ts,
e2e/authed/audit-offline-context.spec.ts, e2e/authed/audit-offline-recovery.spec.ts.
Bằng chứng M cho iOS/Safari thật; một Chromium emulation không đại diện mọi browser.

- A2-AC01 — B/M, F-OFFLINE: A tải rồi logout, B mở cùng URL lúc offline không thấy data/draft
  của A trong HTML/API/cache/IndexedDB/UI/toast. Cleanup lỗi phải LOCKED, không báo xong.
- A2-AC02 — B/P/H: response cũ về sau switch bị bỏ; tab cũ gửi expected-context nhận conflict,
  DB không ghi nhầm project mới theo cookie chung. SSE cũ không sửa UI mới.
- A2-AC03 — U/B/P: nhật ký cùng ngày khác project/owner giữ riêng; switch không sửa project
  của op. Dedup chỉ trong ownership/resource được phép, không làm mất ô batch ngoài giao.
- A2-AC04 — P/H/B: hai tab, lease hết, crash/mất ACK sau commit và 20 retry cùng operationId
  chỉ một business effect/receipt; payload khác cùng key conflict, không chạy mutation mới.
- A2-AC05 — B: IDB request success rồi transaction abort không báo lưu thành công; enqueue
  và dedup nguyên tử; form còn để người dùng xử lý, không có toast “đã lưu” sai.
- A2-AC06 — U/B/H: 401 paused_auth, 409/412 conflict, 429 giữ op theo Retry-After;
  403/404/422 rejected có lý do bền vững; không xóa draft chỉ vì là 4xx, không retry vô hạn.
- A2-AC07 — B/M: migration v1/lần lặp/upgrade-blocked không nhận chủ đoán; quota đầy không
  xóa bản nháp; versionchange đóng connection đúng; logout discard cần xác nhận rõ.
- A2-AC08 — B/M: SW restart, mất ACK/broadcast/background sync, app foreground trở lại đều
  tuân lease/context/locking; không hứa gửi khi browser không hỗ trợ hoặc không còn client.
- A2-AC09 — H/B/M: online 401/403 không trả stale 200; offline hết lease khóa data, không
  suy danh tính từ cache /auth/me. Sensitive endpoints luôn network-only kể cả từng truy cập.
- A2-AC10 — P/H/B: diary If-Match conflict không ghi đè người khác, missing precondition bị
  chặn trên đường migrated; photo orphan/retry có đối soát, không nhân metadata/file hiển thị.

## 5. A3 — Tiền: 6 AC

File đề xuất: tests/audit-money-exact.test.ts, tests/audit-money-contract.test.ts,
tests/audit-money-export.test.ts. Đối chiếu PostgreSQL numeric với implementation bigint.

- A3-AC01 — U/P/H, F-MONEY: 90071992547409.91 + 0.01 = 90071992547409.92, thêm giá trị vượt
  safe đồng; raw API và export canonical giữ nguyên, không có Number trung gian.
- A3-AC02 — U/P: ±0.005 half-away-from-zero thành ±0.01; -1n nhân 1/2 => -1n;
  zero canonical không -0.00; denominator0/nonfinite/chuỗi sai phải lỗi rõ.
- A3-AC03 — U/P: 10.000 dòng 0.01 tổng 100.00, cộng theo nhiều partition rồi gộp vẫn bằng
  tổng trực tiếp. Hai số tiền bằng nhau ở hai dòng không bị dedup.
- A3-AC04 — U/P: seeded property tests parse/serialize round-trip, a+(-a)=0, giao hoán,
  SQL/JS rounding parity; không dùng float oracle làm chuẩn cho bigint.
- A3-AC05 — H/B/M: opt-in DTO string, legacy number trong biên, vượt biên lỗi; ID/count/
  progress không đổi kiểu ngoài ý muốn; role bị che không nhận exact field qua API/export.
- A3-AC06 — P/H/M: chứng từ lịch sử không bị reprice; quantity scale khác tiền giữ đủ;
  golden fixture per-line/per-total/basis/VAT/retention/recovery có approval, rule version rõ.

## 6. A4 — Báo cáo: 8 AC

File đề xuất: tests/audit-cost-report.test.ts, tests/audit-portfolio-kpi.test.ts,
e2e/authed/audit-reporting.spec.ts; fixture performance ghi riêng môi trường và query count.

- A4-AC01 — P/H, F-REPORT: contracts 100+200 cùng grain và payments40+60 cho committed300/
  actual100, không200. Nếu schema không cho tổ hợp đó, bằng chứng constraint và fixture grain
  tương đương phải được ghi, không tắt FK để làm test minh họa vô nghĩa.
- A4-AC02 — P/H: mọi unassigned source vẫn vào projectTotals; không tạo FK0, không mất payment
  vì không có hợp đồng tầng. Bucket label và coverage phản ánh phần chưa phân loại.
- A4-AC03 — P/H: includeVo chỉ tác động nguồn eligible; PO cancelled không cộng; advance
  giữ semantics được duyệt. Nguồn khác ID cùng amount đều được tính theo source lineage.
- A4-AC04 — P/H: insert payment đồng thời với report không tạo rows/totals hai snapshot;
  selectedTotals khớp rows, projectTotals không bị ép bằng floor proxy khi coverage khác.
- A4-AC05 — U/P/H/B: 1 task100% + 9 task0% =10%, không50%; thêm project rỗng không đổi
  denominator; toàn bộ không task hiển thị unavailable, không NaN hoặc 100% giả.
- A4-AC06 — P/H/B: filter org/status/visibility nhất quán list/KPI; masked role không lộ tiền
  qua alerts/coverage/export; label/code trùng không ghép nhầm grain ID.
- A4-AC07 — P/H: ngày VN quanh 00:00 trên server UTC đúng delayed count; nhiều dimensions
  không nhân task; invalid progress được báo data-quality, không sửa upstream từ báo cáo.
- A4-AC08 — P/H/M: SQL/API/export exact bằng nhau, query count không tăng theo số group,
  p95 cùng môi trường không tệ hơn baseline20% hoặc dừng để giải thích/duyệt delta.

## 7. A5 — Chuỗi nghiệp vụ: 9 AC

File đề xuất: tests/audit-business-chain.test.ts, tests/audit-cert-concurrency.test.ts,
e2e/authed/audit-acceptance-payment.spec.ts. Tái dùng tests nghiệp vụ hiện có từ S00.

- A5-AC01 — P/H, F-CHAIN: import/sync retry không nhân nguồn; fault remote-write/snapshot
  không mất thay đổi của người khác. Fake provider test, không gọi hệ ngoài thật.
- A5-AC02 — P/H: 199/200 dimensions không nghiệm thu được; đủ100% thiếu QA vẫn bị chặn;
  pending/rejected flow chưa nghiem_thu; final step mới đổi trạng thái và history.
- A5-AC03 — P/H/B: tick/approve/batch/offline concurrent không lost update, duplicate effect
  hoặc bypass hold-point; hủy duyệt tầng giữ task duyệt riêng theo approval_source.
- A5-AC04 — P/H: contract100/accepted60/previous40 cho kỳ20, chặn21 tại approve;
  draft/cancelled/rejected không tăng lũy kế đã duyệt, VO pending không tăng trần.
- A5-AC05 — P: hai IPC15 cùng lúc khi còn20, tối đa một approve; kiểm bằng transaction
  thật có synchronization barrier, không chỉ hai await tuần tự hoặc mutex ngoài DB.
- A5-AC06 — P/H/M: advance hợp lệ theo hợp đồng không cần giả đã nghiệm thu; không đếm
  như qty acceptance hoặc thu hồi hai lần. Fixture tỷ lệ/basis phải được duyệt.
- A5-AC07 — P/H/M: downstream đã chốt chặn hủy upstream; adjustment có approval/audit;
  thay BOQ giá mới không thay lịch sử, resource cross-project không tham chiếu được.
- A5-AC08 — P/H/B: báo cáo đối soát trạng thái approved khác paid, tiền A3 và nguồn A4;
  error/export/audit-view không lộ thương mại cho vai trò bị cấm.
- A5-AC09 — B/M: engineer/subcon ghi nhận, PM duyệt, BCH xem, cdt/viewer bị giới hạn đúng;
  keyboard/mobile/error/retry không gửi hai transition hoặc khiến người dùng hiểu nhầm đã duyệt.

## 8. A6 — Khôi phục và vận hành: 6 AC

File đề xuất: tests/audit-dr-verifier.test.ts và kịch bản restore disposable theo A6.
Không gọi audit:verify-dr trên production chỉ vì nó có sẵn trong package.json.

- A6-AC01 — O/P/H, F-RESTORE: khôi phục đủ DB/files/quyền/money/audit cùng recovery set;
  appSHA/migration checksum đúng, đích cách ly không gửi email/webhook/provider thật.
- A6-AC02 — O: backup hỏng, thiếu critical attachment/key, migration mismatch từng lỗi
  được báo FAIL; query counts thành công không che thiếu data hoặc files.
- A6-AC03 — U/O: preflight target trùng production/thiếu marker bị chặn trước ghi;
  verifier không auto-migrate, raw URI/secret không vào logs.
- A6-AC04 — P/O: fixture cross-org/orphan/audit tamper/role BYPASSRLS bị phát hiện;
  zero rows do RLS không bị hiểu là không có vi phạm.
- A6-AC05 — O/M: RPO/RTO có mốc/manifest/độ phân giải và người kiểm; thiếu marker nguồn
  là NOT_RUN, không gán “đạt SLA”. Operator khác lặp được runbook không cần chat cũ.
- A6-AC06 — O: lỗi diễn tập giữ evidence, không phá nguồn hoặc ghi đè backup tốt;
  cleanup chỉ sau quyền và retention đã duyệt, không xóa để che failure.

## 9. Điều kiện final audit

46 AC là phạm vi tối thiểu, không thay các test hiện có. Mỗi AC nhiều assertion không được
rút về một smoke test “status200”. Sau từng PR chạy affected gates; trước release chạy full
matrix theo PLAN và báo rõ những phần cần browser/DB/operation chưa chạy được.

Performance baseline và mục tiêu trong README/A4 là đề xuất; kết quả phải ghi workload,
phiên bản, cold/warm, concurrency, query count, sample count và p95 tuyệt đối. Không đưa tốc
độ X lần hoặc coverage100% khi không có phép đo.

S15 tổng hợp thành evidence index với spec commit và release SHA. Reviewer xác nhận các
AC mandatory không NOT_RUN/FAIL, residual risk không bị giấu, owner UAT đã ký.
S16 production verification là cổng riêng, không suy từ automated tests hoặc docs CI.
