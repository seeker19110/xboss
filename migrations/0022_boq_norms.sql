-- 0022_boq_norms.sql — M18: Định mức vật tư/nhân công/máy theo hạng mục BOQ.
-- Xem docs/nang-cap/M18-dinh-muc.md.

CREATE TABLE IF NOT EXISTS boq_norms (
  id SERIAL PRIMARY KEY,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('material','labor','equipment')),
  material_id INTEGER REFERENCES materials(id),
  resource_name TEXT,
  qty_per_unit NUMERIC(15,4) NOT NULL,
  unit_label TEXT NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT boq_norms_material_chk CHECK (
    (resource_type = 'material' AND material_id IS NOT NULL) OR
    (resource_type <> 'material' AND resource_name IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_boq_norms_item ON boq_norms(boq_item_id);

-- Cảnh báo vật tư vượt định mức theo hạng mục (>ngưỡng %) — Admin/PM/kỹ sư, dedup theo boq_norm.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS boq_norm_id INTEGER REFERENCES boq_norms(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_norm ON notifications(user_id, type, boq_norm_id)
  WHERE boq_norm_id IS NOT NULL;
