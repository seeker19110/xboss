import * as dotenv from "dotenv";
import * as XLSX from "xlsx";
import { importWorkbook } from "../lib/import";

dotenv.config({ path: ".env.local" });

const FILE = "./attachments/GIA THÀNH - TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx";

async function main() {
  console.log("🚀 Bắt đầu import Excel AVIO - Tháp A...");
  const workbook = XLSX.readFile(FILE, { cellDates: true });
  const stats = await importWorkbook(workbook);
  console.log(`✅ Sheets: ${stats.sheets.join(", ")}`);
  console.log(`✅ ${stats.packages} nhóm công việc, ${stats.tasks} tasks.`);
  if (stats.errors.length) {
    console.warn(`⚠️ ${stats.errors.length} lỗi:`);
    stats.errors.slice(0, 10).forEach((e) => console.warn("  - " + e));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Import lỗi:", err);
  process.exit(1);
});
