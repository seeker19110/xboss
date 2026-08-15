# ENG-2 — Engineering Intelligence (đặc tả thi hành)

> **Phase 2/4 của track `ENG-*`.** Đọc trước: `ENG-0-roadmap-tich-hop-engineering-os.md`
> (lộ trình + 12 nguyên tắc + boundary chống AI tự cấp quyền) và
> `ENGINEERING-OS-ENG2-ENG3-ENG4.md` (đặc tả **kiến trúc/khái niệm** gốc — file này là bản
> **thi hành** cụ thể hoá nó vào XBoss: schema DDL, route, lib, test).
>
> Quan hệ 2 file: `ENGINEERING-OS-ENG2-ENG3-ENG4.md` §1–§6 + §29 + §30 là **nguồn yêu cầu**;
> file này là **cách làm** trong XBoss. Mâu thuẫn nào giữa 2 file → file khái niệm thắng về
> _nguyên tắc_, file này thắng về _chi tiết kỹ thuật XBoss_.

## 1. Ranh giới phase (LUẬT CỨNG — không được vi phạm)

Từ §0 "Core principle" của đặc tả gốc:

```text
ENG-2 = KNOW / REASON / SUGGEST     ← phase này
ENG-3 = PLAN / APPROVE / EXECUTE    ← KHÔNG làm ở đây
ENG-4 = DELEGATE / COORDINATE       ← KHÔNG làm ở đây
```

- ENG-2 **không tự phê duyệt, không tự thi công** (§1.1). Không route nào của ENG-2 được
  ghi vào `boq_items`/`payment_bills`/`tasks.progress_percent`/`engineering_objects.status`.
- Suggestion được "Accept" chỉ đổi `status` của chính suggestion đó — **không** tự sinh
  workflow/thay đổi dữ liệu nghiệp vụ. Việc biến suggestion thành hành động thật là ENG-3
  (`createWorkflowFromSuggestion`, phase sau) — ENG-2 chỉ dựng sẵn khoá ngoại để ENG-3 nối vào.
- **Không gọi LLM trong phase này.** ENG-2 xây _hợp đồng dữ liệu + engine xếp hạng/độ tin cậy
  xác định (deterministic)_; hệ sinh suggestion thật (MEPF-Agents hoặc rule engine) đẩy vào
  qua API. Đúng nguyên tắc #1/#2/#9 (`ENG-0` mục 3): LLM không phải nguồn sự thật, engine
  domain phải chạy được không cần LLM.

## 2. Schema — `migrations/0085_engineering_intelligence.sql`

Thuần `CREATE TABLE`/`CREATE INDEX` → đi thẳng production (không cần staging). Chạy
`npm run gen:erd` cùng PR.

### 2.1 `engineering_intelligence_packages` (§1.3)

Gói output của 1 lần chạy intelligence — nhiều suggestion chung 1 package.

```sql
CREATE TABLE IF NOT EXISTS engineering_intelligence_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,              -- question/objective (§1.3)
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  -- provenance: hệ nào/model nào sinh ra gói này (§1.3, §27). JSONB tự do vì mỗi nguồn
  -- khai khác nhau (agent version, model id, calculation_version...) — KHÔNG ép schema
  -- cứng, đúng cách engineering_objects.properties đang làm.
  provenance JSONB NOT NULL DEFAULT '{}',
  -- Ràng buộc quan sát (§27): trace_id để nối ngược log/Sentry của bên gọi.
  trace_id TEXT,
  api_key_id INTEGER REFERENCES api_keys(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_ip_project ON engineering_intelligence_packages(project_id, created_at DESC);
```

### 2.2 `engineering_suggestions` (§2, §3, §5, §6)

```sql
CREATE TABLE IF NOT EXISTS engineering_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES engineering_intelligence_packages(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Đối tượng kỹ thuật liên quan (ENG-1) — NULL khi suggestion ở mức dự án/tài liệu.
  object_id UUID REFERENCES engineering_objects(id) ON DELETE CASCADE,
  -- §2.1 suggestion classes A–H (8 lớp, khoá đóng — validate ở lib/DB, không tự thêm).
  suggestion_class TEXT NOT NULL CHECK (suggestion_class IN
    ('design', 'drawing', 'mep', 'compliance', 'quantity_cost', 'constructability', 'risk', 'change_impact')),
  title TEXT NOT NULL,
  body TEXT,
  -- §3 ranking semantic (7 mức, thứ tự nghiêm ngặt — dùng sortRank ở lib/engineering-intel.ts).
  priority TEXT NOT NULL CHECK (priority IN
    ('critical_safety', 'regulatory', 'high_impact', 'design_coordination', 'quality', 'optimization', 'cosmetic')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  -- §5 confidence: 4 mức, KHÔNG phải điểm số LLM tự chấm. Suy ra bằng hàm xác định
  -- computeConfidence() từ 6 tín hiệu (mục 3.2) — cột này lưu KẾT QUẢ đã tính.
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  -- Tín hiệu đầu vào của computeConfidence (lưu để tái dựng/giải thích, §27).
  confidence_signals JSONB NOT NULL DEFAULT '{}',
  impact TEXT CHECK (impact IN ('critical', 'high', 'medium', 'low', 'none')),
  urgency TEXT CHECK (urgency IN ('immediate', 'soon', 'normal', 'later')),
  reversible BOOLEAN,
  estimated_effort TEXT,
  -- §3: suggestion không đủ evidence → 'needs_review' (KHÔNG phải trạng thái người dùng
  -- chọn, do hệ tự đặt lúc ingest — xem mục 3.3).
  -- §6 human interaction: accepted/rejected/modified/deferred/false_positive.
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN
    ('open', 'needs_review', 'accepted', 'rejected', 'modified', 'deferred', 'false_positive')),
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  -- Nối sang ENG-3 (phase sau): workflow sinh ra từ suggestion này. Cột để sẵn, ENG-2
  -- KHÔNG ghi (không có bảng workflow ở phase này) — tránh migration đổi bảng về sau.
  workflow_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_sug_project_status ON engineering_suggestions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_eng_sug_project_class ON engineering_suggestions(project_id, suggestion_class);
CREATE INDEX IF NOT EXISTS idx_eng_sug_object ON engineering_suggestions(object_id);
CREATE INDEX IF NOT EXISTS idx_eng_sug_package ON engineering_suggestions(package_id);
```

### 2.3 `engineering_evidence` (§4 evidence-first — bảng quan trọng nhất)

```sql
CREATE TABLE IF NOT EXISTS engineering_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES engineering_suggestions(id) ON DELETE CASCADE,
  -- §4: PHẢI phân biệt 4 loại. Đây là cơ chế chống hallucination cốt lõi của ENG-2 —
  -- một "recommendation" không kèm ít nhất 1 dòng 'fact' bị coi là thiếu evidence.
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'inference', 'assumption', 'recommendation')),
  statement TEXT NOT NULL,
  -- Nguồn của FACT: trỏ về source revision (ENG-1) + vị trí trong nguồn.
  source_revision_id UUID REFERENCES engineering_source_revisions(id),
  object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  locator TEXT,                          -- "layer=M-DUCT,handle=1A2B" / "page=3,cell=B12"
  standard_ref TEXT,                     -- §2.1.D: mã tiêu chuẩn/điều khoản khi là compliance
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eng_evidence_suggestion ON engineering_evidence(suggestion_id, sort_order);
```

### 2.4 Audit — KHÔNG dùng được trigger `audit_row_change()` trên bảng UUID

Dự định ban đầu là gắn trigger `audit_row_change()` (0049) như `0061_api_keys.sql`. **Đã
thử và vỡ thật** khi chạy test: hàm đó khai `v_id BIGINT` rồi ép
`(to_jsonb(NEW)->>'id')::bigint`, trong khi mọi bảng `engineering_*` dùng **UUID** làm khoá
chính → `invalid input syntax for type bigint: "45c086c3-…"` ở mọi INSERT. `audit_log.entity_id`
cũng là `BIGINT` nên về bản chất không chứa được UUID.

Quyết định: **không gắn trigger**; truy vết bằng cột sẵn có trên bảng
(`decided_by`/`decided_at`/`decision_note` + `package_id` → `provenance`/`trace_id`) — đủ trả
lời "ai quyết, khi nào, vì sao, nguồn nào sinh ra" theo §27. Nâng hạ tầng audit lên khoá đa
kiểu (UUID) là việc riêng, ghi nợ trong `PROGRESS.md`.

> Ghi chú sửa doc drift: đặc tả ENG-1 mục 2.4 từng ghi "gắn trigger audit" nhưng
> `migrations/0084_engineering_core.sql` thực tế **không có** DO-block đó (kiểm bằng
> `pg_trigger`: chỉ tồn tại trigger của các bảng khoá số). Nhờ vậy ENG-1 không dính lỗi
> trên. Đã sửa lại mục 2.4 của ENG-1 cho khớp code thật.

## 3. `lib/engineering-intel.ts` (mới)

### 3.1 Ranking xác định (§3)

```ts
export const PRIORITY_ORDER = [
  "critical_safety",
  "regulatory",
  "high_impact",
  "design_coordination",
  "quality",
  "optimization",
  "cosmetic",
] as const;
export type SuggestionPriority = (typeof PRIORITY_ORDER)[number];

// Điểm sắp xếp: priority là trục CHÍNH (không bao giờ bị confidence/severity vượt mặt —
// một cảnh báo an toàn confidence thấp vẫn xếp trên một tối ưu hoá confidence cao, đúng
// §3 + §10 "không dùng AI confidence cao để hạ cấp việc có safety risk").
export function rankSuggestion(s: {
  priority: SuggestionPriority;
  severity: string;
  confidence: string;
}): number;
```

Thứ tự sắp xếp trong list API: `priority` (theo `PRIORITY_ORDER`) → `severity` → `confidence`
→ `created_at DESC`. Sắp trong **SQL** (`ORDER BY array_position(...)`), không sort ở JS —
danh sách có thể dài, phân trang phải đúng.

### 3.2 Confidence xác định (§5)

```ts
export type ConfidenceSignals = {
  sourceQuality?: number; // 0..1 — chất lượng nguồn (bản vẽ gốc vs OCR ảnh scan)
  extractionConfidence?: number; // 0..1 — độ tin của bước trích xuất (từ MEPF-Agents)
  ruleValidated?: boolean; // đã qua rule/quy chuẩn xác định chưa
  crossSourceAgreement?: number; // 0..1 — nhiều nguồn độc lập cùng kết luận
  freshness?: number; // 0..1 — dữ liệu còn mới so với revision hiện hành
  completeness?: number; // 0..1 — đủ dữ liệu đầu vào chưa
};

// KHÔNG nhận "confidence" do bên gọi tự khai — luôn TÍNH LẠI từ signals (§5 "confidence
// không phải LLM tự chấm điểm"). Thiếu signals → 'unknown' (KHÔNG phải 'low' — §5 yêu cầu
// dùng UNKNOWN khi evidence không đủ; 'low' hàm ý đã đo được và thấp, khác hẳn).
export function computeConfidence(
  signals: ConfidenceSignals,
): "high" | "medium" | "low" | "unknown";
```

Quy tắc (thuần, test được, không có số ma thuật rải rác):

- Không có signal nào → `unknown`.
- Có `< 3` signal trong 6 → `unknown` (không đủ cơ sở để xếp hạng).
- Ngược lại tính trung bình các signal số (`ruleValidated` quy đổi `true=1/false=0`):
  `>= 0.8` → `high`; `>= 0.5` → `medium`; còn lại → `low`.
- **Ghi đè cứng**: `ruleValidated === false` → tối đa `medium` (rule xác định đã bác thì
  không được nhận `high` dù các signal khác đẹp).

### 3.3 Cổng evidence lúc ingest (§4, §3)

```ts
// Suggestion PHẢI có ≥1 evidence kind='fact' để được 'open'. Thiếu → hệ tự đặt
// status='needs_review' (KHÔNG từ chối ingest — bóc thiếu âm thầm nguy hiểm hơn bóc thừa
// có cảnh báo, nguyên tắc #4 docs/AUDIT_BOC_KHOI_LUONG.md của MEP-Agents).
// Ngoài ra: priority 'critical_safety'|'regulatory' mà confidence='unknown' cũng vào
// 'needs_review' — không để cảnh báo an toàn trôi vào danh sách chính khi chưa có cơ sở.
export function initialStatus(input: {
  evidence: { kind: string }[];
  priority: SuggestionPriority;
  confidence: string;
}): "open" | "needs_review";
```

### 3.4 Hàm dữ liệu

```ts
export async function ingestIntelligencePackage(
  projectId: number,
  apiKeyId: number,
  actorId: number,
  payload: IntelligencePackageInput,
): Promise<{
  packageId: string;
  suggestions: { id: string; status: string; confidence: string }[];
}>;

export async function listSuggestions(
  projectId: number,
  filter?: {
    status?: string;
    suggestionClass?: string;
    priority?: string;
    objectId?: string;
    limit?: number;
  },
): Promise<SuggestionRow[]>;

export async function getSuggestion(
  projectId: number,
  id: string,
): Promise<{ suggestion: SuggestionRow; evidence: EvidenceRow[] } | null>;

// §6 human interaction. KHÔNG có side effect ngoài chính bảng suggestion (LUẬT mục 1).
export async function decideSuggestion(
  projectId: number,
  id: string,
  userId: number,
  decision: "accepted" | "rejected" | "modified" | "deferred" | "false_positive",
  note?: string,
): Promise<void>;
```

Toàn bộ `ingestIntelligencePackage` chạy trong **1 `withTransaction`**; mỗi suggestion tính
`confidence` + `initialStatus` **ở server** (bỏ qua giá trị bên gọi tự khai), ghi evidence
kèm `sort_order` theo thứ tự mảng.

## 4. API

### 4.1 `POST /api/v1/engineering/intelligence` (API key, scope `engineering`)

Cùng khuôn `app/api/v1/engineering/ingest/route.ts` (ENG-1). Body:

```ts
type IntelligencePackageInput = {
  objective: string;
  sourceRevisionId?: string;
  provenance?: Record<string, unknown>;
  traceId?: string;
  suggestions: {
    suggestionClass:
      | "design"
      | "drawing"
      | "mep"
      | "compliance"
      | "quantity_cost"
      | "constructability"
      | "risk"
      | "change_impact";
    title: string;
    body?: string;
    priority: SuggestionPriority;
    severity?: "critical" | "high" | "medium" | "low" | "info";
    impact?: string;
    urgency?: string;
    reversible?: boolean;
    estimatedEffort?: string;
    externalObjectKey?: string; // map sang engineering_objects.external_key (ENG-1)
    confidenceSignals?: ConfidenceSignals;
    evidence: {
      kind: "fact" | "inference" | "assumption" | "recommendation";
      statement: string;
      locator?: string;
      standardRef?: string;
      externalObjectKey?: string;
    }[];
  }[]; // tối đa 200/request
};
```

Trả `201 { packageId, suggestions: [{ id, status, confidence }] }` — bên gọi thấy ngay
suggestion nào bị hạ về `needs_review` và vì sao (confidence tính lại).

422 khi: `suggestions` rỗng/`> 200`; thiếu `title`/`priority`/`suggestionClass` (chỉ rõ
index); `evidence` rỗng ở phần tử nào (evidence-first là bắt buộc — mảng rỗng hoàn toàn
khác với "có evidence nhưng thiếu fact"); `externalObjectKey` không tồn tại trong dự án.

### 4.2 Route quản trị (session auth)

Quyền mới `CAN.viewEngineeringSuggestions` (Admin/PM/**engineer** — kỹ sư là người đọc
suggestion kỹ thuật, khác ENG-1 chỉ Admin/PM duyệt object) và
`CAN.decideEngineeringSuggestions` (Admin/PM — quyết định là hành vi có hệ quả).

- `GET /api/engineering/suggestions?status=&class=&priority=&objectId=`
- `GET /api/engineering/suggestions/:id` → suggestion + evidence nhóm theo `kind`
- `POST /api/engineering/suggestions/:id/decide` `{ decision, note? }`

## 5. UI — `/engineering/suggestions`

Tab thứ 2 của cụm Engineering (link chéo với `/engineering` của ENG-1):

- Bảng xếp theo ranking (§3): cột Ưu tiên (badge 7 màu theo `PRIORITY_ORDER`, `critical_safety`
  đỏ đậm) / Lớp / Tiêu đề / Độ tin (badge 4 mức, `unknown` màu zinc + icon dấu hỏi — **không
  truyền tin chỉ bằng màu**) / Trạng thái / Ngày.
- Filter: trạng thái (mặc định `open`), lớp, ưu tiên.
- Modal chi tiết: 4 khối evidence tách bạch theo `kind` với nhãn tiếng Việt rõ ràng —
  **Sự thật** (fact) / **Suy luận** (inference) / **Giả định** (assumption) / **Khuyến nghị**
  (recommendation), đúng §4; hiển thị `confidence_signals` dạng bảng nhỏ để giải thích vì sao
  ra mức tin cậy đó; 5 nút quyết định (§6) + ô ghi chú.
- Banner cảnh báo ở đầu modal khi `status='needs_review'`: "Thiếu bằng chứng loại Sự thật —
  cần rà lại trước khi dùng" (giải thích lý do, không chỉ tô màu).

## 6. Test — `tests/engineering-intel.test.ts`

Thuần (không cần DB): `rankSuggestion` giữ đúng thứ tự 7 mức kể cả khi confidence ngược
chiều; `computeConfidence` 6 nhánh (rỗng→unknown, <3 signal→unknown, ≥0.8→high, ≥0.5→medium,
còn lại→low, `ruleValidated=false` ghim trần medium); `initialStatus` (thiếu fact→needs_review,
critical_safety+unknown→needs_review, đủ→open).

Tích hợp (cần `TEST_DATABASE_URL`): ingest package 3 suggestion → đọc lại đúng, confidence
**tính lại ở server** (gửi `confidence:"high"` giả trong payload không có tác dụng);
suggestion thiếu evidence `fact` → `needs_review`; `decideSuggestion` đổi status + ghi
`decided_by/at`, gọi trên dự án khác → ném lỗi; cách ly đa dự án; list sắp đúng thứ tự
ranking; scope `read` gọi route v1 → 403; `engineer` xem được nhưng quyết định → 403.

## 7. Tiêu chí chấp nhận (khớp §30 "ENG-2 DONE")

- [ ] Intelligence Package contract có thật (bảng + API + type).
- [ ] Evidence/provenance **bắt buộc**: không có fact → `needs_review`, không lọt `open`.
- [ ] Đủ 8 suggestion class (§2.1 A–H) + 7 mức ranking (§3) + 4 mức confidence (§5).
- [ ] Confidence tính bằng hàm xác định từ signals, **không nhận giá trị bên gọi khai**.
- [ ] Human feedback loop đủ 5 quyết định (§6).
- [ ] **Không** có đường authorization/execution nào (grep xác nhận không ghi
      `boq_items`/`payment_bills`/`tasks`/`engineering_objects.status`).
- [ ] `lint`/`typecheck`/`build`/`npm test` toàn bộ suite xanh; `gen:erd` khớp.
