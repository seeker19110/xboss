// M9 — Dashboard mở rộng: khối "tiền + chất lượng + công trường" bổ sung vào
// /api/dashboard hiện có. Không thêm schema — chỉ query tổng hợp. Mỗi khối chỉ
// tính khi bảng nguồn tồn tại (module đã triển khai) → trả null để UI ẩn thẻ
// (dashboard chạy được dù module sau chưa làm, vd work_fronts của M14).
// Xem docs/nang-cap/M09-dashboard.md.
import { query, queryOne, todayISO } from "@/lib/db";
import { boqExecutedQty } from "@/lib/boq";
import { costSummary } from "@/lib/cost";

export async function tableExists(name: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT to_regclass(?) IS NOT NULL AS exists`,
    name,
  );
  return !!row?.exists;
}

export type CashflowMonth = { month: string; in: number; out: number };

// 12 tháng gần nhất: in = payment_bills gắn hợp đồng nhận thầu (thu từ CĐT),
// out = payment_bills gắn hợp đồng giao thầu/NCC hoặc chưa gắn hợp đồng (mặc định
// trước M16 mọi bill đều là chi cho NCC/thầu phụ).
export async function cashflowSeries(): Promise<CashflowMonth[]> {
  const rows = await query<{ month: string; direction: "in" | "out"; total: number }>(
    `SELECT to_char(pb.paid_date, 'YYYY-MM') AS month,
            CASE WHEN c.kind = 'nhan_thau' THEN 'in' ELSE 'out' END AS direction,
            SUM(pb.amount) AS total
       FROM payment_bills pb
       LEFT JOIN contracts c ON c.id = pb.contract_id
      WHERE pb.paid_date >= (CURRENT_DATE - INTERVAL '12 months')
      GROUP BY month, direction
      ORDER BY month`,
  );
  const map = new Map<string, CashflowMonth>();
  for (const r of rows) {
    const entry = map.get(r.month) ?? { month: r.month, in: 0, out: 0 };
    entry[r.direction] = Number(r.total);
    map.set(r.month, entry);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type CpiBlock = {
  executedValue: number;
  actualCost: number;
  cpi: number;
  budgetUsedPct: number;
};

// CPI = giá trị thực hiện (KL thực hiện × đơn giá, lib/boq.ts) / thực chi (lib/cost.ts).
// CPI ≥ 1: thực hiện nhiều hơn tiền đã chi (tốt) — < 1: chi vượt so với thực hiện (rủi ro).
export async function cpiBlock(): Promise<CpiBlock> {
  const boqItems = await query<{ id: number; unitPrice: number }>(
    `SELECT id, unit_price AS "unitPrice" FROM boq_items WHERE vo_id IS NULL`,
  );
  let executedValue = 0;
  for (const it of boqItems) executedValue += (await boqExecutedQty(it.id)) * Number(it.unitPrice);

  const rows = await costSummary("system");
  const totals = rows.reduce(
    (acc, r) => ({ budget: acc.budget + r.budget, actual: acc.actual + r.actual }),
    { budget: 0, actual: 0 },
  );
  const cpi = totals.actual > 0 ? executedValue / totals.actual : 0;
  const budgetUsedPct = totals.budget > 0 ? (totals.actual / totals.budget) * 100 : 0;
  return { executedValue, actualCost: totals.actual, cpi, budgetUsedPct };
}

export type QualityBlock = {
  ncrOpen: number;
  ncrOverdue: number;
  ncrClosed30d: number;
  inspectionPassRate: number | null;
};

export async function qualityBlock(): Promise<QualityBlock> {
  const today = todayISO();
  const ncrRow = await queryOne<{ open: number; overdue: number; closed30d: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE status <> 'closed') AS open,
       COUNT(*) FILTER (WHERE status <> 'closed' AND due_date IS NOT NULL AND due_date < ?) AS overdue,
       COUNT(*) FILTER (WHERE status = 'closed' AND closed_at >= NOW() - INTERVAL '30 days') AS "closed30d"
     FROM ncrs`,
    today,
  );
  const inspRow = await queryOne<{ passed: number; failed: number }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'passed') AS passed,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed
       FROM qc_inspections WHERE status IN ('passed','failed')`,
  );
  const passed = inspRow?.passed ?? 0;
  const failed = inspRow?.failed ?? 0;
  const total = passed + failed;

  return {
    ncrOpen: ncrRow?.open ?? 0,
    ncrOverdue: ncrRow?.overdue ?? 0,
    ncrClosed30d: ncrRow?.closed30d ?? 0,
    inspectionPassRate: total > 0 ? (passed / total) * 100 : null,
  };
}

export type ProcurementBlock = { poLate: number; vehicleNoShowWeek: number };

export async function procurementBlock(): Promise<ProcurementBlock> {
  const poLate = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM purchase_orders
      WHERE expected_date IS NOT NULL AND expected_date < ?
        AND status NOT IN ('received','reconciled','cancelled')`,
    todayISO(),
  );
  const vehicleNoShow = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM vehicle_logs
      WHERE status = 'no_show' AND expected_at >= NOW() - INTERVAL '7 days'`,
  );
  return { poLate: poLate?.n ?? 0, vehicleNoShowWeek: vehicleNoShow?.n ?? 0 };
}

export type WorkfrontBlock = { waitingFloors: number; cumulativeWaitDays: number };

// M14 (mặt bằng thi công) chưa triển khai — bảng work_fronts chưa tồn tại → null
// (UI ẩn thẻ). Khi M14 xong, hàm này cần cập nhật đúng schema thật của work_fronts.
// Tầng chờ bàn giao mặt bằng (M14) + tổng số ngày chờ luỹ kế (Σ max(0, today −
// start_date sớm nhất của tầng) qua mọi task chưa xong của tầng đó) — con số EOT
// cho dashboard. `null` khi M14 chưa triển khai (bảng chưa tồn tại).
export async function workfrontBlock(): Promise<WorkfrontBlock | null> {
  if (!(await tableExists("work_fronts"))) return null;

  const rows = await query<{ earliestStart: string | null }>(
    `SELECT MIN(t.start_date) AS "earliestStart"
       FROM work_fronts wf
       LEFT JOIN work_packages wp
         ON wp.sheet_type_id = wf.sheet_type_id AND wp.floor_label = wf.floor_label
       LEFT JOIN tasks t
         ON t.package_id = wp.id AND t.start_date IS NOT NULL
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')
      WHERE wf.status = 'pending'
      GROUP BY wf.id`,
  );

  const today = todayISO();
  let cumulativeWaitDays = 0;
  for (const r of rows) {
    if (!r.earliestStart) continue;
    cumulativeWaitDays += Math.max(
      0,
      Math.round((Date.parse(today) - Date.parse(r.earliestStart)) / 86400_000),
    );
  }

  return { waitingFloors: rows.length, cumulativeWaitDays };
}

export type VoBlock = { draft: number; submitted: number; approved: number; rejected: number };

// Tổng giá trị VO theo trạng thái (approved gộp cả partially_approved/contract_added).
export async function voBlock(): Promise<VoBlock> {
  const rows = await query<{ status: string; total: number }>(
    `SELECT vo.status,
            COALESCE(SUM(
              CASE WHEN vo.status IN ('approved','partially_approved','contract_added')
                   THEN COALESCE(bi.qty_approved, 0) * bi.unit_price
                   ELSE bi.qty_contract * bi.unit_price END
            ), 0) AS total
       FROM variation_orders vo
       LEFT JOIN boq_items bi ON bi.vo_id = vo.id
      GROUP BY vo.status`,
  );
  const result: VoBlock = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
  for (const r of rows) {
    if (r.status === "draft") result.draft += Number(r.total);
    else if (r.status === "submitted") result.submitted += Number(r.total);
    else if (r.status === "rejected") result.rejected += Number(r.total);
    else result.approved += Number(r.total); // approved/partially_approved/contract_added
  }
  return result;
}

export type DisciplineCrossRow = {
  code: string;
  name: string;
  color: string | null;
  progressPct: number;
  delayedCount: number;
  ncrOpen: number;
  budgetUsedPct: number;
};

// Bảng so sánh chéo hệ: % tiến độ, số task trễ, NCR mở, % ngân sách đã dùng — mỗi
// hệ trong danh mục disciplines (màn hình chỉ huy trưởng đa hệ, §3b kế hoạch tổng).
export async function byDisciplineBlock(): Promise<DisciplineCrossRow[]> {
  const today = todayISO();
  const progress = await query<{ disciplineId: number; progressPct: number; delayedCount: number }>(
    `SELECT st.discipline_id AS "disciplineId",
            COALESCE(AVG(t.progress_percent), 0) * 100 AS "progressPct",
            COUNT(*) FILTER (WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu')) AS "delayedCount"
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE st.discipline_id IS NOT NULL
      GROUP BY st.discipline_id`,
    today,
  );
  const ncrOpen = await query<{ disciplineId: number; n: number }>(
    `SELECT st.discipline_id AS "disciplineId", COUNT(*) AS n
       FROM ncrs n
       JOIN tasks t ON t.id = n.task_id
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
      WHERE n.status <> 'closed' AND st.discipline_id IS NOT NULL
      GROUP BY st.discipline_id`,
  );
  const cost = await costSummary("system");

  const progressMap = new Map(progress.map((r) => [r.disciplineId, r]));
  const ncrMap = new Map(ncrOpen.map((r) => [r.disciplineId, Number(r.n)]));
  const costMap = new Map(cost.map((r) => [r.key, r]));

  const disciplines = await query<{ id: number; code: string; name: string; color: string | null }>(
    `SELECT id, code, name, color FROM disciplines ORDER BY id`,
  );

  return disciplines.map((d) => {
    const p = progressMap.get(d.id);
    const c = costMap.get(d.code);
    return {
      code: d.code,
      name: d.name,
      color: d.color,
      progressPct: Number(p?.progressPct ?? 0),
      delayedCount: Number(p?.delayedCount ?? 0),
      ncrOpen: ncrMap.get(d.id) ?? 0,
      budgetUsedPct: c && c.budget > 0 ? (c.committed / c.budget) * 100 : 0,
    };
  });
}
