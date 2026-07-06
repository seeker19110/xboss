-- 0021_equipment.sql — M12: Sổ thiết bị/máy thi công + log cấp phát/hiệu chuẩn.
-- Xem docs/nang-cap/M12-thiet-bi.md.

CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  serial TEXT,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good','maintenance','broken','retired')),
  calibration_due DATE,
  cert_file_path TEXT, cert_file_name TEXT, cert_mime TEXT,
  current_location TEXT,
  current_crew TEXT,
  note TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipment_condition ON equipment(condition);
CREATE INDEX IF NOT EXISTS idx_equipment_calibration ON equipment(calibration_due);

CREATE TABLE IF NOT EXISTS equipment_logs (
  id SERIAL PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('issue','return','move','maintain','calibrate')),
  to_location TEXT, to_crew TEXT,
  note TEXT, logged_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_equipment ON equipment_logs(equipment_id);

-- Cảnh báo hạn kiểm định/hiệu chuẩn ≤30 ngày (Admin/PM), dedup theo equipment.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_equipment
  ON notifications(user_id, equipment_id, type) WHERE equipment_id IS NOT NULL;
