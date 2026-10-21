# Autopilot — A4-AC06 · 22/10/2026

> Duyệt bởi phiên chính: D-003 (phạm vi D-001/D-002), QUALITY-FINAL-1 Approved 25/09/2026 bởi chủ dự án XBoss.
> Base: `a723c578afd1f3c08ccd305fb809d0a7309ae152`; đã merge #651–#662, không còn PR mở trước khi bắt đầu.

## Phạm vi và cổng duyệt

XBoss là web app SaaS nhiều tổ chức, Node 24, Next 16, PostgreSQL raw SQL; lockfile Playwright 1.63.0.
Blueprint sản phẩm L được sinh nguyên văn: 1152 MUST, 639 SHOULD, chưa audit; đây không phải nghiệm thu toàn sản phẩm.
Loop này dùng [acceptance của A4-AC06](A4-AC06-ACCEPTANCE.md), giữ toàn bộ ba nhánh của tiêu chí đã duyệt.
Mục tiêu: sáu ca browser trên desktop/mobile, API/DB thật, không mock báo cáo; list/KPI đúng scope, nhãn trùng đúng dòng, bốn vai trò bị cấm không nhận tiền.
Không sửa app/backend/schema, công thức tiền, quyền, lockfile, CI, hook, dữ liệu thật hoặc triển khai.
Research và contract ở [RESEARCH.md](RESEARCH.md). Lịch sử PROGRESS được giữ nguyên byte, vẫn cùng thư mục gốc để link tương đối còn đúng.
PR của slice mới cần người merge theo `merge_autonomy: L1`; quyền merge các PR cũ đã được thực hiện đầy đủ.
Doctor có false positive đường dẫn `..` trong hook; không sửa checker/hook để ép xanh, ghi việc cần người riêng.

## Ngân sách (4 con số)

- Số vòng tối đa: 20.
- Ngân sách: 60000 token từ lúc khởi động loop; không gọi provider trả phí trong test.
- Timeout mỗi lệnh Gate: 3600 giây (`XT_RECORD_TIMEOUT`).
- Hạn chót: 6 giờ từ `loop init`; thời điểm UTC do `.autopilot/state.json` ghi.

## Hạn

Không có hạn hợp đồng mới. Hạn nội bộ là deadline trên; hết ngân sách thì checkpoint, không hạ gate.

## Điểm dừng bắt buộc về hành động

- Production, dữ liệu thật, secret, tiền thật, thông báo đối ngoại.
- Sửa quyền, CI/hook/checker bảo vệ; không làm trong slice này.
- Merge PR mới theo L1: làm xong, review, kiểm CI rồi gom cho người.
- Cùng chữ ký lỗi ba lần: máy blocked; lần hai phải đổi cách.

## Task

- [x] `T-001` Chuẩn hóa trạng thái ngắn và giữ lịch sử nguyên vẹn — Gate: `python3 .xtemplates/scripts/xt.py progress-check`
- [x] `T-002` Fixture riêng và sáu ca browser A4-AC06 compile — Gate: `npm run typecheck`
- [x] `T-003` Kiểm oracle miền costs/portfolio trên PostgreSQL disposable — Gate: `npm run test:single -- --experimental-test-module-mocks --test-concurrency=1 tests/cost-report.test.ts tests/portfolio-kpi.test.ts`
- [x] `T-004` Build production trên main mới và dependency đúng lock — Gate: `npm run build`
- [x] `T-005` Browser thật desktop/mobile cho A4-AC06 — Gate: `npm run test:e2e -- e2e/authed/a4-ac06-report-scope.spec.ts --workers=2`
- [ ] `T-006` Toàn bộ cổng tĩnh của repo — Gate: `npm run gate`
- [ ] `T-007` Đối chiếu đủ acceptance của slice với bằng chứng và review — Gate: `python3 .xtemplates/scripts/xt.py blueprint-status docs/autopilot/A4-AC06-ACCEPTANCE.md --strict`
- [ ] `T-008` Người review và merge PR của slice theo L1 — Gate: `bash -c 'gh pr view --json state --jq .state | rg -x MERGED'`
- [ ] `T-009` Người xử lý checker doctor của harness bằng thay đổi được duyệt — Gate: `python3 .xtemplates/scripts/xt.py doctor`

## Contract và file ownership

Executor chỉ tạo `e2e/helpers/a4-report-fixtures.ts` và `e2e/authed/a4-ac06-report-scope.spec.ts`.
PM có ba dự án active/handover/closed cùng org được gán, một cùng org không gán và grant sai org để kiểm boundary.
Hai sheet khác tháp có code/tầng giống nhau, khóa khác; HĐ 1/7 tỷ, actual 0,1/0,8 tỷ, org khác có sentinel.
Bốn vai trò engineer/subcon/viewer/cdt có membership hợp lệ, phiên riêng; system/floor phải 403 chỉ lỗi, không rows/totals/alerts/metadata hoặc tiền trong DOM.
Root sở hữu docs, state và runtime; reviewer chỉ đọc. Không sửa helper dùng chung hoặc generated artifact của nhau.

## Ước lượng

Một PR test/docs; P50 1 giờ, P90 3 giờ, cộng thời gian CI và người merge. Không có phụ thuộc dịch vụ ngoài.
