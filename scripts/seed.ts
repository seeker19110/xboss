import "./env";
import * as XLSX from "xlsx";
import { run } from "@/lib/db";
import { importWorkbook } from "@/lib/tien-do/import";
import { trongToChuc } from "@/lib/ha-tang/to-chuc";

const FILE =
  process.env.XLSX_FILE ??
  "./attachments/GIA THÀNH - TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx";

async function main() {
  console.log("🚀 Import Excel AVIO - Tháp A...");

  // Reset dữ liệu thi công (giữ nguyên bảng users).
  for (const t of [
    "notifications",
    "progress_dimensions",
    "task_history",
    "tasks",
    "work_packages",
    "sheet_types",
    "towers",
    "projects",
  ]) {
    await run(`DELETE FROM ${t}`);
  }

  const workbook = XLSX.readFile(FILE, { cellDates: true });
  const stats = await importWorkbook(workbook);

  console.log(`✅ Sheets: ${stats.sheets.join(", ")}`);
  console.log(
    `✅ ${stats.packages} nhóm công việc, ${stats.tasks} tasks, ${stats.dimensions} ô dimension.`,
  );
  if (stats.errors.length) {
    console.warn(`⚠️ ${stats.errors.length} lỗi:`);
    stats.errors.slice(0, 10).forEach((e) => console.warn("  - " + e));
  }
  process.exit(0);
}

// S16 (RLS 0165): script dữ liệu đơn tổ chức — chạy trong ngữ cảnh tổ chức mặc định 1 (DEFAULT
// của projects/users.org_id) để bảng theo tổ chức không trả rỗng khi chạy bằng role ứng dụng.
trongToChuc(1, main).catch((err) => {
  console.error("❌ Import lỗi:", err);
  process.exit(1);
});
