import { query, queryOne } from "@/lib/db";
import { slugFromCode } from "@/lib/sheets";

// Sinh BOQCODE mặc định: <SLUG-SHEET>-<mã hàng>, phân tách thống nhất bằng "-"
// (dấu "," trong mã Excel được đổi thành "-"), vd: OGTD-A1, OGCH-OGCH4-06, ODNN1-A1-r7
export function makeBoq(sheetCode: string, rowCode: string): string {
  const prefix = (slugFromCode(sheetCode) ?? sheetCode).toUpperCase();
  return `${prefix}-${rowCode.replace(/,/g, "-")}`;
}

// BOQCODE phải duy nhất trên TOÀN BỘ hệ thống (nhóm + task + vật tư + dòng BOQ)
// để mã đặt hàng/nghiệm thu không bao giờ nhập nhằng.
// Trả về mô tả nơi đang dùng mã, hoặc null nếu chưa ai dùng.
export async function boqTakenBy(
  boq: string,
  exclude?: { table: "tasks" | "work_packages" | "materials" | "boq_items"; id: number },
): Promise<string | null> {
  const rows = await query<{ kind: string; id: number; code: string | null; name: string }>(
    `(SELECT 'task'    AS kind, id, code, name FROM tasks         WHERE boq_code = ?)
     UNION ALL
     (SELECT 'package' AS kind, id, code, name FROM work_packages WHERE boq_code = ?)
     UNION ALL
     (SELECT 'material' AS kind, id, NULL,  name FROM materials   WHERE boq_code = ?)
     UNION ALL
     (SELECT 'boq_item' AS kind, id, code, name FROM boq_items    WHERE code = ?)`,
    boq,
    boq,
    boq,
    boq,
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
