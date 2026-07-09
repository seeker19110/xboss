-- 0030_kickoff.sql — M23: Khởi động & Pháp lý. Hồ sơ pháp lý dự án (giấy phép XD, phê
-- duyệt QH/TK, HĐ chính...) + cảnh báo hết hạn; checklist huy động công trường (bàn giao
-- mặt bằng, khảo sát, trắc đạc, huy động). Xem docs/nang-cap/M23-khoi-dong-phap-ly.md
-- (đặc tả gốc ghi số 0028 — đã đổi số vì 0028/0029 bị chiếm bởi migration khác lúc code).
CREATE TABLE IF NOT EXISTS legal_documents (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('giay_phep_xd','phe_duyet_qh','phe_duyet_tk','hd_chinh','khac')),
  code TEXT, title TEXT NOT NULL,
  issued_by TEXT, issued_date DATE, expiry_date DATE,     -- expiry_date NULL = không hạn
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('draft','valid','expired','superseded')),
  note TEXT,
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER, -- 1 file chính (pattern gọn)
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mobilization_items (          -- checklist huy động công trường
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  category TEXT NOT NULL CHECK (category IN ('mat_bang','khao_sat','trac_dac','huy_dong','khac')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
  due_date DATE, done_date DATE, assignee INTEGER REFERENCES users(id), note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS legal_document_id INTEGER REFERENCES legal_documents(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_legal ON notifications(user_id, type, legal_document_id)
  WHERE legal_document_id IS NOT NULL;
