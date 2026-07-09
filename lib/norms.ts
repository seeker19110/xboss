// M18 — Định mức thi công theo hạng mục BOQ (vật tư/nhân công/máy): đối chiếu tiêu hao
// thực tế (material_transactions theo tầng — M4; diary_manpower theo tổ đội — M5) với
// định mức × KL thực hiện (boqExecutedQty — M1). Xem docs/nang-cap/M18-dinh-muc.md.
import { query, queryOne } from "@/lib/db";
import { boqExecutedQty } from "@/lib/boq";

export const NORM_RESOURCE_TYPES = ["material", "labor", "equipment"] as const;
export type NormResourceType = (typeof NORM_RESOURCE_TYPES)[number];
export const NORM_RESOURCE_TYPE_LABEL: Record<NormResourceType, string> = {
  material: "Vật tư",
  labor: "Nhân công",
  equipment: "Máy",
};

export const NORM_OVER_THRESHOLD_PCT = 20;

export type NormInput = {
  resourceType: NormResourceType;
  materialId: number | null;
  resourceName: string | null;
  qtyPerUnit: number;
  unitLabel: string;
  note: string | null;
};

export function parseNormBody(body: Record<string, unknown>): NormInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    resourceType: (typeof body.resourceType === "string"
      ? body.resourceType
      : "") as NormResourceType,
    materialId: body.materialId != null ? Number(body.materialId) : null,
    resourceName: strOrNull(body.resourceName),
    qtyPerUnit: body.qtyPerUnit != null ? Number(body.qtyPerUnit) : NaN,
    unitLabel: typeof body.unitLabel === "string" ? body.unitLabel.trim() : "",
    note: strOrNull(body.note),
  };
}

export function validateNormInput(input: NormInput): string | null {
  if (!NORM_RESOURCE_TYPES.includes(input.resourceType)) return "Loại nguồn lực không hợp lệ";
  if (!Number.isFinite(input.qtyPerUnit) || input.qtyPerUnit <= 0)
    return "Định mức/đơn vị phải lớn hơn 0";
  if (!input.unitLabel) return "Thiếu đơn vị định mức";
  if (input.resourceType === "material" && input.materialId == null)
    return "Định mức vật tư cần chọn vật tư (materialId)";
  if (input.resourceType !== "material" && !input.resourceName)
    return "Định mức nhân công/máy cần tên nguồn lực (resourceName)";
  return null;
}

export async function checkNormMaterial(input: NormInput): Promise<string | null> {
  if (input.materialId == null) return null;
  const m = await queryOne(`SELECT id FROM materials WHERE id = ?`, input.materialId);
  if (!m) return "Vật tư không tồn tại";
  return null;
}

export type NormRow = {
  id: number;
  boqItemId: number;
  resourceType: NormResourceType;
  materialId: number | null;
  materialName: string | null;
  resourceName: string | null;
  qtyPerUnit: number;
  unitLabel: string;
  note: string | null;
  createdAt: string;
};

export async function listNormsForBoqItem(boqItemId: number): Promise<NormRow[]> {
  return query<NormRow>(
    `SELECT n.id, n.boq_item_id AS "boqItemId", n.resource_type AS "resourceType",
            n.material_id AS "materialId", m.name AS "materialName",
            n.resource_name AS "resourceName", n.qty_per_unit AS "qtyPerUnit",
            n.unit_label AS "unitLabel", n.note, n.created_at AS "createdAt"
       FROM boq_norms n LEFT JOIN materials m ON m.id = n.material_id
      WHERE n.boq_item_id = ? ORDER BY n.resource_type, n.id`,
    boqItemId,
  );
}

export async function getNorm(id: number): Promise<NormRow | null> {
  const row = await queryOne<NormRow>(
    `SELECT n.id, n.boq_item_id AS "boqItemId", n.resource_type AS "resourceType",
            n.material_id AS "materialId", m.name AS "materialName",
            n.resource_name AS "resourceName", n.qty_per_unit AS "qtyPerUnit",
            n.unit_label AS "unitLabel", n.note, n.created_at AS "createdAt"
       FROM boq_norms n LEFT JOIN materials m ON m.id = n.material_id
      WHERE n.id = ?`,
    id,
  );
  return row ?? null;
}

// Tầng thi công của dòng BOQ (suy từ boq_task_map → tasks → work_packages.floor_label) —
// dùng lọc material_transactions.floor_label khi đối chiếu (nợ kỹ thuật M4 giải quyết ở đây).
async function boqItemFloors(boqItemId: number): Promise<string[]> {
  const rows = await query<{ floorLabel: string | null }>(
    `SELECT DISTINCT wp.floor_label AS "floorLabel"
       FROM boq_task_map m
       JOIN tasks t ON t.id = m.task_id
       JOIN work_packages wp ON wp.id = t.package_id
      WHERE m.boq_item_id = ? AND wp.floor_label IS NOT NULL`,
    boqItemId,
  );
  return rows.map((r) => r.floorLabel!).filter(Boolean);
}

export type NormUsage = {
  normId: number;
  resourceType: NormResourceType;
  resourceLabel: string;
  unitLabel: string;
  expected: number;
  actual: number | null;
  variancePct: number | null;
};

// Đối chiếu 1 định mức: expected = qty_per_unit × KL thực hiện; actual tuỳ loại nguồn lực.
async function normUsageOne(norm: NormRow, executedQty: number): Promise<NormUsage> {
  const expected = norm.qtyPerUnit * executedQty;
  const resourceLabel =
    norm.resourceType === "material" ? (norm.materialName ?? "?") : (norm.resourceName ?? "?");

  let actual: number | null = null;
  if (norm.resourceType === "material" && norm.materialId != null) {
    const floors = await boqItemFloors(norm.boqItemId);
    const floorFilter = floors.length > 0 ? ` AND floor_label = ANY(?)` : "";
    const row = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type IN ('xuat_cong_truong', 'hoan_kho') THEN -delta ELSE GREATEST(delta, 0) END), 0) AS total
         FROM material_transactions WHERE material_id = ?${floorFilter}`,
      ...(floors.length > 0 ? [norm.materialId, floors] : [norm.materialId]),
    );
    actual = row?.total ?? 0;
  } else if (norm.resourceType === "labor" && norm.resourceName) {
    // Đối chiếu lỏng: tổng nhân lực ghi nhận theo tổ đội cùng tên — không tách theo hạng mục.
    const row = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(headcount), 0) AS total FROM diary_manpower WHERE crew = ?`,
      norm.resourceName,
    );
    actual = row?.total ?? 0;
  }
  // equipment: chưa có danh mục ca máy đối chiếu được (M12 chưa nối FK) — actual để null.

  const variancePct =
    actual != null && expected > 0 ? ((actual - expected) / expected) * 100 : null;

  return {
    normId: norm.id,
    resourceType: norm.resourceType,
    resourceLabel,
    unitLabel: norm.unitLabel,
    expected,
    actual,
    variancePct,
  };
}

export async function normUsage(boqItemId: number): Promise<NormUsage[]> {
  const norms = await listNormsForBoqItem(boqItemId);
  if (norms.length === 0) return [];
  const executedQty = await boqExecutedQty(boqItemId);
  return Promise.all(norms.map((n) => normUsageOne(n, executedQty)));
}

export type OverNormItem = {
  normId: number;
  boqItemId: number;
  boqCode: string;
  resourceLabel: string;
  unitLabel: string;
  expected: number;
  actual: number;
  variancePct: number;
};

// Định mức vật tư (đối chiếu tin cậy) vượt ngưỡng — nguồn notification norm_over.
// Nhân công chỉ tham khảo, không cảnh báo cứng (đối chiếu lỏng theo spec).
// projectId: lọc theo dự án đang chọn (đa dự án, M22+) — không truyền = không lọc.
export async function overNormItems(
  thresholdPct = NORM_OVER_THRESHOLD_PCT,
  projectId?: number,
): Promise<OverNormItem[]> {
  const projectFilter = projectId != null ? " AND bi.project_id = ?" : "";
  const materialNorms = await query<{
    id: number;
    boqItemId: number;
    boqCode: string;
    qtyPerUnit: number;
    unitLabel: string;
    materialId: number;
    materialName: string;
  }>(
    `SELECT n.id, n.boq_item_id AS "boqItemId", bi.code AS "boqCode",
            n.qty_per_unit AS "qtyPerUnit", n.unit_label AS "unitLabel",
            n.material_id AS "materialId", m.name AS "materialName"
       FROM boq_norms n
       JOIN boq_items bi ON bi.id = n.boq_item_id
       JOIN materials m ON m.id = n.material_id
      WHERE n.resource_type = 'material'${projectFilter}`,
    ...(projectId != null ? [projectId] : []),
  );

  const result: OverNormItem[] = [];
  for (const n of materialNorms) {
    const executedQty = await boqExecutedQty(n.boqItemId);
    const expected = n.qtyPerUnit * executedQty;
    if (expected <= 0) continue;
    const floors = await boqItemFloors(n.boqItemId);
    const floorFilter = floors.length > 0 ? ` AND floor_label = ANY(?)` : "";
    const row = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type IN ('xuat_cong_truong', 'hoan_kho') THEN -delta ELSE GREATEST(delta, 0) END), 0) AS total
         FROM material_transactions WHERE material_id = ?${floorFilter}`,
      ...(floors.length > 0 ? [n.materialId, floors] : [n.materialId]),
    );
    const actual = row?.total ?? 0;
    const variancePct = ((actual - expected) / expected) * 100;
    if (variancePct > thresholdPct)
      result.push({
        normId: n.id,
        boqItemId: n.boqItemId,
        boqCode: n.boqCode,
        resourceLabel: n.materialName,
        unitLabel: n.unitLabel,
        expected,
        actual,
        variancePct,
      });
  }
  return result;
}
