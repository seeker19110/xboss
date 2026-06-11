// Gán BOQCODE cho mọi hàng (nhóm + task) đang NULL: <SLUG-SHEET>-<mã hàng>.
// Nếu mã sinh ra bị trùng (hiếm) thì thêm hậu tố -2, -3...
// Chạy: npx tsx scripts/backfill-boq.ts
import "./env";
import { query, queryOne, run } from "../lib/db";
import { makeBoq } from "../lib/boq";

type Row = { id: number; code: string; sheetCode: string };

async function unique(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; ; i++) {
    const t = await queryOne(`SELECT 1 AS x FROM tasks WHERE boq_code = ?`, candidate);
    const w = await queryOne(`SELECT 1 AS x FROM work_packages WHERE boq_code = ?`, candidate);
    if (!t && !w) return candidate;
    candidate = `${base}-${i}`;
  }
}

async function main() {
  const wps = await query<Row>(
    `SELECT wp.id, wp.code, st.code AS "sheetCode"
       FROM work_packages wp JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE wp.boq_code IS NULL ORDER BY wp.id`);
  for (const w of wps) {
    await run(`UPDATE work_packages SET boq_code = ? WHERE id = ?`, await unique(makeBoq(w.sheetCode, w.code)), w.id);
  }
  console.log(`✅ Nhóm: gán BOQ cho ${wps.length} hàng.`);

  const tasks = await query<Row>(
    `SELECT t.id, t.code, st.code AS "sheetCode"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.boq_code IS NULL ORDER BY t.id`);
  for (const t of tasks) {
    await run(`UPDATE tasks SET boq_code = ? WHERE id = ?`, await unique(makeBoq(t.sheetCode, t.code)), t.id);
  }
  console.log(`✅ Task: gán BOQ cho ${tasks.length} hàng.`);

  const dup = await query<{ boq: string; n: number }>(
    `SELECT boq_code AS boq, COUNT(*) AS n FROM (
       SELECT boq_code FROM tasks WHERE boq_code IS NOT NULL
       UNION ALL SELECT boq_code FROM work_packages WHERE boq_code IS NOT NULL
     ) s GROUP BY boq_code HAVING COUNT(*) > 1`);
  console.log(dup.length === 0 ? "🎉 Không có mã trùng — BOQCODE duy nhất toàn cục." : `❌ ${dup.length} mã trùng!`);
  process.exit(dup.length === 0 ? 0 : 1);
}

main().catch((err) => { console.error("❌", err); process.exit(1); });
