// M9 — Dashboard mở rộng: khối "tiền + chất lượng + công trường" bổ sung vào
// /api/dashboard hiện có. Không thêm schema — chỉ query tổng hợp. Mỗi khối chỉ
// tính khi bảng nguồn tồn tại (module đã triển khai) → trả null để UI ẩn thẻ
// (dashboard chạy được dù module sau chưa làm, vd work_fronts của M14).
// Xem docs/nang-cap/M09-dashboard.md.
import { query, queryOne, todayISO } from "@/lib/db";
import { costSummary } from "@/lib/cost";

export async function tableExists(name: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT to_regclass(?) IS NOT NULL AS exists`,
    name,
  );
  return !!row?.exists;
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

// M14 (mặt bằng thi công, đã chuyển sang model tầng×công tác của M46): đếm tầng chưa
// sẵn sàng (công tác cuối chưa bàn giao) có task sắp/đã tới hạn bắt đầu (stageMissingList,
// cùng nguồn với notification stage_missing + /lookahead) + tổng số ngày chờ luỹ kế —
// bằng chứng xin gia hạn (EOT) trên dashboard.
export async function workfrontBlock(): Promise<WorkfrontBlock | null> {
  if (!(await tableExists("floor_stage_fronts"))) return null;
  const { stageMissingList } = await import("@/lib/constructionStages");
  const items = await stageMissingList();
  return {
    waitingFloors: items.length,
    cumulativeWaitDays: items.reduce((sum, it) => sum + it.waitingDays, 0),
  };
}

export type ApprovalsBlock = { pendingProposals: number; pendingPurchaseRequests: number };

// M19 — widget "Chờ duyệt" cho Admin/PM: đếm gộp đề xuất đã trình (proposals) +
// yêu cầu mua vật tư đang chờ (purchase_requests) — 1 con số duy nhất, tránh 2 nơi rời rạc.
export async function approvalsBlock(): Promise<ApprovalsBlock> {
  const row = await queryOne<{ proposals: number; prs: number }>(
    `SELECT (SELECT COUNT(*) FROM proposals WHERE status = 'submitted') AS proposals,
            (SELECT COUNT(*) FROM purchase_requests WHERE status = 'pending') AS prs`,
  );
  return {
    pendingProposals: Number(row?.proposals ?? 0),
    pendingPurchaseRequests: Number(row?.prs ?? 0),
  };
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

export type SystemCrossRow = {
  code: string;
  name: string;
  color: string | null;
  progressPct: number;
  delayedCount: number;
  ncrOpen: number;
  budgetUsedPct: number;
};

// Bảng so sánh chéo hệ: % tiến độ, số TẦNG trễ (quyết 2026-07-11 — 1 tầng nhiều task
// trễ vẫn tính 1 lần, gộp theo floor_label trong phạm vi hệ đó), NCR mở, % ngân sách
// đã dùng — mỗi hệ trong danh mục systems (màn hình chỉ huy trưởng đa hệ, §3b kế hoạch tổng).
export async function bySystemBlock(): Promise<SystemCrossRow[]> {
  const today = todayISO();
  const progress = await query<{ systemId: number; progressPct: number; delayedCount: number }>(
    `SELECT st.system_id AS "systemId",
            COALESCE(AVG(t.progress_percent), 0) * 100 AS "progressPct",
            COUNT(DISTINCT wp.floor_label) FILTER (WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu')) AS "delayedCount"
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE st.system_id IS NOT NULL
      GROUP BY st.system_id`,
    today,
  );
  const ncrOpen = await query<{ systemId: number; n: number }>(
    `SELECT st.system_id AS "systemId", COUNT(*) AS n
       FROM ncrs n
       JOIN tasks t ON t.id = n.task_id
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
      WHERE n.status <> 'closed' AND st.system_id IS NOT NULL
      GROUP BY st.system_id`,
  );
  const cost = await costSummary("system");

  const progressMap = new Map(progress.map((r) => [r.systemId, r]));
  const ncrMap = new Map(ncrOpen.map((r) => [r.systemId, Number(r.n)]));
  const costMap = new Map(cost.map((r) => [r.key, r]));

  const systems = await query<{ id: number; code: string; name: string; color: string | null }>(
    `SELECT id, code, name, color FROM systems ORDER BY id`,
  );

  return systems.map((d) => {
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
