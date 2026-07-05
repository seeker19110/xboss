-- 0008_qaqc.sql — M3 lõi: checklist/inspection → gate nghiệm thu → hold-point chuyển bước
-- → NCR. Xem docs/nang-cap/M03-qaqc.md (T&C/phiếu YCNT/xuất hồ sơ tầng để đợt sau).

CREATE TABLE IF NOT EXISTS qc_checklists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'work' CHECK (category IN ('work', 'tc', 'hse')),
  discipline_id INTEGER REFERENCES disciplines(id),
  required BOOLEAN NOT NULL DEFAULT FALSE, -- bật gate: nghiệm thu task/hệ cần inspection Đạt
  items JSONB NOT NULL DEFAULT '[]',       -- [{label, type:'pass_fail'|'measure', unit?, design_value?}]
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_inspections (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES qc_checklists(id),
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  work_package_id INTEGER REFERENCES work_packages(id) ON DELETE CASCADE,
  results JSONB NOT NULL DEFAULT '[]', -- [{label, pass, measured?, note?}]
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'passed', 'failed')),
  inspected_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  inspected_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (task_id IS NOT NULL OR work_package_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS ncrs (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  inspection_id INTEGER REFERENCES qc_inspections(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  assigned_to INTEGER REFERENCES users(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixing', 'recheck', 'closed')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Hold point chuyển bước: predecessor phải có biên bản/inspection đạt trước khi successor
-- được thi công (lib/qaqc.ts:handoverBlocked).
ALTER TABLE package_dependencies ADD COLUMN IF NOT EXISTS requires_handover BOOLEAN NOT NULL DEFAULT FALSE;

-- Phân loại hồ sơ chất lượng (vat_lieu | cong_viec | giai_doan | chuyen_buoc | hoan_cong) —
-- trang tổng hợp/xuất hồ sơ tầng đợt sau; 'chuyen_buoc' đã dùng ngay trong handoverBlocked.
ALTER TABLE task_documents ADD COLUMN IF NOT EXISTS doc_category TEXT;

-- Ảnh gắn NCR — tái dùng task_photos (đã có nếu ncr_id NULL thì vẫn là ảnh task như cũ).
ALTER TABLE task_photos ADD COLUMN IF NOT EXISTS ncr_id INTEGER REFERENCES ncrs(id) ON DELETE CASCADE;

-- Cảnh báo NCR quá hạn — cùng cơ chế dedup partial unique index như cost_group/material_id.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ncr_id INTEGER REFERENCES ncrs(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_ncr ON notifications(user_id, ncr_id, type)
  WHERE ncr_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qc_inspections_task ON qc_inspections(task_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_package ON qc_inspections(work_package_id);
CREATE INDEX IF NOT EXISTS idx_qc_checklists_discipline ON qc_checklists(discipline_id);
CREATE INDEX IF NOT EXISTS idx_ncrs_status ON ncrs(status);
CREATE INDEX IF NOT EXISTS idx_ncrs_task ON ncrs(task_id);
CREATE INDEX IF NOT EXISTS idx_ncrs_assigned ON ncrs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_package_dep_handover ON package_dependencies(successor_id) WHERE requires_handover;
