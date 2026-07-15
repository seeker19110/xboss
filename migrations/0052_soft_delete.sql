-- M45 PR4 — Soft-delete thực thể hợp đồng-tài chính.
-- Thêm cột deleted_at (NULL = còn sống). Route DELETE chuyển thành
-- UPDATE deleted_at = now(); mọi SELECT liệt kê/thống kê thêm deleted_at IS NULL.
-- Admin xem/khôi phục qua ?includeDeleted=1 + POST /api/<entity>/:id/restore.
-- Chỉ ADD COLUMN (thêm thuần tuý) → đi thẳng production được.
--
-- Bảng tracking (tasks, progress_dimensions, materials…) GIỮ hard-delete.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE variation_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE payment_certs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE insurance_bonds ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Lọc nhanh dòng còn sống (điều kiện phổ biến nhất).
CREATE INDEX IF NOT EXISTS idx_contracts_alive ON contracts(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_alive ON invoices(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_bonds_alive ON insurance_bonds(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_claims_alive ON claims(id) WHERE deleted_at IS NULL;
