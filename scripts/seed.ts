import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as XLSX from "xlsx";
import * as schema from "../lib/db/schema";

dotenv.config({ path: ".env.local" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema });

// Helper convert Excel date
function excelDateToJSDate(serial: any): Date | null {
  if (!serial) return null;
  if (typeof serial === "string" && !isNaN(Date.parse(serial))) return new Date(serial);
  const num = Number(serial);
  if (isNaN(num)) return null;
  const utc_days = Math.floor(num - 25569);
  return new Date(utc_days * 86400 * 1000);
}

async function main() {
  console.log("🚀 Bắt đầu import Excel AVIO - Tháp A...");

  // 1. Tạo Project & Tower mặc định
  const [project] = await db.insert(schema.projects).values({
    name: "TT AVIO Tháp A",
    code: "AVIO-A",
  }).onConflictDoNothing().returning();

  const projectId = project?.id || 1;

  const [tower] = await db.insert(schema.towers).values({
    projectId,
    name: "Tháp A",
  }).onConflictDoNothing().returning();

  const towerId = tower?.id || 1;

  console.log(`✅ Project ID: ${projectId}, Tower ID: ${towerId}`);

  const filePath = "./attachments/GIA THÀNH - TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx";
  const workbook = XLSX.readFile(filePath);

  await importSheetTypes();

  await importFromSheet(workbook, "TRACKING OGTĐ", "OGTĐ", projectId, towerId);
  await importFromSheet(workbook, "TRACKING OGHL", "OGHL", projectId, towerId);
  await importFromSheet(workbook, "TRACKING OGCH", "OGCH", projectId, towerId);
  await importFromSheet(workbook, "TRACKING ODNN Zone 1", "ODNN", projectId, towerId);
  await importFromSheet(workbook, "TRACKING ODNN Zone 2", "ODNN", projectId, towerId);

  console.log("✅ Import hoàn tất!");
  await pool.end();
}

async function importSheetTypes() {
  const types = [
    { code: "OGTĐ", name: "Ống Gió Trục Đứng" },
    { code: "OGHL", name: "Ống Gió Hành Lang" },
    { code: "OGCH", name: "Ống Gió Căn Hộ" },
    { code: "ODNN", name: "Ống Đồng Nước Ngưng" },
  ];
  for (const t of types) {
    await db.insert(schema.sheetTypes).values(t).onConflictDoNothing();
  }
  console.log("✅ Sheet Types imported");
}

async function importFromSheet(workbook: XLSX.WorkBook, sheetName: string, sheetTypeCode: string, projectId: number, towerId: number) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    console.log(`⚠️ Sheet ${sheetName} không tồn tại`);
    return;
  }

  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[];
  console.log(`📥 Đang import ${sheetName} (${data.length} rows)...`);

  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[2]) continue;

    const name = String(row[2] || "").trim();
    if (!name) continue;

    const code = String(row[0] || `AUTO-${i}`).trim();
    const floor = String(row[3] || "").trim();
    const startDate = excelDateToJSDate(row[4]);
    const days = parseInt(row[5]) || 15;
    let progress = 0;
    if (row[7] != null) {
      progress = parseFloat(row[7]);
      if (isNaN(progress)) progress = 0;
    }

    let endDate: Date | null = null;
    if (startDate) {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days);
    }

    try {
      await db.insert(schema.workPackages).values({
        projectId,
        towerId,
        sheetTypeId: 1, // tạm thời, sẽ cải tiến sau
        code,
        name,
        floor: floor || null,
        startDate,
        endDate,
        days,
        progress: Math.min(Math.max(progress, 0), 1),
        status: progress >= 0.95 ? "DaHoanThanh" : (progress > 0.1 ? "DangThiCong" : "ChuanBi"),
        note: String(row[1] || ""),
      }).onConflictDoNothing();
    } catch (err: any) {
      console.warn(`⚠️ Skip row ${i} (${name}):`, err.message.substring(0, 100));
    }
  }
  console.log(`✅ Hoàn thành ${sheetName}`);
}

main().catch((err) => {
  console.error("❌ Import lỗi:", err);
  process.exit(1);
});