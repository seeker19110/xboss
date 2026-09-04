// Gán BOQCODE cho mọi hàng (nhóm + task) đang NULL: <SLUG-SHEET>-<mã hàng>.
// Nếu mã sinh ra bị trùng (hiếm) thì thêm hậu tố -2, -3...
// Chạy: npx tsx scripts/backfill-boq.ts
import "./env";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { makeBoq } from "@/lib/khoi-luong/boq";

type Row = { id: number; code: string; sheetCode: string; orgId: number | null };

// Mã BOQ duy nhất trong phạm vi ORG và trên CẢ BỐN bảng (tasks, work_packages, materials,
// boq_items) — nguồn sự thật là sổ đăng ký `boq_codes` + trigger `boq_codes_sync` (0029/0078).
// Bản cũ của hàm này chỉ tra `tasks` + `work_packages` và không lọc org: mã "chưa ai dùng"
// theo nó vẫn có thể đang thuộc về một dòng vật tư hoặc một dòng BOQ, và lúc UPDATE mới vỡ
// ở trigger — script dừng nửa chừng sau khi đã ghi hàng trăm hàng.
async function unique(base: string, orgId: number): Promise<string> {
  let candidate = base;
  for (let i = 2; ; i++) {
    const taken = await queryOne(
      `SELECT 1 AS x FROM boq_codes WHERE org_id = ? AND code = ?`,
      orgId,
      candidate,
    );
    if (!taken) return candidate;
    candidate = `${base}-${i}`;
  }
}

async function main() {
  // Cả script trong MỘT transaction: mã do `unique()` chọn chỉ đúng khi không có ai ghi xen
  // giữa lúc chọn và lúc UPDATE, và một lần chạy hỏng phải không để lại nửa vời.
  const { wps, tasks } = await withTransaction(async () => {
    const wps = await query<Row>(
      `SELECT wp.id, wp.code, st.code AS "sheetCode", p.org_id AS "orgId"
         FROM work_packages wp
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         JOIN towers tw ON tw.id = st.tower_id
         JOIN projects p ON p.id = tw.project_id
        WHERE wp.boq_code IS NULL ORDER BY wp.id`,
    );
    for (const w of wps) {
      await run(
        `UPDATE work_packages SET boq_code = ? WHERE id = ?`,
        await unique(makeBoq(w.sheetCode, w.code), w.orgId ?? 1),
        w.id,
      );
    }

    const tasks = await query<Row>(
      `SELECT t.id, t.code, st.code AS "sheetCode", p.org_id AS "orgId"
         FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         JOIN towers tw ON tw.id = st.tower_id
         JOIN projects p ON p.id = tw.project_id
        WHERE t.boq_code IS NULL ORDER BY t.id`,
    );
    for (const t of tasks) {
      await run(
        `UPDATE tasks SET boq_code = ? WHERE id = ?`,
        await unique(makeBoq(t.sheetCode, t.code), t.orgId ?? 1),
        t.id,
      );
    }
    return { wps, tasks };
  });

  console.log(`✅ Nhóm: gán BOQ cho ${wps.length} hàng.`);
  console.log(`✅ Task: gán BOQ cho ${tasks.length} hàng.`);

  // Kiểm cuối: còn hàng nào chưa có mã không. (Trùng mã KHÔNG cần kiểm ở đây nữa — từ 0078
  // `boq_codes` có PK (org_id, code) nên trùng là bất khả thi ở tầng DB; cái còn sót lại thật
  // sự là hàng bị bỏ qua, vd nhóm/task treo ở sheet không thuộc dự án nào.)
  const con = await queryOne<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM tasks WHERE boq_code IS NULL)
          + (SELECT COUNT(*) FROM work_packages WHERE boq_code IS NULL) AS n`,
  );
  const conLai = Number(con?.n ?? 0);
  console.log(
    conLai === 0
      ? "🎉 Mọi nhóm và task đều đã có BOQCODE."
      : `⚠️  Còn ${conLai} hàng chưa có mã (không nối được tới dự án/tổ chức nào).`,
  );
  process.exit(conLai === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
