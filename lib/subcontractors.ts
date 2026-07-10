// M33 — Hồ sơ năng lực & Đánh giá Nhà thầu phụ (NTP): mở rộng suppliers bằng bảng con
// 1-1 (subcontractor_profiles), hồ sơ năng lực đính kèm (subcon_documents, pattern
// task_documents) và đánh giá hiệu quả ĐỊNH KỲ (subcon_evaluations — khác
// supplier_ratings theo PO của M04). Công nợ là VIEW tính lúc gọi, không lưu — tái
// dùng lib/contracts.ts (không viết lại công thức giá trị HĐ/đã thanh toán).
// Xem docs/nang-cap/M33-nha-thau-phu.md.
import { query, queryOne, run } from "@/lib/db";
import { listContracts } from "@/lib/contracts";

const PERIOD_RE = /^\d{4}-(Q[1-4]|\d{2})$/;

// ===== Danh sách NTP (suppliers có ít nhất 1 dòng discipline_contractors, M15) =====

export type SubcontractorDiscipline = {
  disciplineId: number;
  disciplineCode: string;
  disciplineName: string;
  zone: string | null;
  floorLabels: string[] | null;
  isPrimary: boolean;
};

export type SubcontractorListRow = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  disciplines: SubcontractorDiscipline[];
  orgChartNote: string | null;
  siteRepName: string | null;
  siteRepPhone: string | null;
  capabilitySummary: string | null;
};

// projectId (M22 pattern): undefined = không lọc; có giá trị → chỉ ẩn NTP đã gắn hồ sơ
// (subcontractor_profiles.project_id) cho MỘT dự án khác — hồ sơ chưa gán dự án nào
// vẫn hiện ở mọi dự án (discipline_contractors/suppliers chưa có cột project_id).
export async function listSubcontractors(projectId?: number): Promise<SubcontractorListRow[]> {
  const conds = ["dc.supplier_id IS NOT NULL"];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("(p.project_id IS NULL OR p.project_id = ?)");
    args.push(projectId);
  }
  return query<SubcontractorListRow>(
    `SELECT s.id, s.name, s.phone, s.email,
            COALESCE(disc.disciplines, '[]') AS disciplines,
            p.org_chart_note AS "orgChartNote", p.site_rep_name AS "siteRepName",
            p.site_rep_phone AS "siteRepPhone", p.capability_summary AS "capabilitySummary"
       FROM suppliers s
       JOIN (SELECT DISTINCT supplier_id FROM discipline_contractors) dc ON dc.supplier_id = s.id
       LEFT JOIN subcontractor_profiles p ON p.supplier_id = s.id
       LEFT JOIN (
         SELECT x.supplier_id,
                json_agg(json_build_object(
                  'disciplineId', x.discipline_id, 'disciplineCode', d.code, 'disciplineName', d.name,
                  'zone', x.zone, 'floorLabels', x.floor_labels, 'isPrimary', x.is_primary
                ) ORDER BY d.code) AS disciplines
           FROM discipline_contractors x
           JOIN disciplines d ON d.id = x.discipline_id
          GROUP BY x.supplier_id
       ) disc ON disc.supplier_id = s.id
      WHERE ${conds.join(" AND ")}
      ORDER BY s.name`,
    ...args,
  );
}

// ===== Hồ sơ năng lực (subcontractor_profiles) =====

export type SubcontractorProfileInput = {
  projectId: number | null;
  orgChartNote: string | null;
  siteRepName: string | null;
  siteRepPhone: string | null;
  capabilitySummary: string | null;
};

// Upsert hồ sơ mở rộng — supplier_id là PK nên ON CONFLICT DO UPDATE (idempotent).
export async function upsertSubcontractorProfile(
  supplierId: number,
  input: SubcontractorProfileInput,
): Promise<void> {
  await run(
    `INSERT INTO subcontractor_profiles
       (supplier_id, project_id, org_chart_note, site_rep_name, site_rep_phone, capability_summary)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (supplier_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       org_chart_note = EXCLUDED.org_chart_note,
       site_rep_name = EXCLUDED.site_rep_name,
       site_rep_phone = EXCLUDED.site_rep_phone,
       capability_summary = EXCLUDED.capability_summary`,
    supplierId,
    input.projectId,
    input.orgChartNote,
    input.siteRepName,
    input.siteRepPhone,
    input.capabilitySummary,
  );
}

// ===== Đánh giá hiệu quả định kỳ (subcon_evaluations) =====

export type EvaluationInput = {
  period: string;
  safetyScore: number | null;
  qualityScore: number | null;
  scheduleScore: number | null;
  manpowerScore: number | null;
  note: string | null;
};

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ.
export function validateEvaluationInput(input: EvaluationInput): string | null {
  if (!input.period || !PERIOD_RE.test(input.period))
    return "Kỳ đánh giá không hợp lệ — dùng định dạng YYYY-QN (vd 2026-Q3) hoặc YYYY-MM";
  const scores = [
    ["An toàn", input.safetyScore],
    ["Chất lượng", input.qualityScore],
    ["Tiến độ", input.scheduleScore],
    ["Nhân sự", input.manpowerScore],
  ] as const;
  let hasAny = false;
  for (const [label, v] of scores) {
    if (v == null) continue;
    hasAny = true;
    if (!Number.isInteger(v) || v < 1 || v > 5) return `Điểm "${label}" phải là số nguyên 1-5`;
  }
  if (!hasAny) return "Cần chấm ít nhất 1 tiêu chí (1-5 điểm)";
  return null;
}

export type EvaluationRow = {
  id: number;
  supplierId: number;
  period: string;
  safetyScore: number | null;
  qualityScore: number | null;
  scheduleScore: number | null;
  manpowerScore: number | null;
  note: string | null;
  evaluatedBy: number | null;
  evaluatedByName: string | null;
  createdAt: string;
};

export async function listEvaluations(supplierId: number): Promise<EvaluationRow[]> {
  return query<EvaluationRow>(
    `SELECT e.id, e.supplier_id AS "supplierId", e.period,
            e.safety_score AS "safetyScore", e.quality_score AS "qualityScore",
            e.schedule_score AS "scheduleScore", e.manpower_score AS "manpowerScore",
            e.note, e.evaluated_by AS "evaluatedBy", u.name AS "evaluatedByName",
            e.created_at AS "createdAt"
       FROM subcon_evaluations e
       LEFT JOIN users u ON u.id = e.evaluated_by
      WHERE e.supplier_id = ?
      ORDER BY e.period`,
    supplierId,
  );
}

export type EvaluationAverage = {
  latestPeriod: string | null;
  avgScore: number | null; // TB 4 tiêu chí của kỳ gần nhất
  trend: number | null; // avgScore kỳ gần nhất − kỳ trước đó (null nếu chưa đủ 2 kỳ)
};

// Điểm TB kỳ gần nhất (theo thứ tự period tăng dần — 'YYYY-QN'/'YYYY-MM' so chuỗi đúng
// thứ tự thời gian) + xu hướng so kỳ trước (tuỳ chọn hiển thị UI, không bắt buộc).
export async function avgEvaluationScore(supplierId: number): Promise<EvaluationAverage> {
  const rows = await listEvaluations(supplierId);
  if (rows.length === 0) return { latestPeriod: null, avgScore: null, trend: null };

  const rowAvg = (r: EvaluationRow): number | null => {
    const vals = [r.safetyScore, r.qualityScore, r.scheduleScore, r.manpowerScore].filter(
      (v): v is number => v != null,
    );
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  const latest = rows[rows.length - 1];
  const avgScore = rowAvg(latest);
  const prev = rows.length >= 2 ? rows[rows.length - 2] : null;
  const prevAvg = prev ? rowAvg(prev) : null;
  const trend = avgScore != null && prevAvg != null ? avgScore - prevAvg : null;

  return { latestPeriod: latest.period, avgScore, trend };
}

// ===== Công nợ (view — không lưu, tái dùng lib/contracts.ts) =====

export type SubcontractorDebt = {
  contractValue: number;
  paid: number;
  outstanding: number;
  contracts: {
    id: number;
    code: string;
    title: string;
    value: number;
    addendaTotal: number;
    paid: number;
    status: string;
  }[];
};

// Công nợ = Σ (value + addendaTotal) các HĐ gắn party_supplier_id=supplierId, trừ Σ paid
// (đã tổng hợp sẵn trong listContracts qua payment_bills) — KHÔNG viết lại công thức.
export async function subcontractorDebt(supplierId: number): Promise<SubcontractorDebt> {
  const all = await listContracts();
  const mine = all.filter((c) => c.partySupplierId === supplierId);
  const contractValue = mine.reduce((s, c) => s + Number(c.value) + Number(c.addendaTotal), 0);
  const paid = mine.reduce((s, c) => s + Number(c.paid), 0);
  return {
    contractValue,
    paid,
    outstanding: contractValue - paid,
    contracts: mine.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      value: c.value,
      addendaTotal: c.addendaTotal,
      paid: c.paid,
      status: c.status,
    })),
  };
}

// ===== Hồ sơ năng lực đính kèm (subcon_documents, pattern task_documents) =====

export type SubconDocumentRow = {
  id: number;
  supplierId: number;
  title: string;
  docKind: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
};

export async function listSubconDocuments(supplierId: number): Promise<SubconDocumentRow[]> {
  return query<SubconDocumentRow>(
    `SELECT d.id, d.supplier_id AS "supplierId", d.title, d.doc_kind AS "docKind",
            d.original_name AS "originalName", d.mime_type AS "mimeType",
            d.size_bytes AS "sizeBytes", d.uploaded_by AS "uploadedBy", u.name AS "uploaderName",
            d.created_at AS "createdAt"
       FROM subcon_documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.supplier_id = ?
      ORDER BY d.id DESC`,
    supplierId,
  );
}

// ===== Chi tiết đầy đủ 1 NTP (getSubcontractor) =====

export type SubcontractorDetail = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  disciplines: SubcontractorDiscipline[];
  profile: SubcontractorProfileInput | null;
  documents: SubconDocumentRow[];
  evaluations: EvaluationRow[];
  evaluationAverage: EvaluationAverage;
  debt: SubcontractorDebt;
};

export async function getSubcontractor(supplierId: number): Promise<SubcontractorDetail | null> {
  const supplier = await queryOne<{
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    note: string | null;
  }>(`SELECT id, name, phone, email, address, note FROM suppliers WHERE id = ?`, supplierId);
  if (!supplier) return null;

  const disciplineRows = await query<SubcontractorDiscipline>(
    `SELECT dc.discipline_id AS "disciplineId", d.code AS "disciplineCode", d.name AS "disciplineName",
            dc.zone, dc.floor_labels AS "floorLabels", dc.is_primary AS "isPrimary"
       FROM discipline_contractors dc
       JOIN disciplines d ON d.id = dc.discipline_id
      WHERE dc.supplier_id = ?
      ORDER BY d.code`,
    supplierId,
  );

  const profileRow = await queryOne<{
    projectId: number | null;
    orgChartNote: string | null;
    siteRepName: string | null;
    siteRepPhone: string | null;
    capabilitySummary: string | null;
  }>(
    `SELECT project_id AS "projectId", org_chart_note AS "orgChartNote",
            site_rep_name AS "siteRepName", site_rep_phone AS "siteRepPhone",
            capability_summary AS "capabilitySummary"
       FROM subcontractor_profiles WHERE supplier_id = ?`,
    supplierId,
  );

  const [documents, evaluations, evaluationAverage, debt] = await Promise.all([
    listSubconDocuments(supplierId),
    listEvaluations(supplierId),
    avgEvaluationScore(supplierId),
    subcontractorDebt(supplierId),
  ]);

  return {
    ...supplier,
    disciplines: disciplineRows,
    profile: profileRow
      ? {
          projectId: profileRow.projectId,
          orgChartNote: profileRow.orgChartNote,
          siteRepName: profileRow.siteRepName,
          siteRepPhone: profileRow.siteRepPhone,
          capabilitySummary: profileRow.capabilitySummary,
        }
      : null,
    documents,
    evaluations,
    evaluationAverage,
    debt,
  };
}
