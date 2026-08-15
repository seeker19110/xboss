# Engineering OS — ENG-2 / ENG-3 / ENG-4 Detailed Specification

**Project:** XBoss  
**Roadmap:** Foundation Hardening → M43 → M44 → M45 → M46 → Engineering OS → AI / Digital Twin → Predictive OS → Controlled Autonomy  
**Purpose:** Định nghĩa chi tiết ba tầng sau M43: Engineering Intelligence, Engineering Workflow OS và Multi-Agent Engineering OS.

---

# 0. Architectural position

```text
FOUNDATION HARDENING
        │
        ├── PostgreSQL
        ├── Storage
        ├── Contracts
        ├── Observability
        ├── Security
        ├── Backup / Restore
        └── Dependency Governance
                ↓
              M43
        MEP / Agent Integration
                ↓
              M44
       ENG-2 / Engineering Intelligence
                ↓
              M45
       ENG-3 / Engineering Workflow OS
                ↓
              M46
       ENG-4 / Multi-Agent Engineering OS
                ↓
          Engineering OS
                ↓
          AI / Digital Twin
                ↓
           Predictive OS
                ↓
        Controlled Autonomy
```

## Core principle

Ba tầng không được trộn trách nhiệm:

```text
ENG-2 = KNOW / REASON / SUGGEST
ENG-3 = PLAN / APPROVE / EXECUTE WORKFLOW
ENG-4 = DELEGATE / COORDINATE / RECONCILE
```

AI reasoning **không đồng nghĩa authorization**. Agent recommendation **không đồng nghĩa approval**. Multi-agent consensus **không đồng nghĩa quyền tự động thực thi**.

---

# 1. ENG-2 — Engineering Intelligence

## 1.1 Mục tiêu

ENG-2 biến Engineering OS từ hệ thống có agent runtime thành hệ thống có khả năng hiểu ngữ cảnh kỹ thuật và tạo ra các đề xuất có bằng chứng.

ENG-2 phải hỗ trợ:

- document understanding;
- drawing/CAD/BIM understanding;
- engineering knowledge retrieval;
- cross-document reasoning;
- standards/code awareness;
- engineering validation;
- quantity/cost reasoning;
- anomaly detection;
- impact analysis;
- recommendation generation;
- confidence/provenance tracking.

ENG-2 **không tự phê duyệt hoặc tự thi công**. Nó tạo intelligence package để ENG-3 sử dụng.

---

## 1.2 Intelligence Pipeline

```text
INPUT ARTIFACTS
      ↓
INGESTION
      ↓
NORMALIZATION
      ↓
STRUCTURE / ENTITY EXTRACTION
      ↓
CONTEXT BUILDING
      ↓
KNOWLEDGE RETRIEVAL
      ↓
ENGINEERING REASONING
      ↓
RULE / CONSTRAINT VALIDATION
      ↓
CROSS-CHECK
      ↓
RECOMMENDATION
      ↓
CONFIDENCE + EVIDENCE
      ↓
INTELLIGENCE PACKAGE
```

Mọi recommendation quan trọng phải có provenance và evidence.

---

## 1.3 Intelligence Package

Chuẩn hóa output của ENG-2:

```text
IntelligencePackage
├── package_id
├── project_id
├── task_id
├── question / objective
├── findings[]
├── recommendations[]
├── constraints[]
├── assumptions[]
├── evidence[]
├── conflicts[]
├── confidence
├── validation_status
├── affected_artifacts[]
├── affected_entities[]
├── provenance
└── generated_at
```

Không cho phép recommendation quan trọng chỉ có một câu trả lời LLM không có evidence.

---

# 2. ENG-2 — AI phải gợi ý những gì?

ENG-2 không chỉ trả lời câu hỏi của người dùng. Nó phải chủ động tạo **Engineering Suggestions**.

## 2.1 Suggestion classes

### A. Design suggestions

Phát hiện:

- thiết kế chưa đầy đủ;
- lựa chọn thiết bị không phù hợp;
- kích thước/định mức bất thường;
- topology không hợp lý;
- thiếu thành phần;
- over/under-capacity;
- xung đột giữa discipline.

### B. Drawing suggestions

- thiếu view;
- thiếu dimension;
- inconsistent annotation;
- duplicate element;
- disconnected system;
- symbol/type mismatch;
- layer/category bất thường;
- revision inconsistency.

### C. MEP suggestions

Ví dụ:

```text
HVAC
- capacity anomaly
- duct sizing anomaly
- equipment mismatch
- airflow imbalance

Electrical
- load inconsistency
- protection mismatch
- cable/feeder anomaly
- panel loading anomaly

Plumbing / Fire
- pipe sizing anomaly
- flow/pressure issue
- equipment connection issue
- missing fixture/system relationship
```

Các rule cụ thể phải lấy từ domain knowledge và standards thực tế; không hard-code ví dụ thành quy chuẩn pháp lý nếu chưa có source.

### D. Compliance suggestions

ENG-2 phải chỉ ra:

```text
Requirement
→ Evidence
→ Current state
→ Gap
→ Suggested remediation
→ Confidence
```

Không được tuyên bố “compliant” chỉ dựa trên LLM inference.

### E. Quantity / Cost suggestions

Có thể đề xuất:

- missing quantity;
- suspicious quantity;
- duplicate quantity;
- unit mismatch;
- scope mismatch;
- drawing-to-BOQ discrepancy;
- cost anomaly;
- unpriced item;
- quantity change impact.

### F. Constructability suggestions

- access problem;
- maintenance clearance concern;
- installation sequence issue;
- clash risk;
- impossible/unsafe workflow assumption;
- temporary works implication.

### G. Risk suggestions

Mỗi risk nên có:

```text
risk_id
severity
probability
impact
affected_scope
trigger
mitigation
owner
confidence
evidence
```

### H. Change-impact suggestions

Khi một artifact/entity thay đổi, ENG-2 phải có khả năng gợi ý:

```text
Changed entity
   ↓
Dependent systems
   ↓
Affected drawings
   ↓
Affected quantities
   ↓
Affected cost
   ↓
Affected schedule/workflows
   ↓
Required approvals
```

---

# 3. ENG-2 — Suggestion ranking

Không spam người dùng bằng hàng trăm suggestion.

Mỗi suggestion có:

```text
priority
severity
confidence
impact
urgency
reversibility
estimated_effort
```

Ranking semantic:

```text
CRITICAL SAFETY / INTEGRITY
        ↓
REGULATORY / CONTRACTUAL
        ↓
HIGH COST / HIGH IMPACT
        ↓
DESIGN / COORDINATION
        ↓
QUALITY
        ↓
OPTIMIZATION
        ↓
COSMETIC
```

Suggestion không đủ evidence phải được hạ confidence hoặc đưa vào `NEEDS_REVIEW`.

---

# 4. ENG-2 — Evidence-first rule

Recommendation phải phân biệt:

```text
FACT
INFERENCE
ASSUMPTION
RECOMMENDATION
```

Ví dụ:

```text
FACT:
Drawing A revision 7 contains equipment E-101.

INFERENCE:
E-101 appears undersized relative to the extracted design load.

ASSUMPTION:
The stated design condition is the governing condition.

RECOMMENDATION:
Review E-101 selection against the governing load calculation.
```

Đây là yêu cầu bắt buộc để giảm hallucination.

---

# 5. ENG-2 — Confidence model

Confidence không phải “LLM tự chấm điểm”.

Confidence nên được tổng hợp từ:

```text
source quality
+ extraction confidence
+ rule validation
+ cross-source agreement
+ model agreement where appropriate
+ freshness
+ completeness
```

Phân loại:

```text
HIGH
MEDIUM
LOW
UNKNOWN
```

`UNKNOWN` phải được sử dụng khi evidence không đủ.

---

# 6. ENG-2 — Human interaction

Người dùng phải có thể:

```text
Accept suggestion
Reject suggestion
Modify suggestion
Ask for evidence
Ask for alternative
Defer
Mark false positive
Create workflow from suggestion
```

Feedback trở thành training/evaluation signal nhưng không tự động biến thành production truth.

---

# 7. ENG-3 — Engineering Workflow OS

## 7.1 Mục tiêu

ENG-3 chuyển recommendation/intelligence thành workflow có kiểm soát.

```text
Intelligence
   ↓
Decision package
   ↓
Workflow proposal
   ↓
Approvals
   ↓
Execution
   ↓
Validation
   ↓
Artifact / revision
   ↓
Audit
```

---

# 8. ENG-3 — Chuẩn hóa số bước duyệt

## Default approval model: 3 tầng

Đây là mặc định của Engineering OS:

```text
GATE 1 — TECHNICAL REVIEW
        ↓
GATE 2 — DISCIPLINE / QA REVIEW
        ↓
GATE 3 — AUTHORITY / RELEASE
        ↓
EXECUTION
```

Không phải workflow nào cũng bắt buộc đủ ba gate. Nhưng **mọi workflow phải khai báo approval profile** và hệ thống không được tự bỏ gate.

### Gate 0 — Automatic validation

Đây không phải human approval.

Hệ thống kiểm tra:

- schema;
- permissions;
- required artifacts;
- model/rule validation;
- conflicts;
- missing information;
- safety blockers;
- dependency readiness.

Nếu Gate 0 fail → không được tạo approval request.

### Gate 1 — Technical Review

Reviewer xác nhận:

- technical correctness;
- assumptions;
- calculations;
- evidence;
- affected scope;
- alternatives.

### Gate 2 — Discipline / QA Review

Reviewer kiểm tra:

- discipline consistency;
- interdisciplinary impact;
- quality;
- standards/checklists;
- downstream consequences.

### Gate 3 — Authority / Release

Người có quyền release xác nhận:

- scope;
- commercial/contractual impact nếu có;
- safety/regulatory significance;
- final revision;
- release status.

Chỉ sau Gate 3 mới được `RELEASED` đối với workflow có yêu cầu controlled release.

---

# 9. ENG-3 — Approval profiles

Ngoài default 3-gate profile, hệ thống có profile:

### PROFILE-A — Informational

```text
Gate 0 → publish suggestion
```

Không có side effect.

### PROFILE-B — Low-risk change

```text
Gate 0 → Gate 1 → execute
```

### PROFILE-C — Standard engineering change

```text
Gate 0 → Gate 1 → Gate 2 → execute
```

### PROFILE-D — Controlled release

```text
Gate 0 → Gate 1 → Gate 2 → Gate 3 → release/execute
```

### PROFILE-E — Safety / regulatory / high-impact

```text
Gate 0
 → specialist technical review
 → discipline review
 → independent QA / compliance review
 → authority release
 → controlled execution
```

Profile phải được policy engine quyết định dựa trên risk classification; AI không được tự hạ profile.

---

# 10. ENG-3 — Risk-based approval

Approval level được quyết định bởi:

```text
technical risk
safety risk
regulatory risk
financial impact
scope impact
reversibility
uncertainty
cross-discipline impact
```

Nguyên tắc:

```text
LOW risk       → fewer gates
MEDIUM risk    → standard gates
HIGH risk      → all relevant gates
CRITICAL risk  → independent verification + authority
```

Không được dùng “AI confidence cao” để giảm approval level cho một thay đổi có safety/regulatory risk cao.

---

# 11. ENG-3 — Workflow state machine

```text
DRAFT
 ↓
VALIDATING
 ↓
AWAITING_APPROVAL
 ↓
APPROVED
 ↓
EXECUTING
 ↓
VALIDATING_RESULT
 ↓
COMPLETED
```

Các nhánh:

```text
REJECTED
CANCELLED
BLOCKED
FAILED
ROLLED_BACK
SUPERSEDED
```

Mọi state transition phải audit được.

---

# 12. ENG-3 — Approval object

```text
Approval
├── approval_id
├── workflow_id
├── gate_id
├── approver_role
├── required_capability
├── assigned_reviewer
├── evidence
├── decision
├── comments
├── decided_at
├── delegation
└── provenance
```

Approval không được chỉ là boolean `approved=true`.

---

# 13. ENG-3 — Separation of duties

Một user không mặc định được:

```text
create → review → approve → release → verify
```

toàn bộ cùng một workflow đối với high-risk changes.

Policy engine phải hỗ trợ separation-of-duties.

---

# 14. ENG-3 — Rollback

Workflow có side effect phải khai báo:

```text
reversible = true/false
rollback_strategy
rollback_artifacts
rollback_authority
```

Nếu không rollback được, workflow phải được đánh dấu non-reversible trước approval.

---

# 15. ENG-4 — Multi-Agent Engineering OS

## 15.1 Mục tiêu

ENG-4 cho phép nhiều agent chuyên môn phối hợp:

```text
Planner
   ↓
+----------+----------+----------+
|          |          |          |
MEP      BIM/CAD   Quantity   Compliance
|          |          |          |
+----------+----------+----------+
             ↓
          Verifier
             ↓
        Reconciliation
             ↓
       Engineering Plan
```

Mục tiêu không phải “nhiều agent nói chuyện với nhau”, mà là **multi-agent execution có kiểm soát**.

---

# 16. ENG-4 — Agent roles

Tối thiểu:

```text
PLANNER
SPECIALIST
VERIFIER
CRITIC
RECONCILER
EXECUTOR
```

Không phải project nào cũng cần tất cả role.

---

# 17. ENG-4 — Conflict model

Mọi conflict phải được phân loại.

### Type A — Data conflict

Hai agent đọc khác dữ liệu.

Giải quyết:

```text
source authority
→ artifact version
→ timestamp/freshness
→ provenance
```

Không dùng voting để giải quyết data conflict.

### Type B — Interpretation conflict

Cùng dữ liệu nhưng reasoning khác.

Giải quyết:

```text
evidence comparison
→ assumptions comparison
→ independent verification
→ specialist adjudication if needed
```

### Type C — Constraint conflict

Ví dụ cost vs performance, space vs equipment requirement.

Giải quyết bằng constraint hierarchy:

```text
Safety / Law
      ↓
Contract / Mandatory requirement
      ↓
Engineering constraints
      ↓
Project constraints
      ↓
Cost / Schedule optimization
      ↓
Preference
```

Không được giải quyết bằng majority vote nếu conflict liên quan safety/law.

### Type D — Execution conflict

Hai agent đề xuất hành động trái nhau.

Không agent nào tự execute.

```text
freeze execution
→ collect proposals
→ compare impact
→ reconcile
→ approval
→ execute
```

---

# 18. ENG-4 — Conflict resolution protocol

Chuẩn hóa thành 7 bước:

```text
1. DETECT
2. CLASSIFY
3. FREEZE
4. COLLECT EVIDENCE
5. RECONCILE
6. VERIFY
7. AUTHORIZE
```

### 1. DETECT

Phát hiện output không tương thích.

### 2. CLASSIFY

Data / Interpretation / Constraint / Execution / Scope.

### 3. FREEZE

Tạm dừng side effect liên quan.

### 4. COLLECT EVIDENCE

Mỗi agent phải cung cấp:

```text
claim
source
assumption
calculation/reasoning reference
confidence
affected entities
```

### 5. RECONCILE

Reconciler tạo:

```text
ConflictRecord
├── conflict_id
├── participants
├── claims
├── evidence
├── constraints
├── proposed resolutions
├── unresolved_items
└── recommendation
```

### 6. VERIFY

Verifier độc lập kiểm tra proposed resolution.

### 7. AUTHORIZE

ENG-3 policy/approval layer quyết định có được execute hay không.

---

# 19. ENG-4 — Không dùng majority vote làm mặc định

Không được thiết kế:

```text
3 agents say A
2 agents say B
→ A wins
```

cho engineering decisions quan trọng.

Thay vào đó:

```text
Evidence
+ Authority
+ Constraints
+ Verification
+ Risk
```

mới quyết định.

Voting chỉ có thể dùng cho low-risk preference ranking, không dùng để override authoritative evidence, mandatory constraints hoặc safety rules.

---

# 20. ENG-4 — Authority hierarchy

Khi conflict không thể giải quyết tự động:

```text
Authoritative source
      ↓
Validated engineering rule
      ↓
Qualified specialist
      ↓
Independent verifier
      ↓
Human authority
```

Model confidence không nằm trên human authority hoặc mandatory constraint.

---

# 21. ENG-4 — Agent negotiation

Agent không được trao đổi vô hạn.

Mỗi collaboration task có:

```text
max_rounds
max_tokens
timeout
max_replans
conflict_budget
```

Nếu không hội tụ:

```text
UNRESOLVED
   ↓
HUMAN REVIEW
```

Không ép consensus giả.

---

# 22. ENG-4 — Consensus levels

```text
CONSENSUS_CONFIRMED
CONSENSUS_WITH_RISK
PARTIAL_AGREEMENT
CONFLICT_REQUIRES_REVIEW
NO_CONSENSUS
```

`NO_CONSENSUS` là trạng thái hợp lệ, không phải lỗi hệ thống.

---

# 23. ENG-4 — Multi-agent execution lifecycle

```text
INTENT
 ↓
PLAN
 ↓
DECOMPOSE
 ↓
ASSIGN
 ↓
PARALLEL / SEQUENTIAL EXECUTION
 ↓
COLLECT
 ↓
VERIFY
 ↓
CONFLICT DETECTION
 ↓
RECONCILIATION
 ↓
FINAL PLAN
 ↓
ENG-3 APPROVAL
 ↓
EXECUTION
 ↓
POST-EXECUTION VERIFICATION
```

Không được bỏ qua ENG-3 approval boundary đối với workflow có side effects.

---

# 24. Cross-agent context

Mỗi agent chỉ nhận context cần thiết.

Agent-to-agent message phải có:

```text
message_id
sender_agent
receiver_agent
task_id
claim
payload
artifacts
constraints
assumptions
confidence
provenance
```

Không truyền hidden state tùy ý.

---

# 25. Digital Twin readiness

ENG-2/3/4 phải tạo dữ liệu đủ tốt cho Digital Twin sau này:

```text
Entity
Relationship
State
Revision
Event
Observation
Decision
Prediction
Action
Outcome
```

Mọi engineering decision quan trọng nên có:

```text
what
why
based_on
who/agent
when
approved_by
executed_as
result
```

Đây là nền tảng để Predictive OS học từ lịch sử decision → outcome.

---

# 26. Controlled Autonomy boundary

Không tầng nào được tự ý vượt boundary:

```text
ENG-2
AI may recommend

ENG-3
System may coordinate and execute only after policy/approval

ENG-4
Agents may coordinate and reconcile but cannot bypass authorization

Controlled Autonomy
Only explicitly authorized workflows may become autonomous
```

Autonomy phải được cấp theo:

```text
workflow type
risk class
tool permissions
project policy
approval profile
execution environment
rollback capability
```

---

# 27. Observability requirements

Mỗi intelligence/workflow/multi-agent run phải có:

```text
trace_id
run_id
project_id
task_id
agent_id
workflow_id
artifact_ids
model/provider metadata
latency
tokens/cost where available
tool calls
approvals
conflicts
retries
final outcome
```

Phải tái dựng được câu hỏi:

> “Tại sao hệ thống đưa ra quyết định này, dựa trên dữ liệu nào, agent nào tham gia, ai duyệt, và kết quả thực tế là gì?”

---

# 28. Security requirements

- Least privilege.
- Project/tenant isolation.
- Tool allowlist.
- Artifact access control.
- Approval identity verification.
- Separation of duties.
- No secret in prompts/logs.
- No agent-created privilege escalation.
- Immutable/auditable decision records cho high-risk workflows.

---

# 29. Testing strategy

## ENG-2

Test:

- extraction;
- retrieval;
- evidence grounding;
- confidence classification;
- false-positive handling;
- cross-document reasoning;
- recommendation ranking.

## ENG-3

Test:

- Gate 0 validation;
- each approval profile;
- rejection;
- delegation;
- separation of duties;
- timeout;
- cancellation;
- rollback;
- audit trail;
- unauthorized execution denial.

## ENG-4

Test:

- parallel agents;
- sequential dependencies;
- data conflicts;
- interpretation conflicts;
- constraint conflicts;
- execution conflicts;
- no-consensus;
- verifier rejection;
- reconciler failure;
- timeout/round limits;
- authorization boundary.

---

# 30. Acceptance criteria

## ENG-2 DONE

- Intelligence Package contract implemented.
- Evidence/provenance mandatory for important recommendations.
- Suggestion taxonomy implemented.
- Ranking/confidence implemented.
- Human feedback loop implemented.
- No direct authorization/execution.
- Tests and observability pass.

## ENG-3 DONE

- Default 3-gate approval model implemented.
- Gate 0 automatic validation exists.
- Risk-based approval profiles exist.
- Approval object is auditable.
- Separation of duties works.
- Rollback/non-reversible declaration works.
- Workflow state machine is enforced.
- Unauthorized execution is impossible through normal APIs.

## ENG-4 DONE

- Multi-agent roles implemented.
- Conflict types implemented.
- Seven-step conflict protocol implemented.
- Evidence-first reconciliation implemented.
- No majority-vote override for safety/law/authoritative data.
- No-consensus is supported.
- Agent collaboration has hard limits.
- ENG-3 remains the authorization boundary.
- Complete provenance/audit exists.

---

# 31. Implementation order

```text
ENG-2.1 Intelligence contracts
ENG-2.2 Evidence/provenance
ENG-2.3 Context + retrieval
ENG-2.4 Engineering reasoning
ENG-2.5 Suggestion engine
ENG-2.6 Validation/confidence
ENG-2.7 Human feedback

        ↓

ENG-3.1 Workflow contracts
ENG-3.2 Policy/risk engine
ENG-3.3 Gate 0 validation
ENG-3.4 Approval engine
ENG-3.5 Workflow state machine
ENG-3.6 Execution engine
ENG-3.7 Rollback/audit

        ↓

ENG-4.1 Multi-agent protocol
ENG-4.2 Planner/delegation
ENG-4.3 Specialist execution
ENG-4.4 Verifier/critic
ENG-4.5 Conflict detector
ENG-4.6 Reconciler
ENG-4.7 Consensus/no-consensus
ENG-4.8 Cross-agent execution
ENG-4.9 Authorization integration
```

Mỗi phase phải có test, regression verification và commit riêng.

---

# 32. Final architectural rule

Engineering OS phải tiến hóa theo:

```text
M43
Agent Integration
      ↓
ENG-2
Intelligence
      ↓
ENG-3
Controlled Workflow
      ↓
ENG-4
Multi-Agent Coordination
      ↓
Engineering OS
      ↓
Digital Twin
      ↓
Predictive OS
      ↓
Controlled Autonomy
```

Mục tiêu không phải làm AI “tự động nhất có thể”. Mục tiêu là xây dựng hệ thống engineering có thể **hiểu đúng → đề xuất có bằng chứng → phối hợp → được kiểm soát → thực thi → đo kết quả → học từ kết quả**, trong đó mức tự động hóa tăng dần theo risk và evidence.
