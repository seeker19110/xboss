-- 0006_discipline_contractors.sql — M15: nhà thầu phụ trách từng hệ, chia phạm vi
-- tầng/khu (1 hệ có thể có 2+ nhà thầu). Xem docs/nang-cap/M15-trang-he.md.

CREATE TABLE IF NOT EXISTS discipline_contractors (
  id SERIAL PRIMARY KEY,
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  floor_labels TEXT[],
  zone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  UNIQUE (discipline_id, supplier_id, zone)
);

-- Tài khoản subcon thuộc nhà thầu nào (nối sang suppliers) — dùng để lọc/gán trách
-- nhiệm theo hệ; quyền GHI vẫn theo task được gán (canTouchTask), không nới thêm.
ALTER TABLE users ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);

CREATE INDEX IF NOT EXISTS idx_discipline_contractors_discipline ON discipline_contractors(discipline_id);
CREATE INDEX IF NOT EXISTS idx_discipline_contractors_supplier ON discipline_contractors(supplier_id);
