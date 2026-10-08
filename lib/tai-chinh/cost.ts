// Kiểm soát chi phí (M2): ngân sách (BOQ) vs cam kết (PO + giao thầu) vs thực chi
// (payment_bills) theo hệ hoặc theo tầng. Logic tách khỏi route để test tích hợp trực
// tiếp qua DB (cùng pattern lib/report.ts, lib/systems.ts). Xem docs/nang-cap/M02-chi-phi.md.
//
// QUALITY-FINAL-1 / S10 (A3): mọi số tiền là MoneyMinor (bigint đồng×100). SQL cộng/nhân rồi
// round tổng nhóm 2 số lẻ (ties xa 0) và cast `::text` ngay trong SELECT — không đi qua parser
// NUMERIC→float của lib/db. Số lượng PO là float8 nên đọc biểu diễn đã lưu `::text::numeric`
// trước khi nhân đơn giá (float8 × numeric trong PostgreSQL ra float8 — mất xu).
import { query, queryOne, run } from "@/lib/db";
import {
  moneyToNumberSafe,
  moneyToWire,
  parseFixedDecimalExact,
  parseMoneyExact,
  type MoneyWireFormat,
} from "@/lib/nen/money";

/** Ba khoản tiền của một nhóm chi phí, bigint đồng×100. */
export type CostAmounts = { budget: bigint; committed: bigint; actual: bigint };

export type CostRow = { key: string; label: string } & CostAmounts;

export type CostSettings = { warnPct: number; overPct: number };

// Biểu thức SQL dùng chung: tổng numeric → round 2 số lẻ → text canonical.
const moneyText = (expr: string) => `round(COALESCE(${expr}, 0), 2)::text`;

// Ngân sách theo hệ = Σ qty_contract × unit_price của boq_items gốc thuộc hệ đó (M1),
// cộng thêm dòng KL phát sinh (VO — M6) đã duyệt (qty_approved × unit_price) khi
// includeVo=true (mặc định — UI có toggle "Gồm VO").
// projectId (M22+): undefined = không lọc dự án; boq_items có cột project_id trực tiếp
// (migration 0027).
async function budgetBySystem(includeVo = true, projectId?: number): Promise<Map<number, bigint>> {
  const conds = [
    "bi.system_id IS NOT NULL",
    "(bi.vo_id IS NULL OR (? AND vo.status IN ('approved','partially_approved','contract_added')))",
  ];
  const args: unknown[] = [includeVo];
  if (projectId != null) {
    conds.push("bi.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ systemId: number; budget: string }>(
    `SELECT bi.system_id AS "systemId",
            ${moneyText(`SUM(
              CASE WHEN bi.vo_id IS NULL THEN bi.qty_contract * bi.unit_price
                   ELSE COALESCE(bi.qty_approved, 0) * bi.unit_price END
            )`)} AS budget
       FROM boq_items bi
       LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
      WHERE ${conds.join(" AND ")}
      GROUP BY bi.system_id`,
    ...args,
  );
  return new Map(rows.map((r) => [r.systemId, parseMoneyExact(r.budget)]));
}

// Cam kết theo hệ = giá trị PO (loại đơn đã huỷ) quy về hệ qua materials.sheet_type_id
// → sheet_types.system_id, cộng giá trị hợp đồng giao thầu theo tầng (floor_contracts)
// quy về hệ qua sheet_types.system_id. Gộp trong 1 câu SQL (UNION ALL rồi SUM numeric).
// projectId (M22+): undefined = không lọc. purchase_orders có cột project_id trực tiếp;
// floor_contracts không có nên lọc qua sheet_types → towers.project_id.
async function committedBySystem(projectId?: number): Promise<Map<number, bigint>> {
  const poProject = projectId != null ? " AND po.project_id = ?" : "";
  const fcJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const fcProject = projectId != null ? " AND tw.project_id = ?" : "";
  const rows = await query<{ systemId: number; committed: string }>(
    `SELECT src."systemId", ${moneyText("SUM(src.amount)")} AS committed
       FROM (
         SELECT st.system_id AS "systemId",
                poi.qty_ordered::text::numeric * COALESCE(poi.unit_price, 0) AS amount
           FROM po_items poi
           JOIN purchase_orders po ON po.id = poi.po_id
           LEFT JOIN materials m ON m.id = poi.material_id
           LEFT JOIN sheet_types st ON st.id = m.sheet_type_id
          WHERE po.status <> 'cancelled' AND st.system_id IS NOT NULL${poProject}
         UNION ALL
         SELECT st.system_id, fc.contract_value
           FROM floor_contracts fc
           JOIN sheet_types st ON st.id = fc.sheet_type_id${fcJoin}
          WHERE st.system_id IS NOT NULL${fcProject}
       ) src
      GROUP BY src."systemId"`,
    ...(projectId != null ? [projectId, projectId] : []),
  );
  return new Map(rows.map((r) => [r.systemId, parseMoneyExact(r.committed)]));
}

// Thực chi theo hệ = Σ amount của payment_bills (MỌI type, kể cả advance — tạm ứng đã
// ra khỏi công ty, đã quyết 2026-07-04) quy về hệ qua sheet_types.system_id.
// projectId (M22+): undefined = không lọc, lọc qua sheet_types → towers.project_id.
async function actualBySystem(projectId?: number): Promise<Map<number, bigint>> {
  const conds = ["st.system_id IS NOT NULL"];
  const args: unknown[] = [];
  const join = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  if (projectId != null) {
    conds.push("tw.project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ systemId: number; actual: string }>(
    `SELECT st.system_id AS "systemId", ${moneyText("SUM(pb.amount)")} AS actual
       FROM payment_bills pb
       JOIN sheet_types st ON st.id = pb.sheet_type_id${join}
      WHERE ${conds.join(" AND ")}
      GROUP BY st.system_id`,
    ...args,
  );
  return new Map(rows.map((r) => [r.systemId, parseMoneyExact(r.actual)]));
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
    sheetType: string;
    floorLabel: string;
    contractValue: string;
    actual: string;
  }>(
    `SELECT st.code AS "sheetType", fc.floor_label AS "floorLabel",
            ${moneyText("fc.contract_value")} AS "contractValue",
            ${moneyText(`(SELECT SUM(pb.amount) FROM payment_bills pb
                       WHERE pb.sheet_type_id = st.id AND pb.floor_label = fc.floor_label)`)} AS actual
       FROM floor_contracts fc
       JOIN sheet_types st ON st.id = fc.sheet_type_id${join}${where}
      ORDER BY st.id, fc.floor_label`,
    ...args,
  );
  return rows.map((r) => {
    const contractValue = parseMoneyExact(r.contractValue);
    return {
      key: `${r.sheetType}:${r.floorLabel}`,
      label: `${r.sheetType} · ${r.floorLabel}`,
      budget: contractValue,
      committed: contractValue,
      actual: parseMoneyExact(r.actual),
    };
  });
}

export async function costSummary(
  groupBy: "system" | "floor",
  includeVo = true,
  projectId?: number,
): Promise<CostRow[]> {
  if (groupBy === "floor") return costByFloor(projectId);

  const systems = await query<{ id: number; code: string; name: string }>(
    `SELECT id, code, name FROM systems ORDER BY id`,
  );
  const [budget, committed, actual] = await Promise.all([
    budgetBySystem(includeVo, projectId),
    committedBySystem(projectId),
    actualBySystem(projectId),
  ]);
  return systems.map((d) => ({
    key: d.code,
    label: d.name,
    budget: budget.get(d.id) ?? 0n,
    committed: committed.get(d.id) ?? 0n,
    actual: actual.get(d.id) ?? 0n,
  }));
}

/** Tổng exact (bigint) của các dòng — không qua float. */
export function sumCostAmounts(rows: readonly CostAmounts[]): CostAmounts {
  return rows.reduce<CostAmounts>(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      committed: acc.committed + r.committed,
      actual: acc.actual + r.actual,
    }),
    { budget: 0n, committed: 0n, actual: 0n },
  );
}

export async function costTotals(
  includeVo = true,
  projectId?: number,
  // Chỉ truyền kết quả costSummary("system") cùng projectId/includeVo trong chính request.
  // Không lấy dữ liệu từ client, không tái dùng rows theo tầng hoặc cache giữa các request.
  systemRows?: readonly CostRow[],
): Promise<CostAmounts> {
  const rows = systemRows ?? (await costSummary("system", includeVo, projectId));
  return sumCostAmounts(rows);
}

// Ngân sách của 1 hệ (dùng cho khối `budget` trong getSystemSummary — lib/systems.ts).
// projectId (M22+): undefined = không lọc. Trả JSON number qua adapter có biên: ngoài biên
// round-trip an toàn thì throw RangeError("money_precision_unsupported"), không xấp xỉ.
export async function systemBudget(
  systemId: number,
  includeVo = true,
  projectId?: number,
): Promise<number> {
  const conds = [
    "bi.system_id = ?",
    "(bi.vo_id IS NULL OR (? AND vo.status IN ('approved','partially_approved','contract_added')))",
  ];
  const args: unknown[] = [systemId, includeVo];
  if (projectId != null) {
    conds.push("bi.project_id = ?");
    args.push(projectId);
  }
  const row = await queryOne<{ budget: string }>(
    `SELECT ${moneyText(`SUM(
              CASE WHEN bi.vo_id IS NULL THEN bi.qty_contract * bi.unit_price
                   ELSE COALESCE(bi.qty_approved, 0) * bi.unit_price END
            )`)} AS budget
       FROM boq_items bi
       LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return moneyToNumberSafe(parseMoneyExact(row?.budget ?? "0"));
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

// ---------------------------------------------------------------------------
// So ngưỡng & DTO (A3-FR06, A4-FR07)
// ---------------------------------------------------------------------------

/**
 * Ngưỡng % (cột numeric(5,2), về JS là number ≤ 2 số lẻ) → số nguyên phần-trăm-×100. Dùng
 * `toFixed(2)` rồi phân tích chuỗi nên 90.1 → 9010 đúng, không nhân float.
 */
function pctScaled(pct: number): bigint {
  if (!Number.isFinite(pct)) throw new RangeError("cost_threshold_invalid");
  return parseFixedDecimalExact(pct.toFixed(2), 2);
}

/**
 * committed/budget ≥ pct% — so chéo exact trên bigint (committed×10000 ≥ pct×100×budget).
 * Ngân sách ≤ 0 không có tỷ lệ: luôn false (không Infinity / 100% giả).
 */
export function reachesPct(committed: bigint, budget: bigint, pct: number): boolean {
  if (budget <= 0n) return false;
  return committed * 10000n >= pctScaled(pct) * budget;
}

/**
 * Tỷ lệ committed/budget theo % để HIỂN THỊ (2 số lẻ, chặt cụt) — tính bằng bigint rồi mới đổi
 * number; không dùng để so ngưỡng. Ngân sách ≤ 0 → null (chưa có ngân sách).
 */
export function usagePct(committed: bigint, budget: bigint): number | null {
  if (budget <= 0n) return null;
  return Number((committed * 10000n) / budget) / 100;
}

export type CostAmountsWire = {
  budget: string | number;
  committed: string | number;
  actual: string | number;
};
export type CostRowWire = { key: string; label: string } & CostAmountsWire;

/**
 * Ba khoản tiền ra wire: decimal-string-v1 → chuỗi canonical; legacy → number qua
 * `moneyToNumberSafe` (ngoài biên throw RangeError "money_precision_unsupported" — route 422).
 */
export function costAmountsToWire(a: CostAmounts, format: MoneyWireFormat): CostAmountsWire {
  return {
    budget: moneyToWire(a.budget, format),
    committed: moneyToWire(a.committed, format),
    actual: moneyToWire(a.actual, format),
  };
}
