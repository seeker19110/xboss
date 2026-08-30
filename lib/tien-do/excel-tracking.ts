// lib/excel-tracking.ts — Các hàm & hằng số dùng chung để dựng/xuất Excel cho Tiến độ/Tracking
import ExcelJS from "exceljs";
import { STATUS_LABEL, type StatusSlug } from "@/lib/tien-do/status";

export type TrackTask = {
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

export type DimRow = { taskId: number; label: string; installed: number };

// Tên tab Excel: tối đa 31 ký tự, không chứa ký tự cấm.
export const safeTabName = (s: string) => s.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);

// Tô màu nền/chữ ô trạng thái — bám bảng màu trạng thái dùng trong UI nhưng
// dùng tông nhạt cho nền giấy trắng của Excel (đọc rõ khi in/mở bằng Excel).
export const STATUS_FILL: Record<StatusSlug, { bg: string; fg: string }> = {
  tre: { bg: "FFFEE2E2", fg: "FF991B1B" }, // đỏ
  hoan_thanh: { bg: "FFD1FAE5", fg: "FF065F46" }, // emerald
  nghiem_thu: { bg: "FFCCFBF1", fg: "FF115E59" }, // teal
  dang_thi_cong: { bg: "FFE0F2FE", fg: "FF075985" }, // sky
  chuan_bi: { bg: "FFF4F4F5", fg: "FF3F3F46" }, // zinc
};
export const GROUP_FILL = "FFE4E4E7"; // nền hàng nhóm (work package) — zinc-200
export const HEADER_FILL = "FF27272A"; // nền header — zinc-800

export function fill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

// Style hàng header: nền đậm, chữ trắng đậm, viền dưới.
export function styleHeader(row: ExcelJS.Row) {
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
export function buildTrackingTab(ws: ExcelJS.Worksheet, tasks: TrackTask[], dims: DimRow[]) {
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
