// Kiểm soát chi phí (M2): ngân sách (BOQ) vs cam kết (PO + giao thầu) vs thực chi
// (payment_bills) theo hệ hoặc theo tầng. Xem docs/nang-cap/M02-chi-phi.md và
// QUALITY-FINAL-1 A3/A4 (docs/nang-cap/AUDIT-2026-09-25/A4-REPORTING.md).
//
// S10b/S11 — báo cáo chuẩn `getCostReport` (cost-report-v1):
//   - Tiền exact: mọi SUM/tích làm trong SQL rồi `ROUND(…, 2)::text`, JS chỉ cộng bigint đồng×100
//     (lib/nen/money). Không parseFloat, không cộng/nhân tiền trên number.
//   - Pre-aggregate TỪNG nguồn theo khoá thật (boq_items.id, po_items.id, floor_contracts
//     UNIQUE(sheet_type_id, floor_label), payment_bills.id) rồi mới ghép ở JS theo system ID /
//     (sheet_type_id, floor_label) — không JOIN chéo nguồn, không SUM(DISTINCT amount).
//   - Phạm vi: dòng hợp lệ = project_id trực tiếp đúng dự án VÀ mọi cha có mặt (hợp đồng, đợt IPC,
//     sheet → tháp, vật tư, VO) cùng dự án. Dòng chạm dự án nhưng lệch lineage = invalid-scope:
//     KHÔNG cộng vào tổng nào, chỉ đếm vào coverage (không lộ số tiền) → báo cáo "cần đối soát".
//     Dòng đúng dự án nhưng chưa gán hệ/tầng = unassigned: vẫn vào projectTotals + dòng riêng.
//   - Một snapshot: toàn bộ nguồn + ngưỡng đọc trong MỘT transaction REPEATABLE READ READ ONLY.
import { query, queryOne, run, withProjectScope } from "@/lib/db";
import {
  moneyToNumber,
  moneyToWire,
  mulRatio,
  parseFixedDecimalExact,
  type MoneyWireFormat,
} from "@/lib/nen/money";

export type CostGroupBy = "system" | "floor";

/** Dòng legacy (number) cho caller nội bộ cũ: thông báo cost_over, dashboard theo hệ. */
export type CostRow = {
  key: string;
  label: string;
  budget: number;
  committed: number;
  actual: number;
};

export type CostSettings = { warnPct: number; overPct: number };

// ---------------------------------------------------------------------------
// Nguồn — mỗi query trả aggregate theo khoá thật của chính nguồn đó.
// ---------------------------------------------------------------------------

/** Trạng thái phạm vi một dòng nguồn: hợp lệ / lệch lineage / khối lượng không hữu hạn. */
type SourceState = "ok" | "invalid_scope" | "invalid_quantity";

type BoqAgg = { systemId: number | null; state: SourceState; n: number; amount: string };
type PoAgg = { systemId: number | null; state: SourceState; n: number; amount: string };
type FloorContractSrc = {
  sheetTypeId: number;
  sheetCode: string;
  floorLabel: string;
  systemId: number | null;
  state: SourceState;
  amount: string;
};
type PaymentAgg = {
  sheetTypeId: number | null;
  sheetCode: string | null;
  floorLabel: string | null;
  systemId: number | null;
  state: SourceState;
  n: number;
  amount: string;
};
type SystemRef = { id: number; code: string; name: string };

type CostSources = {
  boq: BoqAgg[];
  po: PoAgg[];
  floorContracts: FloorContractSrc[];
  payments: PaymentAgg[];
};

// Mọi query nguồn nhận dự án đúng MỘT tham số qua `(SELECT ?::int AS id) p` (Postgres kéo
// subquery hằng này lên thành tham số, vẫn dùng được index project_id).

// Ngân sách = Σ qty_contract × unit_price của dòng BOQ gốc + (includeVo) Σ qty_approved ×
// unit_price của dòng VO đã duyệt. Tích NUMERIC(15,3)×NUMERIC(15,2) exact, cộng rồi mới ROUND 2
// theo nhóm hệ (cost-sum-v1). Dòng VO có VO ngoài dự án/không thấy được (RLS) vẫn được xét để
// đếm invalid-scope khi includeVo, không bị lọc mất im lặng.
async function loadBoqBySystem(projectId: number, includeVo: boolean): Promise<BoqAgg[]> {
  return query<BoqAgg>(
    `SELECT s."systemId", s.state, COUNT(*) AS n,
            ROUND(COALESCE(SUM(s.v) FILTER (WHERE s.state = 'ok'), 0), 2)::text AS amount
       FROM (
         SELECT bi.system_id AS "systemId",
                CASE WHEN COALESCE(bi.project_id = p.id
                                   AND (bi.contract_id IS NULL OR c.project_id = p.id)
                                   AND (bi.vo_id IS NULL OR vo.project_id = p.id), false)
                     THEN 'ok' ELSE 'invalid_scope' END AS state,
                CASE WHEN bi.vo_id IS NULL THEN bi.qty_contract * bi.unit_price
                     ELSE COALESCE(bi.qty_approved, 0) * bi.unit_price END AS v
           FROM (SELECT ?::int AS id, ?::boolean AS include_vo) p
           CROSS JOIN boq_items bi
           LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
           LEFT JOIN contracts c ON c.id = bi.contract_id
          WHERE (bi.vo_id IS NULL
                 OR (p.include_vo
                     AND (vo.project_id IS DISTINCT FROM p.id
                          OR vo.status IN ('approved', 'partially_approved', 'contract_added'))))
            AND (bi.project_id = p.id OR c.project_id = p.id OR vo.project_id = p.id)
       ) s
      GROUP BY s."systemId", s.state`,
    projectId,
    includeVo,
  );
}

// Cam kết PO = Σ qty_ordered × unit_price các PO chưa huỷ, quy về hệ qua vật tư → sheet → hệ.
// qty_ordered là float8 (A3-FR04): nhân bằng `qty_ordered::text::numeric` — đúng biểu diễn float
// đã lưu (legacy_float_text của DATA-MIGRATIONS §6), KHÔNG để Postgres ép unit_price sang float8
// rồi SUM float (bản cũ: 0.1×3.00 ×3 dòng = 0.9000000000000001). NaN/±Infinity không thành 0:
// loại khỏi tổng + đếm invalid_quantity để đối soát.
async function loadPoBySystem(projectId: number): Promise<PoAgg[]> {
  return query<PoAgg>(
    `SELECT s."systemId", s.state, COUNT(*) AS n,
            ROUND(COALESCE(SUM(CASE WHEN s.state = 'ok' THEN s.qty::text::numeric * s.price END),
                           0), 2)::text AS amount
       FROM (
         SELECT st.system_id AS "systemId", poi.qty_ordered AS qty,
                COALESCE(poi.unit_price, 0) AS price,
                CASE WHEN NOT COALESCE(po.project_id = p.id
                                       AND (po.contract_id IS NULL OR c.project_id = p.id)
                                       AND (m.project_id IS NULL OR m.project_id = p.id)
                                       AND (m.sheet_type_id IS NULL OR tw.project_id = p.id), false)
                       THEN 'invalid_scope'
                     WHEN poi.qty_ordered IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
                       THEN 'invalid_quantity'
                     ELSE 'ok' END AS state
           FROM (SELECT ?::int AS id) p
           CROSS JOIN po_items poi
           JOIN purchase_orders po ON po.id = poi.po_id
           LEFT JOIN contracts c ON c.id = po.contract_id
           LEFT JOIN materials m ON m.id = poi.material_id
           LEFT JOIN sheet_types st ON st.id = m.sheet_type_id
           LEFT JOIN towers tw ON tw.id = st.tower_id
          WHERE po.status <> 'cancelled'
            AND (po.project_id = p.id OR m.project_id = p.id OR tw.project_id = p.id)
       ) s
      GROUP BY s."systemId", s.state`,
    projectId,
  );
}

// Giao thầu theo tầng: grain thật UNIQUE(sheet_type_id, floor_label) — mỗi dòng là một nhóm,
// không cần GROUP BY. Không có project_id riêng: phạm vi qua sheet → tháp, hợp đồng (nếu có)
// phải cùng dự án.
async function loadFloorContracts(projectId: number): Promise<FloorContractSrc[]> {
  return query<FloorContractSrc>(
    `SELECT fc.sheet_type_id AS "sheetTypeId", st.code AS "sheetCode",
            fc.floor_label AS "floorLabel", st.system_id AS "systemId",
            CASE WHEN COALESCE(tw.project_id = p.id
                               AND (fc.contract_id IS NULL OR c.project_id = p.id), false)
                 THEN 'ok' ELSE 'invalid_scope' END AS state,
            ROUND(COALESCE(fc.contract_value, 0), 2)::text AS amount
       FROM (SELECT ?::int AS id) p
       CROSS JOIN floor_contracts fc
       JOIN sheet_types st ON st.id = fc.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
       LEFT JOIN contracts c ON c.id = fc.contract_id
      WHERE tw.project_id = p.id OR c.project_id = p.id
      ORDER BY fc.sheet_type_id, fc.floor_label`,
    projectId,
  );
}

// Thực chi = Σ amount của payment_bills MỌI type (kể cả advance — đã quyết 2026-07-04), gom theo
// (sheet, tầng, hệ). Phạm vi trực tiếp project_id; contract/đợt IPC/sheet nếu có phải cùng dự án
// (Q-AC05) — hợp đồng dự án khác bị RLS che thì LEFT JOIN ra NULL nên tự rơi vào invalid_scope.
// Dòng legacy project_id NULL không thuộc dự án nào (khớp S02a), chỉ được đếm nếu cha trỏ về đây.
async function loadPayments(projectId: number): Promise<PaymentAgg[]> {
  return query<PaymentAgg>(
    `SELECT pb.sheet_type_id AS "sheetTypeId", st.code AS "sheetCode",
            pb.floor_label AS "floorLabel", st.system_id AS "systemId",
            CASE WHEN COALESCE(pb.project_id = p.id
                               AND (pb.contract_id IS NULL OR c.project_id = p.id)
                               AND (pb.payment_cert_id IS NULL OR pcc.project_id = p.id)
                               AND (pb.sheet_type_id IS NULL OR tw.project_id = p.id), false)
                 THEN 'ok' ELSE 'invalid_scope' END AS state,
            COUNT(*) AS n, ROUND(COALESCE(SUM(pb.amount), 0), 2)::text AS amount
       FROM (SELECT ?::int AS id) p
       CROSS JOIN payment_bills pb
       LEFT JOIN sheet_types st ON st.id = pb.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
       LEFT JOIN contracts c ON c.id = pb.contract_id
       LEFT JOIN payment_certs pc ON pc.id = pb.payment_cert_id
       LEFT JOIN contracts pcc ON pcc.id = pc.contract_id
      WHERE pb.project_id = p.id OR c.project_id = p.id OR pcc.project_id = p.id
         OR tw.project_id = p.id
      GROUP BY 1, 2, 3, 4, 5`,
    projectId,
  );
}

async function loadSources(projectId: number, includeVo: boolean): Promise<CostSources> {
  // Tuần tự trên cùng connection (Promise.all không song song được trên 1 client và không tạo
  // snapshot nhất quán — A4-FR06). Thanh toán đọc cuối: test snapshot khoá đúng bảng này.
  const boq = await loadBoqBySystem(projectId, includeVo);
  const po = await loadPoBySystem(projectId);
  const floorContracts = await loadFloorContracts(projectId);
  const payments = await loadPayments(projectId);
  return { boq, po, floorContracts, payments };
}

async function loadSystems(): Promise<SystemRef[]> {
  return query<SystemRef>(`SELECT id, code, name FROM systems ORDER BY id`);
}

// ---------------------------------------------------------------------------
// Ghép nguồn → dòng báo cáo (thuần, bigint).
// ---------------------------------------------------------------------------

export type CostAmounts = { budget: bigint; committed: bigint; actual: bigint };

/** Mức cảnh báo một dòng: `no_budget` = cam kết dương nhưng ngân sách ≤ 0 (không chia). */
export type CostAlertLevel = "none" | "warn" | "over" | "no_budget";

export type CostReportRow = CostAmounts & {
  key: string;
  label: string;
  /** Nhóm hệ: ID hệ (null = chưa gán hệ). Nhóm tầng: luôn null. */
  systemId: number | null;
  /** Chỉ để dựng link hiển thị, không dùng làm khoá nhóm. */
  systemCode: string | null;
  /** Nhóm tầng: grain (sheetTypeId, floorLabel); null ở dòng chưa gán tầng/nhóm hệ. */
  sheetTypeId: number | null;
  floorLabel: string | null;
  unassigned: boolean;
  level: CostAlertLevel;
  /** committed/budget theo điểm cơ bản (×10000, làm tròn ties xa 0); null khi budget ≤ 0. */
  usageBasisPoints: bigint | null;
};

export type CostSourceCounts = {
  boqItems: number;
  poItems: number;
  floorContracts: number;
  payments: number;
};

export type CostCoverage = {
  /** false khi có dòng lệch phạm vi/khối lượng lỗi — tổng CHƯA đủ điều kiện đối soát. */
  reconciled: boolean;
  /** Đúng dự án nhưng chưa gán hệ (nhóm hệ) / chưa gán sheet-tầng (nhóm tầng): đã trong tổng. */
  unassigned: CostSourceCounts;
  /** Lineage lệch dự án: KHÔNG trong tổng nào, chỉ đếm (không lộ số tiền). */
  invalidScope: CostSourceCounts;
  /** Khối lượng PO NaN/±Infinity: không trong tổng, cần đối soát. */
  invalidQuantity: { poItems: number };
};

export type CostSettingsExact = {
  /** NUMERIC(5,2) canonical, vd "90.00". */
  warnPct: string;
  overPct: string;
};

export const COST_REPORT_VERSION = "cost-report-v1";

export type CostReport = {
  rows: CostReportRow[];
  selectedTotals: CostAmounts;
  projectTotals: CostAmounts;
  settings: CostSettingsExact;
  alerts: CostReportRow[];
  metadata: {
    projectId: number;
    groupBy: CostGroupBy;
    includeVo: boolean;
    reportVersion: typeof COST_REPORT_VERSION;
    computedAt: string;
    currency: "VND";
    budgetBasis: "boq" | "floor-contract-proxy";
    coverage: CostCoverage;
  };
};

const ZERO: CostAmounts = { budget: 0n, committed: 0n, actual: 0n };
const BASIS_POINTS = 10000n;
const UNASSIGNED_SYSTEM_LABEL = "Chưa gán hệ";
const UNASSIGNED_FLOOR_LABEL = "Chưa gán tầng";

function sqlMoney(text: string): bigint {
  // ROUND(…, 2)::text luôn đúng scale 2; sai dạng là lỗi hệ thống (fail-fast, không đoán).
  return parseFixedDecimalExact(text, 2);
}

function addAmounts(a: CostAmounts, b: Partial<CostAmounts>): CostAmounts {
  return {
    budget: a.budget + (b.budget ?? 0n),
    committed: a.committed + (b.committed ?? 0n),
    actual: a.actual + (b.actual ?? 0n),
  };
}

function sumAmounts(rows: readonly CostAmounts[]): CostAmounts {
  return rows.reduce<CostAmounts>((acc, r) => addAmounts(acc, r), ZERO);
}

/**
 * Mức cảnh báo bằng nhân chéo exact (A4-FR07): committed/budget ≥ pct/100 ⇔
 * committed × 10000 ≥ pct(scale 2) × budget. Budget ≤ 0 không chia: cam kết dương = chưa có
 * ngân sách, không Infinity/100% giả.
 */
export function costAlertLevel(
  amounts: Pick<CostAmounts, "budget" | "committed">,
  settings: CostSettingsExact,
): CostAlertLevel {
  const { budget, committed } = amounts;
  if (budget <= 0n) return committed > 0n ? "no_budget" : "none";
  const lhs = committed * BASIS_POINTS;
  if (lhs >= parseFixedDecimalExact(settings.overPct, 2) * budget) return "over";
  if (lhs >= parseFixedDecimalExact(settings.warnPct, 2) * budget) return "warn";
  return "none";
}

type RowBase = Omit<CostReportRow, "level" | "usageBasisPoints">;

function finishRow(row: RowBase, settings: CostSettingsExact): CostReportRow {
  return {
    ...row,
    level: costAlertLevel(row, settings),
    usageBasisPoints: row.budget > 0n ? mulRatio(row.committed, BASIS_POINTS, row.budget) : null,
  };
}

function emptyCounts(): CostSourceCounts {
  return { boqItems: 0, poItems: 0, floorContracts: 0, payments: 0 };
}

/** Tổng hợp theo hệ (systemId null = chưa gán hệ) — nền của projectTotals ở MỌI chế độ nhóm. */
function amountsBySystem(src: CostSources): Map<number | null, CostAmounts> {
  const map = new Map<number | null, CostAmounts>();
  const add = (systemId: number | null, part: Partial<CostAmounts>) =>
    map.set(systemId, addAmounts(map.get(systemId) ?? ZERO, part));
  for (const r of src.boq) if (r.state === "ok") add(r.systemId, { budget: sqlMoney(r.amount) });
  for (const r of src.po) if (r.state === "ok") add(r.systemId, { committed: sqlMoney(r.amount) });
  for (const r of src.floorContracts)
    if (r.state === "ok") add(r.systemId, { committed: sqlMoney(r.amount) });
  for (const r of src.payments)
    if (r.state === "ok") add(r.systemId, { actual: sqlMoney(r.amount) });
  return map;
}

function coverageOf(src: CostSources, groupBy: CostGroupBy): CostCoverage {
  const unassigned = emptyCounts();
  const invalidScope = emptyCounts();
  let invalidQuantity = 0;
  for (const r of src.boq) {
    if (r.state !== "ok") invalidScope.boqItems += r.n;
    else if (groupBy === "system" && r.systemId == null) unassigned.boqItems += r.n;
  }
  for (const r of src.po) {
    if (r.state === "invalid_scope") invalidScope.poItems += r.n;
    else if (r.state === "invalid_quantity") invalidQuantity += r.n;
    else if (groupBy === "system" && r.systemId == null) unassigned.poItems += r.n;
  }
  for (const r of src.floorContracts) {
    if (r.state !== "ok") invalidScope.floorContracts += 1;
    else if (groupBy === "system" && r.systemId == null) unassigned.floorContracts += 1;
  }
  for (const r of src.payments) {
    if (r.state !== "ok") invalidScope.payments += r.n;
    else if (groupBy === "system" ? r.systemId == null : !isFloorGrain(r))
      unassigned.payments += r.n;
  }
  const invalidTotal =
    invalidScope.boqItems +
    invalidScope.poItems +
    invalidScope.floorContracts +
    invalidScope.payments +
    invalidQuantity;
  return {
    reconciled: invalidTotal === 0,
    unassigned,
    invalidScope,
    invalidQuantity: { poItems: invalidQuantity },
  };
}

function isFloorGrain(
  r: Pick<PaymentAgg, "sheetTypeId" | "floorLabel">,
): r is { sheetTypeId: number; floorLabel: string } {
  return r.sheetTypeId != null && r.floorLabel != null;
}

function systemRows(
  systems: readonly SystemRef[],
  bySystem: Map<number | null, CostAmounts>,
  settings: CostSettingsExact,
): CostReportRow[] {
  const rows = systems.map((s) =>
    finishRow(
      {
        key: `system:${s.id}`,
        label: s.name,
        systemId: s.id,
        systemCode: s.code,
        sheetTypeId: null,
        floorLabel: null,
        unassigned: false,
        ...(bySystem.get(s.id) ?? ZERO),
      },
      settings,
    ),
  );
  // Mọi hệ có trong nguồn đều có FK tới systems — phần còn lại (systemId null hoặc hệ không
  // nằm trong danh sách đọc được) gộp vào dòng "chưa gán hệ" để selectedTotals = projectTotals.
  const known = new Set(systems.map((s) => s.id));
  const rest = [...bySystem].filter(([id]) => id == null || !known.has(id)).map(([, a]) => a);
  if (rest.length > 0) {
    rows.push(
      finishRow(
        {
          key: "system:unassigned",
          label: UNASSIGNED_SYSTEM_LABEL,
          systemId: null,
          systemCode: null,
          sheetTypeId: null,
          floorLabel: null,
          unassigned: true,
          ...sumAmounts(rest),
        },
        settings,
      ),
    );
  }
  return rows;
}

// Nhóm tầng: ngân sách = cam kết = giá trị hợp đồng giao thầu theo tầng (proxy, BOQ chưa phân bổ
// tầng); thực chi ghép ở cùng grain (sheet_type_id, floor_label). Thanh toán không có hợp đồng
// tầng vẫn thành dòng riêng; thanh toán thiếu sheet/tầng vào dòng "chưa gán tầng".
function floorRows(src: CostSources, settings: CostSettingsExact): CostReportRow[] {
  type Grain = { sheetTypeId: number; sheetCode: string; floorLabel: string; amounts: CostAmounts };
  const grains = new Map<string, Grain>();
  const keyOf = (sheetTypeId: number, floorLabel: string) =>
    JSON.stringify([sheetTypeId, floorLabel]);
  for (const fc of src.floorContracts) {
    if (fc.state !== "ok") continue;
    const v = sqlMoney(fc.amount);
    grains.set(keyOf(fc.sheetTypeId, fc.floorLabel), {
      sheetTypeId: fc.sheetTypeId,
      sheetCode: fc.sheetCode,
      floorLabel: fc.floorLabel,
      amounts: { budget: v, committed: v, actual: 0n },
    });
  }
  let unassignedActual: bigint | null = null;
  for (const p of src.payments) {
    if (p.state !== "ok") continue;
    const v = sqlMoney(p.amount);
    if (!isFloorGrain(p)) {
      unassignedActual = (unassignedActual ?? 0n) + v;
      continue;
    }
    const k = keyOf(p.sheetTypeId, p.floorLabel);
    const g = grains.get(k) ?? {
      sheetTypeId: p.sheetTypeId,
      sheetCode: p.sheetCode ?? String(p.sheetTypeId),
      floorLabel: p.floorLabel,
      amounts: ZERO,
    };
    grains.set(k, { ...g, amounts: addAmounts(g.amounts, { actual: v }) });
  }
  const ordered = [...grains.values()].sort((a, b) =>
    a.sheetTypeId !== b.sheetTypeId
      ? a.sheetTypeId - b.sheetTypeId
      : a.floorLabel < b.floorLabel
        ? -1
        : a.floorLabel > b.floorLabel
          ? 1
          : 0,
  );
  const rows = ordered.map((g) =>
    finishRow(
      {
        key: `floor:${keyOf(g.sheetTypeId, g.floorLabel)}`,
        label: `${g.sheetCode} · ${g.floorLabel}`,
        systemId: null,
        systemCode: null,
        sheetTypeId: g.sheetTypeId,
        floorLabel: g.floorLabel,
        unassigned: false,
        ...g.amounts,
      },
      settings,
    ),
  );
  if (unassignedActual != null) {
    rows.push(
      finishRow(
        {
          key: "floor:unassigned",
          label: UNASSIGNED_FLOOR_LABEL,
          systemId: null,
          systemCode: null,
          sheetTypeId: null,
          floorLabel: null,
          unassigned: true,
          budget: 0n,
          committed: 0n,
          actual: unassignedActual,
        },
        settings,
      ),
    );
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Service chuẩn S11.
// ---------------------------------------------------------------------------

/** Phạm vi đã được route xác minh (user → org → dự án khả kiến + quyền xem chi phí). */
export type CostReportScope = { kind: "project"; projectId: number };
export type CostReportOptions = { groupBy: CostGroupBy; includeVo: boolean };

type SettingsSnapshot = {
  warnPct: string | null;
  overPct: string | null;
  computedAt: Date | string;
};

const DEFAULT_SETTINGS: CostSettingsExact = { warnPct: "90.00", overPct: "100.00" };

/** Ghép nguồn đã đọc (cùng snapshot) thành báo cáo — thuần, không chạm DB. */
export function buildCostReport(
  projectId: number,
  options: CostReportOptions,
  data: {
    systems: readonly SystemRef[];
    sources: CostSources;
    settings: CostSettingsExact;
    computedAt: string;
  },
): CostReport {
  const { groupBy, includeVo } = options;
  const bySystem = amountsBySystem(data.sources);
  const rows =
    groupBy === "floor"
      ? floorRows(data.sources, data.settings)
      : systemRows(data.systems, bySystem, data.settings);
  return {
    rows,
    selectedTotals: sumAmounts(rows),
    projectTotals: sumAmounts([...bySystem.values()]),
    settings: data.settings,
    alerts: rows.filter((r) => r.level !== "none"),
    metadata: {
      projectId,
      groupBy,
      includeVo,
      reportVersion: COST_REPORT_VERSION,
      computedAt: data.computedAt,
      currency: "VND",
      budgetBasis: groupBy === "floor" ? "floor-contract-proxy" : "boq",
      coverage: coverageOf(data.sources, groupBy),
    },
  };
}

/**
 * Báo cáo chi phí MỘT dự án (A4 §3): rows theo hệ/tầng, selectedTotals = Σ rows,
 * projectTotals = tổng dự án theo cơ sở BOQ (gồm chưa gán hệ), ngưỡng, cảnh báo và metadata.
 * Mọi nguồn + ngưỡng đọc trong MỘT transaction REPEATABLE READ READ ONLY (A4-FR06), đóng ngay
 * sau khi materialize — không giữ snapshot khi đổi wire/trả HTTP. Số query cố định (5 nhóm tầng,
 * 6 nhóm hệ), không phụ thuộc số nhóm/dòng.
 */
export async function getCostReport(
  scope: CostReportScope,
  options: CostReportOptions,
): Promise<CostReport> {
  const projectId = scope.projectId;
  if (scope.kind !== "project" || !Number.isSafeInteger(projectId) || projectId <= 0) {
    throw new TypeError("cost_report_scope_invalid");
  }
  const data = await withProjectScope(
    projectId,
    async () => {
      // Câu đầu tiên: ngưỡng + thời điểm snapshot. Ngưỡng theo TỔ CHỨC của dự án (S02e,
      // org_cost_settings); org chưa cấu hình → không có dòng → DEFAULT_SETTINGS (90/100).
      const head = await queryOne<SettingsSnapshot>(
        `SELECT now() AS "computedAt", s.warn_pct::text AS "warnPct", s.over_pct::text AS "overPct"
           FROM (SELECT 1) AS one
           LEFT JOIN projects p ON p.id = ?
           LEFT JOIN org_cost_settings s ON s.org_id = p.org_id`,
        projectId,
      );
      const systems = options.groupBy === "system" ? await loadSystems() : [];
      const sources = await loadSources(projectId, options.includeVo);
      return { head, systems, sources };
    },
    { readOnly: true, isolation: "repeatable_read" },
  );
  const settings: CostSettingsExact =
    data.head?.warnPct != null && data.head.overPct != null
      ? { warnPct: data.head.warnPct, overPct: data.head.overPct }
      : DEFAULT_SETTINGS;
  const at = data.head?.computedAt;
  return buildCostReport(projectId, options, {
    systems: data.systems,
    sources: data.sources,
    settings,
    computedAt: at instanceof Date ? at.toISOString() : String(at ?? new Date().toISOString()),
  });
}

// ---------------------------------------------------------------------------
// DTO wire (A3-FR06): decimal-string-v1 opt-in, legacy number trong biên an toàn.
// ---------------------------------------------------------------------------

type AmountsWire = { budget: string | number; committed: string | number; actual: string | number };

export type CostReportRowWire = AmountsWire & {
  key: string;
  label: string;
  systemId: number | null;
  systemCode: string | null;
  sheetTypeId: number | null;
  floorLabel: string | null;
  unassigned: boolean;
  level: CostAlertLevel;
  /** Hiển thị: % cam kết/ngân sách (2 số lẻ), null khi chưa có ngân sách. Không dùng để tính. */
  usagePct: number | null;
};

export type CostAlertWire = {
  key: string;
  label: string;
  level: Exclude<CostAlertLevel, "none">;
  pct: number | null;
  over: boolean;
};

export type CostReportWire = {
  rows: CostReportRowWire[];
  /** Legacy (cửa sổ chuyển đổi): luôn = projectTotals, KHÔNG đổi theo tab nhóm. */
  totals: AmountsWire;
  selectedTotals: AmountsWire;
  projectTotals: AmountsWire;
  settings: CostSettings;
  alerts: CostAlertWire[];
  groupBy: CostGroupBy;
  metadata: CostReport["metadata"] & { moneyFormat: MoneyWireFormat };
};

function amountsToWire(a: CostAmounts, format: MoneyWireFormat): AmountsWire {
  return {
    budget: moneyToWire(a.budget, format),
    committed: moneyToWire(a.committed, format),
    actual: moneyToWire(a.actual, format),
  };
}

/** Điểm cơ bản → % 2 số lẻ để HIỂN THỊ (giá trị nhỏ, không phải tiền). */
function basisPointsToPct(bp: bigint | null): number | null {
  return bp == null ? null : Number(bp) / 100;
}

/**
 * Báo cáo → JSON. Legacy number qua `moneyToWire` (ngoài biên round-trip throw
 * RangeError("money_precision_unsupported") — route trả 422, không xấp xỉ). Legacy giữ hợp đồng
 * cũ của `alerts` (chỉ nhóm có ngân sách, `pct` là number) — client mới nhận cả `no_budget`.
 * Ngưỡng là phần trăm NUMERIC(5,2) (≤ 1000) nên trả number ở cả hai định dạng.
 */
export function costReportToWire(report: CostReport, format: MoneyWireFormat): CostReportWire {
  const projectTotals = amountsToWire(report.projectTotals, format);
  const alerts = report.alerts
    .filter((r) => format !== "legacy-number" || r.level !== "no_budget")
    .map((r): CostAlertWire => ({
      key: r.key,
      label: r.label,
      level: r.level as CostAlertWire["level"],
      pct: basisPointsToPct(r.usageBasisPoints),
      over: r.level === "over",
    }));
  return {
    rows: report.rows.map((r) => ({
      key: r.key,
      label: r.label,
      systemId: r.systemId,
      systemCode: r.systemCode,
      sheetTypeId: r.sheetTypeId,
      floorLabel: r.floorLabel,
      unassigned: r.unassigned,
      level: r.level,
      usagePct: basisPointsToPct(r.usageBasisPoints),
      ...amountsToWire(r, format),
    })),
    totals: projectTotals,
    selectedTotals: amountsToWire(report.selectedTotals, format),
    projectTotals,
    settings: {
      warnPct: Number(report.settings.warnPct),
      overPct: Number(report.settings.overPct),
    },
    alerts,
    groupBy: report.metadata.groupBy,
    metadata: { ...report.metadata, moneyFormat: format },
  };
}

// ---------------------------------------------------------------------------
// Adapter legacy cho caller nội bộ (thông báo cost_over, dashboard theo hệ, tóm tắt hệ).
// ---------------------------------------------------------------------------

/**
 * Dòng theo hệ dạng number (key = mã hệ — khoá cost_group của thông báo). Cùng nguồn/phạm vi
 * exact như `getCostReport`, chỉ đổi sang number ở biên để tính tỷ lệ hiển thị. Không tự mở
 * transaction (caller có thể đang trong transaction). Thiếu dự án → [] (fail-closed: không còn
 * chế độ "toàn hệ" cộng chéo dự án/tổ chức). Dòng "chưa gán hệ" không có mã hệ nên không trả.
 */
export async function costSummary(
  groupBy: CostGroupBy,
  includeVo = true,
  projectId?: number,
): Promise<CostRow[]> {
  if (projectId == null) return [];
  const systems = groupBy === "system" ? await loadSystems() : [];
  const sources = await loadSources(projectId, includeVo);
  const report = buildCostReport(
    projectId,
    { groupBy, includeVo },
    { systems, sources, settings: DEFAULT_SETTINGS, computedAt: "" },
  );
  return report.rows
    .filter((r) => !r.unassigned)
    .map((r) => ({
      key: groupBy === "system" ? (r.systemCode ?? r.key) : r.key,
      label: r.label,
      budget: moneyToNumber(r.budget),
      committed: moneyToNumber(r.committed),
      actual: moneyToNumber(r.actual),
    }));
}

/**
 * Ngân sách của 1 hệ (khối `budget` trong getSystemSummary — lib/tien-do/systems.ts): cùng
 * nguồn exact với báo cáo. Thiếu dự án → null (UI ẩn khối), không cộng BOQ toàn hệ.
 */
export async function systemBudget(
  systemId: number,
  includeVo = true,
  projectId?: number,
): Promise<number | null> {
  if (projectId == null) return null;
  const rows = await loadBoqBySystem(projectId, includeVo);
  const total = rows
    .filter((r) => r.state === "ok" && r.systemId === systemId)
    .reduce((acc, r) => acc + sqlMoney(r.amount), 0n);
  return moneyToNumber(total);
}

/** Ngưỡng cảnh báo chi phí của MỘT tổ chức (S02e); org chưa cấu hình → mặc định 90/100. */
export async function getCostSettings(orgId: number): Promise<CostSettings> {
  const row = await queryOne<{ warnPct: number; overPct: number }>(
    `SELECT warn_pct AS "warnPct", over_pct AS "overPct" FROM org_cost_settings WHERE org_id = ?`,
    orgId,
  );
  return row ?? { warnPct: 90, overPct: 100 };
}

/** Ghi ngưỡng cho đúng tổ chức `orgId` — không bao giờ chạm cấu hình org khác. */
export async function updateCostSettings(orgId: number, settings: CostSettings): Promise<void> {
  await run(
    `INSERT INTO org_cost_settings (org_id, warn_pct, over_pct) VALUES (?, ?, ?)
     ON CONFLICT (org_id) DO UPDATE
       SET warn_pct = EXCLUDED.warn_pct, over_pct = EXCLUDED.over_pct, updated_at = now()`,
    orgId,
    settings.warnPct,
    settings.overPct,
  );
}
