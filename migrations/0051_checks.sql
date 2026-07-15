-- M45 PR2 — CHECK constraints + số hoá miền giá trị.
-- Đóng lỗ toàn vẹn: tiến độ ngoài [0,1], tiền âm. Postgres không có
-- ADD CONSTRAINT IF NOT EXISTS → bọc DO block bắt duplicate_object (idempotent).
--
-- ĐỤNG DỮ LIỆU (validate dòng hiện có) → phải chạy staging trước prod
-- (deploy.sh --staging, xem docs/ops/staging.md). Dọn dữ liệu vi phạm ngay
-- trước khi ADD để migration không đỏ trên dữ liệu cũ.

-- 1) Dọn tiến độ ngoài [0,1] (kẹp về biên) trước khi ràng buộc.
UPDATE tasks SET progress_percent = 0 WHERE progress_percent < 0;
UPDATE tasks SET progress_percent = 1 WHERE progress_percent > 1;
UPDATE work_packages SET progress = 0 WHERE progress < 0;
UPDATE work_packages SET progress = 1 WHERE progress > 1;

DO $$
BEGIN
  -- Tiến độ trong [0,1].
  BEGIN
    ALTER TABLE tasks ADD CONSTRAINT chk_tasks_progress
      CHECK (progress_percent BETWEEN 0 AND 1);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE work_packages ADD CONSTRAINT chk_wp_progress
      CHECK (progress BETWEEN 0 AND 1);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- Tiền không âm (cột NULL vẫn thoả CHECK).
  BEGIN
    ALTER TABLE cash_transactions ADD CONSTRAINT chk_cash_amount
      CHECK (amount >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE advances ADD CONSTRAINT chk_advances_amount
      CHECK (amount >= 0 AND settled_amount >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE invoices ADD CONSTRAINT chk_invoices_amount
      CHECK (net_amount >= 0 AND vat_amount >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE payment_cert_items ADD CONSTRAINT chk_pci_amount
      CHECK (qty_period >= 0 AND qty_cumulative >= 0 AND unit_price >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE payroll ADD CONSTRAINT chk_payroll_amount
      CHECK (gross >= 0 AND net >= 0 AND rate >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    -- qty_stock KHÔNG ràng buộc: có thể âm hợp lệ (thiếu hụt do xuất vượt tồn).
    ALTER TABLE materials ADD CONSTRAINT chk_materials_qty
      CHECK (qty_boq >= 0 AND qty_planned >= 0 AND qty_used >= 0 AND min_stock_level >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
