-- M5 — Nhật ký thi công điện tử (NĐ 06/2021) + nhân lực theo tổ đội/ngày.
-- Xem docs/nang-cap/M05-nhat-ky.md.

CREATE TABLE IF NOT EXISTS site_diaries (
  id SERIAL PRIMARY KEY,
  diary_date DATE NOT NULL UNIQUE,
  weather_am TEXT,
  weather_pm TEXT,
  work_done TEXT,          -- prefill từ task_history, người lập sửa được
  obstacles TEXT,          -- vướng mắc / chỉ đạo
  safety_note TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked')),
  created_by INTEGER REFERENCES users(id),
  locked_by INTEGER REFERENCES users(id),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diary_manpower (
  id SERIAL PRIMARY KEY,
  diary_id INTEGER NOT NULL REFERENCES site_diaries(id) ON DELETE CASCADE,
  crew TEXT NOT NULL,                 -- tổ đội / thầu phụ
  headcount SMALLINT NOT NULL CHECK (headcount >= 0),
  note TEXT,
  UNIQUE (diary_id, crew)
);
CREATE INDEX IF NOT EXISTS idx_diary_manpower_diary ON diary_manpower(diary_id);

-- Ảnh hiện trường (task_photos có sẵn từ baseline) được chọn đưa vào nhật ký ngày đó.
CREATE TABLE IF NOT EXISTS diary_photos (
  diary_id INTEGER NOT NULL REFERENCES site_diaries(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES task_photos(id) ON DELETE CASCADE,
  PRIMARY KEY (diary_id, photo_id)
);

-- Audit lock/unlock (giá trị pháp lý — cần vết ai khoá/mở khoá lúc nào, đối xứng po_status_history).
CREATE TABLE IF NOT EXISTS diary_lock_history (
  id SERIAL PRIMARY KEY,
  diary_id INTEGER NOT NULL REFERENCES site_diaries(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('lock', 'unlock')),
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cảnh báo "chưa lập nhật ký" (dedup theo ngày, cùng cơ chế partial unique index với
-- cost_group/ncr_id/po_id/vehicle_id).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS diary_date DATE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_diary ON notifications(user_id, diary_date, type)
  WHERE diary_date IS NOT NULL;
