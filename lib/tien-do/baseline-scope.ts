import { queryOne } from "@/lib/db";

// QUALITY-FINAL-1 A1-FR06: `?baseline=<id>` do client gửi phải thuộc DỰ ÁN ĐANG CHỌN — nếu
// không, EVM/S-curve đọc được ngày kế hoạch (baseline_tasks) của dự án/tổ chức khác.

const INT4_MAX = 2147483647;

export type KetQuaBaseline =
  { ok: true; baselineId: number | null } | { ok: false; status: 400 | 404; error: string };

/** Tham số `baseline` thô → số nguyên dương hợp lệ (int4), null khi thiếu; undefined khi sai định dạng. */
export function parseBaselineParam(raw: string | null): number | null | undefined {
  if (raw == null || raw === "") return null;
  if (!/^[0-9]{1,10}$/.test(raw)) return undefined;
  const n = Number(raw);
  return n >= 1 && n <= INT4_MAX ? n : undefined;
}

/** Kiểm định dạng (400) rồi kiểm baseline thuộc dự án (404 — không phân biệt "không tồn tại"/"dự án khác"). */
export async function kiemBaselineThuocDuAn(
  raw: string | null,
  projectId: number,
): Promise<KetQuaBaseline> {
  const id = parseBaselineParam(raw);
  if (id === undefined)
    return { ok: false, status: 400, error: "baseline phải là số nguyên dương hợp lệ" };
  if (id === null) return { ok: true, baselineId: null };
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM baselines WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
  if (!row)
    return { ok: false, status: 404, error: "Không tìm thấy baseline trong dự án đang chọn" };
  return { ok: true, baselineId: id };
}
