// Kiểm soát chi phí (M2): ngân sách (BOQ) vs cam kết (PO + giao thầu) vs thực chi
// (payment_bills) theo hệ hoặc theo tầng. Logic tách khỏi route để test tích hợp trực
// tiếp qua DB (cùng pattern lib/report.ts, lib/systems.ts). Xem docs/nang-cap/M02-chi-phi.md.
//
// QUALITY-FINAL-1 / S10 (A3): mọi số tiền là MoneyMinor (bigint đồng×100). SQL cộng/nhân rồi
// round tổng nhóm 2 số lẻ (ties xa 0) và cast `::text` ngay trong SELECT, kể cả bên trong
// json_build_object/json_agg — không đi qua parser NUMERIC→float của lib/db. Số lượng PO là
// float8 nên đọc biểu diễn đã lưu `::text::numeric` trước khi nhân đơn giá (float8 × numeric
// trong PostgreSQL ra float8 — mất xu); chưa có cột exact/provenance (DATA-MIGRATIONS §6).
//
// QUALITY-FINAL-1 / S11 (A4): MỘT dịch vụ canonical `getCostReport` thay bộ costSummary/
// costTotals gọi lặp. Toàn bộ nguồn (BOQ/VO, PO, HĐ giao thầu tầng, phiếu thanh toán), rows
// theo hệ + theo tầng, ngưỡng cảnh báo và coverage đọc trong ĐÚNG 1 câu SQL (1 snapshot MVCC,
// A4-FR06 — không cần đổi isolation ở lib/db). Luật nguồn:
//   - Scope trực tiếp: boq_items/purchase_orders/payment_bills.project_id = dự án; HĐ giao thầu
//     tầng (không có project_id) theo sheet → tháp.project_id.
//   - Lineage: mọi cha đã gắn (hợp đồng, đợt IPC, VO, sheet/tháp, vật tư) phải cùng dự án. Cha
//     khác dự án — hoặc không đọc được vì RLS che — là MÂU THUẪN: không cộng vào tổng nào, đếm ở
//     coverage.conflicts, báo cáo `reconciled=false`. Không chọn cha "thuận tiện" để đưa tiền vào.
//   - Đúng dự án nhưng chưa phân hệ/tầng → nhóm `unassigned` (systemId null), vẫn trong
//     projectTotals — không mất tiền do inner join.
//   - Mỗi dòng nguồn tính 1 lần theo PK; tổng hợp từng nguồn rồi mới gộp (UNION ALL), không
//     SUM(DISTINCT amount); nhóm theo id hệ / (sheet_type_id, floor_label), nhãn chỉ để hiển thị.
import { queryOne, run, withProjectScope } from "@/lib/db";
import {
  moneyToNumberSafe,
  moneyToWire,
  parseFixedDecimalExact,
  parseMoneyExact,
  type MoneyWireFormat,
} from "@/lib/nen/money";

/** Ba khoản tiền của một nhóm chi phí, bigint đồng×100. */
export type CostAmounts = { budget: bigint; committed: bigint; actual: bigint };

export type CostGroupBy = "system" | "floor";

/** Một dòng báo cáo. `unassigned` = đúng dự án nhưng chưa phân hệ (hoặc tầng). */
export type CostRow = {
  key: string;
  label: string;
  systemId: number | null;
  sheetTypeId: number | null;
  floorLabel: string | null;
  unassigned: boolean;
} & CostAmounts;

export type CostSettings = { warnPct: number; overPct: number };

export type CostAlert = { key: string; label: string; pct: number | null; over: boolean };

/** Đếm theo nguồn — không chứa số tiền (an toàn để trả cùng metadata). */
export type CostSourceCounts = {
  boq: number;
  purchaseOrders: number;
  floorContracts: number;
  payments: number;
};

export type CostCoverage = {
  /** true khi không có chứng từ mâu thuẫn phạm vi / thiếu scope / số lượng không hữu hạn. */
  reconciled: boolean;
  /** Dòng có project_id = dự án nhưng cha trỏ dự án khác (hoặc cha bị che) — KHÔNG cộng. */
  conflicts: CostSourceCounts;
  /** Phiếu thiếu project_id nhưng lineage trỏ về dự án — KHÔNG cộng, cần đối soát. Dưới RLS
   *  role ứng dụng các dòng project_id NULL không đọc được nên đây là cận dưới. */
  missingDirectScope: { payments: number };
  /** Dòng đúng dự án chưa phân hệ (đã cộng vào nhóm unassigned). */
  unassigned: CostSourceCounts;
  /** Phiếu đúng dự án chưa có sheet/tầng (nhóm unassigned của chế độ tầng). */
  unassignedFloorPayments: number;
  /** Dòng PO có qty_ordered NaN/±Infinity — KHÔNG cộng (không thành 0). */
  poQuantityNonFinite: number;
  /** HĐ giao thầu tầng chưa nhập giá trị (NULL — không đóng góp tiền). */
  floorContractsWithoutValue: number;
};

export type CostReportMetadata = {
  projectId: number;
  groupBy: CostGroupBy;
  includeVo: boolean;
  reportVersion: "cost-report-v1";
  computedAt: string;
  currency: "VND";
  /** Hệ: ngân sách = BOQ (+VO). Tầng: ngân sách = giá trị HĐ giao thầu tầng (proxy). */
  budgetBasis: "boq" | "floor-contract-proxy";
};

export type CostReport = {
  rows: CostRow[];
  /** Tổng exact đúng các rows đang hiển thị. */
  selectedTotals: CostAmounts;
  /** Tổng tài chính dự án (cơ sở BOQ, gồm unassigned) — không đổi theo chế độ nhóm. */
  projectTotals: CostAmounts;
  settings: CostSettings;
  alerts: CostAlert[];
  metadata: CostReportMetadata;
  coverage: CostCoverage;
};

export const COST_REPORT_VERSION = "cost-report-v1" as const;
/** Khoá nhóm chưa phân hệ/tầng — không trùng mã hệ (mã hệ không chứa "__"). */
export const UNASSIGNED_KEY = "__unassigned__";

const VO_COUNTED = "('approved','partially_approved','contract_added')";

// Tiền nhóm: SUM numeric → round 2 số lẻ (half away from zero) → text canonical.
const moneyText = (expr: string) => `round(COALESCE(${expr}, 0), 2)::text`;

// MỘT câu SQL cho toàn bộ báo cáo (A4-FR06). Tham số: projectId, includeVo.
const COST_REPORT_SQL = `
WITH prm AS (SELECT ?::int AS pid, ?::boolean AS inc_vo),
boq_src AS (
  SELECT bi.id, bi.system_id,
         CASE WHEN bi.vo_id IS NULL THEN bi.qty_contract * bi.unit_price
              ELSE COALESCE(bi.qty_approved, 0) * bi.unit_price END AS amount,
         (bi.vo_id IS NULL OR (prm.inc_vo AND vo.status IN ${VO_COUNTED})) AS counted,
         ((bi.contract_id IS NOT NULL AND ct.project_id IS DISTINCT FROM bi.project_id)
          OR (bi.vo_id IS NOT NULL AND vo.project_id IS DISTINCT FROM bi.project_id)) AS conflict
    FROM prm
    JOIN boq_items bi ON bi.project_id = prm.pid
    LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
    LEFT JOIN contracts ct ON ct.id = bi.contract_id
),
po_src AS (
  SELECT poi.id, st.system_id,
         CASE WHEN poi.qty_ordered::text IN ('NaN', 'Infinity', '-Infinity') THEN NULL
              ELSE poi.qty_ordered::text::numeric * COALESCE(poi.unit_price, 0) END AS amount,
         COALESCE(po.status <> 'cancelled', false) AS counted,
         ((po.contract_id IS NOT NULL AND ct.project_id IS DISTINCT FROM po.project_id)
          OR (m.sheet_type_id IS NOT NULL AND tw.project_id IS DISTINCT FROM po.project_id)
          OR (m.project_id IS NOT NULL AND m.project_id <> po.project_id)) AS conflict
    FROM prm
    JOIN purchase_orders po ON po.project_id = prm.pid
    JOIN po_items poi ON poi.po_id = po.id
    LEFT JOIN contracts ct ON ct.id = po.contract_id
    LEFT JOIN materials m ON m.id = poi.material_id
    LEFT JOIN sheet_types st ON st.id = m.sheet_type_id
    LEFT JOIN towers tw ON tw.id = st.tower_id
),
fc_src AS (
  SELECT fc.id, fc.sheet_type_id, fc.floor_label, st.system_id, fc.contract_value AS amount,
         (fc.contract_id IS NOT NULL AND ct.project_id IS DISTINCT FROM tw.project_id) AS conflict
    FROM prm
    JOIN towers tw ON tw.project_id = prm.pid
    JOIN sheet_types st ON st.tower_id = tw.id
    JOIN floor_contracts fc ON fc.sheet_type_id = st.id
    LEFT JOIN contracts ct ON ct.id = fc.contract_id
),
pay_src AS (
  SELECT pb.id, pb.amount, pb.sheet_type_id, pb.floor_label, st.system_id,
         ((pb.contract_id IS NOT NULL AND ct.project_id IS DISTINCT FROM pb.project_id)
          OR (pb.payment_cert_id IS NOT NULL AND pcc.project_id IS DISTINCT FROM pb.project_id)
          OR (pb.payment_cert_id IS NOT NULL AND pb.contract_id IS NOT NULL
              AND pc.contract_id IS DISTINCT FROM pb.contract_id)
          OR (pb.sheet_type_id IS NOT NULL AND tw.project_id IS DISTINCT FROM pb.project_id)) AS conflict
    FROM prm
    JOIN payment_bills pb ON pb.project_id = prm.pid
    LEFT JOIN contracts ct ON ct.id = pb.contract_id
    LEFT JOIN payment_certs pc ON pc.id = pb.payment_cert_id
    LEFT JOIN contracts pcc ON pcc.id = pc.contract_id
    LEFT JOIN sheet_types st ON st.id = pb.sheet_type_id
    LEFT JOIN towers tw ON tw.id = st.tower_id
),
pay_unscoped AS (
  SELECT COUNT(*)::int AS n
    FROM prm, payment_bills pb
    LEFT JOIN contracts ct ON ct.id = pb.contract_id
    LEFT JOIN payment_certs pc ON pc.id = pb.payment_cert_id
    LEFT JOIN contracts pcc ON pcc.id = pc.contract_id
    LEFT JOIN sheet_types st ON st.id = pb.sheet_type_id
    LEFT JOIN towers tw ON tw.id = st.tower_id
   WHERE pb.project_id IS NULL
     AND prm.pid IN (ct.project_id, pcc.project_id, tw.project_id)
),
sys_lines AS (
  SELECT system_id, amount AS budget, 0::numeric AS committed, 0::numeric AS actual
    FROM boq_src WHERE counted AND NOT conflict
  UNION ALL
  SELECT system_id, 0, amount, 0 FROM po_src WHERE counted AND NOT conflict AND amount IS NOT NULL
  UNION ALL
  SELECT system_id, 0, COALESCE(amount, 0), 0 FROM fc_src WHERE NOT conflict
  UNION ALL
  SELECT system_id, 0, 0, amount FROM pay_src WHERE NOT conflict
),
sys_agg AS (
  SELECT CASE WHEN s.id IS NULL THEN NULL ELSE l.system_id END AS system_id,
         SUM(l.budget) AS budget, SUM(l.committed) AS committed, SUM(l.actual) AS actual,
         COUNT(*) AS n
    FROM sys_lines l
    LEFT JOIN systems s ON s.id = l.system_id
   GROUP BY 1
),
floor_fc AS (
  SELECT sheet_type_id, floor_label, SUM(amount) AS v
    FROM fc_src WHERE NOT conflict GROUP BY sheet_type_id, floor_label
),
floor_pay AS (
  SELECT sheet_type_id, floor_label, SUM(amount) AS a
    FROM pay_src
   WHERE NOT conflict AND sheet_type_id IS NOT NULL AND floor_label IS NOT NULL
   GROUP BY sheet_type_id, floor_label
),
floor_rows AS (
  SELECT COALESCE(f.sheet_type_id, p.sheet_type_id) AS sheet_type_id,
         COALESCE(f.floor_label, p.floor_label) AS floor_label, f.v, p.a
    FROM floor_fc f
    FULL JOIN floor_pay p ON p.sheet_type_id = f.sheet_type_id AND p.floor_label = f.floor_label
)
SELECT
  (SELECT COALESCE(json_agg(json_build_object(
            'systemId', s.id, 'code', s.code, 'name', s.name,
            'budget', ${moneyText("a.budget")},
            'committed', ${moneyText("a.committed")},
            'actual', ${moneyText("a.actual")}) ORDER BY s.id), '[]'::json)
     FROM systems s LEFT JOIN sys_agg a ON a.system_id = s.id) AS "systemRows",
  (SELECT json_build_object(
            'budget', ${moneyText("a.budget")},
            'committed', ${moneyText("a.committed")},
            'actual', ${moneyText("a.actual")})
     FROM sys_agg a WHERE a.system_id IS NULL) AS "systemUnassigned",
  (SELECT COALESCE(json_agg(json_build_object(
            'sheetTypeId', r.sheet_type_id, 'sheetCode', st.code, 'towerName', tw.name,
            'floorLabel', r.floor_label,
            'budget', ${moneyText("r.v")},
            'actual', ${moneyText("r.a")}) ORDER BY r.sheet_type_id, r.floor_label), '[]'::json)
     FROM floor_rows r
     JOIN sheet_types st ON st.id = r.sheet_type_id
     JOIN towers tw ON tw.id = st.tower_id) AS "floorRows",
  (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE ${moneyText("SUM(amount)")} END
     FROM pay_src
    WHERE NOT conflict AND (sheet_type_id IS NULL OR floor_label IS NULL)) AS "floorUnassignedActual",
  (SELECT json_build_object('warnPct', warn_pct::text, 'overPct', over_pct::text)
     FROM cost_settings WHERE id = 1) AS settings,
  json_build_object(
    'conflicts', json_build_object(
      'boq', (SELECT COUNT(*)::int FROM boq_src WHERE conflict),
      'purchaseOrders', (SELECT COUNT(*)::int FROM po_src WHERE conflict),
      'floorContracts', (SELECT COUNT(*)::int FROM fc_src WHERE conflict),
      'payments', (SELECT COUNT(*)::int FROM pay_src WHERE conflict)),
    'missingDirectScope', json_build_object('payments', (SELECT n FROM pay_unscoped)),
    'unassigned', json_build_object(
      'boq', (SELECT COUNT(*)::int FROM boq_src
               WHERE counted AND NOT conflict AND system_id IS NULL),
      'purchaseOrders', (SELECT COUNT(*)::int FROM po_src
               WHERE counted AND NOT conflict AND amount IS NOT NULL AND system_id IS NULL),
      'floorContracts', (SELECT COUNT(*)::int FROM fc_src WHERE NOT conflict AND system_id IS NULL),
      'payments', (SELECT COUNT(*)::int FROM pay_src WHERE NOT conflict AND system_id IS NULL)),
    'unassignedFloorPayments', (SELECT COUNT(*)::int FROM pay_src
               WHERE NOT conflict AND (sheet_type_id IS NULL OR floor_label IS NULL)),
    'poQuantityNonFinite', (SELECT COUNT(*)::int FROM po_src
               WHERE counted AND NOT conflict AND amount IS NULL),
    'floorContractsWithoutValue', (SELECT COUNT(*)::int FROM fc_src
               WHERE NOT conflict AND amount IS NULL)
  ) AS coverage,
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "computedAt"
FROM prm`;

type MoneyTriple = { budget: string; committed: string; actual: string };
type ReportRow = {
  systemRows: ({ systemId: number; code: string; name: string } & MoneyTriple)[];
  systemUnassigned: MoneyTriple | null;
  floorRows: {
    sheetTypeId: number;
    sheetCode: string;
    towerName: string;
    floorLabel: string;
    budget: string;
    actual: string;
  }[];
  floorUnassignedActual: string | null;
  settings: { warnPct: string; overPct: string } | null;
  coverage: Omit<CostCoverage, "reconciled">;
  computedAt: string;
};

const DEFAULT_SETTINGS: CostSettings = { warnPct: 90, overPct: 100 };

const amounts = (t: MoneyTriple): CostAmounts => ({
  budget: parseMoneyExact(t.budget),
  committed: parseMoneyExact(t.committed),
  actual: parseMoneyExact(t.actual),
});

function systemRowsOf(r: ReportRow): CostRow[] {
  const rows: CostRow[] = r.systemRows.map((s) => ({
    key: s.code,
    label: s.name,
    systemId: s.systemId,
    sheetTypeId: null,
    floorLabel: null,
    unassigned: false,
    ...amounts(s),
  }));
  if (r.systemUnassigned) {
    rows.push({
      key: UNASSIGNED_KEY,
      label: "Chưa phân hệ",
      systemId: null,
      sheetTypeId: null,
      floorLabel: null,
      unassigned: true,
      ...amounts(r.systemUnassigned),
    });
  }
  return rows;
}

function floorRowsOf(r: ReportRow): CostRow[] {
  // Nhãn hiển thị "mã sheet · tầng"; mã sheet chỉ unique theo tháp nên khi trùng nhãn thì thêm
  // tên tháp. Khoá luôn là id sheet + tầng (khoá nguồn thật), không dùng nhãn.
  const base = (f: ReportRow["floorRows"][number]) => `${f.sheetCode} · ${f.floorLabel}`;
  const seen = new Map<string, number>();
  for (const f of r.floorRows) seen.set(base(f), (seen.get(base(f)) ?? 0) + 1);
  const rows: CostRow[] = r.floorRows.map((f) => {
    const budget = parseMoneyExact(f.budget);
    return {
      key: `${f.sheetTypeId}:${f.floorLabel}`,
      label: (seen.get(base(f)) ?? 0) > 1 ? `${base(f)} (${f.towerName})` : base(f),
      systemId: null,
      sheetTypeId: f.sheetTypeId,
      floorLabel: f.floorLabel,
      unassigned: false,
      // Proxy: BOQ không có chiều tầng — ngân sách = cam kết = giá trị HĐ giao thầu tầng.
      budget,
      committed: budget,
      actual: parseMoneyExact(f.actual),
    };
  });
  if (r.floorUnassignedActual != null) {
    rows.push({
      key: UNASSIGNED_KEY,
      label: "Chưa phân tầng",
      systemId: null,
      sheetTypeId: null,
      floorLabel: null,
      unassigned: true,
      budget: 0n,
      committed: 0n,
      actual: parseMoneyExact(r.floorUnassignedActual),
    });
  }
  return rows;
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

/** Cảnh báo từ đúng rows của báo cáo (cùng snapshot), so ngưỡng exact (A4-FR07). */
export function costAlerts(rows: readonly CostRow[], settings: CostSettings): CostAlert[] {
  return rows
    .filter((r) => reachesPct(r.committed, r.budget, settings.warnPct))
    .map((r) => ({
      key: r.key,
      label: r.label,
      pct: usagePct(r.committed, r.budget),
      over: reachesPct(r.committed, r.budget, settings.overPct),
    }));
}

/**
 * Báo cáo chi phí canonical của MỘT dự án (A4 §3). `projectId` phải là dự án đã được caller
 * xác minh quyền (route: getCurrentProjectId + CAN.viewPayments). Tự mở/tái dùng transaction có
 * GUC app.project_id để RLS lọc đúng; toàn bộ số liệu đọc trong 1 câu SQL (1 snapshot).
 */
export async function getCostReport(
  projectId: number,
  options: { groupBy: CostGroupBy; includeVo: boolean },
): Promise<CostReport> {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    throw new RangeError("getCostReport: projectId không hợp lệ");
  }
  const { groupBy, includeVo } = options;
  const r = await withProjectScope(projectId, () =>
    queryOne<ReportRow>(COST_REPORT_SQL, projectId, includeVo),
  );
  if (!r) throw new Error("getCostReport: truy vấn không trả dòng");

  const systemRows = systemRowsOf(r);
  const rows = groupBy === "floor" ? floorRowsOf(r) : systemRows;
  const settings: CostSettings = r.settings
    ? { warnPct: Number(r.settings.warnPct), overPct: Number(r.settings.overPct) }
    : DEFAULT_SETTINGS;
  const c = r.coverage;
  const conflictCount =
    c.conflicts.boq +
    c.conflicts.purchaseOrders +
    c.conflicts.floorContracts +
    c.conflicts.payments;
  return {
    rows,
    selectedTotals: sumCostAmounts(rows),
    projectTotals: sumCostAmounts(systemRows),
    settings,
    alerts: costAlerts(rows, settings),
    metadata: {
      projectId,
      groupBy,
      includeVo,
      reportVersion: COST_REPORT_VERSION,
      computedAt: r.computedAt,
      currency: "VND",
      budgetBasis: groupBy === "floor" ? "floor-contract-proxy" : "boq",
    },
    coverage: {
      ...c,
      reconciled:
        conflictCount === 0 && c.missingDirectScope.payments === 0 && c.poQuantityNonFinite === 0,
    },
  };
}

/**
 * Ngân sách của 1 hệ (khối `budget` trong getSystemSummary — lib/tien-do/systems.ts), lấy từ
 * CÙNG báo cáo canonical để không có 2 nguồn sự thật. Không có dự án → null (không mở báo cáo
 * toàn hệ). Trả JSON number qua adapter có biên: ngoài biên throw "money_precision_unsupported".
 */
export async function systemBudget(
  systemId: number,
  includeVo = true,
  projectId?: number | null,
): Promise<number | null> {
  if (projectId == null) return null;
  const report = await getCostReport(projectId, { groupBy: "system", includeVo });
  const row = report.rows.find((r) => r.systemId === systemId);
  return moneyToNumberSafe(row?.budget ?? 0n);
}

export async function getCostSettings(): Promise<CostSettings> {
  const row = await queryOne<{ warnPct: number; overPct: number }>(
    `SELECT warn_pct AS "warnPct", over_pct AS "overPct" FROM cost_settings WHERE id = 1`,
  );
  return row ?? DEFAULT_SETTINGS;
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

/** Dòng báo cáo ra wire: ID/nhãn giữ kiểu, chỉ tiền đổi theo định dạng. */
export function costRowToWire(r: CostRow, format: MoneyWireFormat) {
  return {
    key: r.key,
    label: r.label,
    systemId: r.systemId,
    sheetTypeId: r.sheetTypeId,
    floorLabel: r.floorLabel,
    unassigned: r.unassigned,
    ...costAmountsToWire(r, format),
  };
}
