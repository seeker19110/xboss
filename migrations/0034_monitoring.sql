-- 0034_monitoring.sql — M26: Quan hệ & Quan trắc (lún/chuyển vị, cộng đồng). Mốc quan
-- trắc kết cấu/nền (lún, chuyển vị/nghiêng, công trình lân cận) + kỳ đo + ngưỡng cảnh
-- báo warn/alarm; khiếu nại/quan hệ cộng đồng (tiếp nhận → xử lý → đóng).
-- Xem docs/nang-cap/M26-quan-he-quan-trac.md (đặc tả gốc ghi số 0031 — đã đổi số qua
-- 2 lần rebase vì `0031_hr.sql`/`0032_insurance_bonds.sql`/`0033_environment.sql`
-- lần lượt chiếm khi rebase lên main mới nhất).
CREATE TABLE IF NOT EXISTS monitoring_points (              -- mốc quan trắc
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  code TEXT NOT NULL, kind TEXT NOT NULL
    CHECK (kind IN ('lun','chuyen_vi','nghieng','lan_can','khac')),
  location TEXT, warn_threshold NUMERIC(12,3), alarm_threshold NUMERIC(12,3), unit TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped')),
  UNIQUE(project_id, code)
);
CREATE TABLE IF NOT EXISTS monitoring_readings (
  id SERIAL PRIMARY KEY,
  point_id INTEGER NOT NULL REFERENCES monitoring_points(id) ON DELETE CASCADE,
  measured_at DATE NOT NULL, value NUMERIC(12,3) NOT NULL,
  cumulative NUMERIC(12,3),                                  -- luỹ kế (lún cộng dồn) — tính lúc ghi
  level TEXT CHECK (level IN ('normal','warn','alarm')),     -- so ngưỡng của point lúc ghi
  note TEXT, recorded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(point_id, measured_at)
);
CREATE TABLE IF NOT EXISTS community_cases (                -- khiếu nại/quan hệ cộng đồng
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  code TEXT, title TEXT NOT NULL, source TEXT,               -- dân cư/chính quyền/khác
  received_date DATE, status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','handling','closed')),
  resolution TEXT, closed_date DATE,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS monitoring_point_id INTEGER REFERENCES monitoring_points(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_mon_point ON notifications(user_id, type, monitoring_point_id)
  WHERE monitoring_point_id IS NOT NULL;
