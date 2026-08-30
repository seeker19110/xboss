# G12 / PINNACLE — Đặc tả Triển khai Trạng thái Đỉnh cao: XBoss Autonomous & Cognitive Engineering OS

| Thuộc tính       | Giá trị                                                |
| ---------------- | ------------------------------------------------------ |
| Issue / Goal     | GOAL-2026-PINNACLE-AUTONOMOUS-COGNITIVE-ENGINEERING-OS |
| Spec owner       | Seeker / Chief Engineering Architect                   |
| State            | **Approved for implementation**                        |
| Người/ngày duyệt | Seeker / 2026-08-19                                    |
| Cập nhật         | 2026-08-19                                             |

> **Nguyên tắc bất biến:** Không cấp quyền tự động hoá không kiểm soát (A3+ vô điều kiện). An toàn sinh mạng, tuân thủ pháp lý/hợp đồng và tính toàn vẹn tài chính công trình luôn thuộc quyền phán quyết tối cao của con người (Human Gate & Single-use Cryptographic Token).

---

## 1. Problem, vai trò và bằng chứng

### 1.1 Pain points theo vai trò

| Vai trò                                      | Điểm nghẽn hiện tại (Baseline v1.0)                                                                                                    | Kỳ vọng ở Trạng thái Đỉnh cao (Pinnacle State)                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Giám đốc Dự án (PM)**                      | Nhìn thấy rủi ro chậm tiến độ nhưng phải tự tính toán phương án bù tiến độ thủ công, tốn nhiều ngày cân nhắc chi phí.                  | Hệ thống Prescriptive giả lập hàng nghìn kịch bản (What-If), đề xuất ngay 3 phương án tối ưu (Pareto Frontier: Chi phí vs Thời gian vs Rủi ro). |
| **Chỉ huy trưởng (BCH) & Kỹ sư hiện trường** | Khó phát hiện kịp sai lệch giữa thi công thực tế và bản vẽ BIM cho đến khi xảy ra xung đột lắp đặt, dẫn đến đập phá sửa chữa (rework). | Nhận diện tự động sai lệch hình học giữa đám mây điểm 3D (Point-Cloud/LiDAR/Camera AI) và BIM thiết kế theo thời gian thực (L4–L6 Living Twin). |
| **Kỹ sư MEPF / Kết cấu**                     | Tốn 30–40% thời gian tra cứu tiêu chuẩn (TCVN, QCVN, NFPA) và tự tổng hợp tài liệu trình duyệt (Submittal/RFI).                        | Mạng lưới Swarm Agents tự động đối soát điều khoản tiêu chuẩn và chuẩn bị bản nháp RFI/Submittal hoàn chỉnh kèm trích dẫn pháp lý.              |
| **Trưởng phòng Đấu thầu & Dự toán (QS/BOQ)** | Khó đối soát định mức hao hụt thực tế giữa các dự án để tinh chỉnh đơn giá cho gói thầu mới.                                           | Ngân hàng tri thức liên dự án (Cross-Project Memory Bank) tự động kết tinh định mức và bài học kinh nghiệm từ các công trình trước.             |
| **Chủ đầu tư (CĐT) & Đơn vị Vận hành (FM)**  | Nhận bàn giao hồ sơ hoàn công dạng file PDF tĩnh rời rạc, không dùng được cho bảo trì vận hành thông minh.                             | Nhận bàn giao Bản sao số hoàn công sống (Living Digital Twin) tích hợp luồng dữ liệu cảm biến IoT, vòng đời thiết bị và lịch sử bảo trì.        |

### 1.2 Bằng chứng thực nghiệm & Đo lường cơ sở

- **Tần suất xung đột hiện trường:** Thống kê ngành xây dựng cho thấy chi phí khắc phục lỗi sai lệch hình học và xung đột MEPF chiếm 5–12% tổng giá trị dự toán công trình.
- **Thời gian xử lý thay đổi thiết kế (Change Order):** Trung bình mất từ 7–14 ngày để đánh giá toàn diện tác động chi phí – tiến độ qua các phòng ban.
- **Tỷ lệ thất thoát bài học:** Hơn 80% các bài học sự cố công trường bị lãng quên sau khi dự án kết thúc, khiến dự án mới lặp lại sai lầm tương tự.

---

## 2. Outcome, metric và guardrail

### 2.1 Target đo lường thành công (Success Metrics)

1. **Phát hiện sai lệch hình học sớm (Geometry Discrepancy Detection):** Phát hiện $\ge 95\%$ sai lệch vị trí tĩnh/động vượt dung sai ($\pm 15\text{mm}$) giữa thực tế và thiết kế trước khi tiến hành công tác đổ bê tông hoặc đóng trần.
2. **Tốc độ tối ưu hóa kịch bản (Prescriptive Scenario Latency):** Chạy mô phỏng 10,000 vòng lặp Monte Carlo phân tích tiến độ - chi phí trong thời gian $< 3.5\text{s}$.
3. **Độ chính xác đối soát tiêu chuẩn (Code Compliance Accuracy):** Tự động phát hiện đúng $\ge 98\%$ các điều khoản không phù hợp theo TCVN/QCVN/NFPA với đầy đủ trích dẫn số hiệu điều khoản.
4. **Hiệu suất tạo tài liệu kỹ thuật (Autonomous Drafting Speed):** Giảm $75\%$ thời gian chuẩn bị hồ sơ RFI, Material Submittal và 2-Phase QA/QC Inspection Package.
5. **Độ tin cậy liên dự án (Cross-Project Transfer Learning):** Cung cấp gợi ý định mức và cảnh báo rủi ro dựa trên dữ liệu lịch sử với độ tương thích dự án đạt F1-Score $\ge 0.88$.

### 2.2 Guardrails & Ngưỡng an toàn tuyệt đối

- **PostgreSQL Invariant & RLS:** $100\%$ truy vấn dữ liệu tuân thủ RLS strict theo `project_id`. Không cho phép bất kỳ agent nào truy cập chéo dữ liệu khi chưa được phân quyền.
- **Cryptographic Approval Gate:** Mọi hành động thực thi cấp A2+ (thay đổi trạng thái task, phát hành RFI, phê duyệt đặt hàng) bắt buộc phải có **Single-use Cryptographic Token** do người dùng có thẩm quyền ký duyệt (Human Authorization).
- **Hard Kill-Switch:** Thời gian ngắt toàn bộ hoạt động tự động hóa trên một dự án hoặc toàn hệ thống $\le 100\text{ms}$ khi kích hoạt Kill Switch.
- **Zero-PII & Redaction:** Không ghi dữ liệu nhạy cảm, mật khẩu hoặc khóa bảo mật vào log/telemetry.

---

## 3. Nghiên cứu hiện trạng và bệ phóng kiến trúc

XBoss đã hoàn thành toàn diện nền tảng v1.0 và 5 phân hệ Engineering OS sơ khởi (OS-1 → OS-5):

1. **Knowledge Graph & System of Record (OS-1):** Bảng `engineering_object_types`, `engineering_relation_types`, engine duyệt đồ thị BFS `lib/engineering-graph.ts` và sổ chất lượng `engineering_data_quality_issues`.
2. **Digital Twin L0–L3 (OS-2):** Bảng `engineering_twin_bindings`, `engineering_twin_states`, engine tính toán độ tươi mới `computeFreshness` và dòng thời gian `lib/engineering-twin.ts`.
3. **Predictive OS (OS-3):** Bảng `engineering_prediction_models`, `engineering_prediction_runs`, pipeline tính toán xác suất và độ bất định `lib/engineering-predictions.ts`.
4. **Controlled Autonomy A0–A2 (OS-4):** Bảng `engineering_autonomy_capabilities`, `engineering_execution_requests`, cơ chế Dry-run diff và Single-use Token `lib/engineering-autonomy.ts`.
5. **Data & Audit Hardening (C3/M90):** Trường `audit_log.entity_key` dạng TEXT hỗ trợ trọn vẹn UUID của thực thể kỹ thuật.

---

## 4. Phương án kiến trúc

| Phương án                                                                                                          | Lợi ích                                                                                                                                                                   | Chi phí/Rủi ro                                                                                                                        | Kết luận            |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **Không làm (Dừng ở v1.0)**                                                                                        | Hệ thống ổn định, không tốn thêm tài nguyên.                                                                                                                              | Mất đi năng lực cạnh tranh đột phá; hệ thống chỉ dừng lại ở vai trò ghi chép thụ động.                                                | **Bác bỏ**          |
| **Phương án A: Thêm hạ tầng phân tán ngoài (Kafka, Neo4j, Vector DB, Microservices)**                              | Tận dụng được các công cụ chuyên biệt có sẵn của hệ sinh thái AI bên ngoài.                                                                                               | Tăng đột biến độ phức tạp vận hành, phá vỡ kiến trúc Next.js + PostgreSQL nguyên khối an toàn, rủi ro đồng bộ dữ liệu và bảo mật RLS. | **Bác bỏ**          |
| **Phương án B (Khuyến nghị): Phát triển 4 Động cơ Đỉnh cao trên nền tảng PostgreSQL Raw SQL + Next.js App Router** | Tối ưu hóa hiệu năng cực đại, bảo toàn $100\%$ tính năng cách ly RLS, kiểm soát chặt chẽ giao dịch ACID, không tốn chi phí hạ tầng thứ 3, mở rộng tự nhiên từ OS-1..OS-5. | Yêu cầu thiết kế thuật toán chặt chẽ và tối ưu hóa truy vấn SQL chuyên sâu.                                                           | **CHỌN (Approved)** |

---

## 5. Bốn Động cơ Trọng tâm của Trạng thái Đỉnh cao (Pinnacle Engines)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        XBOSS AUTONOMOUS & COGNITIVE ENGINEERING OS                     │
├──────────────────────────┬──────────────────────────┬──────────────────────────────────┤
│ ENGINE 1: LIVING TWIN    │ ENGINE 2: PRESCRIPTIVE   │ ENGINE 3: SWARM AGENTS           │
│ (L4–L6 Reality Capture)  │ (Multi-Objective Pareto) │ (Authority-Based Synthesis)      │
│ • Point-Cloud / LiDAR    │ • Monte Carlo Simulation │ • Structure / MEP / BOQ / Safety │
│ • 3D BIM vs As-Built Diff│ • Cost-Schedule Pareto   │ • Automated RFI / Submittal Draft│
│ • IoT Telemetry Streams  │ • Code Compliance Engine │ • Single-use Cryptographic Token │
├──────────────────────────┴──────────────────────────┴──────────────────────────────────┤
│ ENGINE 4: CROSS-PROJECT COLLECTIVE INTELLIGENCE & CLOSED-LOOP MEMORY BANK              │
│ OBSERVE ➔ UNDERSTAND ➔ MODEL ➔ PREDICT ➔ DECIDE ➔ AUTHORIZE ➔ ACT ➔ VERIFY ➔ LEARN     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Functional Requirements (FR) & Non-Functional Requirements (NFR)

### 6.1 Functional Requirements

- **FR-01 (Continuous Reality Ingestion):** Cho phép nạp dữ liệu quan trắc 3D (LiDAR point clouds, drone photogrammetry meshes, camera inspection feeds) gắn liền với tọa độ công trình và đối tượng BIM.
- **FR-02 (As-Built vs BIM Spatial Diff Engine):** Tự động tính toán khoảng cách sai lệch hình học giữa đám mây điểm thực tế và bề mặt hình học thiết kế BIM, phân loại mức độ nghiêm trọng (Normal, Warning, Critical Clash).
- **FR-03 (Living Sensor Telemetry Stream):** Tiếp nhận luồng dữ liệu cảm biến IoT hiện trường (nhiệt độ, độ ẩm, áp suất, độ nghiêng, độ rung) với cơ chế sliding-window aggregations và phát hiện bất thường tức thì.
- **FR-04 (Prescriptive Pareto Optimization):** Chạy thuật toán mô phỏng tối ưu hóa đa mục tiêu để tạo ra đường cong Pareto Frontier cân bằng giữa Chi phí bổ sung (Crash Cost) và Thời gian rút ngắn (Time Compression).
- **FR-05 (Standards & Code Compliance Validator):** Tự động phân tích các thuộc tính kỹ thuật của đối tượng so với bộ quy chuẩn (TCVN, QCVN, NFPA 13/72/101, ASHRAE 90.1) và tạo báo cáo không phù hợp (Non-Compliance Report - NCR).
- **FR-06 (Multi-Agent Swarm Debate & Reconciliation):** Điều phối phiên tranh luận có cấu trúc giữa các Agent chuyên môn (Structural, MEPF, Cost, Safety, Contract) với thuật toán phân xử dựa trên thẩm quyền nguồn (`primary_code` > `design_spec` > `derived_calculation`).
- **FR-07 (Autonomous Technical Draft Generator):** Tự động tạo bản nháp kỹ thuật hoàn chỉnh: RFI, Material Approval Submittal, 2-Phase QA/QC Inspection Package kèm mã xác thực Token.
- **FR-08 (Cross-Project Memory Bank & Pattern Engine):** Khai phá các quy luật ẩn (patterns) về năng suất nhân công, hao hụt vật tư và rủi ro thời tiết từ các dự án đã hoàn thành để làm giàu kho tri thức dùng chung.

### 6.2 Non-Functional Requirements

- **NFR-01 (Performance):** Truy vấn kiểm tra sai lệch hình học và phân tích tác động Knowledge Graph hoàn tất trong $< 150\text{ms}$ với đồ thị 50,000 nút.
- **NFR-02 (ACID & Concurrency):** Đảm bảo $100\%$ các giao dịch cấp phát Single-use Token và thay đổi trạng thái thực thi sử dụng `SELECT ... FOR UPDATE` tránh tranh chấp đồng thời (race conditions).
- **NFR-03 (Security & RLS):** Đảm bảo $100\%$ các bảng dữ liệu mới có RLS kích hoạt, cô lập hoàn toàn giữa các dự án.
- **NFR-04 (Accessibility & UX):** Mọi giao diện trực quan hóa 3D/Graph đều có chế độ Fallback Accessible Table đạt chuẩn WCAG 2.1 AA.

---

## 7. Data Contract và DDL (Migration 0098)

Tạo file migration `migrations/0098_engineering_pinnacle_autonomous_os.sql`:

```sql
-- Migration: 0098_engineering_pinnacle_autonomous_os.sql
-- Mục đích: Thiết lập cơ sở dữ liệu cho 4 Động cơ Đỉnh cao (Living Twin, Prescriptive Engine, Multi-Agent Swarm, Cross-Project Memory Bank)

-- ============================================================================
-- 1. ENGINE 1: LIVING DIGITAL TWIN & REALITY CAPTURE (L4-L6)
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_twin_reality_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  capture_code VARCHAR(100) NOT NULL,
  capture_type VARCHAR(50) NOT NULL CHECK (capture_type IN ('lidar_pointcloud', 'drone_photogrammetry', 'camera_ai_survey', 'bim_scan_diff')),
  spatial_zone VARCHAR(100) NOT NULL,
  elevation_level VARCHAR(50),
  capture_timestamp TIMESTAMPTZ NOT NULL,
  total_points BIGINT DEFAULT 0,
  storage_uri TEXT NOT NULL,
  bounding_box JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_reality_captures_project_code UNIQUE (project_id, capture_code)
);

CREATE TABLE IF NOT EXISTS engineering_twin_spatial_deviations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  capture_id UUID NOT NULL REFERENCES engineering_twin_reality_captures(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  element_guid VARCHAR(128),
  deviation_type VARCHAR(50) NOT NULL CHECK (deviation_type IN ('position_offset', 'clearance_violation', 'missing_element', 'unexpected_obstacle', 'rotation_skew')),
  measured_deviation_mm NUMERIC(10, 2) NOT NULL,
  tolerance_threshold_mm NUMERIC(10, 2) NOT NULL,
  severity VARCHAR(30) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  point_coordinates JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "z": 0}'::jsonb,
  remediation_status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (remediation_status IN ('open', 'acknowledged', 'remediated', 'accepted_as_built', 'rejected')),
  suggestion_id UUID REFERENCES engineering_suggestions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_twin_sensor_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sensor_code VARCHAR(100) NOT NULL,
  sensor_type VARCHAR(50) NOT NULL CHECK (sensor_type IN ('temperature', 'humidity', 'pressure', 'vibration', 'tilt', 'flow_rate', 'energy_kwh')),
  object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  sampling_interval_seconds INT NOT NULL DEFAULT 60,
  latest_value NUMERIC(14, 4),
  latest_unit VARCHAR(30),
  latest_observed_at TIMESTAMPTZ,
  anomaly_status VARCHAR(30) NOT NULL DEFAULT 'normal' CHECK (anomaly_status IN ('normal', 'warning', 'critical', 'offline')),
  threshold_config JSONB NOT NULL DEFAULT '{"min": null, "max": null, "critical_max": null}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_sensor_streams_project_code UNIQUE (project_id, sensor_code)
);

-- ============================================================================
-- 2. ENGINE 2: PRESCRIPTIVE OPTIMIZATION & STANDARDS COMPLIANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_prescriptive_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scenario_code VARCHAR(100) NOT NULL,
  trigger_reason VARCHAR(100) NOT NULL,
  target_metric VARCHAR(50) NOT NULL CHECK (target_metric IN ('schedule_compression', 'cost_mitigation', 'clash_resolution', 'resource_leveling', 'multi_objective_pareto')),
  baseline_schedule_days INT NOT NULL,
  baseline_cost_vnd NUMERIC(18, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'simulated' CHECK (status IN ('simulated', 'evaluating', 'approved', 'rejected', 'archived')),
  simulated_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  pareto_frontier JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_option_index INT,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_prescriptive_scenarios_code UNIQUE (project_id, scenario_code)
);

CREATE TABLE IF NOT EXISTS engineering_compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_code VARCHAR(100) NOT NULL,
  standard_title TEXT NOT NULL,
  section_clause VARCHAR(100) NOT NULL,
  domain VARCHAR(50) NOT NULL CHECK (domain IN ('structural', 'fire_safety', 'hvac', 'plumbing', 'electrical', 'environmental', 'general_building')),
  rule_expression JSONB NOT NULL,
  severity VARCHAR(30) NOT NULL CHECK (severity IN ('advisory', 'mandatory', 'legal_strict')),
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_compliance_rules_clause UNIQUE (standard_code, section_clause)
);

CREATE TABLE IF NOT EXISTS engineering_compliance_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES engineering_objects(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES engineering_compliance_rules(id) ON DELETE CASCADE,
  compliance_status VARCHAR(30) NOT NULL CHECK (compliance_status IN ('compliant', 'non_compliant', 'exemption_granted', 'manual_review_required')),
  finding_details TEXT,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  audited_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. ENGINE 3: MULTI-AGENT SWARM ORCHESTRATION & SYNTHESIS
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_swarm_debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  debate_topic TEXT NOT NULL,
  trigger_event VARCHAR(100) NOT NULL,
  participating_agents JSONB NOT NULL DEFAULT '["agent_structural", "agent_mepf", "agent_cost_qs", "agent_safety", "agent_contract"]'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'debating', 'synthesized', 'authorized', 'cancelled')),
  synthesis_summary TEXT,
  consensus_level VARCHAR(30) CHECK (consensus_level IN ('unanimous', 'majority_with_dissent', 'authority_reconciled', 'human_escalation_required')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_swarm_arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES engineering_swarm_debates(id) ON DELETE CASCADE,
  agent_role VARCHAR(50) NOT NULL,
  stance VARCHAR(30) NOT NULL CHECK (stance IN ('propose', 'concur', 'object', 'amend', 'neutral')),
  authority_weight NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
  argument_text TEXT NOT NULL,
  cited_clauses JSONB NOT NULL DEFAULT '[]'::jsonb,
  impact_assessment JSONB NOT NULL DEFAULT '{"cost_delta_vnd": 0, "schedule_delta_days": 0, "risk_score": 0}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. ENGINE 4: CROSS-PROJECT COLLECTIVE INTELLIGENCE & PATTERN MEMORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS engineering_knowledge_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type VARCHAR(50) NOT NULL CHECK (pattern_type IN ('labor_productivity_deviation', 'material_waste_rate', 'subcontractor_reliability', 'weather_impact_curve', 'rework_risk_fingerprint')),
  category VARCHAR(100) NOT NULL,
  fingerprint_hash VARCHAR(128) NOT NULL UNIQUE,
  pattern_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,
  sample_size_projects INT NOT NULL DEFAULT 1,
  sample_size_observations BIGINT NOT NULL DEFAULT 1,
  lesson_learned TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS engineering_cross_project_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  pattern_id UUID REFERENCES engineering_knowledge_patterns(id) ON DELETE SET NULL,
  work_package_code VARCHAR(100),
  observed_problem TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  prescribed_preventative_action TEXT NOT NULL,
  effectiveness_score NUMERIC(5, 4) DEFAULT 1.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. ROW-LEVEL SECURITY & PERFORMANCE INDEXES
-- ============================================================================

ALTER TABLE engineering_twin_reality_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_twin_spatial_deviations ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_twin_sensor_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_prescriptive_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_compliance_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_swarm_debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_swarm_arguments ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_twin_reality_captures ON engineering_twin_reality_captures
  FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT));

CREATE POLICY rls_twin_spatial_deviations ON engineering_twin_spatial_deviations
  FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT));

CREATE POLICY rls_twin_sensor_streams ON engineering_twin_sensor_streams
  FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT));

CREATE POLICY rls_prescriptive_scenarios ON engineering_prescriptive_scenarios
  FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT));

CREATE POLICY rls_compliance_audits ON engineering_compliance_audits
  FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT));

CREATE POLICY rls_swarm_debates ON engineering_swarm_debates
  FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT));

CREATE POLICY rls_swarm_arguments ON engineering_swarm_arguments
  FOR ALL USING (debate_id IN (SELECT id FROM engineering_swarm_debates WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::BIGINT)));

CREATE INDEX IF NOT EXISTS idx_twin_spatial_deviations_proj ON engineering_twin_spatial_deviations(project_id, severity, remediation_status);
CREATE INDEX IF NOT EXISTS idx_twin_sensor_streams_proj ON engineering_twin_sensor_streams(project_id, anomaly_status);
CREATE INDEX IF NOT EXISTS idx_prescriptive_scenarios_proj ON engineering_prescriptive_scenarios(project_id, status);
CREATE INDEX IF NOT EXISTS idx_compliance_audits_proj ON engineering_compliance_audits(project_id, compliance_status);
CREATE INDEX IF NOT EXISTS idx_swarm_debates_proj ON engineering_swarm_debates(project_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_patterns_type ON engineering_knowledge_patterns(pattern_type, category);
```

---

## 8. API Contract

### 8.1 Bộ REST API Endpoints Đỉnh cao

| Phương thức | Endpoint                                         | Chức năng                                           | Phân quyền tối thiểu |
| ----------- | ------------------------------------------------ | --------------------------------------------------- | -------------------- |
| `POST`      | `/api/engineering/twin/reality-capture`          | Nạp dữ liệu point-cloud / mesh hiện trường          | `ENGINEER`           |
| `GET`       | `/api/engineering/twin/deviations`               | Truy vấn danh sách sai lệch BIM vs As-Built         | `VIEWER`             |
| `POST`      | `/api/engineering/twin/sensors/telemetry`        | Đẩy luồng dữ liệu cảm biến IoT                      | `ENGINEER` / API Key |
| `POST`      | `/api/engineering/prescriptive/simulate`         | Kích hoạt mô phỏng tối ưu hóa đa mục tiêu Pareto    | `PM`                 |
| `GET`       | `/api/engineering/prescriptive/scenarios`        | Lấy danh sách kịch bản What-If đã giải              | `VIEWER`             |
| `POST`      | `/api/engineering/compliance/audit-element`      | Kiểm tra đối soát tiêu chuẩn kỹ thuật tức thì       | `ENGINEER`           |
| `POST`      | `/api/engineering/swarm/debates`                 | Khởi tạo phiên tranh luận Swarm Agents              | `ENGINEER` / `PM`    |
| `POST`      | `/api/engineering/swarm/debates/[id]/synthesize` | Tổng hợp kết quả tranh luận theo Authority          | `PM`                 |
| `GET`       | `/api/engineering/memory/patterns`               | Truy vấn các mẫu hình định mức & bài học liên dự án | `VIEWER`             |

---

## 9. Kế hoạch Slice & Lộ trình Triển khai (Delivery Slices)

```text
SLICE 1 (PIN-1): Living Digital Twin & Continuous Reality Ingestion (Migration 0098 Part 1, Core Twin Engine, Point-Cloud Ingestion, UI Reality Viewer)
    ↓
SLICE 2 (PIN-2): Prescriptive Engine & Standards Compliance (Migration 0098 Part 2, Monte Carlo Solver, TCVN/NFPA Rule Engine, UI Scenario Explorer)
    ↓
SLICE 3 (PIN-3): Multi-Agent Swarm Orchestration & Autonomous Drafting (Migration 0098 Part 3, Swarm Debate Protocol, Token Authorization, UI Swarm Console)
    ↓
SLICE 4 (PIN-4): Cross-Project Memory Bank & Closed-Loop Engine (Migration 0098 Part 4, Pattern Fingerprinting, Lesson Transfer, UI Knowledge Explorer)
    ↓
SLICE 5 (PIN-5): Pinnacle Program Closeout & Verification (E2E Integration, Mutation Checks, DR Verification, Final Release Audit)
```

---

## 10. Acceptance Criteria (AC)

- **AC-01 (Spatial Deviation Detection):** Khi nạp bản ghi reality capture có tọa độ lệch $> 20\text{mm}$ so với thiết kế, hệ thống tự động sinh bản ghi `engineering_twin_spatial_deviations` với `severity = 'critical'` và tạo liên kết đề xuất `engineering_suggestions`.
- **AC-02 (Pareto Optimization Frontier):** Khi kích hoạt `/api/engineering/prescriptive/simulate`, hệ thống trả về mảng `pareto_frontier` chứa ít nhất 3 kịch bản thỏa mãn cân bằng chi phí - tiến độ mà không vi phạm đường găng (Critical Path).
- **AC-03 (Standards Rule Validation):** Khi gửi yêu cầu kiểm tra đối tượng MEPF có kích thước ống và khoảng cách van vi phạm quy chuẩn QCVN 06:2022/BXD hoặc NFPA 13, hệ thống ghi nhận `compliance_status = 'non_compliant'` kèm số hiệu điều khoản chính xác.
- **AC-04 (Authority-Based Swarm Reconciliation):** Khi Agent Kết cấu và Agent MEPF xung đột vị trí đặt lỗ mở xuyên dầm, hệ thống tự động ưu tiên phán quyết của Agent Kết cấu (`primary_authority = 1.0 > 0.8`) và ghi rõ lý do trong biên bản tổng hợp.
- **AC-05 (Cryptographic Single-Use Authorization):** Bất kỳ lệnh thực thi nào phát sinh từ Swarm Agent bắt buộc phải tiêu thụ 1 token hợp lệ; nếu tái sử dụng token hoặc token hết hạn, hệ thống trả về mã lỗi `403 Forbidden` và khóa thao tác.

---

## 11. Approval & Ký duyệt

- [x] **Product / Architecture:** Đã phê duyệt mục tiêu và cấu trúc 4 Động cơ Đỉnh cao.
- [x] **Security / RLS / Audit:** Đã phê duyệt cơ chế Single-use Token, RLS đa dự án và Hard Kill Switch.
- [x] **Data Invariants:** Đã duyệt Schema DDL Migration 0098 append-only.
- [x] **Trạng thái:** **Approved for implementation** (Seeker - 2026-08-19).
