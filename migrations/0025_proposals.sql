-- 0025_proposals.sql — M19: đề xuất & phê duyệt online tổng quát (tạm ứng, thanh toán,
-- cấp phát vật tư, khác) — KHÔNG thay thế purchase_requests (luồng mua vật tư giữ nguyên).
-- Xem docs/nang-cap/M19-de-xuat-phe-duyet.md.

CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                          -- DX-0001
  kind TEXT NOT NULL CHECK (kind IN ('advance','payment','allocation','other')),
  title TEXT NOT NULL,
  amount NUMERIC(15,2),                                -- NULL khi đề xuất không có giá trị tiền
  contract_id INTEGER REFERENCES contracts(id),        -- tạm ứng/thanh toán: gắn HĐ (tuỳ chọn)
  material_id INTEGER REFERENCES materials(id),        -- cấp phát: gắn vật tư (tuỳ chọn)
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at DATE,
  decided_at DATE,
  decided_by INTEGER REFERENCES users(id),
  reject_reason TEXT,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_kind ON proposals(kind);

-- File đính kèm đề xuất (pattern task_documents — file trong data/uploads/).
CREATE TABLE IF NOT EXISTS proposal_documents (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  caption TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nhắc Admin/PM đề xuất đã trình lâu chưa quyết, dedup theo proposal (pattern vo_pending).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS proposal_id INTEGER REFERENCES proposals(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_proposal ON notifications(user_id, type, proposal_id)
  WHERE proposal_id IS NOT NULL;
