import { NextRequest, NextResponse } from "next/server";
import { query, todayISO, daysFromTodayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";
import { progressAtDate } from "@/lib/report";
import { getCurrentProjectId } from "@/lib/projects";
import { getGroupProgressMap } from "@/lib/group-progress";
import {
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
  // Dự án đang chọn — lọc mọi khối theo dự án để tránh rò rỉ chéo dự án (đa dự án, M22+).
  // null = DB chưa có project nào → giữ hành vi không lọc (tương thích ngược).
  const projectId = await getCurrentProjectId(user);
  const projectFilterAnd = projectId != null ? "AND tw.project_id = ?" : "";
  const projectParams = projectId != null ? [projectId] : [];
  const systemFilterAnd = systemId !== null ? "AND st.system_id = ?" : "";
  const systemParams = systemId !== null ? [systemId] : [];
  const range = req.nextUrl.searchParams.get("range"); // "week" | "month" | null

  // Task trễ: end_date < hôm nay AND progress < 1 AND chưa hoàn thành/nghiệm thu.
  // Danh sách này liệt kê theo TỪNG TASK/CÔNG TÁC (cần biết đúng task nào để gán lý do
  // trễ/xử lý — bảng Pareto trên dashboard dựa vào đây). Các số liệu tổng hợp bên dưới
  // (totalDelayed/kpi[].delayed) đếm theo HẠNG MỤC = cặp (sheet, tầng): OGTĐ tầng 27 có
  // nhiều công tác trễ vẫn tính 1 hạng mục trễ; OGTĐ-27 và OGCH-27 tính riêng 2 hạng mục.
  const delayedTasks = await query<{
    id: number;
    code: string;
    name: string;
    status: string;
    startDate: string | null;
    endDate: string;
    progressPercent: number;
    delayReason: string | null;
    delayNote: string | null;
    floorLabel: string | null;
    packageCode: string;
    sheetType: string;
    sheetSlug: string | null;
    assigneeName: string | null;
  }>(
    // COALESCE(t.start_date/end_date, wp....): task NULL = kế thừa ngày nhóm (lib/recompute.ts).
    `SELECT t.id, t.code, t.name, t.status,
            COALESCE(t.start_date, wp.start_date) AS "startDate",
            COALESCE(t.end_date, wp.end_date) AS "endDate",
            t.progress_percent AS "progressPercent",
            t.delay_reason AS "delayReason", t.delay_note AS "delayNote",
            wp.floor_label AS "floorLabel", wp.code AS "packageCode",
            st.code AS "sheetType", st.slug AS "sheetSlug",
            u.name AS "assigneeName"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id
       ${projectId != null ? "JOIN towers tw ON tw.id = st.tower_id" : ""}
      WHERE COALESCE(t.end_date, wp.end_date) IS NOT NULL AND COALESCE(t.end_date, wp.end_date) < ?
        AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')
        ${systemFilterAnd}
        ${projectFilterAnd}
      ORDER BY COALESCE(t.end_date, wp.end_date)`,
    today,
    ...systemParams,
    ...projectParams,
  );

  // Hạng mục trễ = cặp (sheet, tầng) có ≥1 công tác trễ — nhiều công tác trễ cùng một
  // (sheet, tầng) vẫn tính 1 hạng mục. Suy trực tiếp từ delayedTasks (đã lọc theo
  // systemFilter) thay vì query SQL riêng, đảm bảo tổng số + số theo từng sheet luôn khớp.
  const delayedItemsBySheet = new Map<string, Set<string>>();
  for (const t of delayedTasks) {
    if (!delayedItemsBySheet.has(t.sheetType)) delayedItemsBySheet.set(t.sheetType, new Set());
    delayedItemsBySheet.get(t.sheetType)!.add(t.floorLabel ?? "");
  }
  const totalDelayedItems = [...delayedItemsBySheet.values()].reduce(
    (sum, set) => sum + set.size,
    0,
  );

  // Tiến độ trung bình của TOÀN BỘ công tác trong từng hạng mục (sheet+tầng) — dùng cho
  // cột "Tiến độ TB" ở bảng hạng mục trễ, tránh nhầm với avg chỉ tính trên công tác trễ.
  const groupProgress = await getGroupProgressMap({ systemId, projectId });

  // KPI theo từng sheet. LEFT JOIN work_packages/tasks (sheet chưa có task nào vẫn phải
  // hiện) — JOIN towers (INNER) lọc đúng dự án qua ON, không ảnh hưởng LEFT JOIN work_packages/tasks
  // phía sau nên sheet chưa có task vẫn hiện đúng khi đang lọc theo dự án.
  const kpiRaw = await query<{
    sheetId: number;
    sheetType: string;
    sheetSlug: string | null;
    total: number;
    avgProgress: number;
  }>(
    `SELECT st.id AS "sheetId", st.code AS "sheetType", st.slug AS "sheetSlug",
            COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress"
       FROM sheet_types st
       ${projectId != null ? "JOIN towers tw ON tw.id = st.tower_id AND tw.project_id = ?" : ""}
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
       ${systemId !== null ? "WHERE st.system_id = ?" : ""}
      GROUP BY st.id, st.code, st.slug
      ORDER BY st.sort_order, st.id`,
    ...projectParams,
    ...systemParams,
  );
  const kpi = kpiRaw.map((k) => ({
    ...k,
    delayed: delayedItemsBySheet.get(k.sheetType)?.size ?? 0,
  }));

  // `?range=week|month` (M36 PR3): thêm % đầu kỳ + Δ kỳ cho từng dòng KPI — tái dựng từ
  // task_history qua `progressAtDate` (mốc 7/30 ngày trước), gộp theo sheetId.
  const kpiWithDelta =
    range === "week" || range === "month"
      ? await (async () => {
          const pastDate = range === "week" ? daysFromTodayISO(-7) : daysFromTodayISO(-30);
          const prevRows = await progressAtDate(pastDate, {
            ...(systemId !== null ? { systemId } : {}),
            projectId: projectId ?? undefined,
          });
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

  // M9 — khối mở rộng "tiền + chất lượng + công trường". Khối tài chính (vo, và
  // budgetUsedPct trong bySystem) chỉ trả cho PAYMENT_VIEW_ROLES (admin/pm/bch) —
  // ẩn từ server cho cdt/viewer, không chỉ ẩn UI (quyết 2026-07-04). Dashboard
  // tổng quan không còn hiển thị cashflow/CPI/% ngân sách (quyết 2026-07-11) nên
  // bỏ hẳn budgetUsedPct khỏi response thay vì null theo quyền.
  const canViewFinance = CAN.viewPayments(user.role);
  const [quality, procurement, workfront, bySystem] = await Promise.all([
    qualityBlock(projectId),
    procurementBlock(projectId),
    workfrontBlock(projectId),
    bySystemBlock(projectId),
  ]);
  const vo = canViewFinance ? await voBlock(projectId) : null;

  // Widget "Chờ duyệt" (M19) — chỉ người có quyền duyệt (Admin/PM) cần thấy.
  const approvals = CAN.approve(user.role) ? await approvalsBlock(projectId) : null;

  return NextResponse.json({
    approvals,
    delayedTasks,
    groupProgress: Object.fromEntries(groupProgress),
    kpi: kpiWithDelta,
    totalDelayed: totalDelayedItems,
    quality,
    procurement,
    workfront,
    vo,
    bySystem: bySystem.map(({ budgetUsedPct, ...rest }) => rest),
  });
}
