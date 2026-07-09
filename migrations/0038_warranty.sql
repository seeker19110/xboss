-- 0038_warranty.sql — M30: Bảo hành & Bảo trì (O&M). Danh mục hạng mục bảo hành theo
-- hệ (hạn suy từ warranty_from + warranty_months), claim lỗi sau bàn giao (vòng đời
-- open→handling→closed, tách khỏi NCR M03 vì khác giai đoạn/quyền), thư viện tài liệu
-- hướng dẫn vận hành & bảo trì. Xem docs/nang-cap/M30-bao-hanh-bao-tri.md (đặc tả gốc
-- ghi số 0035 — đã bị 0035_handover.sql [M29] chiếm khi rebase lên main mới nhất, đổi
-- thành 0038; 0037 dành cho M27 finance đang chạy song song, không dùng).
CREATE TABLE IF NOT EXISTS warranty_items (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  handover_item_id INTEGER REFERENCES handover_items(id),
  warranty_from DATE, warranty_months INTEGER,               -- hạn = warranty_from + months
  guarantee_id INTEGER REFERENCES insurance_bonds(id),        -- bảo lãnh bảo hành (M28, kind='bao_lanh_bao_hanh')
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired')),
  note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS warranty_claims (                -- lỗi sau bàn giao
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  warranty_item_id INTEGER REFERENCES warranty_items(id),
  code TEXT, reported_date DATE, description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','handling','closed')),
  due_date DATE, resolution TEXT, closed_date DATE, assignee INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS om_documents (                   -- hướng dẫn O&M (pattern task_documents)
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS warranty_item_id INTEGER REFERENCES warranty_items(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS warranty_claim_id INTEGER REFERENCES warranty_claims(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_warranty ON notifications(user_id, type, warranty_item_id)
  WHERE warranty_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_wclaim ON notifications(user_id, type, warranty_claim_id)
  WHERE warranty_claim_id IS NOT NULL;
