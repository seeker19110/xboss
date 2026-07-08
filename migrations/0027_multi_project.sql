-- 0027_multi_project.sql — M22 PR1: nền đa dự án (schema + gate quyền), CHƯA đổi UI/
-- hành vi hiện có — dự án mặc định (id nhỏ nhất) vẫn hoạt động như trước. Xem ADR-0004
-- + docs/nang-cap/M22-da-du-an.md.

-- Ai thấy dự án nào (song song user_disciplines hiện có). Rỗng toàn bảng = mọi user
-- thấy mọi dự án (tương thích ngược 1 dự án) — xem lib/projects.ts::visibleProjectIds.
CREATE TABLE IF NOT EXISTS user_projects (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','handover','closed'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS color TEXT; -- chấm nhận diện ở project switcher (M22 PR2)

-- Cột project_id cho các bảng "gốc cụm" — không FK nào tới towers/sheet_types/tasks đủ
-- tin cậy để suy project_id (rà từng bảng theo ADR-0004; bảng suy được qua cha — vd
-- payment_certs qua contract_id NOT NULL, qc_inspections qua task/work_package, work_fronts
-- qua sheet_type_id NOT NULL — KHÔNG thêm cột, tránh trùng nguồn sự thật).
ALTER TABLE contracts          ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE variation_orders   ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE materials          ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE boq_items          ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE purchase_orders    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE purchase_requests  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE meetings           ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE risks              ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE proposals          ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE correspondences    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE drawings           ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE qc_checklists      ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE ncrs               ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE hse_records        ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE site_diaries       ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE equipment          ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE vehicle_logs       ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE tender_packages    ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE project_documents  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);

-- Backfill dữ liệu hiện có về dự án mặc định (id nhỏ nhất) — an toàn cho DB 1 dự án
-- đang chạy; DB nhiều dự án "rác" cần rà thủ công trước khi áp migration này (xem ADR-0004).
DO $$
DECLARE default_project_id INTEGER := (SELECT MIN(id) FROM projects);
BEGIN
  IF default_project_id IS NOT NULL THEN
    UPDATE contracts         SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE variation_orders  SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE materials         SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE boq_items         SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE purchase_orders   SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE purchase_requests SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE meetings          SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE risks             SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE proposals         SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE correspondences   SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE drawings          SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE qc_checklists     SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE ncrs              SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE hse_records       SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE site_diaries      SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE equipment         SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE vehicle_logs      SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE tender_packages   SET project_id = default_project_id WHERE project_id IS NULL;
    UPDATE project_documents SET project_id = default_project_id WHERE project_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_variation_orders_project ON variation_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_items_project ON boq_items(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project ON purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_project ON purchase_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_correspondences_project ON correspondences(project_id);
CREATE INDEX IF NOT EXISTS idx_drawings_project ON drawings(project_id);
CREATE INDEX IF NOT EXISTS idx_qc_checklists_project ON qc_checklists(project_id);
CREATE INDEX IF NOT EXISTS idx_ncrs_project ON ncrs(project_id);
CREATE INDEX IF NOT EXISTS idx_hse_records_project ON hse_records(project_id);
CREATE INDEX IF NOT EXISTS idx_site_diaries_project ON site_diaries(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_project ON equipment(project_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_logs_project ON vehicle_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_tender_packages_project ON tender_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);
