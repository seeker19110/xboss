# Acceptance — phát hành và phần còn chờ của M136

Nguồn: [M136](../nang-cap/M136-trai-nghiem-hieu-nang-tinh-gon.md),
[goal](../goals/upgrade-ux-performance-2026-10.md) và chỉ dẫn `/autopilot` ngày 24/10/2026.
Chỉ kiểm lát M136; không nghiệm thu blueprint toàn sản phẩm.

- [x] `M136-REL-001` **MUST** Evidence lưu trong repo dẫn đúng PR #675, SHA squash, CI main và deploy; phân biệt Git SHA với migration head.
- [x] `M136-REL-002` **MUST** Public smoke 23/10 được ghi đúng phạm vi desktop/mobile unauthenticated, API 401, health/readiness 200; không coi là UAT hoặc business flow production đã đăng nhập.
- [x] `M136-REL-003` **MUST** Goal/spec/PROGRESS/runbook cập nhật rollout VERIFIED, giữ UAT/usage chờ người; số test local và CI được ghi riêng.
- [x] `M136-REL-004` **MUST** Cổng tĩnh và review độc lập đạt; thay đổi chỉ gồm tài liệu/evidence, không secret, dữ liệu riêng tư hoặc runtime artifact.
- [ ] `M136-UAT-001` **MUST** 3–5 người đại diện và thiết bị Safari/cảm ứng thật có kết quả UAT theo runbook, chưa có bằng chứng thì tiếp tục chờ.
- [ ] `M136-USAGE-001` **MUST** Cửa sổ usage thực được xác nhận nguồn, coverage và thời điểm; owner quyết định giữ/gộp/gỡ trước khi xóa capability sống.

Hai MUST cuối thuộc outcome sản phẩm còn mở; không miễn trừ, không đánh dấu N/A để kết thúc vòng.

## Evidence của phần kỹ thuật

REL-001/002: [release.md](../ops/evidence/m136/release.md) và [release.json](../ops/evidence/m136/release.json).
REL-003: goal/spec/PROGRESS/runbook trong cùng PR đối soát. REL-004: 18/18 gate ngày 24/10,
review độc lập 0 P1/P2, chỉ docs/evidence. Final verify chạy lại Gate trên cây cuối.
