-- 0087_engineering_agents.sql — ENG-4 Multi-Agent Engineering OS
-- (docs/nang-cap/ENG-4-multi-agent-engineering-os.md, cụ thể hoá
-- docs/nang-cap/ENGINEERING-OS-ENG2-ENG3-ENG4.md §15–§28).
--
-- ENG-4 = DELEGATE / COORDINATE / RECONCILE. KHÔNG vượt mặt ENG-3: kết quả một phiên phối
-- hợp là BẢN KẾ HOẠCH ĐÃ HOÀ GIẢI, muốn có tác động thật phải tạo workflow ENG-3 và đi qua
-- đủ cửa duyệt. Không bảng nào ở đây có đường ghi sang boq_items/payment_bills/tasks.
-- Thuần CREATE TABLE/INDEX, không đụng dữ liệu hiện có.

CREATE TABLE IF NOT EXISTS engineering_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  intent TEXT NOT NULL, -- §23 INTENT: mục tiêu của phiên phối hợp
  -- §22: 5 mức đồng thuận. 'no_consensus' là KẾT QUẢ HỢP LỆ, không phải lỗi hệ thống —
  -- thà không đồng thuận còn hơn ép consensus giả (§21).
  consensus TEXT NOT NULL DEFAULT 'pending' CHECK (consensus IN
    ('pending', 'consensus_confirmed', 'consensus_with_risk', 'partial_agreement',
     'conflict_requires_review', 'no_consensus')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'frozen', 'closed')),
  -- §21 giới hạn cứng: agent không được trao đổi vô hạn.
  max_rounds INTEGER NOT NULL DEFAULT 5,
  round_count INTEGER NOT NULL DEFAULT 0,
  conflict_budget INTEGER NOT NULL DEFAULT 10,
  reconciled_plan JSONB, -- kế hoạch đã hoà giải — KHÔNG phải lệnh thực thi
  -- Nối sang ENG-3 khi con người quyết định biến kế hoạch thành hành động. ENG-4 KHÔNG tự
  -- ghi cột này (giữ đúng ranh giới uỷ quyền — chỉ luồng tạo workflow mới gắn).
  workflow_id UUID REFERENCES engineering_workflows(id) ON DELETE SET NULL,
  trace_id TEXT,
  api_key_id INTEGER REFERENCES api_keys(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_as_project ON engineering_agent_sessions(project_id, status);

-- §24 cross-agent context: mỗi claim mang đủ nguồn/giả định/độ tin — không truyền hidden
-- state tuỳ ý giữa các agent.
CREATE TABLE IF NOT EXISTS engineering_agent_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES engineering_agent_sessions(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL CHECK (agent_role IN
    ('planner', 'specialist', 'verifier', 'critic', 'reconciler', 'executor')), -- §16
  agent_name TEXT NOT NULL,
  topic TEXT NOT NULL, -- khoá gom nhóm: chỉ 2 claim cùng topic mới so sánh được với nhau
  claim TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  assumptions JSONB NOT NULL DEFAULT '[]',
  -- Tính bằng computeConfidence dùng chung với ENG-2 — KHÔNG nhận điểm agent tự khai.
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('high','medium','low','unknown')),
  confidence_signals JSONB NOT NULL DEFAULT '{}',
  -- §20 authority hierarchy — dùng phân xử xung đột dữ liệu (Type A), KHÔNG dùng vote.
  source_authority TEXT NOT NULL DEFAULT 'derived' CHECK (source_authority IN
    ('authoritative_source', 'validated_rule', 'specialist', 'verifier', 'derived')),
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  round INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_ac_session ON engineering_agent_claims(session_id, topic);

CREATE TABLE IF NOT EXISTS engineering_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES engineering_agent_sessions(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  conflict_type TEXT NOT NULL CHECK (conflict_type IN
    ('data', 'interpretation', 'constraint', 'execution', 'scope')), -- §17
  -- §18 giao thức 7 bước: detect → classify → freeze → collect → reconcile → verify → authorize.
  stage TEXT NOT NULL DEFAULT 'detected' CHECK (stage IN
    ('detected', 'classified', 'frozen', 'evidence_collected', 'reconciled', 'verified',
     'authorized', 'unresolved')),
  claim_ids JSONB NOT NULL DEFAULT '[]',
  resolution TEXT,
  -- BẮT BUỘC ghi cách đi tới kết luận — để chứng minh không dùng majority vote sai chỗ
  -- (§19). 'preference_vote' chỉ hợp lệ trong điều kiện rất hẹp, xem assertVoteAllowed().
  resolution_method TEXT CHECK (resolution_method IN
    ('source_authority', 'evidence_comparison', 'constraint_hierarchy',
     'independent_verification', 'human_authority', 'preference_vote')),
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_cf_session ON engineering_conflicts(session_id, stage);
