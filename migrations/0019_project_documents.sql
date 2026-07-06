-- 0019_project_documents.sql — M20: Kho hồ sơ dự án. Chỉ 1 bảng mới: file tự do cấp
-- dự án (không thuộc task/HĐ/VO/bản vẽ cụ thể nào) — vd văn bản pháp lý chung, hồ sơ
-- năng lực, biểu mẫu công ty. Các nguồn file khác (task_documents/contract_documents/
-- vo_documents/drawing_revisions) đọc chéo qua lib/documents-hub.ts, không di trú.
-- Xem docs/nang-cap/M20-kho-ho-so.md.

CREATE TABLE IF NOT EXISTS project_documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,                          -- nhãn tự do (vd "Pháp lý", "Biểu mẫu")
  file_name TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
