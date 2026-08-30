-- Migration 0112: Smart Materials QR Logistics & Mobile Barcode Receiving Scanner (M78)
-- Quản lý chuỗi cung ứng vật tư, tự động sinh mã QR định danh cho từng kiện hàng/spool/thiết bị, quét barcode bằng Camera PWA và đối soát GRN

CREATE TABLE IF NOT EXISTS engineering_material_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shipment_code TEXT NOT NULL,
  do_number TEXT NOT NULL,
  po_number TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'in_transit', 'site_received', 'inspected_ok', 'has_discrepancy', 'closed')),
  total_items_count INTEGER NOT NULL DEFAULT 0,
  received_items_count INTEGER NOT NULL DEFAULT 0,
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  manifest_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_material_qr_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shipment_id UUID REFERENCES engineering_material_shipments(id) ON DELETE SET NULL,
  qr_code TEXT NOT NULL UNIQUE,
  tag_type TEXT NOT NULL DEFAULT 'material_unit' CHECK (tag_type IN ('material_unit', 'spool_bundle', 'delivery_order', 'equipment_asset')),
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1.0,
  unit TEXT NOT NULL DEFAULT 'cái',
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'scanned_on_site', 'inspected', 'installed', 'damaged', 'lost')),
  scanned_at TIMESTAMPTZ,
  scanned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  location_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_goods_receipt_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES engineering_material_shipments(id) ON DELETE CASCADE,
  grn_number TEXT NOT NULL,
  received_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  inspection_status TEXT NOT NULL DEFAULT 'passed' CHECK (inspection_status IN ('passed', 'passed_with_minor_defects', 'rejected')),
  variance_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipments_proj_code
  ON engineering_material_shipments (project_id, shipment_code, status);

CREATE INDEX IF NOT EXISTS idx_qr_tags_proj_code
  ON engineering_material_qr_tags (project_id, qr_code, status);

CREATE INDEX IF NOT EXISTS idx_grn_proj_shipment
  ON engineering_goods_receipt_notes (project_id, shipment_id);

ALTER TABLE engineering_material_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_material_shipments FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_material_qr_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_material_qr_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE engineering_goods_receipt_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_goods_receipt_notes FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_material_shipments' AND policyname = 'engineering_material_shipments_isolation') THEN
    CREATE POLICY engineering_material_shipments_isolation ON engineering_material_shipments FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_material_qr_tags' AND policyname = 'engineering_material_qr_tags_isolation') THEN
    CREATE POLICY engineering_material_qr_tags_isolation ON engineering_material_qr_tags FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engineering_goods_receipt_notes' AND policyname = 'engineering_goods_receipt_notes_isolation') THEN
    CREATE POLICY engineering_goods_receipt_notes_isolation ON engineering_goods_receipt_notes FOR ALL
      USING (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*')
      WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::integer OR current_setting('app.project_id', true) = '*');
  END IF;
END $$;
