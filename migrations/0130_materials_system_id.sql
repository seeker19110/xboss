-- Migration 0130: Quan ly danh muc vat tu & BOQ theo cac Dai he thong MEPF (HVAC, Dien, Cap Thoat Nuoc, PCCC)
ALTER TABLE materials ADD COLUMN IF NOT EXISTS system_id INTEGER REFERENCES systems(id);

-- Backfill system_id tu sheet_types neu co
UPDATE materials m
   SET system_id = st.system_id
  FROM sheet_types st
 WHERE m.sheet_type_id = st.id
   AND m.system_id IS NULL
   AND st.system_id IS NOT NULL;

-- Cap nhat ten hien thi chuan cho cac he MEPF
UPDATE systems SET name = 'HVAC (Điều hòa không khí & Thông gió)' WHERE code = 'acmv';
UPDATE systems SET name = 'Điện & Điện nhẹ (ELV)' WHERE code = 'dien';
UPDATE systems SET name = 'Cấp Thoát Nước' WHERE code = 'nuoc';
UPDATE systems SET name = 'PCCC (Phòng cháy chữa cháy)' WHERE code = 'pccc';

CREATE INDEX IF NOT EXISTS idx_materials_system ON materials(system_id);
