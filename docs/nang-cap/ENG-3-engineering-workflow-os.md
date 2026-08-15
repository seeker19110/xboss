# ENG-3 — Engineering Workflow OS (đặc tả thi hành)

> **Phase 3/4 của track `ENG-*`.** Đọc trước: `ENG-0-roadmap-tich-hop-engineering-os.md`
> và `ENGINEERING-OS-ENG2-ENG3-ENG4.md` §7–§14 (nguồn yêu cầu). File này là bản **thi hành**
> cho XBoss (schema DDL, route, lib, test).

## 1. Ranh giới phase & quan hệ với engine duyệt đã có

```text
ENG-2 = KNOW / REASON / SUGGEST      (đã xong)
ENG-3 = PLAN / APPROVE / EXECUTE     ← phase này
ENG-4 = DELEGATE / COORDINATE        (phase sau)
```

**ENG-3 là ranh giới ủy quyền (authorization boundary) của toàn track** (§26): mọi thay đổi
có side effect từ ENG-2/ENG-4 đều phải đi qua đây; không tầng nào được vượt mặt.

### Vì sao KHÔNG tái dùng `lib/approvals.ts` (M46 Approval Engine) mà làm mới

Đã đọc kỹ `lib/approvals.ts` trước khi quyết định (đúng nguyên tắc "đọc trước khi sửa, tái
dùng trước khi viết mới"). M46 **không đáp ứng** được ENG-3 vì khác bản chất ở 4 điểm:

|                | M46 `approval_flows`                                                                          | ENG-3 cần (§8–§14)                                                                 |
| -------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Loại thực thể  | Khoá đóng 4 giá trị nghiệp vụ XBoss (`variation`/`payment_cert`/`proposal`/`task_acceptance`) | Workflow kỹ thuật tự do, sinh từ suggestion/agent                                  |
| Chọn cấp duyệt | Theo **ngưỡng tiền** (`minAmount`)                                                            | Theo **risk classification** 8 chiều (§10) — tiền chỉ là 1 chiều                   |
| Gate 0         | Không có                                                                                      | **Bắt buộc** — validation tự động, fail thì không được tạo request (§8)            |
| Vòng đời       | `pending/approved/rejected/cancelled`                                                         | State machine 12 trạng thái có `EXECUTING`/`VALIDATING_RESULT`/`ROLLED_BACK` (§11) |

→ Làm bảng/lib riêng, **không đụng** M46 (mọi luồng VO/IPC/nghiệm thu hiện có giữ nguyên
100%). Hai hệ sống song song, không chia sẻ bảng.

### Phạm vi CÓ / KHÔNG ở phase này

- **CÓ**: hợp đồng workflow, policy/risk engine, Gate 0, engine duyệt nhiều gate, state
  machine, separation of duties, khai báo rollback, audit đầy đủ.
- **KHÔNG**: _thực thi tự động_ side effect thật (ghi `boq_items`, sửa `tasks`…). Trạng thái
  `EXECUTING`/`COMPLETED` ở PR này được chuyển bằng thao tác **người dùng xác nhận đã làm**
  (`POST .../execute`, `.../complete`) — hệ thống ghi nhận và audit, **không tự chạy**. Lý
  do: chưa có executor an toàn nào được duyệt; §26 nói rõ autonomy phải được cấp tường minh
  theo workflow type/risk class/rollback capability — chưa có cơ chế cấp đó thì không được
  tự thực thi. Đây là ranh giới có chủ đích, không phải thiếu sót.

## 2. Schema — `migrations/0086_engineering_workflows.sql`

### 2.1 `engineering_workflows` (§11 state machine, §14 rollback)

```sql
CREATE TABLE IF NOT EXISTS engineering_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Nguồn gốc: sinh từ suggestion ENG-2 (thường gặp) hoặc tạo tay.
  suggestion_id UUID REFERENCES engineering_suggestions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  -- §9 approval profile A–E. profile QUYẾT ĐỊNH số gate; policy engine chọn, người dùng
  -- KHÔNG tự chọn (xem lib/engineering-workflow.ts::classifyRisk + selectProfile).
  profile TEXT NOT NULL CHECK (profile IN ('A', 'B', 'C', 'D', 'E')),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('low', 'medium', 'high', 'critical')),
  -- Đầu vào của classifyRisk — lưu để giải thích vì sao ra profile này (§27).
  risk_inputs JSONB NOT NULL DEFAULT '{}',
  -- §11: 12 trạng thái (7 dòng chính + 5 nhánh).
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN
    ('draft', 'validating', 'awaiting_approval', 'approved', 'executing',
     'validating_result', 'completed',
     'rejected', 'cancelled', 'blocked', 'failed', 'rolled_back', 'superseded')),
  -- §14: bắt buộc khai TRƯỚC khi duyệt. non-reversible phải được biết trước khi ai đó ký.
  reversible BOOLEAN NOT NULL DEFAULT FALSE,
  rollback_strategy TEXT,
  -- Kết quả Gate 0 (§8) — lưu lại để không phải chạy lại và để audit.
  gate0_result JSONB NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_wf_project_state ON engineering_workflows(project_id, state);
CREATE INDEX IF NOT EXISTS idx_eng_wf_suggestion ON engineering_workflows(suggestion_id);
```

### 2.2 `engineering_workflow_gates` (§12 approval object)

Approval **không được chỉ là boolean** (§12) — mỗi gate là 1 dòng đầy đủ.

```sql
CREATE TABLE IF NOT EXISTS engineering_workflow_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES engineering_workflows(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,                  -- 1..n theo profile
  gate_type TEXT NOT NULL CHECK (gate_type IN
    ('technical_review', 'discipline_qa', 'independent_qa', 'authority_release')),
  required_role TEXT NOT NULL,           -- vai trò XBoss được phép ký gate này
  decision TEXT CHECK (decision IN ('approved', 'rejected')),
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  comments TEXT,
  evidence JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_eng_wf_gates_wf ON engineering_workflow_gates(workflow_id, seq);
```

### 2.3 `engineering_workflow_events` (§11 "mọi state transition phải audit được")

Vì trigger `audit_row_change()` không dùng được cho khoá UUID (đã chứng minh ở ENG-2 —
`audit_log.entity_id` là BIGINT), ENG-3 **tự ghi audit** bằng bảng sự kiện riêng. Đây không
phải giải pháp tạm: workflow cần audit _có ngữ nghĩa_ (from_state→to_state, ai, vì sao) chứ
không phải diff JSONB thô.

```sql
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
```

## 3. `lib/engineering-workflow.ts`

### 3.1 Risk engine (§10) → profile (§9) — thuần, xác định

```ts
export type RiskInputs = {
  safetyRisk?: boolean; // ảnh hưởng an toàn
  regulatoryRisk?: boolean; // ảnh hưởng pháp lý/quy chuẩn
  financialImpact?: number; // VND
  crossDiscipline?: boolean;
  reversible?: boolean;
  uncertainty?: "low" | "medium" | "high";
  scopeImpact?: "low" | "medium" | "high";
};

export function classifyRisk(i: RiskInputs): "low" | "medium" | "high" | "critical";
export function selectProfile(risk: RiskClass, hasSideEffect: boolean): "A" | "B" | "C" | "D" | "E";
export function gatesForProfile(profile): { seq; gateType; requiredRole }[];
```

Quy tắc **cứng, không thương lượng** (§10 "không được dùng AI confidence cao để giảm approval
level cho thay đổi có safety/regulatory risk"):

- `safetyRisk` → `critical` (bất kể mọi yếu tố khác) → **PROFILE-E** (4 gate).
- `regulatoryRisk` **hoặc** `reversible === false` → tối thiểu `high` → **PROFILE-D**.
- `financialImpact >= 100_000_000` VND, hoặc `crossDiscipline`, hoặc `uncertainty==='high'`
  → tối thiểu `medium` → **PROFILE-C**.
- Còn lại `low` → **PROFILE-B**; workflow không có side effect → **PROFILE-A** (chỉ Gate 0).
- Hàm `selectProfile` **không có tham số nào cho phép hạ cấp** — không nhận "confidence",
  không nhận "override". Muốn hạ profile phải đổi chính `RiskInputs` (dữ liệu, có audit).

Ánh xạ gate → vai trò XBoss:

| Gate      | `gate_type`         | `required_role`                             |
| --------- | ------------------- | ------------------------------------------- |
| 1         | `technical_review`  | `engineer`                                  |
| 2         | `discipline_qa`     | `pm`                                        |
| 3 (chỉ E) | `independent_qa`    | `pm` (người **khác** gate 2 — SoD, mục 3.3) |
| 4         | `authority_release` | `admin`                                     |

Profile: A = [] · B = [1] · C = [1,2] · D = [1,2,4] · E = [1,2,3,4].

### 3.2 Gate 0 — validation tự động (§8)

```ts
export type Gate0Result = { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] };
export async function runGate0(projectId: number, input: WorkflowInput): Promise<Gate0Result>;
```

Kiểm 6 điều, **fail bất kỳ điều nào → không được tạo approval request** (§8):
`title` không rỗng · `risk_inputs` khai đủ (ít nhất `reversible`) · nếu có `suggestionId`
thì suggestion phải tồn tại, **cùng dự án**, và **đã `accepted`** (không tạo workflow từ đề
xuất chưa ai đồng ý) · non-reversible thì `rollbackStrategy` phải nói rõ (kể cả "không thể
hoàn tác, chấp nhận rủi ro") · không có workflow khác **đang mở** cho cùng suggestion (chống
trùng) · người tạo có quyền `CAN.createEngineeringWorkflow`.

### 3.3 State machine (§11) + Separation of Duties (§13)

```ts
export const ALLOWED_TRANSITIONS: Record<WorkflowState, WorkflowState[]>;
export function canTransition(from: WorkflowState, to: WorkflowState): boolean;
```

Chuyển trạng thái hợp lệ (mọi chuyển khác bị từ chối, ghi rõ lý do):

```text
draft            → validating | cancelled
validating       → awaiting_approval | blocked | cancelled     (Gate 0 fail → blocked)
awaiting_approval→ approved | rejected | cancelled | blocked
approved         → executing | cancelled | superseded
executing        → validating_result | failed
validating_result→ completed | failed
failed           → rolled_back | cancelled
blocked          → validating | cancelled
```

**Separation of duties (§13)** — luật cứng trong `approveGate`, áp cho `high`/`critical`:

- Người **tạo** workflow không được ký bất kỳ gate nào.
- Một người không được ký **2 gate** trong cùng workflow.
- Gate `independent_qa` (profile E) phải là người khác gate `discipline_qa` — đây chính là ý
  nghĩa "independent".
- Với risk `low`/`medium`: chỉ áp luật "người tạo không tự ký" (nới cho vận hành thực tế,
  ghi rõ để không ai tưởng là lỗ hổng).

### 3.4 Hàm dữ liệu

```ts
export async function createWorkflow(
  projectId,
  userId,
  input,
): Promise<{ id; state; profile; riskClass; gate0 }>;
export async function listWorkflows(projectId, filter?): Promise<WorkflowRow[]>;
export async function getWorkflow(projectId, id): Promise<{ workflow; gates; events } | null>;
export async function submitForApproval(projectId, id, userId): Promise<void>; // draft→validating→awaiting_approval
export async function approveGate(projectId, id, seq, userId, decision, comments?): Promise<void>;
export async function transitionWorkflow(projectId, id, userId, to, reason?): Promise<void>;
```

Mọi hàm ghi đều bọc `withTransaction`, `SELECT ... FOR UPDATE` trên workflow (chống 2 người
ký cùng lúc), và **luôn** append `engineering_workflow_events`.

`approveGate` khi gate cuối `approved` → tự chuyển workflow sang `approved`; bất kỳ gate nào
`rejected` → workflow `rejected` ngay (không cần chờ các gate sau).

## 4. API

- `POST /api/engineering/workflows` `{ suggestionId?, title, description?, riskInputs, rollbackStrategy? }`
  → chạy Gate 0; fail → **422 kèm danh sách check hỏng** (không tạo bản ghi).
- `GET /api/engineering/workflows?state=` · `GET /api/engineering/workflows/:id`
- `POST /api/engineering/workflows/:id/submit`
- `POST /api/engineering/workflows/:id/gates/:seq` `{ decision, comments? }`
- `POST /api/engineering/workflows/:id/transition` `{ to, reason? }`

Quyền mới: `CAN.createEngineeringWorkflow` (admin/pm/engineer),
`CAN.viewEngineeringWorkflows` (admin/pm/engineer/bch), `CAN.approveEngineeringGate`
(admin/pm/engineer — kiểm thêm `required_role` từng gate ở tầng lib).

**Không có route nào cho phép sửa `profile`/`risk_class` trực tiếp** — chỉ đổi được qua
`riskInputs` lúc tạo (boundary chống tự hạ cấp phê duyệt).

## 5. UI — `/engineering/workflows`

Bảng: Tiêu đề / Profile (A–E kèm tooltip số gate) / Risk (4 mức, badge + icon) / Trạng thái
(12 state, nhãn tiếng Việt) / Tiến độ gate (`2/4`). Modal chi tiết: thông tin + **kết quả
Gate 0 dạng checklist** (xanh/đỏ từng mục, giải thích vì sao bị chặn) + danh sách gate với
người ký/thời điểm/nhận xét + dòng thời gian sự kiện + nút hành động theo trạng thái & quyền.

## 6. Test — `tests/engineering-workflow.test.ts`

Thuần: `classifyRisk` (safety→critical bất kể yếu tố khác; regulatory/non-reversible→≥high;
tiền lớn/cross-discipline/uncertainty cao→≥medium; còn lại low) · `selectProfile` +
`gatesForProfile` (A=0, B=1, C=2, D=3, E=4 gate, đúng thứ tự) · `canTransition` (bảng hợp lệ

- vài chuyển bậy bị chặn: `draft→completed`, `completed→draft`, `rejected→approved`).

Tích hợp: Gate 0 chặn (suggestion chưa `accepted` → 422, không tạo bản ghi — kiểm `COUNT(*)`)
· luồng đủ profile C (tạo→submit→ký gate 1→gate 2→`approved`) · reject gate 1 → workflow
`rejected` ngay, gate 2 không cần ký · **SoD**: người tạo ký gate → chặn; cùng người ký 2
gate của workflow `high` → chặn · cách ly đa dự án · mọi transition đều sinh dòng event.

## 7. Tiêu chí chấp nhận (khớp §30 "ENG-3 DONE")

- [ ] Default 3-gate + đủ 5 profile A–E.
- [ ] Gate 0 tồn tại và **thực sự chặn** (fail → không tạo được approval request).
- [ ] Approval profile chọn theo risk, **không có đường hạ cấp** bằng confidence/override.
- [ ] Approval object đầy đủ (ai/khi nào/nhận xét/evidence), không phải boolean.
- [ ] Separation of duties chạy thật, có test.
- [ ] Khai báo rollback/non-reversible bắt buộc trước khi duyệt.
- [ ] State machine được ép buộc; mọi transition có event audit.
- [ ] Không có đường thực thi trái phép qua API thông thường.
