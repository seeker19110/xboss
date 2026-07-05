-- 0005_boq.sql — M1: BOQ đầy đủ (bảng khối lượng: KL/đơn giá/thành tiền, 3 lớp
-- nhận thầu–giao thầu–thực hiện) + danh mục hệ (disciplines) làm nền cho M15.
-- Xem docs/nang-cap/M01-boq.md.

CREATE TABLE IF NOT EXISTS disciplines (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT
);

INSERT INTO disciplines (code, name, color) VALUES
  ('ket_cau', 'Kết cấu', 'zinc'),
  ('xay_to', 'Xây tô', 'amber'),
  ('acmv', 'ACMV', 'sky'),
  ('dien', 'Điện', 'violet'),
  ('nuoc', 'Nước', 'emerald'),
  ('pccc', 'PCCC', 'rose')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE sheet_types ADD COLUMN IF NOT EXISTS discipline_id INTEGER REFERENCES disciplines(id);

-- Toàn bộ sheet hiện có của XBoss là tracking ACMV (OGTĐ/OGHL/OGCH/ODNN) — backfill
-- về hệ ACMV để không có sheet nào "vô chủ" sau migration.
UPDATE sheet_types SET discipline_id = (SELECT id FROM disciplines WHERE code = 'acmv')
 WHERE discipline_id IS NULL;

CREATE TABLE IF NOT EXISTS boq_items (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  discipline_id INTEGER REFERENCES disciplines(id),
  qty_contract NUMERIC(15,3) NOT NULL DEFAULT 0,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  qty_sub NUMERIC(15,3) DEFAULT 0,
  sub_unit_price NUMERIC(15,2) DEFAULT 0,
  note TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- KL thực hiện không lưu cột — tính động: qty_contract × Σ(weight × task.progress_percent)
-- qua boqExecutedQty (lib/boq.ts), join bảng map dưới.
CREATE TABLE IF NOT EXISTS boq_task_map (
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  weight NUMERIC(5,4) NOT NULL DEFAULT 1,
  PRIMARY KEY (boq_item_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_boq_items_discipline ON boq_items(discipline_id);
CREATE INDEX IF NOT EXISTS idx_boq_task_map_task ON boq_task_map(task_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_boq_items_code_lower ON boq_items(lower(code));
