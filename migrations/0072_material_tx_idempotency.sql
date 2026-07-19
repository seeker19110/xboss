-- 0072_material_tx_idempotency.sql — chống double-submit khi xuất/hoàn kho vật tư
-- (materials/:id/issue, materials/:id/return): client gửi header Idempotency-Key,
-- lưu vào material_transactions; unique index chặn 2 giao dịch trùng key cho cùng
-- vật tư + loại thao tác. Thêm thuần tuý (ADD COLUMN nullable + CREATE INDEX) →
-- idempotent, đi thẳng production.
ALTER TABLE material_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS material_transactions_idem_key
  ON material_transactions (material_id, type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
