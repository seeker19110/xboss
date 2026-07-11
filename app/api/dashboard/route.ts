import { NextRequest, NextResponse } from "next/server";
import { query, todayISO, daysFromTodayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";
import { progressAtDate } from "@/lib/report";
import {
  cashflowSeries,
  cpiBlock,
  qualityBlock,
  procurementBlock,
  workfrontBlock,
  voBlock,
  bySystemBlock,
  approvalsBlock,
} from "@/lib/dashboardext";

export const dynamic = "force-dynamic";

// `?system=<systems.code>` (M36 PR1) lọc KPI + bảng trễ theo hệ — không truyền = nguyên hành vi cũ.
// `?range=week|month` (M36 PR3) thêm cột "Δ kỳ" cho từng dòng KPI — % đầu kỳ (tái dựng từ
// task_history qua `progressAtDate`) so với % hiện tại. Không truyền/`day` = không có Δ kỳ (cũ).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewDashboard(user.role))
    return NextResponse.json({ error: "Thầu phụ không có quyền xem dashboard" }, { status: 403 });

  const today = todayISO();
  const systemId = await resolveSystemId(req.nextUrl.searchParams.get("system"));
  const systemFilterAnd = systemId !== null ? "AND st.system_id = ?" : "";
  const systemFilterWhere = systemId !== null ? "WHERE st.system_id = ?" : "";
  const systemParams = systemId !== null ? [systemId] : [];
  const range = req.nextUrl.searchParams.get("range"); // "week" | "month" | null

  // Task trễ: end_date < hôm nay AND progress < 1 AND chưa hoàn thành/nghiệm thu.
  const delayedTasks = await query(
    `SELECT t.id, t.code, t.name, t.status,
            t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS "progressPercent",
            t.delay_reason AS "delayReason", t.delay_note AS "delayNote",
            wp.floor_label AS "floorLabel", wp.code AS "packageCode",
            st.code AS "sheetType", st.slug AS "sheetSlug",
            u.name AS "assigneeName"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.end_date IS NOT NULL AND t.end_date < ?
        AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')
        ${systemFilterAnd}
      ORDER BY t.end_date`,
    today,
    ...systemParams,
  );

  // KPI theo từng sheet
  const kpi = await query<{
    sheetId: number;
    sheetType: string;
    sheetSlug: string | null;
    total: number;
    avgProgress: number;
    delayed: number;
  }>(
    `SELECT st.id AS "sheetId", st.code AS "sheetType", st.slug AS "sheetSlug",
            COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS delayed
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
       ${systemFilterWhere}
      GROUP BY st.id, st.code, st.slug
      ORDER BY st.sort_order, st.id`,
    today,
    ...systemParams,
  );

  // `?range=week|month` (M36 PR3): thêm % đầu kỳ + Δ kỳ cho từng dòng KPI — tái dựng từ
  // task_history qua `progressAtDate` (mốc 7/30 ngày trước), gộp theo sheetId.
  const kpiWithDelta =
    range === "week" || range === "month"
      ? await (async () => {
          const pastDate = range === "week" ? daysFromTodayISO(-7) : daysFromTodayISO(-30);
          const prevRows = await progressAtDate(pastDate, systemId !== null ? { systemId } : {});
          const prevBySheet = new Map<number, number[]>();
          for (const r of prevRows) {
            if (!prevBySheet.has(r.sheetId)) prevBySheet.set(r.sheetId, []);
            prevBySheet.get(r.sheetId)!.push(r.progress);
          }
          return kpi.map((k) => {
            const list = prevBySheet.get(k.sheetId) ?? [];
            const avgProgressPrev = list.length
              ? list.reduce((s, v) => s + v, 0) / list.length
              : (k.avgProgress ?? 0);
            return {
              ...k,
              avgProgressPrev,
              deltaProgress: (k.avgProgress ?? 0) - avgProgressPrev,
            };
          });
        })()
      : kpi;

  // M9 — khối mở rộng "tiền + chất lượng + công trường". Khối tài chính (cashflow/
  // cpi/vo, và budgetUsedPct trong bySystem) chỉ trả cho PAYMENT_VIEW_ROLES
  // (admin/pm/bch) — ẩn từ server cho cdt/viewer, không chỉ ẩn UI (quyết 2026-07-04).
  const canViewFinance = CAN.viewPayments(user.role);
  const [quality, procurement, workfront, bySystem] = await Promise.all([
    qualityBlock(),
    procurementBlock(),
    workfrontBlock(),
    bySystemBlock(),
  ]);
  const [cashflow, cpi, vo] = canViewFinance
    ? await Promise.all([cashflowSeries(), cpiBlock(), voBlock()])
    : [null, null, null];

  // Widget "Chờ duyệt" (M19) — chỉ người có quyền duyệt (Admin/PM) cần thấy.
  const approvals = CAN.approve(user.role) ? await approvalsBlock() : null;

  return NextResponse.json({
    approvals,
    delayedTasks,
    kpi: kpiWithDelta,
    totalDelayed: delayedTasks.length,
    cashflow,
    cpi,
    quality,
    procurement,
    workfront,
    vo,
    bySystem: bySystem.map((d) => ({
      ...d,
      budgetUsedPct: canViewFinance ? d.budgetUsedPct : null,
    })),
  });
}
