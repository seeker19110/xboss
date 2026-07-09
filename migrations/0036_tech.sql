-- 0036_tech.sql — M31: Chuyển đổi số & Công nghệ. Gom link công cụ ngoài (BIM viewer,
-- P6/MS Project, camera/drone) + album ảnh mốc tiến độ (drone). Xem
-- docs/nang-cap/M31-chuyen-doi-so.md (đặc tả gốc ghi số 0036 — đã đổi số nhiều lần khi
-- rebase lên main mới nhất: 0031-0034 bị M24/M28/M25/M26 chiếm, rồi 0035 bị M29 chiếm).
CREATE TABLE IF NOT EXISTS tech_links (                     -- link công cụ ngoài (P6/BIM viewer/camera)
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  category TEXT NOT NULL CHECK (category IN ('bim','schedule','camera','drone','other')),
  title TEXT NOT NULL, url TEXT NOT NULL,
  embed BOOLEAN DEFAULT FALSE,                               -- true = nhúng iframe; false = link ra ngoài
  note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS progress_albums (                -- album ảnh mốc tiến độ (drone)
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  milestone_label TEXT NOT NULL, captured_date DATE, note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
-- task_photos.task_id cho phép NULL (xem migrations/0001_baseline.sql) → tái dùng
-- task_photos cho ảnh album, task_id = NULL khi ảnh không gắn task cụ thể.
ALTER TABLE task_photos ADD COLUMN IF NOT EXISTS album_id INTEGER REFERENCES progress_albums(id);
CREATE INDEX IF NOT EXISTS idx_photos_album ON task_photos(album_id);
