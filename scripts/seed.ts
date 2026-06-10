import * as XLSX from "xlsx";
import { db, run } from "../lib/db";
import { importWorkbook } from "../lib/import";

const FILE = process.env.XLSX_FILE
  ?? "./attachments/GIA THÀNH - TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx";

async function main() {
  console.log("🚀 Import Excel AVIO - Tháp A...");

  // Reset dữ liệu thi công (giữ nguyên bảng users).
  for (const t of ["progress_dimensions", "task_history", "tasks", "work_packages", "sheet_types", "towers", "projects"]) {
    run(`DELETE FROM ${t}`);
  }

  const workbook = XLSX.readFile(FILE, { cellDates: true });
  db.exec("BEGIN");
  const stats = await importWorkbook(workbook);
  db.exec("COMMIT");

  console.log(`✅ Sheets: ${stats.sheets.join(", ")}`);
  console.log(`✅ ${stats.packages} nhóm công việc, ${stats.tasks} tasks, ${stats.dimensions} ô dimension.`);
  if (stats.errors.length) {
    console.warn(`⚠️ ${stats.errors.length} lỗi:`);
    stats.errors.slice(0, 10).forEach((e) => console.warn("  - " + e));
  }
  process.exit(0);
}

main().catch((err) => { console.error("❌ Import lỗi:", err); process.exit(1); });
