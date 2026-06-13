import * as XLSX from "xlsx";
import { run, queryOne, insertId } from "@/lib/db";
import { slugFromCode, toSlug } from "@/lib/sheets";
import { toStatusSlug, parseProgress } from "@/lib/status";
import { deriveStatus, recomputePackage } from "@/lib/recompute";
import { makeBoq } from "@/lib/boq";

export const SHEET_MAP: Record<string, { code: string; name: string; responsible?: string }> = {
  "TRACKING OGTĐ": { code: "OGTĐ", name: "Ống gió trục đứng", responsible: "Mr. Thừa" },
  "TRACKING OGHL": { code: "OGHL", name: "Ống gió hành lang", responsible: "Mr. Thừa" },
  "TRACKING OGCH": { code: "OGCH", name: "Ống gió căn hộ", responsible: "Mr. Thừa" },
  "TRACKING ODNN Zone 1": { code: "ODNN Zone 1", name: "Ống đồng nước ngưng Zone 1", responsible: "Mr. Hải" },
  "TRACKING ODNN Zone 2": { code: "ODNN Zone 2", name: "Ống đồng nước ngưng Zone 2", responsible: "Mr. Thắng" },
};

const HEADER_ROW = 2;   // dòng tiêu đề (index 2 = dòng 3)
const DATA_START = 5;   // dữ liệu bắt đầu từ index 5
const DIM_START = 9;    // cột dimension đầu tiên

export function toISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  let d: Date;
  if (v instanceof Date) d = v;
  else if (typeof v === "number" && !isNaN(v)) d = new Date(Math.round((v - 25569) * 86400 * 1000));
  else d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const intStt = (s: string) => /^\d+$/.test(s);
const floorOf = (name: string) => name.match(/(\d+F)\b/)?.[1] ?? null;

// ô checkbox đã hoàn thành?
function isChecked(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") return ["x", "1", "true", "✓", "đã lắp"].includes(v.trim().toLowerCase());
  return false;
}
function cleanLabel(v: unknown): string | null {
  if (v == null || String(v).trim() === "") return null;
  return String(v).replace(/\n/g, " ").replace(/\s+/g, " ").trim().replace(/^\d+\s+/, "");
}

type DimDef = { col: number; label: string; index: number };

// Lấy URL hợp lệ từ ô Excel (cột Link Bản vẽ BBNT).
function urlOf(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

// Đọc tiêu đề → danh sách cột dimension + vị trí cột Link (xử lý header gộp ô như OGHL).
function parseDimDefs(rows: unknown[][]): { defs: DimDef[]; linkCol: number } {
  const header = rows[HEADER_ROW] ?? [];
  let linkCol = -1;
  for (let c = DIM_START; c < header.length; c++) {
    if (header[c] != null && String(header[c]).toLowerCase().includes("link")) { linkCol = c; break; }
  }
  const end = linkCol === -1 ? header.length : linkCol;
  const defs: DimDef[] = [];
  let group = "", sub = 0, idx = 0;
  for (let c = DIM_START; c < end; c++) {
    const cleaned = cleanLabel(header[c]);
    let label: string;
    if (cleaned) { group = cleaned; sub = 1; label = group; }
    else { sub++; label = group ? `${group} (${sub})` : `Cột ${c}`; }
    defs.push({ col: c, label, index: ++idx });
  }
  return { defs, linkCol };
}

export type ImportStats = {
  totalRows: number; packages: number; tasks: number; dimensions: number; errors: string[]; sheets: string[];
};

// ===== Preview (dry-run): phân tích file, KHÔNG ghi DB =====
export type SheetPreview = {
  sheetName: string; code: string; label: string;
  packages: number; tasks: number; dimColumns: number;
  warnings: string[];
};
export type PreviewResult = {
  sheets: SheetPreview[];
  unknownSheets: string[];   // sheet trong file không nằm trong SHEET_MAP (bỏ qua khi import)
  totalPackages: number; totalTasks: number; totalWarnings: number;
};

export function analyzeWorkbook(workbook: XLSX.WorkBook): PreviewResult {
  const result: PreviewResult = { sheets: [], unknownSheets: [], totalPackages: 0, totalTasks: 0, totalWarnings: 0 };

  for (const sheetName of workbook.SheetNames) {
    const info = SHEET_MAP[sheetName];
    if (!info) {
      if (sheetName.toUpperCase().includes("TRACKING")) result.unknownSheets.push(sheetName);
      continue;
    }

    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
    const { defs: dimDefs } = parseDimDefs(rows);
    const sp: SheetPreview = { sheetName, code: info.code, label: info.name, packages: 0, tasks: 0, dimColumns: dimDefs.length, warnings: [] };

    let hasPkg = false;
    for (let i = DATA_START; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const code = String(row[0] ?? "").trim();
      const stt = String(row[1] ?? "").trim();
      const name = String(row[2] ?? "").trim();
      if (!name) continue;
      const isTopGroup = /^[A-Z]+$/.test(stt) && !/^[A-Z]+\d/.test(code);
      if (isTopGroup) continue;

      const startDate = toISO(row[4]);
      const endDate = toISO(row[6]);
      if (row[4] != null && row[4] !== "" && !startDate)
        sp.warnings.push(`Dòng ${i + 1}: ngày bắt đầu không đọc được ("${String(row[4]).slice(0, 20)}")`);
      if (row[6] != null && row[6] !== "" && !endDate)
        sp.warnings.push(`Dòng ${i + 1}: ngày kết thúc không đọc được ("${String(row[6]).slice(0, 20)}")`);
      if (startDate && endDate && startDate > endDate)
        sp.warnings.push(`Dòng ${i + 1}: ngày bắt đầu (${startDate}) sau ngày kết thúc (${endDate})`);

      const isPkg = !!code && !code.includes(",") && intStt(stt);
      if (isPkg) { sp.packages++; hasPkg = true; }
      else if (hasPkg) sp.tasks++;
      else sp.warnings.push(`Dòng ${i + 1}: task "${name.slice(0, 30)}" đứng trước nhóm đầu tiên — sẽ bị bỏ qua`);
    }

    if (dimDefs.length === 0)
      sp.warnings.push(`Không nhận diện được cột lưới checkbox — task sẽ chỉ có % tổng`);

    result.sheets.push(sp);
    result.totalPackages += sp.packages;
    result.totalTasks += sp.tasks;
    result.totalWarnings += sp.warnings.length;
  }

  return result;
}

type Row = { id: number };

async function getOrCreateProject(): Promise<number> {
  const p = await queryOne<Row>(`SELECT id FROM projects WHERE name = ?`, "TT AVIO Tháp A");
  if (p) return p.id;
  return insertId(`INSERT INTO projects (name, code) VALUES (?, ?)`, "TT AVIO Tháp A", "AVIO-A");
}
async function getOrCreateTower(projectId: number): Promise<number> {
  const t = await queryOne<Row>(`SELECT id FROM towers WHERE project_id = ?`, projectId);
  if (t) return t.id;
  return insertId(`INSERT INTO towers (project_id, name) VALUES (?, ?)`, projectId, "Tháp A");
}

export async function importWorkbook(workbook: XLSX.WorkBook): Promise<ImportStats> {
  const stats: ImportStats = { totalRows: 0, packages: 0, tasks: 0, dimensions: 0, errors: [], sheets: [] };

  const projectId = await getOrCreateProject();
  const towerId = await getOrCreateTower(projectId);
  const touchedPkgs = new Set<number>();

  for (const sheetName of workbook.SheetNames) {
    const info = SHEET_MAP[sheetName];
    if (!info) continue;
    stats.sheets.push(sheetName);

    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
    const { defs: dimDefs, linkCol } = parseDimDefs(rows);

    let st = await queryOne<Row>(`SELECT id FROM sheet_types WHERE tower_id = ? AND code = ?`, towerId, info.code);
    if (!st) {
      st = { id: await insertId(`INSERT INTO sheet_types (tower_id, code, name, responsible, slug) VALUES (?, ?, ?, ?, ?)`,
        towerId, info.code, info.name, info.responsible ?? null, slugFromCode(info.code) ?? toSlug(info.code)) };
    }

    let currentPkgId: number | null = null;
    let currentPkgCode = "";

    for (let i = DATA_START; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const code = String(row[0] ?? "").trim();
      const stt = String(row[1] ?? "").trim();
      const name = String(row[2] ?? "").trim();
      if (!name) continue;

      const isTopGroup = /^[A-Z]+$/.test(stt) && !/^[A-Z]+\d/.test(code);
      if (isTopGroup) continue;

      stats.totalRows++;
      const startDate = toISO(row[4]);
      const durationDays = row[5] != null ? parseInt(String(row[5])) || null : null;
      const endDate = toISO(row[6]);
      const ghiChu = toStatusSlug(row[3]);

      try {
        const isPkg = !!code && !code.includes(",") && intStt(stt);

        const drawingUrl = linkCol >= 0 ? urlOf(row[linkCol]) : null;

        if (isPkg) {
          const wpCode = code;
          const existing = await queryOne<Row>(`SELECT id FROM work_packages WHERE sheet_type_id = ? AND code = ?`, st.id, wpCode);
          if (!existing) {
            currentPkgId = await insertId(
              `INSERT INTO work_packages (boq_code, sheet_type_id, code, seq_no, floor_label, name, start_date, end_date, duration_days, status, progress, drawing_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
              makeBoq(info.code, wpCode), st.id, wpCode, stt, floorOf(name), name, startDate, endDate, durationDays, ghiChu, drawingUrl);
            stats.packages++;
          } else {
            // Giữ nguyên boq_code (người dùng có thể đã sửa tay).
            await run(`UPDATE work_packages SET start_date = ?, end_date = ?, duration_days = ?, drawing_url = COALESCE(?, drawing_url) WHERE id = ?`,
              startDate, endDate, durationDays, drawingUrl, existing.id);
            currentPkgId = existing.id;
          }
          currentPkgCode = wpCode;
          touchedPkgs.add(currentPkgId);
        } else if (currentPkgId) {
          // Hàng task. Sheet có cột dimension thì MỌI task đều có lưới checkbox —
          // ô trống nghĩa là chưa lắp, không phải "không có lưới".
          const hasGrid = dimDefs.length > 0;
          const taskCode = code || `${currentPkgCode},${stt || "r" + i}`;

          let progress = parseProgress(row[7]);
          if (hasGrid) {
            const done = dimDefs.filter((d) => isChecked(row[d.col])).length;
            progress = Math.round((done / dimDefs.length) * 100) / 100;
          }
          const status = deriveStatus(progress, endDate, ghiChu);

          let taskId: number;
          const existing = await queryOne<Row>(`SELECT id FROM tasks WHERE package_id = ? AND code = ?`, currentPkgId, taskCode);
          if (!existing) {
            taskId = await insertId(
              `INSERT INTO tasks (boq_code, package_id, code, seq_no, name, note, status, start_date, end_date, duration_days, progress_percent, drawing_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              makeBoq(info.code, taskCode), currentPkgId, taskCode, stt || null, name, row[3] != null ? String(row[3]) : null,
              status, startDate, endDate, durationDays, progress, drawingUrl);
            stats.tasks++;
          } else {
            taskId = existing.id;
            // Giữ nguyên boq_code (người dùng có thể đã sửa tay).
            await run(`UPDATE tasks SET status = ?, progress_percent = ?, start_date = ?, end_date = ?, duration_days = ?, drawing_url = COALESCE(?, drawing_url) WHERE id = ?`,
              status, progress, startDate, endDate, durationDays, drawingUrl, taskId);
            await run(`DELETE FROM progress_dimensions WHERE task_id = ?`, taskId);
          }

          if (hasGrid) {
            for (const d of dimDefs) {
              const checked = isChecked(row[d.col]) ? 1 : 0;
              await run(`INSERT INTO progress_dimensions (task_id, dimension_label, installed, value) VALUES (?, ?, ?, ?)`,
                taskId, d.label, checked, checked);
              stats.dimensions++;
            }
          }
        }
      } catch (err) {
        stats.errors.push(`Dòng ${i + 1} (${sheetName}): ${(err as Error).message}`);
      }
    }
  }

  // Tính lại % cho từng work package = trung bình các sub-task.
  for (const pkgId of touchedPkgs) await recomputePackage(pkgId);

  return stats;
}
