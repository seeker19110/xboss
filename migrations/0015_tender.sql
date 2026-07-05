-- 0015_tender.sql — M7: đấu thầu / so sánh báo giá gói giao thầu phụ. Tạo gói từ
-- dòng BOQ, nhận giá chào nhiều NCC, so sánh, trao thầu → sinh hợp đồng giao thầu
-- (contracts, M16) cho NCC trúng thầu. Xem docs/nang-cap/M07-dau-thau.md.

CREATE TABLE IF NOT EXISTS tender_packages (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- GT-0001
  name TEXT NOT NULL,
  scope TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','closed','awarded','cancelled')),
  awarded_bid_id INTEGER,             -- FK thêm sau khi có tender_bids (ALTER cuối file)
  awarded_contract_id INTEGER,        -- HĐ giao thầu (M16) sinh ra khi trao thầu
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tender_items (            -- phạm vi = tham chiếu dòng BOQ
  tender_id INTEGER NOT NULL REFERENCES tender_packages(id) ON DELETE CASCADE,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id),
  qty NUMERIC(15,3) NOT NULL,          -- KL mời (có thể ≠ KL HĐ)
  PRIMARY KEY (tender_id, boq_item_id)
);

CREATE TABLE IF NOT EXISTS tender_bids (
  id SERIAL PRIMARY KEY,
  tender_id INTEGER NOT NULL REFERENCES tender_packages(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  lump_sum NUMERIC(15,2),              -- chào trọn gói (nullable — có thể chỉ chào theo dòng)
  note TEXT,
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER, -- file chào thầu gốc (pattern task_documents)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tender_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS tender_bid_prices (       -- giá theo dòng (thiếu dòng = chưa chào dòng đó)
  bid_id INTEGER NOT NULL REFERENCES tender_bids(id) ON DELETE CASCADE,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id),
  unit_price NUMERIC(15,2) NOT NULL,
  PRIMARY KEY (bid_id, boq_item_id)
);

ALTER TABLE tender_packages ADD COLUMN IF NOT EXISTS awarded_bid_id INTEGER REFERENCES tender_bids(id);
ALTER TABLE tender_packages ADD COLUMN IF NOT EXISTS awarded_contract_id INTEGER REFERENCES contracts(id);
CREATE INDEX IF NOT EXISTS idx_tender_bids_tender ON tender_bids(tender_id);
