# PROGRESS — XBoss

## Đang làm

Autopilot A4-AC06: kiểm chứng scope báo cáo với browser/API/DB thật theo QUALITY-FINAL-1 Approved 25/09/2026. [PLAN](docs/autopilot/PLAN.md) có evidence xanh T-001–T-007: progress/typecheck, 18/18 oracle costs/portfolio không skip, production build, sáu ca desktop/mobile (12 lượt + setup), 18/18 cổng tĩnh, strict acceptance không còn MUST mở của slice.

Browser kiểm list/KPI/filter cùng scope; hai sheet trùng code/T1 đúng dòng và tiền; theo link thật kiểm bill IDs/tiền/sheet của trang đích; engineer/subcon/viewer/cdt nhận nguyên body 403 an toàn, không có UI tài chính. Review độc lập đóng cả hai finding sau sửa.

Đã merge đủ #651–#662 với CI xanh trên từng head; không còn PR cũ mở khi khởi động.

## Tiếp theo

PR của nhánh này dùng CI theo đúng HEAD và kiểm lại bảy Gate bằng `loop verify` trước bàn giao; trạng thái chia sẻ ghi ở PR. Merge PR mới theo L1, T-008 chờ người. [GO-NO-GO](GO-NO-GO.md) chỉ cho slice A4-AC06 và liệt kê bước xử lý phần chờ; blueprint toàn sản phẩm vẫn mở.

T-009 đã defer: doctor nhận nhầm `..` trong đường dẫn hook là file thiếu. Các file hook thật tồn tại; cần bản vá checker được review riêng. Không sửa cổng bảo vệ trong slice báo cáo.

## Quyết định

[D-001–D-005](docs/autopilot/DECISIONS.md): dùng toàn bộ acceptance A4-AC06 cho slice; blueprint sản phẩm L còn 1152 MUST/639 SHOULD chưa audit. Không nghiệm thu toàn sản phẩm. D-004 sửa cờ Node để oracle chạy đúng API mock; D-005 giới hạn hai worker, giữ nguyên 12 lượt và assertion.

Người dùng đã thu hồi hướng dẫn AGENTS.md cũ trong hội thoại 22/10/2026. Không khôi phục file đang sửa/xóa ở checkout gốc. Giữ nguyên quyết định cũ về parser revision và giấy phép.

## Bàn giao phiên

Base đã merge: `a723c578afd1f3c08ccd305fb809d0a7309ae152`. Nhánh `codex/autopilot-a4-ac06`; runtime/evidence riêng ở `.autopilot/`; PostgreSQL disposable và browser production, không mock báo cáo. Không đổi app/backend/schema/quyền/CI hay triển khai.

[Lịch sử nguyên byte](PROGRESS-HISTORY-2026-10-22.md), SHA256 `ce10b14403c8be6fdba16cb755e0b6c919d3552624a3f39b3862d4f95edc8009`. Xem [research](docs/autopilot/RESEARCH.md). Bằng chứng chia sẻ sẽ là PR/CI.
