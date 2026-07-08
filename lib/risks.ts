// M13 — Sổ rủi ro (risk register) ma trận 5×5: danh mục nhóm/trạng thái, validate
// thuần, query danh sách kèm score = probability × impact (tính lúc query, không lưu).
// Xem docs/nang-cap/M13-hop-rui-ro.md.
import { query } from "@/lib/db";
import { nextSeqCode } from "@/lib/seqcode";

export const RISK_CATEGORIES = [
  "schedule",
  "cost",
  "quality",
  "safety",
  "material",
  "other",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];
export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  schedule: "Tiến độ",
  cost: "Chi phí",
  quality: "Chất lượng",
  safety: "An toàn",
  material: "Vật tư",
  other: "Khác",
};

export const RISK_STATUSES = ["open", "mitigating", "closed"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];
export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  open: "Đang mở",
  mitigating: "Đang giảm thiểu",
  closed: "Đã đóng",
};

export type RiskInput = {
  title: string;
  description: string | null;
  category: RiskCategory;
  probability: number;
  impact: number;
  mitigation: string | null;
  owner: number | null;
};

export function parseRiskBody(body: Record<string, unknown>): RiskInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    title: typeof body.title === "string" ? body.title.trim() : "",
    description: strOrNull(body.description),
    category: (typeof body.category === "string" ? body.category : "") as RiskCategory,
    probability: body.probability != null ? Number(body.probability) : NaN,
    impact: body.impact != null ? Number(body.impact) : NaN,
    mitigation: strOrNull(body.mitigation),
    owner: body.owner != null ? Number(body.owner) : null,
  };
}

export function validateRiskInput(input: RiskInput): string | null {
  if (!input.title) return "Thiếu tên rủi ro";
  if (!RISK_CATEGORIES.includes(input.category)) return "Nhóm rủi ro không hợp lệ";
  for (const [label, v] of [
    ["Xác suất", input.probability],
    ["Mức ảnh hưởng", input.impact],
  ] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 5) return `${label} phải là số nguyên 1–5`;
  }
  return null;
}

export type RiskRow = RiskInput & {
  id: number;
  code: string;
  ownerName: string | null;
  status: RiskStatus;
  score: number;
  createdBy: number | null;
  createdAt: string;
  closedAt: string | null;
};

// projectId (M22): undefined = không lọc dự án (dùng nội bộ/test cũ).
export async function listRisks(filter?: {
  status?: RiskStatus;
  projectId?: number;
}): Promise<RiskRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (filter?.status) {
    conds.push("r.status = ?");
    args.push(filter.status);
  }
  if (filter?.projectId != null) {
    conds.push("r.project_id = ?");
    args.push(filter.projectId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<RiskRow>(
    `SELECT r.id, r.code, r.title, r.description, r.category,
            r.probability, r.impact, (r.probability * r.impact) AS score,
            r.mitigation, r.owner, u.name AS "ownerName", r.status,
            r.created_by AS "createdBy", r.created_at AS "createdAt", r.closed_at AS "closedAt"
       FROM risks r
       LEFT JOIN users u ON u.id = r.owner
      ${where}
      ORDER BY (r.status = 'closed'), (r.probability * r.impact) DESC, r.id`,
    ...args,
  );
}

export async function getRisk(id: number, projectId?: number): Promise<RiskRow | undefined> {
  const conds = ["r.id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("r.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<RiskRow>(
    `SELECT r.id, r.code, r.title, r.description, r.category,
            r.probability, r.impact, (r.probability * r.impact) AS score,
            r.mitigation, r.owner, u.name AS "ownerName", r.status,
            r.created_by AS "createdBy", r.created_at AS "createdAt", r.closed_at AS "closedAt"
       FROM risks r
       LEFT JOIN users u ON u.id = r.owner
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return rows[0];
}

export async function nextRiskCode(): Promise<string> {
  return nextSeqCode("risks", "code", "R-", 4);
}
