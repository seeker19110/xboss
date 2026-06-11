// Bổ sung lưới checkbox cho các task bị thiếu progress_dimensions.
// (Bản import hiện tại luôn tạo đủ lưới — script này chỉ cần cho dữ liệu cũ.)
// Chạy: npx tsx scripts/backfill-dims.ts
import "./env";
import { query, run } from "../lib/db";

type Sheet = { id: number; code: string };
type Label = { label: string };
type Task = { id: number };

async function main() {
  const sheets = await query<Sheet>(`SELECT id, code FROM sheet_types ORDER BY id`);
  let totalTasks = 0, totalCells = 0;

  for (const sheet of sheets) {
    // Danh sách cột của sheet, theo thứ tự xuất hiện đầu tiên (thứ tự cột Excel khi import).
    const labels = await query<Label>(
      `SELECT pd.dimension_label AS label
         FROM progress_dimensions pd
         JOIN tasks t ON pd.task_id = t.id
         JOIN work_packages wp ON t.package_id = wp.id
        WHERE wp.sheet_type_id = ?
        GROUP BY pd.dimension_label
        ORDER BY MIN(pd.id)`, sheet.id);
    if (labels.length === 0) {
      console.warn(`⚠️ Sheet ${sheet.code}: chưa có dimension nào trong DB — cần re-import từ Excel.`);
      continue;
    }

    const missing = await query<Task>(
      `SELECT t.id FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
        WHERE wp.sheet_type_id = ?
          AND NOT EXISTS (SELECT 1 FROM progress_dimensions pd WHERE pd.task_id = t.id)`, sheet.id);

    for (const t of missing) {
      for (const l of labels) {
        await run(`INSERT INTO progress_dimensions (task_id, dimension_label, installed, value) VALUES (?, ?, 0, 0)`,
          t.id, l.label);
        totalCells++;
      }
      totalTasks++;
    }
    console.log(`✅ ${sheet.code}: ${labels.length} cột × ${missing.length} task thiếu lưới.`);
  }

  console.log(`\n🎉 Đã bổ sung ${totalCells} ô cho ${totalTasks} task.`);
  process.exit(0);
}

main().catch((err) => { console.error("❌ Backfill lỗi:", err); process.exit(1); });
