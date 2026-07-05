-- 0014_drawings.sql — M8: Drawing register (bản vẽ shop/asbuilt/BIM + biện pháp thi
-- công) với lịch sử revision + trạng thái trình duyệt. Thay thế dần cơ chế 1 file
-- gắn work_package (work_packages.drawing_*, giữ nguyên cho tới khi UI mới thay hẳn).
-- Xem docs/nang-cap/M08-ban-ve.md.

CREATE TABLE IF NOT EXISTS drawings (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- số bản vẽ (VD: ACMV-SD-T05-001)
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'shop'
    CHECK (kind IN ('shop','asbuilt','bim','method')), -- method = biện pháp thi công
  system_group TEXT,
  floor_label TEXT,
  work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drawings_wp ON drawings(work_package_id);
CREATE INDEX IF NOT EXISTS idx_drawings_kind ON drawings(kind);

CREATE TABLE IF NOT EXISTS drawing_revisions (
  id SERIAL PRIMARY KEY,
  drawing_id INTEGER NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  rev TEXT NOT NULL,                   -- A, B, C...
  file_name TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','commented','approved','approved_with_comments','rejected','superseded')),
  submitted_at DATE,
  decided_at DATE,
  decision_note TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (drawing_id, rev)
);
CREATE INDEX IF NOT EXISTS idx_drawing_revisions_drawing ON drawing_revisions(drawing_id);

-- Backfill: 1 file bản vẽ cũ gắn work_package (route /api/workpackages/:id/drawing,
-- vẫn giữ hoạt động song song) → 1 drawing (code tạm "WP-<id>", đổi tên được sau)
-- + 1 rev "A" trạng thái approved (file cũ vốn không có vòng đời duyệt).
INSERT INTO drawings (code, name, kind, work_package_id, created_at)
SELECT 'WP-' || wp.id, wp.name, 'shop', wp.id, NOW()
  FROM work_packages wp
 WHERE wp.drawing_file_name IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM drawings d WHERE d.work_package_id = wp.id);

INSERT INTO drawing_revisions
  (drawing_id, rev, file_name, original_name, mime_type, status, decided_at, created_at)
SELECT d.id, 'A', wp.drawing_file_name, wp.drawing_original_name,
       CASE
         WHEN lower(wp.drawing_file_name) LIKE '%.pdf'  THEN 'application/pdf'
         WHEN lower(wp.drawing_file_name) LIKE '%.png'  THEN 'image/png'
         WHEN lower(wp.drawing_file_name) LIKE '%.webp' THEN 'image/webp'
         WHEN lower(wp.drawing_file_name) LIKE '%.gif'  THEN 'image/gif'
         WHEN lower(wp.drawing_file_name) LIKE '%.jpg'  THEN 'image/jpeg'
         WHEN lower(wp.drawing_file_name) LIKE '%.jpeg' THEN 'image/jpeg'
         ELSE 'application/octet-stream'
       END,
       'approved', CURRENT_DATE, NOW()
  FROM drawings d
  JOIN work_packages wp ON wp.id = d.work_package_id
 WHERE NOT EXISTS (SELECT 1 FROM drawing_revisions r WHERE r.drawing_id = d.id);
