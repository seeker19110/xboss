// ENG-2 — Engineering Intelligence (docs/nang-cap/ENG-2-engineering-intelligence.md,
// cụ thể hoá docs/nang-cap/ENGINEERING-OS-ENG2-ENG3-ENG4.md §1–§6).
//
// RANH GIỚI PHASE (luật cứng): ENG-2 = KNOW / REASON / SUGGEST. Không hàm nào trong file
// này được ghi sang boq_items/payment_bills/tasks/engineering_objects.status — biến
// suggestion thành hành động thật là việc của ENG-3. "Accept" chỉ đổi status của chính
// suggestion đó.
//
// Confidence và ranking đều là hàm XÁC ĐỊNH (deterministic), test được, không gọi LLM —
// đúng nguyên tắc #1/#2/#9 của track ENG (ENG-0 mục 3): LLM không phải nguồn sự thật.
import { z } from "zod";
import { query, queryOne, run, withProjectScope, withTransaction } from "@/lib/db";

// --- §2.1 — 8 lớp suggestion (A–H) ---
export const SUGGESTION_CLASSES = [
  "design",
  "drawing",
  "mep",
  "compliance",
  "quantity_cost",
  "constructability",
  "risk",
  "change_impact",
] as const;
export type SuggestionClass = (typeof SUGGESTION_CLASSES)[number];

export const SUGGESTION_CLASS_LABELS: Record<SuggestionClass, string> = {
  design: "Thiết kế",
  drawing: "Bản vẽ",
  mep: "MEP",
  compliance: "Tuân thủ",
  quantity_cost: "Khối lượng & Chi phí",
  constructability: "Khả thi thi công",
  risk: "Rủi ro",
  change_impact: "Ảnh hưởng thay đổi",
};

// --- §3 — Ranking semantic, thứ tự NGHIÊM NGẶT từ cao xuống thấp ---
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

export const PRIORITY_LABELS: Record<SuggestionPriority, string> = {
  critical_safety: "An toàn / Toàn vẹn",
  regulatory: "Pháp lý / Hợp đồng",
  high_impact: "Chi phí / Tác động lớn",
  design_coordination: "Thiết kế & Phối hợp",
  quality: "Chất lượng",
  optimization: "Tối ưu hoá",
  cosmetic: "Hình thức",
};

export const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;
export const CONFIDENCE_ORDER = ["high", "medium", "low", "unknown"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_ORDER)[number];

// Điểm sắp xếp (số càng NHỎ càng xếp trước). Priority là trục chính và không bao giờ bị
// confidence/severity vượt mặt: một cảnh báo an toàn confidence 'unknown' vẫn xếp TRÊN một
// tối ưu hoá confidence 'high' — đúng §3 và §10 ("không dùng AI confidence cao để hạ cấp
// việc có safety risk"). Dùng cho test bất biến; list API sắp trong SQL để phân trang đúng.
export function rankSuggestion(s: {
  priority: SuggestionPriority;
  severity?: string;
  confidence?: string;
}): number {
  const p = PRIORITY_ORDER.indexOf(s.priority);
  const sev = SEVERITY_ORDER.indexOf((s.severity ?? "medium") as (typeof SEVERITY_ORDER)[number]);
  const conf = CONFIDENCE_ORDER.indexOf((s.confidence ?? "unknown") as ConfidenceLevel);
  // Hệ số 100/10 đảm bảo priority áp đảo severity, severity áp đảo confidence.
  return (
    (p < 0 ? PRIORITY_ORDER.length : p) * 100 + (sev < 0 ? 9 : sev) * 10 + (conf < 0 ? 9 : conf)
  );
}

// --- §5 — Confidence model ---
export type ConfidenceSignals = {
  sourceQuality?: number;
  extractionConfidence?: number;
  ruleValidated?: boolean;
  crossSourceAgreement?: number;
  freshness?: number;
  completeness?: number;
};

const MIN_SIGNALS = 3; // dưới ngưỡng này coi như chưa đủ cơ sở để xếp hạng

// KHÔNG nhận "confidence" do bên gọi tự khai — luôn tính lại từ signals (§5: "confidence
// không phải LLM tự chấm điểm"). Thiếu dữ liệu → 'unknown', KHÔNG phải 'low': 'low' hàm ý
// đã đo được và thấp, 'unknown' hàm ý không đủ cơ sở — hai việc khác hẳn nhau (§5).
export function computeConfidence(signals: ConfidenceSignals | null | undefined): ConfidenceLevel {
  if (!signals) return "unknown";
  const nums: number[] = [];
  for (const k of [
    "sourceQuality",
    "extractionConfidence",
    "crossSourceAgreement",
    "freshness",
    "completeness",
  ] as const) {
    const v = signals[k];
    if (typeof v === "number" && Number.isFinite(v)) nums.push(Math.min(1, Math.max(0, v)));
  }
  if (typeof signals.ruleValidated === "boolean") nums.push(signals.ruleValidated ? 1 : 0);
  if (nums.length < MIN_SIGNALS) return "unknown";

  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  let level: ConfidenceLevel = avg >= 0.8 ? "high" : avg >= 0.5 ? "medium" : "low";
  // Ghi đè cứng: rule xác định đã BÁC thì không được nhận 'high' dù các signal khác đẹp.
  if (signals.ruleValidated === false && level === "high") level = "medium";
  return level;
}

// --- §4 + §3 — Cổng evidence lúc ingest ---
// Suggestion phải có ≥1 evidence kind='fact' mới được vào danh sách chính. Thiếu → hạ về
// 'needs_review' chứ KHÔNG từ chối ingest: bóc thiếu âm thầm nguy hiểm hơn bóc thừa có
// cảnh báo (nguyên tắc #4 docs/AUDIT_BOC_KHOI_LUONG.md của MEP-Agents).
export function initialStatus(input: {
  evidence: { kind: string }[];
  priority: SuggestionPriority;
  confidence: ConfidenceLevel;
}): "open" | "needs_review" {
  const hasFact = input.evidence.some((e) => e.kind === "fact");
  if (!hasFact) return "needs_review";
  // Cảnh báo an toàn/pháp lý chưa có cơ sở đo được thì không để trôi vào danh sách chính.
  if (
    (input.priority === "critical_safety" || input.priority === "regulatory") &&
    input.confidence === "unknown"
  )
    return "needs_review";
  return "open";
}

// --- Schema đầu vào ---
export const evidenceInputSchema = z.object({
  kind: z.enum(["fact", "inference", "assumption", "recommendation"]),
  statement: z.string().trim().min(1).max(4000),
  locator: z.string().trim().max(500).nullable().optional(),
  standardRef: z.string().trim().max(255).nullable().optional(),
  externalObjectKey: z.string().trim().max(255).nullable().optional(),
});

export const suggestionInputSchema = z.object({
  suggestionClass: z.enum(SUGGESTION_CLASSES),
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().max(8000).nullable().optional(),
  priority: z.enum(PRIORITY_ORDER),
  severity: z.enum(SEVERITY_ORDER).default("medium"),
  impact: z.enum(["critical", "high", "medium", "low", "none"]).nullable().optional(),
  urgency: z.enum(["immediate", "soon", "normal", "later"]).nullable().optional(),
  reversible: z.boolean().nullable().optional(),
  estimatedEffort: z.string().trim().max(255).nullable().optional(),
  externalObjectKey: z.string().trim().max(255).nullable().optional(),
  confidenceSignals: z
    .object({
      sourceQuality: z.number().min(0).max(1).optional(),
      extractionConfidence: z.number().min(0).max(1).optional(),
      ruleValidated: z.boolean().optional(),
      crossSourceAgreement: z.number().min(0).max(1).optional(),
      freshness: z.number().min(0).max(1).optional(),
      completeness: z.number().min(0).max(1).optional(),
    })
    .default({}),
  // Evidence-first: mảng rỗng bị chặn ngay ở schema (khác với "có evidence nhưng thiếu
  // fact" — trường hợp đó vào needs_review, xem initialStatus).
  evidence: z.array(evidenceInputSchema).min(1),
});

export const intelligencePackageInputSchema = z.object({
  objective: z.string().trim().min(1).max(2000),
  sourceRevisionId: z.string().uuid().nullable().optional(),
  provenance: z.record(z.string(), z.unknown()).default({}),
  traceId: z.string().trim().max(255).nullable().optional(),
  suggestions: z.array(suggestionInputSchema).min(1).max(200),
});

export type IntelligencePackageInput = z.infer<typeof intelligencePackageInputSchema>;
export type SuggestionInput = z.infer<typeof suggestionInputSchema>;

export type SuggestionRow = {
  id: string;
  packageId: string | null;
  projectId: number;
  objectId: string | null;
  suggestionClass: SuggestionClass;
  title: string;
  body: string | null;
  priority: SuggestionPriority;
  severity: string;
  confidence: ConfidenceLevel;
  confidenceSignals: ConfidenceSignals;
  impact: string | null;
  urgency: string | null;
  reversible: boolean | null;
  status: string;
  decidedBy: number | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
};

export type EvidenceRow = {
  id: string;
  kind: "fact" | "inference" | "assumption" | "recommendation";
  statement: string;
  locator: string | null;
  standardRef: string | null;
  objectId: string | null;
  sortOrder: number;
};

// Tra object nội bộ theo external_key của MEPF-Agents (ENG-1). Trả undefined khi không có —
// caller quyết định coi là lỗi 422 hay bỏ qua.
async function resolveObjectId(
  projectId: number,
  externalKey?: string | null,
): Promise<string | null> {
  if (!externalKey) return null;
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM engineering_objects WHERE project_id = ? AND external_key = ?`,
    projectId,
    externalKey,
  );
  return row?.id ?? null;
}

export class UnknownObjectKeyError extends Error {}

// Ingest 1 gói intelligence. Toàn bộ trong 1 transaction. Confidence + status LUÔN tính lại
// ở server (giá trị bên gọi khai bị bỏ qua hoàn toàn).
export async function ingestIntelligencePackage(
  projectId: number,
  apiKeyId: number | null,
  payload: IntelligencePackageInput,
): Promise<{
  packageId: string;
  suggestions: { id: string; status: string; confidence: ConfidenceLevel }[];
}> {
  return withTransaction(async () => {
    const pkg = await queryOne<{ id: string }>(
      `INSERT INTO engineering_intelligence_packages
         (project_id, objective, source_revision_id, provenance, trace_id, api_key_id)
       VALUES (?, ?, ?, ?::jsonb, ?, ?)
       RETURNING id`,
      projectId,
      payload.objective,
      payload.sourceRevisionId ?? null,
      JSON.stringify(payload.provenance),
      payload.traceId ?? null,
      apiKeyId,
    );
    if (!pkg) throw new Error("Tạo intelligence package thất bại");

    const out: { id: string; status: string; confidence: ConfidenceLevel }[] = [];
    for (const s of payload.suggestions) {
      const confidence = computeConfidence(s.confidenceSignals);
      const status = initialStatus({ evidence: s.evidence, priority: s.priority, confidence });

      let objectId: string | null = null;
      if (s.externalObjectKey) {
        objectId = await resolveObjectId(projectId, s.externalObjectKey);
        if (!objectId)
          throw new UnknownObjectKeyError(
            `externalObjectKey "${s.externalObjectKey}" không tồn tại trong dự án`,
          );
      }

      const row = await queryOne<{ id: string }>(
        `INSERT INTO engineering_suggestions
           (package_id, project_id, object_id, suggestion_class, title, body, priority, severity,
            confidence, confidence_signals, impact, urgency, reversible, estimated_effort, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)
         RETURNING id`,
        pkg.id,
        projectId,
        objectId,
        s.suggestionClass,
        s.title,
        s.body ?? null,
        s.priority,
        s.severity,
        confidence,
        JSON.stringify(s.confidenceSignals),
        s.impact ?? null,
        s.urgency ?? null,
        s.reversible ?? null,
        s.estimatedEffort ?? null,
        status,
      );
      if (!row) throw new Error("Tạo suggestion thất bại");

      for (let i = 0; i < s.evidence.length; i++) {
        const e = s.evidence[i];
        const evObjectId = e.externalObjectKey
          ? await resolveObjectId(projectId, e.externalObjectKey)
          : objectId;
        await run(
          `INSERT INTO engineering_evidence
             (suggestion_id, kind, statement, source_revision_id, object_id, locator, standard_ref, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id,
          e.kind,
          e.statement,
          payload.sourceRevisionId ?? null,
          evObjectId,
          e.locator ?? null,
          e.standardRef ?? null,
          i,
        );
      }

      out.push({ id: row.id, status, confidence });
    }

    return { packageId: pkg.id, suggestions: out };
  });
}

// Danh sách suggestion, sắp theo ranking §3 NGAY TRONG SQL (array_position) — không sort ở
// JS vì danh sách có thể dài và phải phân trang đúng.
export async function listSuggestions(
  projectId: number,
  filter?: {
    status?: string;
    suggestionClass?: string;
    priority?: string;
    objectId?: string;
    limit?: number;
  },
): Promise<SuggestionRow[]> {
  const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);
  // Điều kiện dựng động (KHÔNG dùng "? IS NULL OR col = ?" — Postgres không suy được kiểu
  // tham số đứng riêng, lỗi thật đã gặp ở M64 PR325 và ENG-1).
  const conds = ["project_id = ?"];
  const args: unknown[] = [projectId];
  if (filter?.status) {
    conds.push("status = ?");
    args.push(filter.status);
  }
  if (filter?.suggestionClass) {
    conds.push("suggestion_class = ?");
    args.push(filter.suggestionClass);
  }
  if (filter?.priority) {
    conds.push("priority = ?");
    args.push(filter.priority);
  }
  if (filter?.objectId) {
    conds.push("object_id = ?");
    args.push(filter.objectId);
  }

  // Bọc withProjectScope: đọc NGOÀI transaction không có GUC app.project_id nên RLS không
  // có gì để so (xem lib/db/index.ts + migrations/0069). Cùng pattern các hàm đọc của
  // lib/engineering-kernel.ts.
  return withProjectScope(projectId, () =>
    query<SuggestionRow>(
      `SELECT id, package_id AS "packageId", project_id AS "projectId", object_id AS "objectId",
            suggestion_class AS "suggestionClass", title, body, priority, severity, confidence,
            confidence_signals AS "confidenceSignals", impact, urgency, reversible,
            status, decided_by AS "decidedBy", decided_at AS "decidedAt",
            decision_note AS "decisionNote", created_at AS "createdAt"
       FROM engineering_suggestions
      WHERE ${conds.join(" AND ")}
      ORDER BY array_position(ARRAY['critical_safety','regulatory','high_impact','design_coordination','quality','optimization','cosmetic']::text[], priority),
               array_position(ARRAY['critical','high','medium','low','info']::text[], severity),
               array_position(ARRAY['high','medium','low','unknown']::text[], confidence),
               created_at DESC
      LIMIT ?`,
      ...args,
      limit,
    ),
  );
}

export async function getSuggestion(
  projectId: number,
  id: string,
): Promise<{ suggestion: SuggestionRow; evidence: EvidenceRow[] } | null> {
  // Cả 2 truy vấn nằm trong CÙNG một withProjectScope: `engineering_evidence` không có cột
  // project_id, chỉ ràng buộc qua suggestion cha — nên GUC phải còn hiệu lực khi đọc nó.
  return withProjectScope(projectId, async () => {
    const suggestion = await queryOne<SuggestionRow>(
      `SELECT id, package_id AS "packageId", project_id AS "projectId", object_id AS "objectId",
            suggestion_class AS "suggestionClass", title, body, priority, severity, confidence,
            confidence_signals AS "confidenceSignals", impact, urgency, reversible,
            status, decided_by AS "decidedBy", decided_at AS "decidedAt",
            decision_note AS "decisionNote", created_at AS "createdAt"
       FROM engineering_suggestions WHERE id = ? AND project_id = ?`,
      id,
      projectId,
    );
    if (!suggestion) return null;
    const evidence = await query<EvidenceRow>(
      `SELECT id, kind, statement, locator, standard_ref AS "standardRef",
            object_id AS "objectId", sort_order AS "sortOrder"
       FROM engineering_evidence WHERE suggestion_id = ? ORDER BY sort_order, created_at`,
      id,
    );
    return { suggestion, evidence };
  });
}

export const SUGGESTION_DECISIONS = [
  "accepted",
  "rejected",
  "modified",
  "deferred",
  "false_positive",
] as const;
export type SuggestionDecision = (typeof SUGGESTION_DECISIONS)[number];

// §6 human interaction. KHÔNG có side effect ngoài chính bảng suggestion — "accepted" ở
// ENG-2 nghĩa là "người dùng đồng ý với nội dung đề xuất", KHÔNG phải "đã cho phép thực
// thi". Việc biến thành hành động thật là ENG-3 (cột workflow_id để sẵn cho phase đó).
export async function decideSuggestion(
  projectId: number,
  id: string,
  userId: number,
  decision: SuggestionDecision,
  note?: string,
): Promise<void> {
  const current = await queryOne<{ status: string }>(
    `SELECT status FROM engineering_suggestions WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
  if (!current) throw new Error("Đề xuất không tồn tại hoặc không thuộc dự án đang chọn");
  await run(
    `UPDATE engineering_suggestions
        SET status = ?, decided_by = ?, decided_at = NOW(), decision_note = ?, updated_at = NOW()
      WHERE id = ?`,
    decision,
    userId,
    note?.trim() || null,
    id,
  );
}
