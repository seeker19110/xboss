-- 0028_claims.sql — M34: Claim chi phí & Gia hạn thời gian (EOT) — tách khỏi VO (M6):
-- claim là PHẢN ỨNG với sự kiện gây chậm/phát sinh chi phí ngoài kiểm soát (chờ mặt
-- bằng, thay đổi thiết kế của CĐT, điều kiện công trường...), vòng đời riêng
-- notice→quantified→negotiating→settled/rejected. Xem docs/nang-cap/M34-claim.md.
--
-- Ghi chú: cột `design_change_id` (nối tới bảng `design_changes` của M32) CHƯA thêm ở
-- migration này vì M32 có thể chưa merge vào main — thêm sau bằng migration riêng khi
-- M32 đã tồn tại (xem điểm cần quyết trong tài liệu đặc tả).

CREATE TABLE IF NOT EXISTS claims (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  code TEXT NOT NULL UNIQUE,                                 -- CLM-0001 (nextSeqCode pad 4, xem lib/seqcode.ts)
  kind TEXT NOT NULL CHECK (kind IN ('cost', 'eot')),
  title TEXT NOT NULL,
  contract_id INTEGER REFERENCES contracts(id),
  vo_id INTEGER REFERENCES variation_orders(id),             -- nối VO nếu claim dẫn tới điều chỉnh HĐ chính thức (nullable)
  notice_date DATE NOT NULL,                                  -- ngày thông báo (mốc pháp lý — nhiều HĐ có hạn thông báo)
  cause TEXT NOT NULL,                                        -- nguyên nhân (mô tả)
  amount_requested NUMERIC(15,2),                             -- claim kind='cost'
  days_requested INTEGER,                                     -- claim kind='eot'
  amount_settled NUMERIC(15,2),
  days_settled INTEGER,
  status TEXT NOT NULL DEFAULT 'notice'
    CHECK (status IN ('notice', 'quantified', 'negotiating', 'settled', 'rejected')),
  settlement_note TEXT,
  settled_by INTEGER REFERENCES users(id),
  settled_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claims_contract ON claims(contract_id);
CREATE INDEX IF NOT EXISTS idx_claims_project ON claims(project_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

-- Hồ sơ định lượng (pattern task_documents — file trong data/uploads/).
CREATE TABLE IF NOT EXISTS claim_documents (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  title TEXT,
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nhắc Admin/PM claim quá hạn xử lý chưa quyết, dedup theo claim (pattern vo_pending).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS claim_id INTEGER REFERENCES claims(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_claim ON notifications(user_id, type, claim_id)
  WHERE claim_id IS NOT NULL;
