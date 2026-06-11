import { queryOne } from "@/lib/db";
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
  const t = await queryOne<{ id: number; code: string; name: string }>(
    `SELECT id, code, name FROM tasks WHERE boq_code = ?`, boq);
  if (t && !(exclude?.table === "tasks" && exclude.id === t.id))
    return `task ${t.code} — ${t.name}`;

  const w = await queryOne<{ id: number; code: string; name: string }>(
    `SELECT id, code, name FROM work_packages WHERE boq_code = ?`, boq);
  if (w && !(exclude?.table === "work_packages" && exclude.id === w.id))
    return `nhóm ${w.code} — ${w.name}`;

  const m = await queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM materials WHERE boq_code = ?`, boq);
  if (m && !(exclude?.table === "materials" && exclude.id === m.id))
    return `vật tư ${m.name}`;

  return null;
}
