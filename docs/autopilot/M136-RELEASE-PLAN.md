# Autopilot — đối soát phát hành M136 · 24/10/2026

> Lát tài liệu mức S thuộc goal UPGRADE-2026-10 đã được chủ dự án duyệt.
> Base `d413650c567fa9a515eae5081e612eea53ea8913`, PR #675 đã merge và deploy.
> Phiên chính tự duyệt phạm vi theo `/autopilot`; không mở capability mới.

## Phạm vi và research

G0–G4 tái sử dụng PROJECT, đặc tả M136 và kiến trúc hiện tại: Next.js 16.4.2,
React 19, Node 24, PostgreSQL raw SQL. Không đổi stack, API, schema hoặc threat model.
Acceptance của lát này ở [M136-RELEASE-ACCEPTANCE.md](M136-RELEASE-ACCEPTANCE.md);
blueprint 1152 MUST/639 SHOULD của toàn sản phẩm vẫn chưa được nghiệm thu.

Goal/spec/PROGRESS vẫn ghi rollout chưa diễn ra, trong khi GitHub xác nhận PR #675,
CI main 39963366086 và deploy 39964822526 thành công trên cùng SHA. Bằng chứng smoke
23/10 chỉ nằm trong `.autopilot/` bị ignore. Lát này lưu bản đã soát vào repo và sửa
trạng thái tài liệu; không sửa app để tạo thêm công việc khi chưa có lỗi được chứng minh.

File root sở hữu: plan/acceptance/decisions của lát này, PROGRESS, goal M136, spec M136,
runbook và `docs/ops/evidence/m136/`. Subagent chỉ đọc/kiểm chứng, không sửa cùng file.
Researcher đối chiếu GitHub và public health; reviewer độc lập soát diff trước PR.

## Ngân sách và giới hạn

- Trần 20 vòng; cùng chữ ký lỗi tối đa 3 lần, lần hai phải đổi cách.
- Dịch vụ ngoài trả phí: 0 USD; không gọi provider trả phí hoặc thêm tài khoản.
- Timeout mỗi Gate: 3600 giây (`XT_RECORD_TIMEOUT=3600`).
- Hạn: 2 giờ kể từ `loop init`; UTC lưu trong state.

Không sửa auth, dữ liệu thật, schema, module sống, CI/hook, lockfile hoặc cấu hình quyền.
UAT phải có người thật, Safari/cảm ứng phải có thiết bị thật; không lấy ngày deploy làm
ngày bắt đầu cửa sổ usage khi telemetry chưa được xác nhận. Không suy snapshot lab thành CWV.
Merge PR mới theo `xt.yaml: merge_autonomy: L1`; không đổi chính sách này trong lát tài liệu.

## Task

- [x] `T-001` Lưu bằng chứng phát hành đã rà thông tin nhạy cảm và kiểm sự nhất quán — Gate: `git diff --check`
- [x] `T-002` Đồng bộ goal/spec/runbook/PROGRESS, giữ đúng phần còn chờ và soát độc lập — Gate: `npm run gate`
- [x] `T-003` Commit/push và mở PR đối soát đã qua cổng — Gate: `gh pr view codex/m136-release-reconciliation --repo seeker19110/xboss --json url,state,headRefOid`
- [ ] `T-004` UAT 3–5 người và Safari/cảm ứng thật — Gate: `python3 .xtemplates/scripts/xt.py blueprint-status docs/autopilot/M136-RELEASE-ACCEPTANCE.md --strict`
- [ ] `T-005` Thu đủ usage theo kỳ và owner quyết định giữ/gộp/gỡ — Gate: `python3 .xtemplates/scripts/xt.py blueprint-status docs/autopilot/M136-RELEASE-ACCEPTANCE.md --strict`
- [ ] `T-006` Merge PR tài liệu khi được duyệt theo L1 — Gate: `gh pr view codex/m136-release-reconciliation --repo seeker19110/xboss --json state --jq .state | rg -x MERGED`

## Hoàn thành và đường lùi

Kết quả của lát tự làm là evidence truy được về PR/run/SHA và tài liệu không còn ghi sai
rollout. Toàn goal vẫn chưa Complete khi thiếu UAT/usage. Dùng `loop defer` cho việc cần
người; final verify chạy lại các Gate của task đã hoàn tất, không bịa dữ liệu cho task hoãn.
Rollback tài liệu bằng revert PR; production M136 giữ quy trình rollback đã ghi trong runbook.

## Bằng chứng kiểm chứng lát tài liệu

Ngày 24/10: `npm run gate` 18/18 xanh, `git diff --check` đạt. Reviewer độc lập
không có finding P1/P2; SHA/tree, link, scope, secret/PII và giới hạn smoke được soát.
Full test/build/E2E của mã M136 đã có trong CI phát hành; lát này không đổi mã chạy.

Đã commit/push và mở [PR #676](https://github.com/seeker19110/xboss/pull/676).
T-004/005 và hai MUST sản phẩm được defer, không miễn trừ; T-006 chờ merge theo L1.
[Checkpoint GO/NO-GO](../ops/evidence/m136/GO-NO-GO.md).
