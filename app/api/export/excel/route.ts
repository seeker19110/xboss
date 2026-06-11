import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { query, queryOne, todayISO } from "@/lib/db";
import { STATUS_LABEL } from "@/lib/status";
import { getCurrentUser, CAN } from "@/lib/auth";
import { codeFromSlug } from "@/lib/sheets";

export const dynamic = "force-dynamic";

type TrackTask = {
  taskId: number; boqCode: string | null; code: string; name: string; status: string;
  startDate: string | null; endDate: string | null; progressPercent: number;
  assignee: string | null; wpId: number; wpCode: string; wpName: string;
  floorLabel: string | null; sheetCode: string;
};
type DimRow = { taskId: number; label: string; installed: number };

// Tên tab Excel: tối đa 31 ký tự, không chứa ký tự cấm.
const safeTabName = (s: string) => s.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);

// Dựng tab tracking 1 sheet: hàng nhóm (work package) + hàng task,
// cột dimension theo union nhãn của sheet — bám format file Excel gốc.
function buildTrackingTab(tasks: TrackTask[], dims: DimRow[]): XLSX.WorkSheet {
  const dimsByTask = new Map<number, Map<string, number>>();
  const dimLabels: string[] = []; // giữ thứ tự xuất hiện
  const seen = new Set<string>();
  for (const d of dims) {
    if (!dimsByTask.has(d.taskId)) dimsByTask.set(d.taskId, new Map());
    dimsByTask.get(d.taskId)!.set(d.label, d.installed);
    if (!seen.has(d.label)) { seen.add(d.label); dimLabels.push(d.label); }
  }

  const header = ["BOQCODE", "Mã", "Chi tiết công việc", "Tầng", "Người phụ trách",
    "Bắt đầu", "Kết thúc", "% Tiến độ", "Trạng thái", ...dimLabels];
  const rows: (string | number)[][] = [header];

  let lastWp = 0;
  for (const t of tasks) {
    if (t.wpId !== lastWp) {
      lastWp = t.wpId;
      rows.push([`— ${t.wpCode}`, "", t.wpName, t.floorLabel ?? "", "", "", "", "", ""]);
    }
    const taskDims = dimsByTask.get(t.taskId);
    rows.push([
      t.boqCode ?? "", t.code, t.name, t.floorLabel ?? "", t.assignee ?? "",
      t.startDate ?? "", t.endDate ?? "",
      Math.round((t.progressPercent ?? 0) * 100) + "%",
      STATUS_LABEL[t.status as keyof typeof STATUS_LABEL] ?? t.status,
      ...dimLabels.map((l) => {
        const v = taskDims?.get(l);
        return v === undefined ? "" : v ? "x" : "○";
      }),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 10 }, { wch: 8 }, { wch: 40 }, { wch: 6 }, { wch: 16 },
    { wch: 11 }, { wch: 11 }, { wch: 9 }, { wch: 13 }, ...dimLabels.map(() => ({ wch: 6 }))];
  return ws;
}

// GET /api/export/excel[?sheet=ogtd] → file .xlsx gồm tab "KPI" + "Công việc trễ"
// + 1 tab tracking đầy đủ cho mỗi sheet (hoặc chỉ sheet được chọn).
export async function GET(req: NextRequest) {
  const role = (await getCurrentUser())?.role;
  if (!CAN.export(role)) return NextResponse.json({ error: "Bạn không có quyền export (chỉ Admin/PM)" }, { status: 403 });

  const slug = req.nextUrl.searchParams.get("sheet");
  const onlySheet = slug ? codeFromSlug(slug) : null;
  if (slug && !onlySheet) return NextResponse.json({ error: `Sheet không hợp lệ: ${slug}` }, { status: 400 });

  const today = todayISO();

  const delayed = await query<{ boqCode: string | null; code: string; name: string; status: string; startDate: string | null; endDate: string | null; progressPercent: number; floorLabel: string | null; sheetType: string }>(
    `SELECT t.boq_code AS "boqCode", t.code, t.name, t.status, t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS "progressPercent", wp.floor_label AS "floorLabel", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')
      ORDER BY st.code, t.end_date`, today);

  const kpi = await query<{ sheetType: string; total: number; avgProgress: number; delayed: number }>(
    `SELECT st.code AS "sheetType", COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent),0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN t.end_date < ? AND t.progress_percent < 1 AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END),0) AS delayed
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      GROUP BY st.id, st.code ORDER BY st.id`, today);

  // Toàn bộ task theo sheet (cho các tab tracking) — thứ tự như lưới trên web.
  const sheetFilter = onlySheet ? "WHERE st.code = ?" : "";
  const sheetParams = onlySheet ? [onlySheet] : [];
  const allTasks = await query<TrackTask>(
    `SELECT t.id AS "taskId", t.boq_code AS "boqCode", t.code, t.name, t.status,
            t.start_date AS "startDate", t.end_date AS "endDate", t.progress_percent AS "progressPercent",
            u.name AS assignee, wp.id AS "wpId", wp.code AS "wpCode", wp.name AS "wpName",
            wp.floor_label AS "floorLabel", st.code AS "sheetCode"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id
      ${sheetFilter}
      ORDER BY st.id, wp.id, t.id`, ...sheetParams);

  const allDims = await query<DimRow>(
    `SELECT d.task_id AS "taskId", d.dimension_label AS label, d.installed
       FROM progress_dimensions d
       JOIN tasks t ON d.task_id = t.id
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      ${sheetFilter}
      ORDER BY d.task_id, d.id`, ...sheetParams);

  const delayedRows = delayed.map((d) => ({
    "BOQCODE": d.boqCode ?? "", "Mã": d.code, "Chi tiết công việc": d.name, "Sheet": d.sheetType,
    "Tầng": d.floorLabel ?? "", "Bắt đầu": d.startDate ?? "", "Kết thúc": d.endDate ?? "",
    "% Tiến độ": Math.round((d.progressPercent ?? 0) * 100) + "%",
    "Trạng thái": STATUS_LABEL[d.status as keyof typeof STATUS_LABEL] ?? d.status,
  }));
  const kpiRows = kpi.map((k) => ({
    "Sheet": k.sheetType, "Tổng task": k.total,
    "Tiến độ TB": Math.round((k.avgProgress ?? 0) * 100) + "%", "Số trễ": k.delayed,
  }));

  // Tên file theo mã dự án trong DB (fallback "XBoss" khi chưa seed).
  const project = await queryOne<{ code: string | null }>(`SELECT code FROM projects ORDER BY id LIMIT 1`);
  const fileTag = (project?.code ?? "XBoss").replace(/[^\w-]/g, "-");

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), "KPI");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(delayedRows.length ? delayedRows : [{ "Thông báo": "Không có công việc trễ" }]), "Công việc trễ");

  // 1 tab tracking đầy đủ cho mỗi sheet — checkbox đã tick = "x", chưa tick = "○".
  const sheetCodes = [...new Set(allTasks.map((t) => t.sheetCode))];
  for (const code of sheetCodes) {
    const tasks = allTasks.filter((t) => t.sheetCode === code);
    const taskIds = new Set(tasks.map((t) => t.taskId));
    const dims = allDims.filter((d) => taskIds.has(d.taskId));
    XLSX.utils.book_append_sheet(wb, buildTrackingTab(tasks, dims), safeTabName(code));
  }

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="XBoss-${fileTag}${onlySheet ? "-" + slug : ""}-${today}.xlsx"`,
    },
  });
}
