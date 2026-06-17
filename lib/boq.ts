import { query } from "@/lib/db";
import { slugFromCode } from "@/lib/sheets";

// Sinh BOQCODE mặc định: <SLUG-SHEET>-<mã hàng>, phân tách thống nhất bằng "-"
// (dấu "," trong mã Excel được đổi thành "-"), vd: OGTD-A1, OGCH-OGCH4-06, ODNN1-A1-r7
export function makeBoq(sheetCode: string, rowCode: string): string {
  const prefix = (slugFromCode(sheetCode) ?? sheetCode).toUpperCase();
  return `${prefix}-${rowCode.replace(/,/g, "-")}`;
}

// BOQCODE phải duy nhất trên TOÀN BỘ hệ thống (nhóm + task + vật tư)
// để mã đặt hàng/nghiệm thu không bao giờ nhập nhằng.
// Trả về mô tả nơi đang dùng mã, hoặc null nếu chưa ai dùng.
export async function boqTakenBy(
  boq: string,
  exclude?: { table: "tasks" | "work_packages" | "materials"; id: number },
): Promise<string | null> {
  const rows = await query<{ kind: string; id: number; code: string | null; name: string }>(
    `(SELECT 'task'    AS kind, id, code, name FROM tasks         WHERE boq_code = ?)
     UNION ALL
     (SELECT 'package' AS kind, id, code, name FROM work_packages WHERE boq_code = ?)
     UNION ALL
     (SELECT 'material' AS kind, id, NULL,  name FROM materials   WHERE boq_code = ?)`,
    boq, boq, boq);

  for (const r of rows) {
    if (r.kind === "task"     && !(exclude?.table === "tasks"          && exclude.id === r.id))
      return `task ${r.code} — ${r.name}`;
    if (r.kind === "package"  && !(exclude?.table === "work_packages"  && exclude.id === r.id))
      return `nhóm ${r.code} — ${r.name}`;
    if (r.kind === "material" && !(exclude?.table === "materials"       && exclude.id === r.id))
      return `vật tư ${r.name}`;
  }
  return null;
}
