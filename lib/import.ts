import * as XLSX from "xlsx";
import { run, queryOne, insertId } from "@/lib/db";
import { slugFromCode, toSlug } from "@/lib/sheets";
import { toStatusSlug, parseProgress } from "@/lib/status";
import { deriveStatus, progressFromChecks, recomputePackage } from "@/lib/recompute";
import { makeBoq } from "@/lib/boq";

export const SHEET_MAP: Record<string, { code: string; name: string; responsible?: string }> = {
  "TRACKING OGTĐ": { code: "OGTĐ", name: "Ống gió trục đứng", responsible: "Mr. Thừa" },
  "TRACKING OGHL": { code: "OGHL", name: "Ống gió hành lang", responsible: "Mr. Thừa" },
  "TRACKING OGCH": { code: "OGCH", name: "Ống gió căn hộ", responsible: "Mr. Thừa" },
  "TRACKING ODNN Zone 1": {
    code: "ODNN Zone 1",
    name: "Ống đồng nước ngưng Zone 1",
    responsible: "Mr. Hải",
  },
  "TRACKING ODNN Zone 2": {
    code: "ODNN Zone 2",
    name: "Ống đồng nước ngưng Zone 2",
    responsible: "Mr. Thắng",
  },
};

const HEADER_ROW = 2; // dòng tiêu đề (index 2 = dòng 3)
const DATA_START = 5; // dữ liệu bắt đầu từ index 5
const DIM_START = 9; // cột dimension đầu tiên
const MAX_MISMATCH_LISTED = 50; // số dòng lệch % được liệt kê chi tiết mỗi sheet (xem preview)

// Ngày ISO theo lịch ĐỊA PHƯƠNG của process (không quy đổi qua UTC).
const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Chuỗi ngày tự mang múi giờ: PHẢI có phần giờ đứng trước Z / ±hh:mm / ±hhmm. Bắt buộc
// có giờ vì nếu chỉ khớp đuôi "±dddd" thì ngày kiểu "1-2-2026" cũng lọt (đuôi "-2026"),
// bị hiểu nhầm là có offset rồi quy đổi qua UTC → lệch 1 ngày ở múi giờ dương.
const HAS_TZ = /\d:\d{2}(:\d{2})?(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Ô ngày trong Excel → chuỗi ISO 'YYYY-MM-DD' (cột DATE của Postgres giữ nguyên chuỗi).
 *
 * Cách lấy phần ngày phải khớp cách giá trị được dựng, nếu không sẽ lệch 1 ngày:
 *  - `Date`: đường import THẬT đọc file bằng `cellDates: true` (xem app/api/import/excel
 *    /route.ts và scripts/seed.ts), SheetJS dựng Date theo giờ ĐỊA PHƯƠNG (0h local).
 *    Quy đổi qua `toISOString()` sẽ lùi 1 ngày ở mọi múi giờ dương — gồm chính giờ VN
 *    (UTC+7): toàn bộ ngày BĐ/KT sớm 1 ngày → trạng thái "trễ", S-curve, lookahead đều sai.
 *  - số serial Excel: quy ước mốc 1899-12-30 tính bằng UTC → lấy phần ngày theo UTC.
 *  - chuỗi: 'YYYY-MM-DD' giữ nguyên; chuỗi có Z/offset lấy theo UTC; còn lại `Date` parse
 *    theo giờ địa phương nên lấy theo giờ địa phương.
 */
export function toISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : localISO(v);
  if (typeof v === "number" && !isNaN(v)) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (ISO_DATE.test(s)) {
    // Ép 0h UTC rồi lấy lại phần ngày: giữ nguyên ngày hợp lệ, chuẩn hoá ngày tràn
    // (vd '2026-02-30' → '2026-03-02') như trước, không đẩy chuỗi lỗi xuống cột DATE.
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return HAS_TZ.test(s) ? d.toISOString().slice(0, 10) : localISO(d);
}

const intStt = (s: string) => /^\d+$/.test(s);
const floorOf = (name: string) => name.match(/(\d+F)\b/)?.[1] ?? null;

// Ô checkbox đã hoàn thành? Đây là điểm quyết định DUY NHẤT biến ô lưới Excel thành %
// tiến độ — export để test phủ hết các biến thể giá trị mà file thật có thể chứa (file
// gốc dùng boolean, file dán-giá-trị dùng "x"/"✓"/số).
export function isChecked(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string")
    return ["x", "1", "true", "✓", "đã lắp"].includes(v.trim().toLowerCase());
  return false;
}
function cleanLabel(v: unknown): string | null {
  if (v == null || String(v).trim() === "") return null;
  return String(v)
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\d+\s+/, "");
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
    if (header[c] != null && String(header[c]).toLowerCase().includes("link")) {
      linkCol = c;
      break;
    }
  }
  const end = linkCol === -1 ? header.length : linkCol;
  const defs: DimDef[] = [];
  let group = "",
    sub = 0,
    idx = 0;
  for (let c = DIM_START; c < end; c++) {
    const cleaned = cleanLabel(header[c]);
    let label: string;
    if (cleaned) {
      group = cleaned;
      sub = 1;
      label = group;
    } else {
      sub++;
      label = group ? `${group} (${sub})` : `Cột ${c}`;
    }
    defs.push({ col: c, label, index: ++idx });
  }
  return { defs, linkCol };
}

export type ImportStats = {
  totalRows: number;
  packages: number;
  tasks: number;
  dimensions: number;
  errors: string[];
  /** Chênh lệch phát hiện được giữa % XBoss tính và % ghi sẵn trong file (xem ImportOptions). */
  warnings: string[];
  sheets: string[];
};

/**
 * Mẫu số khi quy lưới checkbox → %:
 *  - `"columns"` (MẶC ĐỊNH, giữ nguyên hành vi cũ): chia cho TỔNG SỐ CỘT dimension của
 *    sheet. Đúng với 4/5 sheet trong file gốc — ở đó công thức Excel cũng chia cứng theo
 *    số cột (vd `COUNTIF(J8:AE8,TRUE)/22`) kể cả khi hàng bỏ trống nhiều ô.
 *  - `"row-nonempty"`: chia cho SỐ Ô CÓ DỮ LIỆU trên đúng hàng đó, và chỉ tạo ô lưới cho
 *    các cột đó (ô trống = hạng mục KHÔNG áp dụng cho hàng này, không phải "chưa lắp").
 *    Đúng với các hàng kiểu OGHL — nơi Excel chia `/4` trong khi sheet có 16 cột.
 *
 * KHÔNG có lựa chọn nào đúng cho mọi sheet: chọn sai chiều nào cũng làm lệch % (một chiều
 * báo thiếu, chiều kia báo thừa), nên mặc định giữ nguyên hành vi cũ và mọi hàng có chênh
 * lệch đều được liệt kê trong `warnings` để người dùng tự quyết.
 */
export type ImportOptions = {
  dimDenominator?: "columns" | "row-nonempty";
};

// Ô lưới có dữ liệu (đã tick hoặc bỏ tick) — khác với ô rỗng hoàn toàn.
const hasCellValue = (v: unknown) => v != null && String(v).trim() !== "";

// Các cột lưới tính vào mẫu số của MỘT hàng, theo lựa chọn mẫu số.
function activeDims(defs: DimDef[], row: unknown[], mode: "columns" | "row-nonempty"): DimDef[] {
  if (mode === "columns") return defs;
  const active = defs.filter((d) => hasCellValue(row[d.col]));
  // Hàng trống trơn (chưa ai nhập gì) → giữ nguyên lưới đầy đủ, % = 0.
  return active.length > 0 ? active : defs;
}

// Chênh lệch giữa % XBoss tính từ lưới và % ghi sẵn ở cột "% Tiến độ" của file (nếu là số).
// Đây là đối chiếu với chính con số của người dùng, không phải suy đoán.
function progressMismatch(row: unknown[], computed: number): number | null {
  const own = row[7];
  if (typeof own !== "number" || isNaN(own)) return null;
  const ownPct = parseProgress(own);
  return Math.abs(ownPct - computed) > 0.015 ? ownPct : null;
}

/**
 * Phân loại một hàng dữ liệu của sheet tracking. Dùng CHUNG cho mọi thứ đọc file gốc
 * (import, xem trước, script backfill) — phân loại lệch nhau giữa các nơi là tự tạo ra
 * sai lệch dữ liệu, đúng lớp lỗi mà đợt rà 2026-08-12 đi tìm.
 *
 *  - `skip`: hàng trống tên, hoặc đề mục nhóm lớn (STT toàn chữ cái, mã không dạng chữ+số).
 *  - `pkg`: hàng nhóm (work package) — có mã, mã không chứa dấu phẩy, STT là số nguyên.
 *  - `task`: hàng sub-task; `code` là mã hàng, hoặc mã tự sinh từ nhóm cha khi ô mã trống.
 */
export type RowKind =
  | { kind: "skip" }
  | { kind: "pkg"; code: string; stt: string; name: string }
  | { kind: "task"; code: string; stt: string; name: string };

export function classifyRow(row: unknown[], rowIndex: number, currentPkgCode: string): RowKind {
  const code = String(row[0] ?? "").trim();
  const stt = String(row[1] ?? "").trim();
  const name = String(row[2] ?? "").trim();
  if (!name) return { kind: "skip" };
  if (/^[A-Z]+$/.test(stt) && !/^[A-Z]+\d/.test(code)) return { kind: "skip" };
  if (!!code && !code.includes(",") && intStt(stt)) return { kind: "pkg", code, stt, name };
  return {
    kind: "task",
    code: code || `${currentPkgCode},${stt || "r" + rowIndex}`,
    stt,
    name,
  };
}

// ===== Preview (dry-run): phân tích file, KHÔNG ghi DB =====
export type SheetPreview = {
  sheetName: string;
  code: string;
  label: string;
  packages: number;
  tasks: number;
  dimColumns: number;
  warnings: string[];
};
export type PreviewResult = {
  sheets: SheetPreview[];
  unknownSheets: string[]; // sheet trong file không nằm trong SHEET_MAP (bỏ qua khi import)
  totalPackages: number;
  totalTasks: number;
  totalWarnings: number;
};

export function analyzeWorkbook(workbook: XLSX.WorkBook): PreviewResult {
  const result: PreviewResult = {
    sheets: [],
    unknownSheets: [],
    totalPackages: 0,
    totalTasks: 0,
    totalWarnings: 0,
  };

  for (const sheetName of workbook.SheetNames) {
    const info = SHEET_MAP[sheetName];
    if (!info) {
      if (sheetName.toUpperCase().includes("TRACKING")) result.unknownSheets.push(sheetName);
      continue;
    }

    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
    const { defs: dimDefs } = parseDimDefs(rows);
    const sp: SheetPreview = {
      sheetName,
      code: info.code,
      label: info.name,
      packages: 0,
      tasks: 0,
      dimColumns: dimDefs.length,
      warnings: [],
    };

    let hasPkg = false;
    let mismatches = 0;
    for (let i = DATA_START; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const kind = classifyRow(row, i, "");
      if (kind.kind === "skip") continue;
      const name = kind.name;

      const startDate = toISO(row[4]);
      const endDate = toISO(row[6]);
      if (row[4] != null && row[4] !== "" && !startDate)
        sp.warnings.push(
          `Dòng ${i + 1}: ngày bắt đầu không đọc được ("${String(row[4]).slice(0, 20)}")`,
        );
      if (row[6] != null && row[6] !== "" && !endDate)
        sp.warnings.push(
          `Dòng ${i + 1}: ngày kết thúc không đọc được ("${String(row[6]).slice(0, 20)}")`,
        );
      if (startDate && endDate && startDate > endDate)
        sp.warnings.push(
          `Dòng ${i + 1}: ngày bắt đầu (${startDate}) sau ngày kết thúc (${endDate})`,
        );

      if (kind.kind === "pkg") {
        sp.packages++;
        hasPkg = true;
      } else if (hasPkg) {
        sp.tasks++;
        // Đối chiếu với chính cột % của file: lệch nghĩa là mẫu số của hàng này khác số
        // cột lưới của sheet (xem ImportOptions.dimDenominator) — nêu rõ để người dùng
        // quyết, KHÔNG tự đổi con số.
        if (dimDefs.length > 0) {
          const done = dimDefs.filter((d) => isChecked(row[d.col])).length;
          const own = progressMismatch(row, progressFromChecks(done, dimDefs.length));
          if (own !== null) {
            mismatches++;
            const nonEmpty = dimDefs.filter((d) => hasCellValue(row[d.col])).length;
            // Chặn trần số dòng liệt kê: file hỏng mẫu số có thể lệch hàng nghìn dòng,
            // liệt kê hết sẽ phình response preview. Tổng số vẫn báo đủ ở dòng cuối.
            if (mismatches <= MAX_MISMATCH_LISTED)
              sp.warnings.push(
                `Dòng ${i + 1}: % trong file (${Math.round(own * 100)}%) khác % tính từ lưới ` +
                  `(${Math.round(progressFromChecks(done, dimDefs.length) * 100)}% = ${done}/${dimDefs.length} ô); ` +
                  `hàng này chỉ có ${nonEmpty} ô có dữ liệu — cân nhắc mẫu số "row-nonempty"`,
              );
          }
        }
      } else
        sp.warnings.push(
          `Dòng ${i + 1}: task "${name.slice(0, 30)}" đứng trước nhóm đầu tiên — sẽ bị bỏ qua`,
        );
    }

    if (mismatches > MAX_MISMATCH_LISTED)
      sp.warnings.push(
        `… và ${mismatches - MAX_MISMATCH_LISTED} dòng nữa cũng lệch % so với file ` +
          `(tổng ${mismatches} dòng trên sheet này)`,
      );

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

// Toàn bộ sheet trong SHEET_MAP là tracking ACMV (xem migrations/0005_boq.sql) — sheet tạo
// mới qua import phải gán system_id ngay, nếu không /progress/acmv sẽ không thấy dữ liệu.
async function getAcmvSystemId(): Promise<number | null> {
  const d = await queryOne<Row>(`SELECT id FROM systems WHERE code = 'acmv'`);
  return d?.id ?? null;
}

export async function importWorkbook(
  workbook: XLSX.WorkBook,
  options: ImportOptions = {},
): Promise<ImportStats> {
  const denominator = options.dimDenominator ?? "columns";
  const stats: ImportStats = {
    totalRows: 0,
    packages: 0,
    tasks: 0,
    dimensions: 0,
    errors: [],
    warnings: [],
    sheets: [],
  };

  const projectId = await getOrCreateProject();
  const towerId = await getOrCreateTower(projectId);
  const acmvSystemId = await getAcmvSystemId();
  const touchedPkgs = new Set<number>();

  for (const sheetName of workbook.SheetNames) {
    const info = SHEET_MAP[sheetName];
    if (!info) continue;
    stats.sheets.push(sheetName);

    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
    const { defs: dimDefs, linkCol } = parseDimDefs(rows);

    let st = await queryOne<Row>(
      `SELECT id FROM sheet_types WHERE tower_id = ? AND code = ?`,
      towerId,
      info.code,
    );
    if (!st) {
      st = {
        id: await insertId(
          `INSERT INTO sheet_types (tower_id, code, name, responsible, slug, system_id) VALUES (?, ?, ?, ?, ?, ?)`,
          towerId,
          info.code,
          info.name,
          info.responsible ?? null,
          slugFromCode(info.code) ?? toSlug(info.code),
          acmvSystemId,
        ),
      };
    }

    let currentPkgId: number | null = null;
    let currentPkgCode = "";
    let mismatches = 0;

    for (let i = DATA_START; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const kind = classifyRow(row, i, currentPkgCode);
      if (kind.kind === "skip") continue;
      const { stt, name } = kind;

      stats.totalRows++;
      const startDate = toISO(row[4]);
      const durationDays = row[5] != null ? parseInt(String(row[5])) || null : null;
      const endDate = toISO(row[6]);
      const ghiChu = toStatusSlug(row[3]);

      try {
        const drawingUrl = linkCol >= 0 ? urlOf(row[linkCol]) : null;

        if (kind.kind === "pkg") {
          const wpCode = kind.code;
          const existing = await queryOne<Row>(
            `SELECT id FROM work_packages WHERE sheet_type_id = ? AND code = ?`,
            st.id,
            wpCode,
          );
          if (!existing) {
            currentPkgId = await insertId(
              `INSERT INTO work_packages (boq_code, sheet_type_id, code, seq_no, floor_label, name, start_date, end_date, duration_days, status, progress, drawing_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
              makeBoq(info.code, wpCode),
              st.id,
              wpCode,
              stt,
              floorOf(name),
              name,
              startDate,
              endDate,
              durationDays,
              ghiChu,
              drawingUrl,
            );
            stats.packages++;
          } else {
            // Giữ nguyên boq_code (người dùng có thể đã sửa tay).
            await run(
              `UPDATE work_packages SET start_date = ?, end_date = ?, duration_days = ?, drawing_url = COALESCE(?, drawing_url) WHERE id = ?`,
              startDate,
              endDate,
              durationDays,
              drawingUrl,
              existing.id,
            );
            currentPkgId = existing.id;
          }
          currentPkgCode = wpCode;
          touchedPkgs.add(currentPkgId);
        } else if (currentPkgId) {
          // Hàng task. Sheet có cột dimension thì MỌI task đều có lưới checkbox —
          // ô trống nghĩa là chưa lắp, không phải "không có lưới".
          const hasGrid = dimDefs.length > 0;
          const taskCode = kind.code;

          // Cột lưới tính vào mẫu số của hàng này (xem ImportOptions.dimDenominator).
          // Chỉ những cột này được ghi thành ô lưới, để recomputeTask về sau đếm đúng
          // cùng mẫu số — hai đường không được lệch nhau.
          const rowDims = hasGrid ? activeDims(dimDefs, row, denominator) : [];

          let progress = parseProgress(row[7]);
          if (hasGrid) {
            // Dùng chung quy tắc với recomputeTask (lib/recompute.ts) — nếu không, cùng
            // một lưới checkbox sẽ cho 2 con số khác nhau tuỳ đường ghi: import làm tròn
            // 199/200 = 0.995 lên 1.00 ("hoàn thành", mở khoá nghiệm thu) rồi lần tick
            // tiếp theo recomputeTask lại hạ về 0.99.
            const done = rowDims.filter((d) => isChecked(row[d.col])).length;
            progress = progressFromChecks(done, rowDims.length);
            const own = progressMismatch(row, progress);
            if (own !== null) {
              mismatches++;
              // Cùng trần liệt kê với bước xem trước: file hỏng mẫu số có thể lệch hàng
              // nghìn dòng, đẩy hết vào JSON kết quả import sẽ phình response.
              if (mismatches <= MAX_MISMATCH_LISTED)
                stats.warnings.push(
                  `Dòng ${i + 1} (${sheetName}) ${taskCode}: % trong file ${Math.round(own * 100)}% ` +
                    `≠ % XBoss tính ${Math.round(progress * 100)}% (${done}/${rowDims.length} ô)`,
                );
            }
          }

          let taskId: number;
          const existing = await queryOne<Row & { status: string }>(
            `SELECT id, status FROM tasks WHERE package_id = ? AND code = ?`,
            currentPkgId,
            taskCode,
          );
          // Trạng thái "hiện tại" truyền cho deriveStatus: task đã tồn tại thì lấy status
          // thật trong DB (không phải chữ ghi chú Excel) — nếu không, import lại 1 file cũ sẽ
          // âm thầm huỷ nghiệm thu đã duyệt (không qua /api/tasks/:id/approve, mất audit).
          // Task mới toanh (chưa từng có) chỉ nhận "nghiệm thu" từ Excel khi % đã đủ 100%,
          // tránh nghiệm thu "chui" một task còn dở dang ngay từ lúc import.
          const currentStatus = existing
            ? existing.status
            : ghiChu === "nghiem_thu" && progress >= 1
              ? "nghiem_thu"
              : null;
          const status = deriveStatus(progress, endDate, currentStatus);
          if (!existing) {
            taskId = await insertId(
              `INSERT INTO tasks (boq_code, package_id, code, seq_no, name, note, status, start_date, end_date, duration_days, progress_percent, drawing_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              makeBoq(info.code, taskCode),
              currentPkgId,
              taskCode,
              stt || null,
              name,
              row[3] != null ? String(row[3]) : null,
              status,
              startDate,
              endDate,
              durationDays,
              progress,
              drawingUrl,
            );
            stats.tasks++;
          } else {
            taskId = existing.id;
            // Giữ nguyên boq_code (người dùng có thể đã sửa tay).
            await run(
              `UPDATE tasks SET status = ?, progress_percent = ?, start_date = ?, end_date = ?, duration_days = ?, drawing_url = COALESCE(?, drawing_url) WHERE id = ?`,
              status,
              progress,
              startDate,
              endDate,
              durationDays,
              drawingUrl,
              taskId,
            );
            await run(`DELETE FROM progress_dimensions WHERE task_id = ?`, taskId);
          }

          if (hasGrid) {
            for (const d of rowDims) {
              const checked = isChecked(row[d.col]) ? 1 : 0;
              await run(
                `INSERT INTO progress_dimensions (task_id, dimension_label, installed, value) VALUES (?, ?, ?, ?)`,
                taskId,
                d.label,
                checked,
                checked,
              );
              stats.dimensions++;
            }
          }
        }
      } catch (err) {
        stats.errors.push(`Dòng ${i + 1} (${sheetName}): ${(err as Error).message}`);
      }
    }

    if (mismatches > MAX_MISMATCH_LISTED)
      stats.warnings.push(
        `${sheetName}: và ${mismatches - MAX_MISMATCH_LISTED} dòng nữa cũng lệch % so với file ` +
          `(tổng ${mismatches} dòng)`,
      );
  }

  // Tính lại % cho từng work package = trung bình các sub-task.
  for (const pkgId of touchedPkgs) await recomputePackage(pkgId);

  return stats;
}
