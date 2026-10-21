# PROGRESS — XBoss

## Đang làm

Đã merge [PR #663](https://github.com/seeker19110/xboss/pull/663) theo chỉ dẫn trực tiếp, main `2adda49d592d744fb6eddb0954bb6f035196f5a0`. CI của head `a327f4e7bcd33d5f2038175db696898afee5b51d` xanh trước merge. #651–#662 cũng đã merge.

Nhánh `codex/autopilot-doctor` sửa false positive ROOT/../.. của checker theo D-007/D-008. Scanner đọc full relative path, giữ đường dẫn thực và chỉ bỏ navigation gồm toàn dấu chấm; regression gọi checker Python thật từ Node. Không đổi hook/settings/policy hoặc L1. Gate T-011/T-009/typecheck được ghi lại sau bản vá; kết quả review/CI và final verify theo đúng HEAD ở PR.

A4-AC06 đã có 13/13 browser desktop/mobile, 18/18 oracle costs/portfolio, build và 18/18 cổng tĩnh. Regression A4/home/IPC/offline:43 pass,2 skip desktop có sẵn cho ca chỉ chạy mobile. PR #663 đã tích hợp các bằng chứng này; không nghiệm thu toàn sản phẩm.

## Tiếp theo

Tiếp tục A5-AC03 trên nhánh riêng: bốn ca browser đồng thời, khóa DB chứng minh overlap, kiểm history/approval_source và regression mất ACK. Spec Approved 25/09/2026; giữ PARTIAL nếu chưa đủ bằng chứng. Một PR cho mỗi slice; PR mới theo L1 cần người merge sau khi diff/review/CI sẵn sàng.

## Quyết định

[D-001–D-008](docs/autopilot/DECISIONS.md): A4-AC06 giữ đầy đủ acceptance; D-007 ghi quyền người dùng merge #663/sửa doctor; D-008 giữ filesystem semantics sau review phát hiện lexical normalization che thư mục trung gian thiếu. [FB-002](docs/xtemplates-feedback/FB-002.md) ghi bản vá harness và regression.

BLUEPRINT toàn sản phẩm còn 1152 MUST/639 SHOULD chưa audit. Không thay bằng chứng test thành M/O hoặc production. Người dùng đã thu hồi AGENTS.md cũ; không khôi phục WIP/file xóa tại checkout gốc. Giữ quyết định cũ về parser revision và giấy phép.

## Bàn giao phiên

Base main đã merge `2adda49d592d744fb6eddb0954bb6f035196f5a0`; nhánh hiện tại `codex/autopilot-doctor`.

[PLAN](docs/autopilot/PLAN.md) và [GO-NO-GO](GO-NO-GO.md) phân biệt phần đã merge, bản vá và giới hạn. Runtime/evidence ở `.autopilot/`, chỉ dùng PostgreSQL disposable và browser production. Final verify chạy sau commit trên cây cuối; CI đối chiếu head PR.

[Lịch sử nguyên byte](PROGRESS-HISTORY-2026-10-22.md), SHA256 `ce10b14403c8be6fdba16cb755e0b6c919d3552624a3f39b3862d4f95edc8009`.
