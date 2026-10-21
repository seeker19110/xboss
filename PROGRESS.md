# PROGRESS — XBoss

## Đang làm

Autopilot A4-AC06: kiểm chứng scope báo cáo bằng browser + API/DB thật. Spec QUALITY-FINAL-1 được chủ dự án duyệt 25/09/2026. Kế hoạch và Gate: [PLAN](docs/autopilot/PLAN.md).

Đã merge đủ #651–#662 sau review và CI xanh trên head tương ứng; lúc khởi động không còn PR mở. Main bao gồm UI recovery/exact money, harness regression và dependency updates.

## Tiếp theo

Fixture tổ chức/role riêng → typecheck → oracle miền → production build → desktop/mobile → gate → review và PR. Không sửa app/backend/schema/quyền/tiền/CI. Runtime chỉ dùng PostgreSQL disposable.

Doctor báo false positive tên file `..` trong đường dẫn hook; giữ nguyên checker và ghi việc chờ người. Không coi cảnh báo này là bằng chứng hook thực tế thiếu.

## Quyết định

[D-001/D-002](docs/autopilot/DECISIONS.md): lát đầu đóng đủ A4-AC06; blueprint sản phẩm L có 1152 MUST/639 SHOULD chưa audit, không tick khống hay nghiệm thu toàn bộ sản phẩm. Loop dùng acceptance riêng của slice.

Người dùng đã thu hồi bộ hướng dẫn AGENTS.md cũ trong hội thoại 22/10/2026. Không khôi phục các file người dùng đang sửa/xóa ở checkout gốc.

Giữ lịch sử nguyên byte tại [PROGRESS-HISTORY-2026-10-22.md](PROGRESS-HISTORY-2026-10-22.md). Quyết định cũ về parser revision và giấy phép không bị mở lại.

## Bàn giao phiên

Base đã có trên main: `a723c578afd1f3c08ccd305fb809d0a7309ae152`. Nhánh: `codex/autopilot-a4-ac06`.

State/evidence cục bộ ở `.autopilot/`; bằng chứng chia sẻ sẽ là PR/CI. Merge PR mới giữ L1. Xem [research](docs/autopilot/RESEARCH.md); lịch sử trước loop giữ SHA256 `ce10b14403c8be6fdba16cb755e0b6c919d3552624a3f39b3862d4f95edc8009`.
