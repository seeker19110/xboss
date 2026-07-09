-- 0033_environment.sql — M25: Môi trường & Giấy phép. Hồ sơ môi trường (ĐTM, giấy phép
-- MT, giấy phép xả thải), quan trắc môi trường theo kỳ (ngưỡng, đạt/không), quản lý chất
-- thải (rắn XD/nguy hại/nước thải). Xem docs/nang-cap/M25-moi-truong-giay-phep.md (đặc
-- tả gốc ghi số 0030 — đã đổi số vì 0030/0031/0032 đã bị `0030_kickoff.sql`/`0031_hr.sql`/
-- `0032_insurance_bonds.sql` chiếm qua 2 lần rebase lên main mới nhất).
CREATE TABLE IF NOT EXISTS env_permits (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('dtm','giay_phep_mt','giay_phep_xa_thai','khac')),
  code TEXT, title TEXT NOT NULL, issued_by TEXT, issued_date DATE, expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expired','superseded')),
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS env_monitoring (                 -- kỳ quan trắc
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  measured_at DATE NOT NULL, category TEXT NOT NULL
    CHECK (category IN ('nuoc_thai','khi_bui','on_rung','khac')),
  indicator TEXT NOT NULL,                                   -- vd 'pH', 'TSS', 'độ ồn dBA'
  value NUMERIC(12,3), unit TEXT, threshold NUMERIC(12,3),   -- ngưỡng cho phép
  passed BOOLEAN,                                            -- value <= threshold (tính lúc ghi)
  location TEXT, note TEXT,
  recorded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS waste_logs (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  log_date DATE NOT NULL, waste_type TEXT NOT NULL
    CHECK (waste_type IN ('ran_xd','nguy_hai','nuoc_thai','khac')),
  quantity NUMERIC(12,2), unit TEXT, disposal_method TEXT, handler TEXT, note TEXT,
  recorded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS env_permit_id INTEGER REFERENCES env_permits(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS env_monitoring_id INTEGER REFERENCES env_monitoring(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_env_permit ON notifications(user_id, type, env_permit_id)
  WHERE env_permit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_env_mon ON notifications(user_id, type, env_monitoring_id)
  WHERE env_monitoring_id IS NOT NULL;
