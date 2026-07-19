-- V5 — Thu hồi phiên chủ động (session revocation).
-- Mỗi user có 1 bộ đếm phiên: tăng bộ đếm = mọi token phát trước đó (nhúng session_version
-- cũ) hết hiệu lực ngay request kế tiếp (getCurrentUser đối chiếu cột này với sv trong token).
-- Thêm thuần tuý (ADD COLUMN, DEFAULT 0) — không đụng dòng dữ liệu hiện có.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0;
