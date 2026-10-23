# Autopilot — A1-AC01 · 22/10/2026

> Phiên chính tự duyệt D-001/D-002 theo QUALITY-FINAL-1 Approved 25/09/2026. Tiếp tục /autopilot sau khi #663/#664/#665 đã merge; base main `9c13f54a`. Không áp dụng AGENTS.md cũ đã được người dùng thu hồi.

## G0–G4: phạm vi và chỉ số hoàn tất

Admin cần quản lý người/dự án và xuất tiến độ trong đúng tổ chức. A1-SCOPE §4 A1-AC01 và TEST-MATRIX §3 yêu cầu hai admin khác tổ chức không đọc/ghi/chọn/export chéo. S15 hiện PARTIAL vì thiếu B hai org và M. Lát này bổ sung bốn luồng B cookie, cả hai chiều A↔B trên desktop/mobile, và chạy lại P/H theo bảng RESEARCH.

Chỉ số: bốn ca × hai viewport + setup = 9 lượt pass, 0 skip; P/H bắt buộc 0 skip; typecheck/build và 18 cổng tĩnh xanh; sáu MUST có bằng chứng; review khác model không còn P1/P2; final verify ổn định và CI đúng HEAD. A1 tổng thể giữ PARTIAL: M, OIDC browser đầy đủ và API-key write hai org/hai chiều còn mở. Không suy slice thành audit 406 route hoặc toàn 1152 MUST/639 SHOULD.

Giữ stack theo lock: Node 24, Next 16, PostgreSQL 16, Playwright 1.63, ExcelJS hiện có. Không thêm thư viện/dịch vụ. Dự kiến chỉ test/docs; nếu thấy bug nghiệp vụ, ghi decision và sửa theo contract đã duyệt. Không đổi spec, schema, policy, dependency, hook/CI hoặc dữ liệu thật.

Research nằm tại A1-AC01-RESEARCH.md. Lớp B dùng browser/cookie/HTTP/DB/download thật, SQL chỉ dựng input. P/H hiện hành dùng mock next/headers làm transport và mạng Google theo từng suite; DB/auth thật. S16 chạy bằng xboss_app LOGIN, NOSUPERUSER, NOBYPASSRLS trên DB disposable đã migrate.

## Contract và ownership

Executor sở hữu hai file e2e/helpers/a1-org-boundary-fixtures.ts và e2e/authed/a1-ac01-org-boundary.spec.ts. Root sở hữu docs/runtime/gates/git/PR; reviewer khác model chỉ đọc. Không agent lồng.

Mỗi ca có hai org, mỗi org hai project và bảy role admin/pm/engineer/subcon/bch/cdt/viewer. Gọi riêng dungToChucCoLap(roles, 2); chỉ hai admin login UI với context cookie rỗng, giữ cấu hình desktop/mobile. /api/auth/me chứng minh hai ID/org khác nhau và cùng role admin. WBS/slug/sentinel riêng theo project; sheet code có thể trùng. Fixture chỉ có input 0%, không dựng output nghiệp vụ. Đóng context/pool, giữ input/audit tới global setup của DB disposable.

- Read: /portfolio, /users và GET /api/projects, /api/users đúng tập own ID/name; có own positive controls trước khi kiểm foreign vắng.
- Write: foreign PATCH role viewer hợp lệ và DELETE đều 404, target DB bất biến. Target foreign tách khỏi own controls: engineer→viewer qua combobox và xóa user chưa có dữ liệu qua dialog thật; 200 và UI sau reload đúng.
- Select: UI chọn project thứ hai cùng org → POST 200, reload cùng URL và cookie xboss_project đúng ID. Foreign POST 403 giữ cookie/UI. Chỉ kiểm foreign option vắng khi listbox mở và own option hiện.
- Export: chọn project qua UI, click link “Xuất Excel”, đọc download bằng ExcelJS. Kiểm filename, headers literal và task đang chọn; loại sentinel org khác lẫn own project chưa chọn. Foreign slug 404 và DB business foreign bất biến; echo slug đã gửi không tính là dữ liệu bị lộ.

D-004: chỉ POST chọn project được gắn observer browser fetch thật: đọc clone body qua binding, trả nguyên Response cho app và cleanup. Có trì hoãn thời điểm app nhận response; slice chỉ chứng minh chức năng, không chứng minh timing reload nguyên trạng. Không route/mock/API gọi lại.

Kiểm toast ngay sau response, trước observer DB/disk theo D-007 A5. Timeout mỗi ca 60 giây cho nhiều bước hai chiều, giữ nguyên assertions nghiệp vụ. Gate browser giữ full log/output riêng bằng pipefail theo FB004. Nhánh export task trễ dựa thêm P/H s02c-dashboard-scope có dữ liệu trễ; fixture B mới chỉ có input 0%.

## Ngân sách và điểm dừng

- Tối đa 28 vòng, dự toán mềm 45000 token; không provider trả phí.
- Timeout mỗi Gate 3600 giây; loop mới giới hạn bốn giờ, không reset history/deadline loop trước.
- L1 giữ nguyên. Quyền vừa cấp chỉ cho #664/#665; PR mới xét merge-check khi code/review/CI hoàn tất.
- Gate lỗi lần hai thì đổi cách; ba lần cùng chữ ký thì blocked. Không skip hoặc nới assertion. M/O/staging/production/tiền thật/thông báo nằm ngoài slice.

## Task

- [x] `T-001` Fixture và bốn ca browser compile — Gate: `npm run typecheck`
- [x] `T-002` P/H org scope hiện hành trên DB disposable — Gate: `npm run test:single -- --experimental-test-module-mocks --test-concurrency=1 tests/route-users-cach-ly-org.test.ts tests/project-select-org.test.ts tests/s02c-dashboard-scope.test.ts tests/api-key-tenant-security.test.ts tests/s16-app-role-duong-phu.test.ts tests/traffic-token.test.ts tests/s02e-org-config.test.ts`
- [x] `T-003` Build production — Gate: `npm run build`
- [x] `T-004` B hai chiều desktop/mobile và download thật — Gate: `bash -o pipefail -c "npm run test:e2e -- e2e/authed/a1-ac01-org-boundary.spec.ts --workers=2 --output=.autopilot/runtime/a1-browser 2>&1 | tee .autopilot/runtime/a1-browser.log"`
- [x] `T-005` Lặp ba lần select/export hai viewport, 12 ca + setup — Gate: `bash -o pipefail -c "npm run test:e2e -- e2e/authed/a1-ac01-org-boundary.spec.ts --grep 'UI chọn|UI download' --repeat-each=3 --workers=2 --output=.autopilot/runtime/a1-repeat-final 2>&1 | tee .autopilot/runtime/a1-repeat-final.log"`
- [x] `T-006` Cổng tĩnh — Gate: `npm run gate`
- [x] `T-007` Acceptance đủ bằng chứng/review độc lập — Gate: `python3 .xtemplates/scripts/xt.py blueprint-status docs/autopilot/A1-AC01-ACCEPTANCE.md --strict`
- [x] `T-008` Merge PR slice theo L1 — Gate: `bash -c 'gh pr view codex/autopilot-a1-ac01 --json state --jq .state | rg -x MERGED'`

Một PR test/docs khi slice xong, base main mới nhất. P50 hai giờ/P90 bốn giờ cộng CI/người merge; thiếu nhánh acceptance thì giữ PARTIAL.

T-008 đã có receipt: người dùng “Cho phép merge #666”; PR #666 merge 273a09d2d403157c534df9260f1ada942ca1327a từ head 5f8a8fd5, 7 Gate PASS STABLE và toàn CI xanh. E2E CI 642 pass/50 skip baseline/0 flaky. Checkpoint đóng task được mang sang lát kế tiếp, không sửa branch đã đóng.
