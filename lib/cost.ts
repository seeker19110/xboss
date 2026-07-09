// Kiểm soát chi phí (M2): ngân sách (BOQ) vs cam kết (PO + giao thầu) vs thực chi
// (payment_bills) theo hệ hoặc theo tầng. Logic tách khỏi route để test tích hợp trực
// tiếp qua DB (cùng pattern lib/report.ts, lib/disciplines.ts). Xem docs/nang-cap/M02-chi-phi.md.
import { query, queryOne, run } from "@/lib/db";

export type CostRow = {
  key: string;
  label: string;
  budget: number;
  committed: number;
  actual: number;
};

export type CostSettings = { warnPct: number; overPct: number };

// Ngân sách theo hệ = Σ qty_contract × unit_price của boq_items gốc thuộc hệ đó (M1),
// cộng thêm dòng KL phát sinh (VO — M6) đã duyệt (qty_approved × unit_price) khi
// includeVo=true (mặc định — UI có toggle "Gồm VO").
// projectId (M22+): undefined = không lọc dự án; boq_items có cột project_id trực tiếp
// (migration 0027).
async function budgetBySystem(
  includeVo = true,
  projectId?: number,
): Promise<Map<number, number>> {
  const conds = [
    "bi.discipline_id IS NOT NULL",
    "(bi.vo_id IS NULL OR (? AND vo.status IN ('approved','partially_approved','contract_added')))",
  ];
  const args: unknown[] = [includeVo];
  if (projectId != null) {
    conds.push("bi.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ disciplineId: number | null; budget: number }>(
    `SELECT bi.discipline_id AS "disciplineId",
            COALESCE(SUM(
              CASE WHEN bi.vo_id IS NULL THEN bi.qty_contract * bi.unit_price
                   ELSE COALESCE(bi.qty_approved, 0) * bi.unit_price END
            ), 0) AS budget
       FROM boq_items bi
       LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
      WHERE ${conds.join(" AND ")}
      GROUP BY bi.discipline_id`,
    ...args,
  );
  return new Map(rows.map((r) => [r.disciplineId as number, r.budget]));
}

// Cam kết theo hệ = giá trị PO (loại đơn đã huỷ) quy về hệ qua materials.sheet_type_id
// → sheet_types.discipline_id, cộng giá trị hợp đồng giao thầu theo tầng (floor_contracts)
// quy về hệ qua sheet_types.discipline_id.
// projectId (M22+): undefined = không lọc. purchase_orders có cột project_id trực tiếp;
// floor_contracts không có nên lọc qua sheet_types → towers.project_id.
async function committedBySystem(projectId?: number): Promise<Map<number, number>> {
  const poConds = ["po.status <> 'cancelled'", "st.discipline_id IS NOT NULL"];
  const poArgs: unknown[] = [];
  if (projectId != null) {
    poConds.push("po.project_id = ?");
    poArgs.push(projectId);
  }
  const poRows = await query<{ disciplineId: number | null; committed: number }>(
    `SELECT st.discipline_id AS "disciplineId",
            COALESCE(SUM(poi.qty_ordered * COALESCE(poi.unit_price, 0)), 0) AS committed
       FROM po_items poi
       JOIN purchase_orders po ON po.id = poi.po_id
       LEFT JOIN materials m ON m.id = poi.material_id
       LEFT JOIN sheet_types st ON st.id = m.sheet_type_id
      WHERE ${poConds.join(" AND ")}
      GROUP BY st.discipline_id`,
    ...poArgs,
  );
  const fcConds = ["st.discipline_id IS NOT NULL"];
  const fcArgs: unknown[] = [];
  const fcJoin =
    projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  if (projectId != null) {
    fcConds.push("tw.project_id = ?");
    fcArgs.push(projectId);
  }
  const fcRows = await query<{ disciplineId: number | null; committed: number }>(
    `SELECT st.discipline_id AS "disciplineId", COALESCE(SUM(fc.contract_value), 0) AS committed
       FROM floor_contracts fc
       JOIN sheet_types st ON st.id = fc.sheet_type_id${fcJoin}
      WHERE ${fcConds.join(" AND ")}
      GROUP BY st.discipline_id`,
    ...fcArgs,
  );
  const map = new Map<number, number>();
  for (const r of poRows)
    map.set(r.disciplineId as number, (map.get(r.disciplineId as number) ?? 0) + r.committed);
  for (const r of fcRows)
    map.set(r.disciplineId as number, (map.get(r.disciplineId as number) ?? 0) + r.committed);
  return map;
}

// Thực chi theo hệ = Σ amount của payment_bills (MỌI type, kể cả advance — tạm ứng đã
// ra khỏi công ty, đã quyết 2026-07-04) quy về hệ qua sheet_types.discipline_id.
// projectId (M22+): undefined = không lọc. payment_bills không có cột riêng nên lọc qua
// sheet_types → towers.project_id.
async function actualBySystem(projectId?: number): Promise<Map<number, number>> {
  const conds = ["st.discipline_id IS NOT NULL"];
  const args: unknown[] = [];
  const join = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  if (projectId != null) {
    conds.push("tw.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ disciplineId: number | null; actual: number }>(
    `SELECT st.discipline_id AS "disciplineId", COALESCE(SUM(pb.amount), 0) AS actual
       FROM payment_bills pb
       JOIN sheet_types st ON st.id = pb.sheet_type_id${join}
      WHERE ${conds.join(" AND ")}
      GROUP BY st.discipline_id`,
    ...args,
  );
  return new Map(rows.map((r) => [r.disciplineId as number, r.actual]));
}

// Ngân sách/cam kết/thực chi theo tầng — BOQ không có chiều tầng nên budget = committed
// (giá trị hợp đồng giao thầu theo tầng, floor_contracts) — nêu rõ trong UI tooltip.
// projectId (M22+): undefined = không lọc, lọc qua sheet_types → towers.project_id.
async function costByFloor(projectId?: number): Promise<CostRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  const join = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  if (projectId != null) {
    conds.push("tw.project_id = ?");
    args.push(projectId);
  }
  const where = conds.length > 0 ? ` WHERE ${conds.join(" AND ")}` : "";
  const rows = await query<{
    sheetTypeId: number;
    sheetType: string;
    floorLabel: string;
    contractValue: number;
    actual: number;
  }>(
    `SELECT st.id AS "sheetTypeId", st.code AS "sheetType", fc.floor_label AS "floorLabel",
            fc.contract_value AS "contractValue",
            COALESCE((SELECT SUM(pb.amount) FROM payment_bills pb
                       WHERE pb.sheet_type_id = st.id AND pb.floor_label = fc.floor_label), 0) AS actual
       FROM floor_contracts fc
       JOIN sheet_types st ON st.id = fc.sheet_type_id${join}${where}
      ORDER BY st.id, fc.floor_label`,
    ...args,
  );
  return rows.map((r) => ({
    key: `${r.sheetType}:${r.floorLabel}`,
    label: `${r.sheetType} · ${r.floorLabel}`,
    budget: r.contractValue,
    committed: r.contractValue,
    actual: r.actual,
  }));
}

export async function costSummary(
  groupBy: "system" | "floor",
  includeVo = true,
  projectId?: number,
): Promise<CostRow[]> {
  if (groupBy === "floor") return costByFloor(projectId);

  const disciplines = await query<{ id: number; code: string; name: string }>(
    `SELECT id, code, name FROM disciplines ORDER BY id`,
  );
  const [budget, committed, actual] = await Promise.all([
    budgetBySystem(includeVo, projectId),
    committedBySystem(projectId),
    actualBySystem(projectId),
  ]);
  return disciplines.map((d) => ({
    key: d.code,
    label: d.name,
    budget: budget.get(d.id) ?? 0,
    committed: committed.get(d.id) ?? 0,
    actual: actual.get(d.id) ?? 0,
  }));
}

export async function costTotals(
  includeVo = true,
  projectId?: number,
): Promise<{ budget: number; committed: number; actual: number }> {
  const rows = await costSummary("system", includeVo, projectId);
  return rows.reduce(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      committed: acc.committed + r.committed,
      actual: acc.actual + r.actual,
    }),
    { budget: 0, committed: 0, actual: 0 },
  );
}

// Ngân sách của 1 hệ (dùng cho khối `budget` trong getDisciplineSummary — lib/disciplines.ts).
// projectId (M22+): undefined = không lọc.
export async function disciplineBudget(
  disciplineId: number,
  includeVo = true,
  projectId?: number,
): Promise<number> {
  const conds = [
    "bi.discipline_id = ?",
    "(bi.vo_id IS NULL OR (? AND vo.status IN ('approved','partially_approved','contract_added')))",
  ];
  const args: unknown[] = [disciplineId, includeVo];
  if (projectId != null) {
    conds.push("bi.project_id = ?");
    args.push(projectId);
  }
  const row = await queryOne<{ budget: number }>(
    `SELECT COALESCE(SUM(
              CASE WHEN bi.vo_id IS NULL THEN bi.qty_contract * bi.unit_price
                   ELSE COALESCE(bi.qty_approved, 0) * bi.unit_price END
            ), 0) AS budget
       FROM boq_items bi
       LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return row?.budget ?? 0;
}

export async function getCostSettings(): Promise<CostSettings> {
  const row = await queryOne<{ warnPct: number; overPct: number }>(
    `SELECT warn_pct AS "warnPct", over_pct AS "overPct" FROM cost_settings WHERE id = 1`,
  );
  return row ?? { warnPct: 90, overPct: 100 };
}

export async function updateCostSettings(settings: CostSettings): Promise<void> {
  await run(
    `UPDATE cost_settings SET warn_pct = ?, over_pct = ? WHERE id = 1`,
    settings.warnPct,
    settings.overPct,
  );
}
