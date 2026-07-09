-- 0031_hr.sql — M24: Nhân sự & Tổ chức. Nhân sự công trường (personnel, khác user hệ
-- thống) + tổ đội (crews) + chấm công (attendance) + đào tạo & chứng chỉ
-- (certifications) + ma trận RACI. Xem docs/nang-cap/M24-nhan-su-to-chuc.md (đặc tả
-- gốc ghi số 0029 — đã đổi số vì 0029/0030 bị chiếm bởi migration khác lúc code).
CREATE TABLE IF NOT EXISTS personnel (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  code TEXT, full_name TEXT NOT NULL, role_title TEXT,      -- chức danh công trường
  supplier_id INTEGER REFERENCES suppliers(id),             -- thuộc nhà thầu phụ nào (nếu có)
  phone TEXT, id_number TEXT,                                -- CCCD (nhạy cảm — chỉ admin/pm xem)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS crews (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  name TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  supplier_id INTEGER REFERENCES suppliers(id), leader_id INTEGER REFERENCES personnel(id),
  UNIQUE(project_id, name)
);
CREATE TABLE IF NOT EXISTS crew_members (
  crew_id INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  PRIMARY KEY (crew_id, personnel_id)
);
CREATE TABLE IF NOT EXISTS attendance (                     -- chấm công ngày
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  work_date DATE NOT NULL, crew_id INTEGER REFERENCES crews(id),
  personnel_id INTEGER REFERENCES personnel(id),            -- NULL = chấm gộp theo tổ (headcount)
  headcount INTEGER, present BOOLEAN, hours NUMERIC(4,1),
  note TEXT, recorded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS certifications (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  personnel_id INTEGER REFERENCES personnel(id),
  kind TEXT NOT NULL,                                        -- thẻ an toàn, chứng chỉ nghề, vận hành...
  code TEXT, issued_date DATE, expiry_date DATE,
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS raci_matrix (                    -- vai trò × hạng mục
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  scope TEXT NOT NULL,                                       -- tên hạng mục/quy trình
  role_label TEXT NOT NULL, personnel_id INTEGER REFERENCES personnel(id),
  raci CHAR(1) NOT NULL CHECK (raci IN ('R','A','C','I'))
);
ALTER TABLE diary_manpower ADD COLUMN IF NOT EXISTS crew_id INTEGER REFERENCES crews(id);
ALTER TABLE notifications  ADD COLUMN IF NOT EXISTS certification_id INTEGER REFERENCES certifications(id);
-- Tên "uq_notif_cert" đã bị chiếm bởi payment_certs (M17, payment_cert_id) — đổi tên
-- tránh CREATE INDEX IF NOT EXISTS no-op im lặng (phát hiện lúc chạy test tích hợp).
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_certification ON notifications(user_id, type, certification_id)
  WHERE certification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(project_id, work_date);
