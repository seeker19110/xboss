-- M134: vô hiệu hoá tài khoản thay cho xoá khi user còn dữ liệu kiểm toán (F-003).
-- NULL = đang hoạt động; khác NULL = Admin đã khoá lúc đó. Thêm thuần tuý (không đụng dòng cũ).
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
