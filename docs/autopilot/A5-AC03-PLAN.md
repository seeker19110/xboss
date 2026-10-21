# Autopilot — A5-AC03 · 22/10/2026

> Phiên chính tự duyệt theo D-001 trong A5-AC03-DECISIONS.md; tiếp tục yêu cầu /autopilot, QUALITY-FINAL-1 Approved 25/09/2026. Đây là slice kế tiếp sau A4-AC06 (#663), không thay kết quả loop trước.

## Phạm vi G0–G4

Đóng khoảng trống lớp B batch/approve đồng thời tại S15, giữ nguyên acceptance A5-AC03: tick/approve/batch/offline không lost update, duplicate effect hoặc bypass; hủy tầng giữ task duyệt riêng đúng approval_source.
Người dùng là PM/engineer của dự án; chỉ số thành công là năm ca mới cho bốn nhóm nghiệp vụ trên desktop/mobile, có bằng chứng request thật cùng chờ khóa, đúng API/DB và giao diện sau reload; regression mất ACK vẫn đúng một receipt/effect.
Giữ stack Node 24, Next 16, PostgreSQL, Playwright 1.63 theo lockfile; tái sử dụng hồ sơ SaaS L và thiết kế/schema/API đã Approved. BLUEPRINT toàn sản phẩm vẫn 1152 MUST/639 SHOULD chưa audit; [acceptance slice](A5-AC03-ACCEPTANCE.md) có sáu MUST, không SHOULD.
Research dùng spec A5, TEST-MATRIX, S15, route và fixture hiện tại; không chọn thư viện/dịch vụ mới. UI/browser → Next route → PostgreSQL là luồng hiện hữu; SQL fixture chỉ tạo input, nghiệp vụ chạy qua HTTP có cookie thật. Không đổi schema, app, quyền, hook, CI hay dependency.
Threat boundary: tổ chức/dự án riêng mỗi ca, hai PM khác ID có membership thật; giữ context cookie, không dùng admin storageState cho phiên thứ hai. Test chỉ dùng PostgreSQL disposable, không production/secret/dữ liệu người dùng.

## Contract và ownership

Executor chỉ tạo `e2e/helpers/a5-approval-fixtures.ts` và `e2e/authed/a5-ac03-concurrency.spec.ts`. Root sở hữu docs, runtime, gate, git/PR; reviewer khác model chỉ đọc, không agent lồng.
Hai PM cùng org/project, WBS có floor_label và dimensions. Không dùng `dungToChucCoLap(["pm", "pm"])` vì map role/email trùng. Phiên browser mới phải giữ viewport/mobile settings nhưng storageState rỗng.
API: PATCH `/api/dimensions/batch`, POST `/api/approvals`, POST `/api/tasks/:id/approve`, DELETE `/api/floor-approvals/:id`. Không mock route, auth, DB hoặc response nghiệp vụ; mất ACK dùng spec có sẵn gọi server thật trước khi cắt response.
Barrier: chỉ giữ taskA chung bằng connection riêng, khởi động hai request browser, observer riêng đợi ít nhất hai backend trong cây `pg_blocking_pids` của PID giữ khóa rồi mới release. Lịch có thứ tự yêu cầu unique firstPID đã chờ trước khi start request sau; cùng lần quan sát cuối phải thấy firstPID còn chờ locker và cạnh secondPID→…→firstPID. Chỉ `Promise.all` hoặc sleep không đủ. Dialog/DOM sẵn sàng trước khi khóa; chờ dưới idle transaction timeout 15 giây, luôn unlock và thu request trong finally.
Approve đôi: chính xác 200+409, một floor row và một history nghiệm thu/task, UI lỗi ở phiên thua và hai phiên hội tụ sau reload. Batch chồng: hợp đủ ô, progress/history liên tục, replay không tăng state/history; installed_at/by theo M120 có thể đóng dấu lại mỗi request online (D-002), receipt cùng key được kiểm riêng ở mất ACK. Approve-vs-untick: chỉ (200,409) hoặc (422,200); không 5xx, `nghiem_thu ⇒ progress=1`. Task A duyệt riêng trước floor A+B, hủy floor giữ A/source task, trả B/source null, không nhân audit A.

## Ngân sách và điểm dừng

- Tối đa 28 vòng.
- Ngân sách slice: 60000 token (điều chỉnh dự toán mềm theo D-004, không reset phần đã dùng), không gọi provider trả phí.
- Timeout mỗi Gate: 3600 giây (`XT_RECORD_TIMEOUT`).
- Hạn: 6 giờ từ loop init của worktree này, không reset loop doctor.

Không có hạn hợp đồng mới. L1 giữ nguyên; người dùng đã xác nhận cho phép merge664và665 theo D-006, chỉ thực hiện khi CI của HEAD mới xanh. Dữ liệu thật, production, tiền thật, thông báo, sửa cổng/quyền nằm ngoài slice. Gate lỗi lần hai phải đổi cách; ba lần cùng chữ ký thì máy blocked, không skip hoặc nới assertion.

## Task

- [x] `T-001` Fixture và năm ca browser compile — Gate: `npm run typecheck`
- [x] `T-002` P/H concurrency và approval_source trên DB disposable — Gate: `npm run test:single -- --experimental-test-module-mocks --test-concurrency=1 tests/s15-dong-thoi-lo.test.ts tests/route-nghiem-thu-bat-bien.test.ts`
- [x] `T-003` Build production — Gate: `npm run build`
- [x] `T-008` Chứng minh hai lịch race ổn định qua năm lượt desktop/mobile — Gate: `npm run test:e2e -- e2e/authed/a5-ac03-concurrency.spec.ts --grep 'duyệt chờ trước|bỏ tick chờ trước' --repeat-each=5 --workers=2`
- [x] `T-004` Browser mới và mất ACK trên desktop/mobile — Gate: `npm run test:e2e -- e2e/authed/a5-ac03-concurrency.spec.ts e2e/authed/offline-deep.spec.ts --grep 'A5-AC03|mất ACK' --workers=2`
- [x] `T-005` Cổng tĩnh — Gate: `npm run gate`
- [x] `T-006` Acceptance đủ bằng chứng và review độc lập — Gate: `python3 .xtemplates/scripts/xt.py blueprint-status docs/autopilot/A5-AC03-ACCEPTANCE.md --strict`
- [ ] `T-007` Merge PR slice theo L1 — Gate: `bash -c 'gh pr view codex/autopilot-a5-ac03 --json state --jq .state | rg -x MERGED'`

Một PR test/docs, stack lên doctor nếu chưa merge; không dồn hai slice vào một PR. P50 1 giờ, P90 3 giờ cộng CI/người merge. Nếu không chứng minh được overlap hoặc thiếu nhánh acceptance thì giữ A5-AC03 PARTIAL.

Fixture chỉ tạo org/project/users/WBS riêng và đóng mọi context/pool; giữ input/audit cô lập tới global-setup kế tiếp của DB disposable, không xóa audit/seed chung để dọn test.

D-003: approve-vs-untick ép hai thứ tự thắng trên fixture riêng bằng probe DB cho action đầu trước khi start action sau; cả hai phải cùng chờ trước release, timeout tổng dưới15 giây. Bốn nhóm nghiệp vụ thành năm ca mới × hai viewport, cộng mất ACK × hai và setup:13 lượt bắt buộc.

D-005: final verify26c25256 bắt flake ở ordered race; sửa barrier chỉ giữ taskA chung và bắt buộc cạnh secondPID→firstPID→locker cùng snapshot. Không dùng first-arrival riêng lẻ để suy người thắng. Đã mở lại T-004/T-006 sau kết quả đỏ; sau sửa, T-008 đạt20 ordered cases qua năm lượt mỗi lịch/viewport và T-004 đủ13/13,0 skip. Final verify bắt buộc kiểm lại bảy Gate sau commit.

D-006: #664 đã merge8fc15d89; #665 đã retarget main, merge origin/main và cập nhật hai docs conflict, source test/checker không đổi. Người dùng đã cho phép cả hai; kiểm lại bảy Gate vàCI mới trước merge665.
