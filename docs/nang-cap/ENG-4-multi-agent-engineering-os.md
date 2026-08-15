# ENG-4 — Multi-Agent Engineering OS (đặc tả thi hành)

> **Phase 4/4 của track `ENG-*`.** Đọc trước: `ENG-0-roadmap-tich-hop-engineering-os.md` và
> `ENGINEERING-OS-ENG2-ENG3-ENG4.md` §15–§28 (nguồn yêu cầu). File này là bản **thi hành**
> cho XBoss.

## 1. Ranh giới phase (LUẬT CỨNG)

```text
ENG-2 = KNOW / REASON / SUGGEST      (xong)
ENG-3 = PLAN / APPROVE / EXECUTE     (xong) ← RANH GIỚI UỶ QUYỀN
ENG-4 = DELEGATE / COORDINATE / RECONCILE  ← phase này
```

- **ENG-4 không được vượt mặt ENG-3** (§23, §26): kết thúc một phiên phối hợp đa agent,
  kết quả là một **bản kế hoạch đã hoà giải** — muốn có tác động thật thì phải tạo workflow
  ENG-3 và đi qua đủ gate. Không route nào của ENG-4 ghi vào `boq_items`/`payment_bills`/
  `tasks`, cũng **không** tự tạo/duyệt workflow.
- **XBoss là bên điều phối và lưu vết, không phải bên chạy agent.** Agent thật (MEPF-Agents)
  chạy ở hệ của họ; ENG-4 cung cấp giao thức: nhận claim của từng agent, phát hiện và phân
  loại xung đột, đóng băng, thu bằng chứng, hoà giải, ghi mức đồng thuận. Đây đúng vai
  "Reconciler/Verifier" trong §16 — phần "Specialist execution" nằm ngoài XBoss.

## 2. Schema — `migrations/0087_engineering_agents.sql`

### 2.1 `engineering_agent_sessions` (§23 lifecycle, §21 hard limits)

```sql
CREATE TABLE IF NOT EXISTS engineering_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,                    -- §23 INTENT: mục tiêu phiên phối hợp
  -- §22 consensus levels — 5 mức, NO_CONSENSUS là trạng thái HỢP LỆ (không phải lỗi).
  consensus TEXT NOT NULL DEFAULT 'pending' CHECK (consensus IN
    ('pending', 'consensus_confirmed', 'consensus_with_risk', 'partial_agreement',
     'conflict_requires_review', 'no_consensus')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'frozen', 'closed')),
  -- §21 hard limits: agent không được trao đổi vô hạn.
  max_rounds INTEGER NOT NULL DEFAULT 5,
  round_count INTEGER NOT NULL DEFAULT 0,
  conflict_budget INTEGER NOT NULL DEFAULT 10,
  -- Kết quả cuối: bản kế hoạch đã hoà giải (KHÔNG phải lệnh thực thi).
  reconciled_plan JSONB,
  -- Nối sang ENG-3 khi con người quyết định biến kế hoạch thành hành động. ENG-4 KHÔNG tự
  -- ghi cột này — chỉ route ENG-3 (tạo workflow) mới gắn, giữ đúng ranh giới uỷ quyền.
  workflow_id UUID REFERENCES engineering_workflows(id) ON DELETE SET NULL,
  trace_id TEXT,                           -- §27 observability
  api_key_id INTEGER REFERENCES api_keys(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_as_project ON engineering_agent_sessions(project_id, status);
```

### 2.2 `engineering_agent_claims` (§24 cross-agent context)

Mỗi claim là phát biểu của **một** agent, kèm đủ thứ §24 yêu cầu — không truyền hidden state.

```sql
CREATE TABLE IF NOT EXISTS engineering_agent_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES engineering_agent_sessions(id) ON DELETE CASCADE,
  -- §16 agent roles (6 vai trò tối thiểu).
  agent_role TEXT NOT NULL CHECK (agent_role IN
    ('planner', 'specialist', 'verifier', 'critic', 'reconciler', 'executor')),
  agent_name TEXT NOT NULL,                -- định danh agent cụ thể (vd "mep-hvac-v2")
  topic TEXT NOT NULL,                     -- khoá gom nhóm: 2 claim cùng topic mới so được
  claim TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  assumptions JSONB NOT NULL DEFAULT '[]',
  -- Tính bằng computeConfidence của ENG-2 (dùng chung, KHÔNG nhận điểm agent tự khai).
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('high','medium','low','unknown')),
  confidence_signals JSONB NOT NULL DEFAULT '{}',
  -- §20 authority hierarchy: hạng nguồn dữ liệu, dùng để phân xử Type A (data conflict).
  source_authority TEXT NOT NULL DEFAULT 'derived' CHECK (source_authority IN
    ('authoritative_source', 'validated_rule', 'specialist', 'verifier', 'derived')),
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  round INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_ac_session ON engineering_agent_claims(session_id, topic);
```

### 2.3 `engineering_conflicts` (§17 conflict model, §18 protocol)

```sql
CREATE TABLE IF NOT EXISTS engineering_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES engineering_agent_sessions(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  -- §17: 4 loại + scope (§18 bước 2 liệt kê 5 nhóm phân loại).
  conflict_type TEXT NOT NULL CHECK (conflict_type IN
    ('data', 'interpretation', 'constraint', 'execution', 'scope')),
  -- §18 7 bước: detect→classify→freeze→collect→reconcile→verify→authorize.
  stage TEXT NOT NULL DEFAULT 'detected' CHECK (stage IN
    ('detected', 'classified', 'frozen', 'evidence_collected', 'reconciled', 'verified',
     'authorized', 'unresolved')),
  claim_ids JSONB NOT NULL DEFAULT '[]',   -- các claim tham gia
  resolution TEXT,
  -- Cách đi tới kết luận — BẮT BUỘC ghi để chứng minh không dùng majority vote sai chỗ.
  resolution_method TEXT CHECK (resolution_method IN
    ('source_authority', 'evidence_comparison', 'constraint_hierarchy',
     'independent_verification', 'human_authority', 'preference_vote')),
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_cf_session ON engineering_conflicts(session_id, stage);
```

## 3. `lib/engineering-agents.ts`

### 3.1 Phát hiện & phân loại xung đột (§17, §18 bước 1–2) — thuần

```ts
export function detectConflicts(claims: ClaimLike[]): { topic: string; claimIds: string[] }[];
export function classifyConflict(claims: ClaimLike[]): ConflictType;
```

- `detectConflicts`: gom theo `topic`; ≥2 claim khác nội dung `claim` trên cùng topic → xung
  đột. Cùng nội dung thì không phải xung đột dù nhiều agent nói (đồng thuận, không phải vote).
- `classifyConflict` theo thứ tự ưu tiên (một xung đột có thể chạm nhiều loại — chọn loại
  **khó** nhất trước, không hạ cấp):
  1. Khác `source_revision_id` → `data` (đọc khác dữ liệu, §17.A).
  2. Có claim từ agent `executor` → `execution` (§17.D — hai bên đề xuất hành động trái nhau).
  3. `payload.constraintKind` xuất hiện → `constraint` (§17.C).
  4. Cùng dữ liệu, khác `assumptions` → `interpretation` (§17.B).
  5. Còn lại → `scope`.

### 3.2 Phân xử — KHÔNG majority vote (§19, §20)

```ts
export type ResolutionMethod =
  | "source_authority"
  | "evidence_comparison"
  | "constraint_hierarchy"
  | "independent_verification"
  | "human_authority"
  | "preference_vote";

export function proposeResolution(
  type: ConflictType,
  claims: ClaimLike[],
): {
  method: ResolutionMethod;
  winnerClaimId: string | null;
  rationale: string;
  needsHuman: boolean;
};
```

Luật (§19 "không dùng majority vote làm mặc định"):

| Loại             | Phương pháp                | Chi tiết                                                                                                                                                                                     |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`           | `source_authority`         | Xếp theo `AUTHORITY_ORDER` (§20): `authoritative_source` > `validated_rule` > `specialist` > `verifier` > `derived`; bằng hạng thì lấy revision mới hơn. **Tuyệt đối không vote** (§17.A).   |
| `interpretation` | `evidence_comparison`      | So `confidence` (thang ENG-2); chênh nhau **≥2 bậc** mới kết luận, nếu không → `needsHuman` (independent verification / specialist adjudication).                                            |
| `constraint`     | `constraint_hierarchy`     | Theo bậc §17.C: `safety_law` > `contract` > `engineering` > `project` > `cost_schedule` > `preference`. Chạm `safety_law`/`contract` → luôn `needsHuman=true` (§17.C: không giải bằng vote). |
| `execution`      | `independent_verification` | Luôn `needsHuman=true`: freeze → so tác động → hoà giải → **ENG-3 phê duyệt** rồi mới thực thi (§17.D).                                                                                      |
| `scope`          | `human_authority`          | Luôn `needsHuman=true`.                                                                                                                                                                      |

`preference_vote` **chỉ** hợp lệ khi cả 5 điều kiện: loại `scope`, không claim nào có
`source_authority='authoritative_source'`, không chạm `safety_law`/`contract`, mọi claim
`confidence` ≥ `medium`, và bên gọi khai `lowRiskPreference: true`. Có hàm riêng
`assertVoteAllowed()` ném lỗi nếu vi phạm — để việc "lỡ dùng vote sai chỗ" là **lỗi cứng**,
không phải quy ước lỏng.

### 3.3 Mức đồng thuận (§22) + giới hạn cứng (§21)

```ts
export function computeConsensus(
  conflicts: ConflictLike[],
  roundCount: number,
  maxRounds: number,
): ConsensusLevel;
```

- Không xung đột nào → `consensus_confirmed`.
- Mọi xung đột đã `verified`/`authorized`, nhưng có cái từng chạm safety/constraint →
  `consensus_with_risk`.
- Còn xung đột chưa xong nhưng đã giải được một phần → `partial_agreement`.
- Có xung đột `unresolved` cần người → `conflict_requires_review`.
- Vượt `max_rounds` mà vẫn còn xung đột → **`no_consensus`** (§21/§22: trạng thái **hợp lệ**,
  đóng phiên và chuyển người xem xét — **không ép consensus giả**).

## 4. API

- `POST /api/v1/engineering/agent-sessions` (API key scope `engineering`) — mở phiên: intent
  - danh sách claim ban đầu. Server tự chạy detect/classify, tạo `engineering_conflicts`,
    tính consensus. Trả về phiên + xung đột + đề xuất phân xử.
- `POST /api/v1/engineering/agent-sessions/:id/claims` — thêm claim vòng sau (tăng `round_count`,
  vượt `max_rounds` → chốt `no_consensus` và trả 200 kèm cảnh báo, **không** ném lỗi vì
  no-consensus là kết quả hợp lệ).
- `GET /api/engineering/agent-sessions[/:id]` (session auth) — Admin/PM/Kỹ sư xem.
- `POST /api/engineering/agent-sessions/:id/conflicts/:conflictId/resolve` — người có thẩm
  quyền chốt xung đột cần người (`needsHuman`), ghi `resolution` + `resolved_by`.

Quyền: `viewEngineeringAgentSessions` (admin/pm/engineer/bch),
`resolveEngineeringConflicts` (admin/pm).

## 5. UI — `/engineering/agent-sessions`

Bảng phiên: Intent / Mức đồng thuận (5 mức, badge — `no_consensus` **không** tô đỏ như lỗi
mà tô zinc kèm nhãn "Chưa đồng thuận (hợp lệ)") / Số xung đột / Vòng (`2/5`) / Trạng thái.
Modal: danh sách claim theo agent (vai trò, độ tin, hạng nguồn), danh sách xung đột kèm
**loại + phương pháp phân xử + lý do**, nút chốt cho xung đột cần người, và ghi chú rõ:
"Kế hoạch đã hoà giải chưa có hiệu lực thi hành — tạo workflow (ENG-3) để đi qua các cửa
duyệt."

## 6. Test — `tests/engineering-agents.test.ts`

Thuần: `detectConflicts` (cùng nội dung ≠ xung đột; khác nội dung cùng topic → xung đột) ·
`classifyConflict` đủ 5 loại theo đúng thứ tự ưu tiên · `proposeResolution` cho từng loại
(data → theo authority, không vote; interpretation chênh <2 bậc → needsHuman;
constraint chạm safety → needsHuman; execution/scope → luôn needsHuman) ·
`assertVoteAllowed` ném lỗi ở cả 4 tình huống cấm · `computeConsensus` đủ 5 mức + vượt
`max_rounds` → `no_consensus`.

Tích hợp: mở phiên có 2 claim mâu thuẫn → tạo đúng conflict + consensus
`conflict_requires_review` · thêm claim vượt `max_rounds` → `no_consensus`, phiên `closed` ·
resolve xung đột ghi `resolved_by`/`method` · cách ly đa dự án · scope `read` → 403 ·
**bất biến ranh giới**: không hàm/route nào của ENG-4 ghi `workflow_id` (grep + test).

## 7. Tiêu chí chấp nhận (khớp §30 "ENG-4 DONE")

- [ ] 6 vai trò agent; 5 loại xung đột; 7 bước protocol có trong `stage`.
- [ ] Hoà giải **evidence-first**, có `resolution_method` bắt buộc ghi lại.
- [ ] **Không majority vote** cho safety/law/authoritative data — có hàm chặn cứng + test.
- [ ] `no_consensus` được hỗ trợ như trạng thái hợp lệ.
- [ ] Giới hạn cứng (`max_rounds`, `conflict_budget`) hoạt động thật.
- [ ] **ENG-3 vẫn là ranh giới uỷ quyền** — ENG-4 không tạo/duyệt workflow, không side effect.
- [ ] Provenance/audit đầy đủ (claim giữ nguồn + assumptions + confidence signals).
