-- 0074_warehouse_receipt_idempotency.sql — chống double-submit khi nhập kho PO
-- (purchase-orders/:id/receive): client gửi header Idempotency-Key, lưu vào
-- warehouse_receipts; unique index chặn 2 phiếu nhập trùng key cho cùng PO.
-- Cùng mẫu 0072_material_tx_idempotency.sql. Thêm thuần tuý (ADD COLUMN nullable +
-- CREATE INDEX) → idempotent, đi thẳng production.
ALTER TABLE warehouse_receipts
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS warehouse_receipts_idem_key
  ON warehouse_receipts (po_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
