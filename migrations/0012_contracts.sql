-- 0012_contracts.sql — M16: sổ hợp đồng (nhận thầu / giao thầu / NCC) + phụ lục +
-- file đính kèm; nối payment_bills / purchase_orders / floor_contracts / boq_items
-- về từng hợp đồng (nullable, backfill dần). Xem docs/nang-cap/M16-hop-dong.md.

CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,            -- số HĐ thật trên giấy, nhập tay (không sinh tự động)
  kind TEXT NOT NULL CHECK (kind IN ('nhan_thau','giao_thau','ncc')),
  title TEXT NOT NULL,
  party_supplier_id INTEGER REFERENCES suppliers(id), -- giao_thau/ncc: đối tác là NCC/thầu phụ
  party_name TEXT,                      -- nhan_thau: tên CĐT/tổng thầu (text tự do)
  discipline_id INTEGER REFERENCES disciplines(id),   -- HĐ giao thầu thường theo hệ (nullable)
  value NUMERIC(15,2) NOT NULL DEFAULT 0,             -- giá trị HĐ gốc (chưa gồm phụ lục/VO)
  advance_pct NUMERIC(5,2) NOT NULL DEFAULT 0,        -- % tạm ứng
  retention_pct NUMERIC(5,2) NOT NULL DEFAULT 0,      -- % giữ lại bảo hành
  signed_date DATE,
  valid_from DATE,
  valid_to DATE,                                      -- NULL = không thời hạn
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','completed','terminated')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_kind ON contracts(kind);

-- Phụ lục hợp đồng (nhập tay; M6 sẽ ghi tự động khi VO chuyển 'contract_added').
CREATE TABLE IF NOT EXISTS contract_addenda (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                                -- số phụ lục
  title TEXT,
  value_delta NUMERIC(15,2) NOT NULL DEFAULT 0,      -- tăng/giảm giá trị (âm được)
  signed_date DATE,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, code)
);

-- File đính kèm hợp đồng (pattern task_documents — file trong data/uploads/).
CREATE TABLE IF NOT EXISTS contract_documents (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  caption TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Liên kết mềm các dòng tiền sẵn có về hợp đồng (nullable — backfill dần từ UI).
ALTER TABLE floor_contracts ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id);
ALTER TABLE payment_bills   ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id);
ALTER TABLE boq_items       ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id); -- BOQ theo HĐ (M17 dùng)
CREATE INDEX IF NOT EXISTS idx_payment_bills_contract ON payment_bills(contract_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_contract ON purchase_orders(contract_id);

-- Dedup cảnh báo contract_expiry (PR 3) — cùng cơ chế partial unique index với
-- material_over / cost_group / po_id.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_contract ON notifications(user_id, type, contract_id)
  WHERE contract_id IS NOT NULL;
