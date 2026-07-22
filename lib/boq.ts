import { query, queryOne } from "@/lib/db";
import { slugFromCode } from "@/lib/sheets";

// Sinh BOQCODE mặc định: <SLUG-SHEET>-<mã hàng>, phân tách thống nhất bằng "-"
// (dấu "," trong mã Excel được đổi thành "-"), vd: OGTD-A1, OGCH-OGCH4-06, ODNN1-A1-r7
export function makeBoq(sheetCode: string, rowCode: string): string {
  const prefix = (slugFromCode(sheetCode) ?? sheetCode).toUpperCase();
  return `${prefix}-${rowCode.replace(/,/g, "-")}`;
}

// BOQCODE phải duy nhất trong PHẠM VI 1 org (M54 GĐ1) — trên nhóm + task + vật tư + dòng
// BOQ — để mã đặt hàng/nghiệm thu không bao giờ nhập nhằng. Hai org khác nhau vẫn được đặt
// cùng 1 mã (cô lập tenant). Trả về mô tả nơi đang dùng mã trong org đó, hoặc null nếu chưa
// ai dùng. Lọc theo org qua bảng đăng ký boq_codes (nguồn sự thật, PK (org_id, code)).
export async function boqTakenBy(
  boq: string,
  orgId: number,
  exclude?: { table: "tasks" | "work_packages" | "materials" | "boq_items"; id: number },
): Promise<string | null> {
  const rows = await query<{ kind: string; id: number; code: string | null; name: string }>(
    `(SELECT 'task'    AS kind, t.id, t.code, t.name FROM tasks t
        JOIN boq_codes bc ON bc.table_name = 'tasks' AND bc.row_id = t.id
       WHERE t.boq_code = ? AND bc.org_id = ?)
     UNION ALL
     (SELECT 'package' AS kind, w.id, w.code, w.name FROM work_packages w
        JOIN boq_codes bc ON bc.table_name = 'work_packages' AND bc.row_id = w.id
       WHERE w.boq_code = ? AND bc.org_id = ?)
     UNION ALL
     (SELECT 'material' AS kind, m.id, NULL, m.name FROM materials m
        JOIN boq_codes bc ON bc.table_name = 'materials' AND bc.row_id = m.id
       WHERE m.boq_code = ? AND bc.org_id = ?)
     UNION ALL
     (SELECT 'boq_item' AS kind, b.id, b.code, b.name FROM boq_items b
        JOIN boq_codes bc ON bc.table_name = 'boq_items' AND bc.row_id = b.id
       WHERE b.code = ? AND bc.org_id = ?)`,
    boq,
    orgId,
    boq,
    orgId,
    boq,
    orgId,
    boq,
    orgId,
  );

  for (const r of rows) {
    if (r.kind === "task" && !(exclude?.table === "tasks" && exclude.id === r.id))
      return `task ${r.code} — ${r.name}`;
    if (r.kind === "package" && !(exclude?.table === "work_packages" && exclude.id === r.id))
      return `nhóm ${r.code} — ${r.name}`;
    if (r.kind === "material" && !(exclude?.table === "materials" && exclude.id === r.id))
      return `vật tư ${r.name}`;
    if (r.kind === "boq_item" && !(exclude?.table === "boq_items" && exclude.id === r.id))
      return `dòng BOQ ${r.code} — ${r.name}`;
  }
  return null;
}

// KL thực hiện của 1 dòng BOQ = qty_contract × Σ(weight × task.progress_percent) qua
// các task đã map (boq_task_map). Tách hàm để M2 (chi phí) / M6 (phát sinh) tái dùng.
export async function boqExecutedQty(boqItemId: number): Promise<number> {
  const row = await queryOne<{ executed: number }>(
    `SELECT COALESCE(bi.qty_contract * SUM(m.weight * COALESCE(t.progress_percent, 0)), 0) AS executed
       FROM boq_items bi
       LEFT JOIN boq_task_map m ON m.boq_item_id = bi.id
       LEFT JOIN tasks t ON t.id = m.task_id
      WHERE bi.id = ?
      GROUP BY bi.id, bi.qty_contract`,
    boqItemId,
  );
  return row?.executed ?? 0;
}
