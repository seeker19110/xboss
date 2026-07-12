-- 0046_construction_stages.sql — đổi trục trang "Mặt bằng thi công" (/work-fronts) từ
-- tầng×sheet-type sang tầng×công tác thi công theo thứ tự cố định (Trắc đạc → MEP layout
-- → Xây thô → MEP âm tường → Tô trám → …). KHÔNG đụng bảng work_fronts/work_front_*
-- cũ (vẫn nuôi notification front_missing + lookahead + báo cáo EOT ở model cũ).

CREATE TABLE IF NOT EXISTS construction_stages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floor_stage_fronts (
  id SERIAL PRIMARY KEY,
  floor_label TEXT NOT NULL,
  stage_id INTEGER NOT NULL REFERENCES construction_stages(id) ON DELETE CASCADE,
  handed_over_at DATE,               -- ngày bàn giao = ngày nhận thực tế; NULL = chưa xong
  note TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (floor_label, stage_id)
);
CREATE INDEX IF NOT EXISTS idx_floor_stage_fronts_stage ON floor_stage_fronts(stage_id);

CREATE TABLE IF NOT EXISTS floor_stage_front_documents (
  id SERIAL PRIMARY KEY,
  floor_stage_front_id INTEGER NOT NULL REFERENCES floor_stage_fronts(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL,
  doc_kind TEXT NOT NULL DEFAULT 'other' CHECK (doc_kind IN ('handover','completion','other')),
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_floor_stage_front_documents_front ON floor_stage_front_documents(floor_stage_front_id);

-- Seed công tác mặc định theo đúng thứ tự yêu cầu (5 công tác gốc + Sơn bả/Đóng trần nối
-- tiếp chuỗi hoàn thiện) — chỉ chèn nếu bảng đang rỗng (idempotent phòng migration chạy
-- lại thủ công, dù runner chỉ áp 1 lần/bảng schema_migrations). Công tác hoàn thiện khác
-- thêm dần qua nút "+" trên trang /work-fronts, không cần sửa migration nữa.
INSERT INTO construction_stages (name, sort_order)
SELECT * FROM (VALUES
  ('Trắc đạc', 1),
  ('MEP (Thi công Layout)', 2),
  ('Xây dựng (Xây Thô)', 3),
  ('MEP (Thi công âm tường)', 4),
  ('Xây dựng (Tô Trám)', 5),
  ('Sơn bả', 6),
  ('Đóng trần', 7)
) AS seed(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM construction_stages);

-- Cảnh báo tầng chưa sẵn sàng (công tác cuối chưa bàn giao) mà task sắp/đã tới ngày bắt
-- đầu — dedup theo floor_stage_front, song song cột work_front_id cũ (giữ nguyên, không
-- xoá — chỉ không còn ghi mới vào đó nữa vì model cũ đã ngừng nuôi).
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS floor_stage_front_id INTEGER REFERENCES floor_stage_fronts(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_floor_stage_front
  ON notifications(user_id, floor_stage_front_id, type) WHERE floor_stage_front_id IS NOT NULL;
