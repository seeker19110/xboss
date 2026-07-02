-- 0002_login_rate_limit.sql — Chuyển rate-limit đăng nhập từ in-memory (Map) sang Postgres.
-- Lý do: đếm trong process bị sai khi chạy nhiều instance (mỗi instance đếm riêng,
-- kẻ tấn công phân tán request qua nhiều instance thì né được giới hạn). Bảng này
-- đóng vai trò store dùng chung, đúng ADR-0001 (không thêm Redis/hạ tầng mới).
CREATE TABLE IF NOT EXISTS login_rate_limits (
  key TEXT PRIMARY KEY,       -- "ip|email" hoặc "ip|<ip>"
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);
