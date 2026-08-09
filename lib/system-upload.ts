// lib/system-upload.ts — Hàm nghiệp vụ chính cho M64
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { query, queryOne, withTransaction } from "./db";
import { recomputeTask } from "./recompute";
import {
  buildTrackingTab,
  safeTabName,
  styleHeader,
  type TrackTask,
  type DimRow,
} from "./excel-tracking";
import { toISO } from "./import";

export type UploadKind = "ke_hoach" | "tracking";
export type UploadResult = {
  rowCount: number;
  matched: number;
  unmatched: number;
  warnings: string[];
};

function isChecked(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string")
    return ["x", "1", "true", "✓", "đã lắp"].includes(v.trim().toLowerCase());
  return false;
}

/**
 * Dựng workbook mẫu "kế hoạch" (1 tab): mỗi dòng là 1 task thuộc hệ `systemId` (lọc theo `projectId` nếu có).
 * Cột: BOQCODE | Sheet | Nhóm | Mã | Tên công việc | Ngày bắt đầu KH | Ngày kết thúc KH
 */
export async function buildPlanTemplate(
  systemId: number,
  projectId?: number | null,
): Promise<ExcelJS.Workbook> {
  const projectJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const projectParam = projectId != null ? [projectId] : [];

  const tasks = await query<{
    boqCode: string | null;
    sheetName: string;
    wpName: string;
    code: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
  }>(
    `SELECT t.boq_code AS "boqCode", st.name AS "sheetName", wp.name AS "wpName",
            t.code, t.name, t.start_date AS "startDate", t.end_date AS "endDate"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
      WHERE st.system_id = ?${projectFilter}
      ORDER BY st.sort_order, st.id, wp.sort_order, wp.id, t.sort_order, t.id`,
    [systemId, ...projectParam],
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kế hoạch");

  ws.columns = [
    { width: 15 }, // BOQCODE
    { width: 15 }, // Sheet
    { width: 25 }, // Nhóm
    { width: 10 }, // Mã
    { width: 45 }, // Tên công việc
    { width: 18 }, // Ngày bắt đầu KH
    { width: 18 }, // Ngày kết thúc KH
  ];

  const headerRow = ws.addRow([
    "BOQCODE",
    "Sheet",
    "Nhóm",
    "Mã",
    "Tên công việc",
    "Ngày bắt đầu KH",
    "Ngày kết thúc KH",
  ]);
  styleHeader(headerRow);

  for (const t of tasks) {
    const hasBoq = !!t.boqCode;
    const boq = t.boqCode ?? "";
    const name = hasBoq ? t.name : `${t.name} (không có BOQCODE — không thể khớp khi upload)`;
    ws.addRow([boq, t.sheetName, t.wpName, t.code, name, t.startDate ?? "", t.endDate ?? ""]);
  }

  // Đóng băng hàng tiêu đề
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };

  return wb;
}

/**
 * Dựng workbook mẫu "tracking": gọi buildTrackingTab từ lib/excel-tracking.ts.
 */
export async function buildTrackingTemplate(
  systemId: number,
  projectId?: number | null,
): Promise<ExcelJS.Workbook> {
  const projectJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const projectParam = projectId != null ? [projectId] : [];

  const allTasks = await query<TrackTask>(
    `SELECT t.id AS "taskId", t.boq_code AS "boqCode", t.code, t.name, t.status,
            t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS "progressPercent", u.name AS assignee,
            wp.id AS "wpId", wp.code AS "wpCode", wp.name AS "wpName",
            wp.floor_label AS "floorLabel", st.code AS "sheetCode"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id${projectJoin}
      WHERE st.system_id = ?${projectFilter}
      ORDER BY st.sort_order, st.id, wp.sort_order, wp.id, t.sort_order, t.id`,
    [systemId, ...projectParam],
  );

  const allDims = await query<DimRow>(
    `SELECT d.task_id AS "taskId", d.dimension_label AS label, d.installed
       FROM progress_dimensions d
       JOIN tasks t ON d.task_id = t.id
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
      WHERE st.system_id = ?${projectFilter}
      ORDER BY d.task_id, d.sort_order, d.id`,
    [systemId, ...projectParam],
  );

  const wb = new ExcelJS.Workbook();
  const sheetCodes = [...new Set(allTasks.map((t) => t.sheetCode))];

  for (const code of sheetCodes) {
    const tasks = allTasks.filter((t) => t.sheetCode === code);
    const taskIds = new Set(tasks.map((t) => t.taskId));
    const dims = allDims.filter((d) => taskIds.has(d.taskId));
    buildTrackingTab(wb.addWorksheet(safeTabName(code)), tasks, dims);
  }

  // Nếu không có sheet nào, tạo 1 sheet trống
  if (sheetCodes.length === 0) {
    wb.addWorksheet("Trống");
  }

  return wb;
}

/**
 * Đọc file kế hoạch tải lên, cập nhật ngày, bọc transaction và gọi recomputeTask.
 */
export async function parsePlanUpload(
  systemId: number,
  projectId: number | null,
  buffer: Buffer,
  changedBy: string,
): Promise<UploadResult> {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  if (wb.SheetNames.length === 0) {
    throw new Error("File rỗng hoặc không có worksheet");
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const sheetData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (sheetData.length === 0) {
    throw new Error("File rỗng");
  }

  const headers = (sheetData[0] as unknown[]).map((h) => String(h || "").trim());
  const boqIdx = headers.indexOf("BOQCODE");
  const startIdx = headers.indexOf("Ngày bắt đầu KH");
  const endIdx = headers.indexOf("Ngày kết thúc KH");

  if (boqIdx === -1) throw new Error("File không đúng mẫu — thiếu cột BOQCODE");
  if (startIdx === -1) throw new Error("File không đúng mẫu — thiếu cột Ngày bắt đầu KH");
  if (endIdx === -1) throw new Error("File không đúng mẫu — thiếu cột Ngày kết thúc KH");

  const projectJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const projectParam = projectId != null ? [projectId] : [];

  let matched = 0;
  let unmatched = 0;
  const warnings: string[] = [];

  await withTransaction(async () => {
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i] as unknown[];
      if (!row || row.length === 0) continue;

      const boqCode = String(row[boqIdx] || "").trim();
      if (!boqCode) {
        unmatched++;
        warnings.push(`Dòng ${i + 1}: thiếu BOQCODE, bỏ qua`);
        continue;
      }

      // Tìm các task tương ứng thuộc hệ + dự án đang chọn
      const queryStr = `
        SELECT t.id
          FROM tasks t
          JOIN work_packages wp ON t.package_id = wp.id
          JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
         WHERE t.boq_code = ? AND st.system_id = ?${projectFilter}
      `;
      const dbTasks = await query<{ id: number }>(queryStr, [boqCode, systemId, ...projectParam]);

      if (dbTasks.length === 0) {
        unmatched++;
        warnings.push(`Dòng ${i + 1}: BOQCODE "${boqCode}" không thuộc hệ này hoặc không tồn tại`);
        continue;
      }

      const rawStart = row[startIdx];
      const rawEnd = row[endIdx];
      const startDate = toISO(rawStart);
      const endDate = toISO(rawEnd);

      const isStartInvalid =
        rawStart !== undefined &&
        rawStart !== null &&
        String(rawStart).trim() !== "" &&
        startDate === null;
      const isEndInvalid =
        rawEnd !== undefined && rawEnd !== null && String(rawEnd).trim() !== "" && endDate === null;

      if (isStartInvalid || isEndInvalid) {
        unmatched++;
        warnings.push(`Dòng ${i + 1}: Định dạng ngày bắt đầu hoặc ngày kết thúc không hợp lệ`);
        continue;
      }

      if (startDate && endDate && startDate > endDate) {
        unmatched++;
        warnings.push(`Dòng ${i + 1}: Ngày bắt đầu sau ngày kết thúc`);
        continue;
      }

      // Cập nhật ngày cho các task và recompute
      for (const t of dbTasks) {
        await query(`UPDATE tasks SET start_date = ?, end_date = ? WHERE id = ?`, [
          startDate,
          endDate,
          t.id,
        ]);
        await recomputeTask(t.id, changedBy);
      }
      matched += dbTasks.length;
    }
  });

  return { rowCount: sheetData.length - 1, matched, unmatched, warnings };
}

/**
 * Đọc file tracking tải lên, cập nhật ô checkbox dimension, bọc transaction và gọi recomputeTask.
 */
export async function parseTrackingUpload(
  systemId: number,
  projectId: number | null,
  buffer: Buffer,
  changedBy: string,
): Promise<UploadResult> {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  if (wb.SheetNames.length === 0) {
    throw new Error("File rỗng hoặc không có worksheet");
  }

  const projectJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const projectParam = projectId != null ? [projectId] : [];

  let matched = 0;
  let unmatched = 0;
  let totalRows = 0;
  const warnings: string[] = [];

  await withTransaction(async () => {
    for (const sheetName of wb.SheetNames) {
      // Tìm sheet_type khớp tên code qua safeTabName
      const sheetTypes = await query<{ id: number; code: string }>(
        `SELECT st.id, st.code
           FROM sheet_types st${projectJoin}
          WHERE st.system_id = ?${projectFilter}`,
        [systemId, ...projectParam],
      );

      const matchedSheet = sheetTypes.find((st) => safeTabName(st.code) === sheetName);
      if (!matchedSheet) {
        warnings.push(`Tab "${sheetName}" không khớp với sheet nào trong hệ này, bỏ qua`);
        continue;
      }

      const ws = wb.Sheets[sheetName];
      const sheetData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      if (sheetData.length === 0) continue;

      const headers = (sheetData[0] as unknown[]).map((h) => String(h || "").trim());
      if (headers[0] !== "BOQCODE") {
        throw new Error(`Tab "${sheetName}" không đúng mẫu — thiếu cột BOQCODE ở cột đầu tiên`);
      }

      totalRows += sheetData.length - 1;
      const dimLabels = headers.slice(9);

      for (let rowIndex = 1; rowIndex < sheetData.length; rowIndex++) {
        const row = sheetData[rowIndex] as unknown[];
        if (!row || row.length === 0) continue;

        const boqCode = String(row[0] || "").trim();
        const taskCode = String(row[1] || "").trim();

        // Bỏ qua dòng trống hoặc dòng nhóm (work package)
        if (!boqCode || boqCode.startsWith("—") || !taskCode) continue;

        // Tìm task trong DB
        const dbTask = await queryOne<{ id: number }>(
          `SELECT t.id FROM tasks t
             JOIN work_packages wp ON t.package_id = wp.id
            WHERE t.boq_code = ? AND wp.sheet_type_id = ?`,
          [boqCode, matchedSheet.id],
        );

        if (!dbTask) {
          unmatched++;
          warnings.push(
            `Dòng ${rowIndex + 1} tab "${sheetName}": BOQCODE "${boqCode}" không thuộc sheet này hoặc không tồn tại`,
          );
          continue;
        }

        // Lấy tất cả dimensions của task hiện tại
        const dbDims = await query<{ id: number; label: string }>(
          `SELECT id, dimension_label AS label FROM progress_dimensions WHERE task_id = ?`,
          [dbTask.id],
        );
        const dimsByLabel = new Map(dbDims.map((d) => [d.label, d.id]));

        // Cập nhật từng ô dimension
        for (let c = 9; c < row.length; c++) {
          const label = dimLabels[c - 9];
          if (!label) continue;

          const rawVal = row[c];
          const isInstalled = isChecked(rawVal);
          const dimId = dimsByLabel.get(label);

          if (dimId === undefined) {
            warnings.push(
              `Dòng ${rowIndex + 1} tab "${sheetName}": nhãn "${label}" không khớp với dimension nào của task, bỏ qua`,
            );
            continue;
          }

          const installedVal = isInstalled ? 1 : 0;
          await query(`UPDATE progress_dimensions SET installed = ?, value = ? WHERE id = ?`, [
            installedVal,
            installedVal,
            dimId,
          ]);
        }

        // recompute cho task (nó tự cascade cập nhật work package progress)
        await recomputeTask(dbTask.id, changedBy);
        matched++;
      }
    }
  });

  return { rowCount: totalRows, matched, unmatched, warnings };
}
