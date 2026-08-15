-- 0086_engineering_workflows.sql — ENG-3 Engineering Workflow OS
-- (docs/nang-cap/ENG-3-engineering-workflow-os.md, cụ thể hoá
-- docs/nang-cap/ENGINEERING-OS-ENG2-ENG3-ENG4.md §7–§14).
--
-- ENG-3 là RANH GIỚI UỶ QUYỀN của toàn track ENG: mọi thay đổi có side effect từ ENG-2/
-- ENG-4 phải đi qua đây. KHÔNG đụng lib/approvals.ts (M46) — 2 hệ sống song song, xem lý
-- do trong mục 1 file đặc tả (M46 chọn cấp duyệt theo ngưỡng TIỀN, ENG-3 theo RISK 8 chiều
-- và bắt buộc có Gate 0 tự động).
-- Thuần CREATE TABLE/INDEX, không đụng dữ liệu hiện có.

CREATE TABLE IF NOT EXISTS engineering_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  suggestion_id UUID REFERENCES engineering_suggestions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  -- §9 approval profile A–E: policy engine chọn theo risk, người dùng KHÔNG tự chọn
  -- (lib/engineering-workflow.ts::classifyRisk + selectProfile, không có tham số override).
  profile TEXT NOT NULL CHECK (profile IN ('A', 'B', 'C', 'D', 'E')),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('low', 'medium', 'high', 'critical')),
  risk_inputs JSONB NOT NULL DEFAULT '{}', -- đầu vào classifyRisk, để giải thích/tái dựng
  -- §11 state machine: 7 trạng thái dòng chính + 6 nhánh.
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN
    ('draft', 'validating', 'awaiting_approval', 'approved', 'executing',
     'validating_result', 'completed',
     'rejected', 'cancelled', 'blocked', 'failed', 'rolled_back', 'superseded')),
  -- §14: khai TRƯỚC khi duyệt — người ký phải biết việc này có hoàn tác được không.
  reversible BOOLEAN NOT NULL DEFAULT FALSE,
  rollback_strategy TEXT,
  gate0_result JSONB NOT NULL DEFAULT '{}', -- §8 kết quả validation tự động
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_wf_project_state ON engineering_workflows(project_id, state);
CREATE INDEX IF NOT EXISTS idx_eng_wf_suggestion ON engineering_workflows(suggestion_id);

-- §12: approval KHÔNG được chỉ là boolean approved=true — mỗi gate là 1 dòng đầy đủ
-- (ai ký, khi nào, nhận xét, evidence, vai trò yêu cầu).
CREATE TABLE IF NOT EXISTS engineering_workflow_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES engineering_workflows(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  gate_type TEXT NOT NULL CHECK (gate_type IN
    ('technical_review', 'discipline_qa', 'independent_qa', 'authority_release')),
  required_role TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('approved', 'rejected')),
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  comments TEXT,
  evidence JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_eng_wf_gates_wf ON engineering_workflow_gates(workflow_id, seq);

-- §11 "mọi state transition phải audit được". Không dùng trigger audit_row_change() được
-- vì audit_log.entity_id là BIGINT còn khoá ở đây là UUID (đã chứng minh ở ENG-2) — và
-- workflow cần audit CÓ NGỮ NGHĨA (from→to, ai, vì sao) chứ không phải diff JSONB thô.
CREATE TABLE IF NOT EXISTS engineering_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES engineering_workflows(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  gate_seq INTEGER,
  reason TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_wf_events_wf ON engineering_workflow_events(workflow_id, created_at);
