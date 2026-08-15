-- 0085_engineering_intelligence.sql — ENG-2 Engineering Intelligence
-- (docs/nang-cap/ENG-2-engineering-intelligence.md, cụ thể hoá
-- docs/nang-cap/ENGINEERING-OS-ENG2-ENG3-ENG4.md §1–§6).
--
-- ENG-2 = KNOW / REASON / SUGGEST. Không bảng nào ở đây có đường ghi sang boq_items/
-- payment_bills/tasks — biến suggestion thành hành động thật là việc của ENG-3.
-- Thuần CREATE TABLE/INDEX, không đụng dữ liệu hiện có.

CREATE TABLE IF NOT EXISTS engineering_intelligence_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  -- Hệ/model nào sinh ra gói này. JSONB tự do vì mỗi nguồn khai khác nhau (agent version,
  -- model id, calculation_version) — không ép schema cứng, cùng cách properties của
  -- engineering_objects đang làm.
  provenance JSONB NOT NULL DEFAULT '{}',
  trace_id TEXT, -- nối ngược log/Sentry của bên gọi (§27 observability)
  api_key_id INTEGER REFERENCES api_keys(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_ip_project ON engineering_intelligence_packages(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS engineering_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES engineering_intelligence_packages(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_id UUID REFERENCES engineering_objects(id) ON DELETE CASCADE,
  -- 8 lớp suggestion (§2.1 A–H), khoá đóng.
  suggestion_class TEXT NOT NULL CHECK (suggestion_class IN
    ('design', 'drawing', 'mep', 'compliance', 'quantity_cost', 'constructability', 'risk', 'change_impact')),
  title TEXT NOT NULL,
  body TEXT,
  -- 7 mức ranking semantic (§3) — priority là trục chính, confidence KHÔNG được vượt mặt.
  priority TEXT NOT NULL CHECK (priority IN
    ('critical_safety', 'regulatory', 'high_impact', 'design_coordination', 'quality', 'optimization', 'cosmetic')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  -- §5: KHÔNG phải điểm LLM tự chấm — kết quả của computeConfidence() từ 6 tín hiệu.
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  confidence_signals JSONB NOT NULL DEFAULT '{}', -- lưu đầu vào để giải thích/tái dựng
  impact TEXT CHECK (impact IN ('critical', 'high', 'medium', 'low', 'none')),
  urgency TEXT CHECK (urgency IN ('immediate', 'soon', 'normal', 'later')),
  reversible BOOLEAN,
  estimated_effort TEXT,
  -- 'needs_review' do HỆ tự đặt khi thiếu evidence loại fact hoặc cảnh báo an toàn chưa đủ
  -- cơ sở (§3, §4); 5 trạng thái còn lại là quyết định của con người (§6).
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN
    ('open', 'needs_review', 'accepted', 'rejected', 'modified', 'deferred', 'false_positive')),
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  -- Nối sang ENG-3 (phase sau). Cột để sẵn, ENG-2 KHÔNG ghi — tránh migration đổi bảng.
  workflow_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_sug_project_status ON engineering_suggestions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_eng_sug_project_class ON engineering_suggestions(project_id, suggestion_class);
CREATE INDEX IF NOT EXISTS idx_eng_sug_object ON engineering_suggestions(object_id);
CREATE INDEX IF NOT EXISTS idx_eng_sug_package ON engineering_suggestions(package_id);

-- Evidence-first (§4) — cơ chế chống hallucination cốt lõi: recommendation phải phân biệt
-- được FACT / INFERENCE / ASSUMPTION / RECOMMENDATION, và không có dòng 'fact' nào thì
-- suggestion bị hạ về needs_review (xem lib/engineering-intel.ts::initialStatus).
CREATE TABLE IF NOT EXISTS engineering_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES engineering_suggestions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'inference', 'assumption', 'recommendation')),
  statement TEXT NOT NULL,
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  locator TEXT,
  standard_ref TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_evidence_suggestion ON engineering_evidence(suggestion_id, sort_order);

-- KHÔNG gắn trigger audit_row_change() (0049) lên bảng này — ĐÃ THỬ VÀ VỠ THẬT:
-- hàm đó khai `v_id BIGINT` rồi ép `(to_jsonb(NEW)->>'id')::bigint`, còn engineering_*
-- dùng UUID làm khoá chính → mọi INSERT/UPDATE lỗi
-- `invalid input syntax for type bigint: "45c086c3-..."`. audit_log.entity_id cũng là
-- BIGINT nên không chứa được UUID; sửa hạ tầng audit sang khoá đa kiểu là việc riêng,
-- ngoài phạm vi ENG-2 (ghi nợ trong PROGRESS.md).
--
-- Truy vết quyết định con người vẫn ĐỦ mà không cần trigger: cột decided_by/decided_at/
-- decision_note ngay trên engineering_suggestions ghi rõ ai quyết, khi nào, vì sao; và
-- mỗi suggestion luôn gắn package (provenance + trace_id) cho biết nguồn nào sinh ra.
