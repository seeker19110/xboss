-- 0013_vo.sql — M6: Phát sinh / thay đổi khối lượng (VO — variation order).
-- Ghi nhận KL ngoài hợp đồng gốc tại hiện trường → trình CĐT/TVGS → duyệt → tự
-- cộng vào ngân sách/KL nhận thầu (boq_items, tách theo trạng thái) → tuỳ chọn
-- nối vào phụ lục hợp đồng (contract_addenda, M16) khi đã chốt bổ sung HĐ.
-- Xem docs/nang-cap/M06-phat-sinh-vo.md.

CREATE TABLE IF NOT EXISTS variation_orders (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,            -- VO-0001 (sinh tự động, lib/seqcode.ts)
  title TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('design_change','client_request','site_condition','other')),
  description TEXT,
  discipline_id INTEGER REFERENCES disciplines(id),   -- hệ liên quan (áp cho mọi dòng KL con)
  contract_id INTEGER REFERENCES contracts(id),       -- HĐ nhận phụ lục khi chốt (nullable, chọn lúc/​sau khi duyệt)
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','partially_approved','rejected','contract_added')),
  submitted_at DATE,
  decided_at DATE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vo_status ON variation_orders(status);

-- Dòng KL của VO dùng chung bảng boq_items (M1): qty_contract = KL đề xuất,
-- qty_approved = KL được duyệt (≤ đề xuất khi duyệt một phần).
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS vo_id INTEGER REFERENCES variation_orders(id) ON DELETE CASCADE;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS qty_approved NUMERIC(15,3);
CREATE INDEX IF NOT EXISTS idx_boq_items_vo ON boq_items(vo_id);

-- Văn bản trình CĐT/TVGS + phản hồi (pattern contract_documents/task_documents).
CREATE TABLE IF NOT EXISTS vo_documents (
  id SERIAL PRIMARY KEY,
  vo_id INTEGER NOT NULL REFERENCES variation_orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  caption TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup cảnh báo vo_pending (VO submitted quá hạn chưa quyết) — cùng cơ chế
-- partial unique index với contract_expiry (M16) / material_over / cost_group.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS vo_id INTEGER REFERENCES variation_orders(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_vo ON notifications(user_id, type, vo_id) WHERE vo_id IS NOT NULL;
