// Seed dữ liệu mẫu BOQ từ attachments/MAU-KHOI-LUONG-BOQ.xlsx vào boq_items
// Chạy: npx tsx scripts/seed-boq.ts
import "./env";
import path from "path";
import * as XLSX from "xlsx";
import { queryOne, run } from "@/lib/db";
import { parseBoqWorkbook, commitBoqImport } from "@/lib/khoi-luong/boq-import";

async function main() {
  const filePath = path.join(process.cwd(), "attachments", "MAU-KHOI-LUONG-BOQ.xlsx");
  console.log(`Đang đọc file mẫu: ${filePath}`);
  const wb = XLSX.readFile(filePath);

  const parsed = parseBoqWorkbook(wb);
  console.log(`Đã trích xuất ${parsed.rows.length} dòng từ sheet ${parsed.sheetUsed ?? "chính"}`);
  console.log(`Hệ nhận diện: ${parsed.detectedSystemCode}`);
  console.log(`Số dòng bỏ qua (Tháp B / 0): ${parsed.skippedTowerBOnly}`);

  if (parsed.rows.length === 0) {
    console.error("❌ Không có dòng nào hợp lệ!");
    process.exit(1);
  }

  // Lấy dự án đầu tiên
  const project = await queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM projects ORDER BY id ASC LIMIT 1`,
  );
  if (!project) {
    console.error("❌ Không tìm thấy dự án nào trong DB. Vui lòng tạo dự án trước.");
    process.exit(1);
  }

  // Lấy hoặc tạo hệ acmv
  const systemCode = parsed.detectedSystemCode || "acmv";
  let system = await queryOne<{ id: number; code: string }>(
    `SELECT id, code FROM systems WHERE code = ?`,
    systemCode,
  );
  if (!system) {
    system = await queryOne<{ id: number; code: string }>(
      `SELECT id, code FROM systems ORDER BY id ASC LIMIT 1`,
    );
  }
  if (!system) {
    console.error("❌ Không tìm thấy hệ thống (systems) nào trong DB.");
    process.exit(1);
  }

  console.log(
    `Bắt đầu import vào Dự án "${project.name}" (ID: ${project.id}), Hệ "${system.code}" (ID: ${system.id})...`,
  );
  const result = await commitBoqImport(parsed.rows, system.id, system.code, project.id, 1);

  console.log(
    `✅ Kết quả: Đã thêm ${result.inserted} dòng, bỏ qua ${result.skipped} dòng trùng mã.`,
  );
  if (result.errors.length > 0) {
    console.log(`Lưu ý (${result.errors.length} lỗi trùng):`, result.errors.slice(0, 5));
  }
}

main().catch((err) => {
  console.error("❌ Lỗi khi seed BOQ:", err);
  process.exit(1);
});
