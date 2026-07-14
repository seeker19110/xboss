import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { query, queryOne, todayISO } from "@/lib/db";
import { STATUS_LABEL, type StatusSlug } from "@/lib/status";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

type TrackTask = {
  taskId: number;
  boqCode: string | null;
  code: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  assignee: string | null;
  wpId: number;
  wpCode: string;
  wpName: string;
  floorLabel: string | null;
  sheetCode: string;
};
type DimRow = { taskId: number; label: string; installed: number };

// Tên tab Excel: tối đa 31 ký tự, không chứa ký tự cấm.
const safeTabName = (s: string) => s.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);

// Tô màu nền/chữ ô trạng thái — bám bảng màu trạng thái dùng trong UI nhưng
// dùng tông nhạt cho nền giấy trắng của Excel (đọc rõ khi in/mở bằng Excel).
const STATUS_FILL: Record<StatusSlug, { bg: string; fg: string }> = {
  tre: { bg: "FFFEE2E2", fg: "FF991B1B" }, // đỏ
  hoan_thanh: { bg: "FFD1FAE5", fg: "FF065F46" }, // emerald
  nghiem_thu: { bg: "FFCCFBF1", fg: "FF115E59" }, // teal
  dang_thi_cong: { bg: "FFE0F2FE", fg: "FF075985" }, // sky
  chuan_bi: { bg: "FFF4F4F5", fg: "FF3F3F46" }, // zinc
};
const GROUP_FILL = "FFE4E4E7"; // nền hàng nhóm (work package) — zinc-200
const HEADER_FILL = "FF27272A"; // nền header — zinc-800

function fill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

// Style hàng header: nền đậm, chữ trắng đậm, viền dưới.
function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = fill(HEADER_FILL);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF52525B" } } };
  });
}

// Dựng tab tracking 1 sheet: hàng nhóm (work package) + hàng task, cột dimension
// theo union nhãn của sheet. Freeze header + cột mã/tên, AutoFilter, % là số thật,
// tô màu trạng thái, in đậm hàng nhóm — bám format file Excel gốc nhưng dễ dùng hơn.
function buildTrackingTab(ws: ExcelJS.Worksheet, tasks: TrackTask[], dims: DimRow[]) {
  const dimsByTask = new Map<number, Map<string, number>>();
  const dimLabels: string[] = []; // giữ thứ tự xuất hiện
  const seen = new Set<string>();
  for (const d of dims) {
    if (!dimsByTask.has(d.taskId)) dimsByTask.set(d.taskId, new Map());
    dimsByTask.get(d.taskId)!.set(d.label, d.installed);
    if (!seen.has(d.label)) {
      seen.add(d.label);
      dimLabels.push(d.label);
    }
  }

  const fixed = [
    "BOQCODE",
    "Mã",
    "Chi tiết công việc",
    "Tầng",
    "Người phụ trách",
    "Bắt đầu",
    "Kết thúc",
    "% Tiến độ",
    "Trạng thái",
  ];
  ws.columns = [
    { width: 12 },
    { width: 9 },
    { width: 42 },
    { width: 7 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    ...dimLabels.map(() => ({ width: 6 })),
  ];
  const PROGRESS_COL = 8; // cột "% Tiến độ" (1-based)
  const STATUS_COL = 9;

  const headerRow = ws.addRow([...fixed, ...dimLabels]);
  styleHeader(headerRow);

  let lastWp = 0;
  for (const t of tasks) {
    if (t.wpId !== lastWp) {
      lastWp = t.wpId;
      const gr = ws.addRow([`— ${t.wpCode}`, "", t.wpName, t.floorLabel ?? ""]);
      gr.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = fill(GROUP_FILL);
        cell.font = { bold: true };
      });
    }
    const taskDims = dimsByTask.get(t.taskId);
    const status = t.status as StatusSlug;
    const row = ws.addRow([
      t.boqCode ?? "",
      t.code,
      t.name,
      t.floorLabel ?? "",
      t.assignee ?? "",
      t.startDate ?? "",
      t.endDate ?? "",
      t.progressPercent ?? 0,
      STATUS_LABEL[status] ?? t.status,
      ...dimLabels.map((l) => {
        const v = taskDims?.get(l);
        return v === undefined ? "" : v ? "x" : "○";
      }),
    ]);
    // % là số thật (0..1) định dạng phần trăm → sort/sum/biểu đồ được trong Excel.
    const pct = row.getCell(PROGRESS_COL);
    pct.numFmt = "0%";
    pct.alignment = { horizontal: "right" };
    // Tô màu ô trạng thái theo enum.
    const style = STATUS_FILL[status];
    if (style) {
      const sc = row.getCell(STATUS_COL);
      sc.fill = fill(style.bg);
      sc.font = { color: { argb: style.fg }, bold: true };
    }
    // Dimension căn giữa cho dễ đọc.
    for (let c = fixed.length + 1; c <= fixed.length + dimLabels.length; c++) {
      row.getCell(c).alignment = { horizontal: "center" };
    }
  }

  // Đóng băng hàng header + 3 cột đầu (BOQCODE/Mã/Tên) để cuộn ngang không mất tên.
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  // Bộ lọc trên toàn bộ hàng header.
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: fixed.length + dimLabels.length },
  };
}

// GET /api/export/excel[?sheet=ogtd] → file .xlsx gồm tab "KPI" + "Công việc trễ"
// + 1 tab tracking đầy đủ cho mỗi sheet (hoặc chỉ sheet được chọn).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.export(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền export (chỉ Admin/PM)" },
      { status: 403 },
    );

  const slug = req.nextUrl.searchParams.get("sheet");
  const onlySheet = slug
    ? ((await queryOne<{ code: string }>(`SELECT code FROM sheet_types WHERE slug = ?`, slug))
        ?.code ?? null)
    : null;
  if (slug && !onlySheet)
    return NextResponse.json({ error: `Sheet không hợp lệ: ${slug}` }, { status: 400 });

  const today = todayISO();

  // Dự án đang chọn — lọc mọi tab theo dự án để tránh rò rỉ chéo dự án (đa dự án, M22+).
  // null = DB chưa có project nào → giữ hành vi không lọc (tương thích ngược).
  const projectId = await getCurrentProjectId(user);
  const projectJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const projectParam = projectId != null ? [projectId] : [];

  const delayed = await query<{
    boqCode: string | null;
    code: string;
    name: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    progressPercent: number;
    floorLabel: string | null;
    sheetType: string;
  }>(
    `SELECT t.boq_code AS "boqCode", t.code, t.name, t.status, t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS "progressPercent", wp.floor_label AS "floorLabel", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
      WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')${projectFilter}
      ORDER BY st.code, t.end_date`,
    today,
    ...projectParam,
  );

  const kpi = await query<{
    sheetType: string;
    total: number;
    avgProgress: number;
    delayed: number;
  }>(
    `SELECT st.code AS "sheetType", COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent),0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN t.end_date < ? AND t.progress_percent < 1 AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END),0) AS delayed
       FROM sheet_types st
       ${projectId != null ? "JOIN towers tw ON tw.id = st.tower_id AND tw.project_id = ?" : ""}
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      GROUP BY st.id, st.code ORDER BY st.id`,
    today,
    ...projectParam,
  );

  // Toàn bộ task theo sheet (cho các tab tracking) — thứ tự như lưới trên web.
  const sheetFilter = onlySheet ? "AND st.code = ?" : "";
  const sheetParams = onlySheet ? [onlySheet] : [];
  const allTasks = await query<TrackTask>(
    `SELECT t.id AS "taskId", t.boq_code AS "boqCode", t.code, t.name, t.status,
            t.start_date AS "startDate", t.end_date AS "endDate", t.progress_percent AS "progressPercent",
            u.name AS assignee, wp.id AS "wpId", wp.code AS "wpCode", wp.name AS "wpName",
            wp.floor_label AS "floorLabel", st.code AS "sheetCode"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id${projectJoin}
      WHERE 1=1 ${sheetFilter}${projectFilter}
      ORDER BY st.id, wp.sort_order, wp.id, t.sort_order, t.id`,
    ...sheetParams,
    ...projectParam,
  );

  const allDims = await query<DimRow>(
    `SELECT d.task_id AS "taskId", d.dimension_label AS label, d.installed
       FROM progress_dimensions d
       JOIN tasks t ON d.task_id = t.id
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
      WHERE 1=1 ${sheetFilter}${projectFilter}
      ORDER BY d.task_id, d.sort_order, d.id`,
    ...sheetParams,
    ...projectParam,
  );

  const wb = new ExcelJS.Workbook();

  // Tab KPI: % tiến độ TB là số thật định dạng phần trăm.
  const kpiWs = wb.addWorksheet("KPI");
  kpiWs.columns = [{ width: 18 }, { width: 12 }, { width: 14 }, { width: 10 }];
  styleHeader(kpiWs.addRow(["Sheet", "Tổng task", "Tiến độ TB", "Số trễ"]));
  for (const k of kpi) {
    const row = kpiWs.addRow([k.sheetType, k.total, k.avgProgress ?? 0, k.delayed]);
    row.getCell(3).numFmt = "0%";
  }
  kpiWs.views = [{ state: "frozen", ySplit: 1 }];

  // Tab Công việc trễ.
  const delWs = wb.addWorksheet("Công việc trễ");
  delWs.columns = [
    { width: 12 },
    { width: 9 },
    { width: 42 },
    { width: 8 },
    { width: 7 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
  ];
  styleHeader(
    delWs.addRow([
      "BOQCODE",
      "Mã",
      "Chi tiết công việc",
      "Sheet",
      "Tầng",
      "Bắt đầu",
      "Kết thúc",
      "% Tiến độ",
      "Trạng thái",
    ]),
  );
  if (delayed.length) {
    for (const d of delayed) {
      const status = d.status as StatusSlug;
      const row = delWs.addRow([
        d.boqCode ?? "",
        d.code,
        d.name,
        d.sheetType,
        d.floorLabel ?? "",
        d.startDate ?? "",
        d.endDate ?? "",
        d.progressPercent ?? 0,
        STATUS_LABEL[status] ?? d.status,
      ]);
      row.getCell(8).numFmt = "0%";
      const style = STATUS_FILL[status];
      if (style) {
        const sc = row.getCell(9);
        sc.fill = fill(style.bg);
        sc.font = { color: { argb: style.fg }, bold: true };
      }
    }
    delWs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
  } else {
    delWs.addRow(["Không có công việc trễ"]);
  }
  delWs.views = [{ state: "frozen", ySplit: 1 }];

  // 1 tab tracking đầy đủ cho mỗi sheet — checkbox đã tick = "x", chưa tick = "○".
  const sheetCodes = [...new Set(allTasks.map((t) => t.sheetCode))];
  for (const code of sheetCodes) {
    const tasks = allTasks.filter((t) => t.sheetCode === code);
    const taskIds = new Set(tasks.map((t) => t.taskId));
    const dims = allDims.filter((d) => taskIds.has(d.taskId));
    buildTrackingTab(wb.addWorksheet(safeTabName(code)), tasks, dims);
  }

  // Tên file theo mã dự án trong DB (fallback "XBoss" khi chưa seed).
  const project = await queryOne<{ code: string | null }>(
    `SELECT code FROM projects ORDER BY id LIMIT 1`,
  );
  const fileTag = (project?.code ?? "XBoss").replace(/[^\w-]/g, "-");

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="XBoss-${fileTag}${onlySheet ? "-" + slug : ""}-${today}.xlsx"`,
    },
  });
}
