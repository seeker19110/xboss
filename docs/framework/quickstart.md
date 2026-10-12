# Quick Start — áp khung trong 10 phút

> Mục tiêu của trang này là chọn **đường đi đúng** và dựng bằng chứng ban đầu, không phải bỏ qua Standard Delivery Contract. Sau khi định hướng, luôn quay về [`standard-delivery.md`](standard-delivery.md).

## 1. Chọn một đường dẫn

| Nếu bạn có... | Đi theo | Đọc tiếp |
| --- | --- | --- |
| Ý tưởng hoặc repo trống | **Greenfield** | `new-project-runbook.md` |
| Repo đang chạy hoặc đã có stack | **Brownfield** | `existing-project-adoption.md` |
| Một tính năng/sửa đổi cụ thể | **Feature loop** | [`docs/specs/README.md`](../specs/README.md) rồi Standard Delivery §3 |

Đừng chọn stack, scaffold hoặc workflow mặc định chỉ vì template có sẵn một ví dụ. Chọn profile và công cụ sau research theo `03-tech-selection-and-proactive-advice.md`.

## 2. Greenfield — lộ trình đầu tiên

1. Copy khung vào repo đích bằng `copy-framework.sh` hoặc `copy-framework.ps1`.
2. Điền `PROJECT.md`: vấn đề, người dùng, MVP, outcome, rủi ro và non-goal.
3. Chọn loại dự án/profile, research phiên bản công cụ còn sống và ghi ADR cho quyết định khó đảo ngược.
4. Điền lệnh thật của dự án vào `CLAUDE.md`; không để agent đoán `build`, `test`, `lint` hay migration.
5. Hoàn thành preflight bên dưới trước feature đầu tiên.
6. Mỗi feature bắt đầu bằng `docs/specs/<date>-<slug>.md` có **Approved for implementation**.

Nếu chưa biết profile, người dùng, outcome hoặc một quyết định lớn, dừng ở research/approval; chưa code.

## 3. Brownfield — lộ trình đầu tiên

1. Inventory stack, lệnh đang chạy, CI, dữ liệu, secrets và rủi ro trước khi copy.
2. Chạy copy script; soát `_framework-dropins/` và các file `*.framework-new` rồi merge có chủ đích. Không đè cấu hình đang chạy.
3. Chạy baseline bằng lệnh chất lượng hiện có; ghi lỗi, nợ kỹ thuật và khoảng trống vào artifact phù hợp.
4. Thêm/siết gate theo từng lát nhỏ, có rollback; không thay stack hoặc rewrite hàng loạt chỉ để “giống template”.
5. Hoàn thành preflight bên dưới, rồi dùng feature loop cho thay đổi tiếp theo.

Chi tiết inventory và chiến lược tăng dần nằm tại `existing-project-adoption.md`.

## 4. Adoption preflight — trước feature/release đầu tiên

Đánh dấu từng mục bằng evidence thực: lệnh đã chạy, link CI, ảnh chụp cấu hình hoặc tài liệu vận hành.

### Contract và lệnh

- [ ] `PROJECT.md` có user, outcome, scope/non-goal, metric và guardrail.
- [ ] `CLAUDE.md` có lệnh thật cho format, lint/static analysis, type check (nếu phù hợp), test và build/package.
- [ ] `scripts/dev-task.sh gate` gọi được các lệnh thật của stack hoặc đã có adapter tương đương được ghi rõ.
- [ ] Feature đầu tiên có spec được người có thẩm quyền duyệt.

### CI và bảo mật

- [ ] CI chạy **build/test/lint của ứng dụng**, không chỉ `framework-lint`, docs consistency hay copy smoke test.
- [ ] Branch protection/ruleset đã áp thật, required checks khớp workflow và có evidence.
- [ ] Secret scan, dependency scan và SAST phù hợp stack đã bật; secrets không có trong Git/CI log.
- [ ] Với auth, payment, multi-tenant, dữ liệu nhạy cảm hoặc automation: threat model và quyền/retention đã được review.

### Vận hành và an toàn thay đổi

- [ ] Có môi trường tách biệt phù hợp, logging/health check không lộ PII và owner cho cảnh báo.
- [ ] Migration có kiểm thử, backup/restore và đường rollback phù hợp khi dự án có dữ liệu.
- [ ] Deploy/release có go/no-go, rollback và reconciliation được ghi trong runbook tương ứng.

> **Quan trọng:** framework gate xanh chỉ chứng minh tài liệu/script của khung còn nhất quán. Nó **không** chứng minh ứng dụng đích build, test, bảo mật hay deploy đúng. Evidence theo profile trong `standard-delivery.md` §10 mới là điều kiện hoàn thành.

## 5. Sau preflight

- Greenfield: tiếp tục các bước của `new-project-runbook.md`.
- Brownfield: theo kế hoạch tăng dần trong `existing-project-adoption.md`.
- Tính năng: tạo spec, nhận approval, chia slice/PR và chạy gate trước commit/merge.

Khi muốn đánh giá toàn bộ dự án thay vì một feature, dùng `project-completion.md`.
