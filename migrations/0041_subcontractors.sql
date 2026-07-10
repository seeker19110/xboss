-- 0041_subcontractors.sql — M33: Hồ sơ năng lực & Đánh giá Nhà thầu phụ (NTP).
-- Mở rộng suppliers hiện có bằng bảng con 1-1 (không sửa bảng suppliers — tránh đụng
-- FK/chỗ dùng suppliers cho NCC vật tư thông thường không cần các trường này).
-- Xem docs/nang-cap/M33-nha-thau-phu.md (đặc tả gốc ghi số 0040 — worktree này đang ở
-- trạng thái schema chỉ tới 0027_multi_project.sql lúc code, đổi thành 0028; số cuối
-- cùng sẽ do phiên chính renumber lại khi tích hợp 3 nhánh song song).
CREATE TABLE IF NOT EXISTS subcontractor_profiles (
  supplier_id INTEGER PRIMARY KEY REFERENCES suppliers(id),
  project_id INTEGER REFERENCES projects(id),
  org_chart_note TEXT,                                       -- sơ đồ tổ chức tại công trường (mô tả text, không vẽ sơ đồ)
  site_rep_name TEXT, site_rep_phone TEXT,                    -- người đại diện tại công trường
  capability_summary TEXT,                                    -- năng lực (nhân sự/thiết bị/kinh nghiệm) — mô tả tự do
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS subcon_documents (                -- hồ sơ năng lực (pattern task_documents)
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  title TEXT NOT NULL,
  doc_kind TEXT,                                               -- giấy phép KD/chứng chỉ/hồ sơ nhân sự/khác — tự do, không CHECK cứng
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS subcon_evaluations (               -- đánh giá hiệu quả ĐỊNH KỲ (khác supplier_ratings theo PO của M04)
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  period TEXT NOT NULL,                                        -- 'YYYY-QN' hoặc 'YYYY-MM' — tự do định kỳ theo nhu cầu PM
  safety_score INTEGER CHECK (safety_score BETWEEN 1 AND 5),
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
  schedule_score INTEGER CHECK (schedule_score BETWEEN 1 AND 5),
  manpower_score INTEGER CHECK (manpower_score BETWEEN 1 AND 5),
  note TEXT,
  evaluated_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, period)
);
CREATE INDEX IF NOT EXISTS idx_subcon_documents_supplier ON subcon_documents(supplier_id);
CREATE INDEX IF NOT EXISTS idx_subcon_evaluations_supplier ON subcon_evaluations(supplier_id);
