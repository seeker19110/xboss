-- 0163_po_qty_exact.sql — QUALITY-FINAL-1 DATA-MIGRATIONS §6 (A3-FR04): khối lượng PO/PR/phiếu
-- nhận exact — bước EXPAND. Đặc tả: docs/nang-cap/AUDIT-2026-09-25/DATA-MIGRATIONS.md §6.
--
-- Chỉ THÊM cột/constraint (cột mới NULL hết → mọi CHECK đúng với dữ liệu cũ) — không UPDATE/
-- backfill, không NOT NULL, không DROP cột float cũ → đi thẳng production.
-- Backfill dữ liệu cũ: scripts/backfill-po-qty-exact.ts (qty::text::numeric, 'legacy_float_text').
-- Provenance THEO TỪNG CỘT: 'legacy_float_text' (biểu diễn float đã lưu) | 'exact_input_v1'
-- (chuỗi decimal canonical người dùng nhập). Cutover reader + NOT NULL là bước sau.
-- Quyền: xboss_app có quyền cấp ở mức BẢNG (ALTER DEFAULT PRIVILEGES 0069) → tự ghi được cột mới.
-- Idempotent: ADD COLUMN IF NOT EXISTS; constraint thêm qua khối DO kiểm pg_constraint.

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS qty_requested_exact numeric,
  ADD COLUMN IF NOT EXISTS qty_requested_provenance text;
ALTER TABLE po_items
  ADD COLUMN IF NOT EXISTS qty_ordered_exact numeric,
  ADD COLUMN IF NOT EXISTS qty_ordered_provenance text,
  ADD COLUMN IF NOT EXISTS qty_received_exact numeric,
  ADD COLUMN IF NOT EXISTS qty_received_provenance text;
ALTER TABLE receipt_items
  ADD COLUMN IF NOT EXISTS qty_received_exact numeric,
  ADD COLUMN IF NOT EXISTS qty_received_provenance text;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('purchase_requests', 'pr_qty_origin',
       $c$CHECK (qty_requested_provenance IN ('legacy_float_text', 'exact_input_v1'))$c$),
      ('purchase_requests', 'pr_qty_finite',
       $c$CHECK (qty_requested_exact::text NOT IN ('NaN', 'Infinity', '-Infinity'))$c$),
      ('purchase_requests', 'pr_qty_new_range',
       $c$CHECK (qty_requested_provenance <> 'exact_input_v1' OR
          (qty_requested_exact IS NOT NULL
           AND qty_requested_exact BETWEEN 0 AND 999999999999999999.999999
           AND scale(qty_requested_exact) <= 6))$c$),
      ('po_items', 'po_ordered_origin',
       $c$CHECK (qty_ordered_provenance IN ('legacy_float_text', 'exact_input_v1'))$c$),
      ('po_items', 'po_received_origin',
       $c$CHECK (qty_received_provenance IN ('legacy_float_text', 'exact_input_v1'))$c$),
      ('po_items', 'po_ordered_finite',
       $c$CHECK (qty_ordered_exact::text NOT IN ('NaN', 'Infinity', '-Infinity'))$c$),
      ('po_items', 'po_received_finite',
       $c$CHECK (qty_received_exact::text NOT IN ('NaN', 'Infinity', '-Infinity'))$c$),
      ('po_items', 'po_ordered_new_range',
       $c$CHECK (qty_ordered_provenance <> 'exact_input_v1' OR
          (qty_ordered_exact IS NOT NULL
           AND qty_ordered_exact BETWEEN 0 AND 999999999999999999.999999
           AND scale(qty_ordered_exact) <= 6))$c$),
      ('po_items', 'po_received_new_range',
       $c$CHECK (qty_received_provenance <> 'exact_input_v1' OR qty_received_exact IS NULL OR
          (qty_received_exact BETWEEN 0 AND 999999999999999999.999999
           AND scale(qty_received_exact) <= 6))$c$),
      ('receipt_items', 'receipt_qty_origin',
       $c$CHECK (qty_received_provenance IN ('legacy_float_text', 'exact_input_v1'))$c$),
      ('receipt_items', 'receipt_qty_finite',
       $c$CHECK (qty_received_exact::text NOT IN ('NaN', 'Infinity', '-Infinity'))$c$),
      ('receipt_items', 'receipt_qty_new_range',
       $c$CHECK (qty_received_provenance <> 'exact_input_v1' OR
          (qty_received_exact IS NOT NULL
           AND qty_received_exact BETWEEN 0 AND 999999999999999999.999999
           AND scale(qty_received_exact) <= 6))$c$)
    ) AS v(tbl, name, def)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = c.name AND conrelid = c.tbl::regclass
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', c.tbl, c.name, c.def);
    END IF;
  END LOOP;
END $$;
