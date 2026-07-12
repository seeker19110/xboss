-- Chặn trùng mã hàng (work_packages.code) trong cùng sheet ở tầng DB.
-- Trước đây chỉ kiểm tra ứng dụng (SELECT rồi mới INSERT, không transaction/lock) —
-- 2 người dùng cùng bấm "Thêm hạng mục" với cùng mã trong cùng sheet (đợt audit
-- 2026-07-12 phát hiện, sau khi tính năng thêm/sao chép hạng mục lên lưới tracking
-- nhiều người dùng đồng thời) có thể tạo trùng code do race condition.
-- Backfill: nếu dữ liệu cũ đã lỡ trùng, index CONCURRENTLY sẽ không tạo được —
-- dùng bản thường (migration chạy trong 1 transaction ngắn lúc boot, chấp nhận khoá bảng
-- ngắn) và để lộ lỗi rõ ràng nếu có trùng thật, không âm thầm bỏ qua.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wp_sheet_code ON work_packages(sheet_type_id, lower(code));
