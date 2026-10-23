// Sắp xếp lại thứ tự nhóm (work_packages trong 1 sheet) và task (tasks trong 1 nhóm) theo một
// danh sách id đầy đủ — phục vụ kéo thả trên lưới tracking (M135). Khác `.../move` (chỉ hoán
// đổi với hàng liền kề), ở đây client gửi TOÀN BỘ thứ tự mới; tập id phải khớp đúng tập hiện có
// trong DB, lệch (máy khác vừa thêm/xoá) thì không ghi gì để không trộn hai thứ tự với nhau.
import { query, run } from "@/lib/db";

export const MAX_SAP_XEP_IDS = 2000;

/** Tập id gửi lên lệch tập hiện có trong DB — route trả 409 để client tải lại. */
export class LoiLechDanhSach extends Error {
  constructor() {
    super("LECH_DANH_SACH");
  }
}

/**
 * Đọc và kiểm `ids` từ body: mảng 1..MAX phần tử, số nguyên dương an toàn, không trùng.
 * Trả chuỗi lỗi tiếng Việt khi không hợp lệ (route trả 422; thiếu hẳn/rỗng → 400).
 */
export function docDanhSachId(
  raw: unknown,
): { ids: number[] } | { loi: string; status: 400 | 422 } {
  if (!Array.isArray(raw) || raw.length === 0) return { loi: "ids rỗng", status: 400 };
  if (raw.length > MAX_SAP_XEP_IDS)
    return { loi: `Tối đa ${MAX_SAP_XEP_IDS} mục mỗi lần sắp xếp`, status: 422 };
  const ids = raw.map((v) => (typeof v === "number" ? v : NaN));
  if (ids.some((n) => !Number.isSafeInteger(n) || n <= 0))
    return { loi: "ids phải là số nguyên dương", status: 422 };
  if (new Set(ids).size !== ids.length) return { loi: "ids bị trùng", status: 422 };
  return { ids };
}

/** Hai danh sách id có cùng tập phần tử (không xét thứ tự) — `ids` đã được kiểm không trùng. */
export function cungTapId(ids: number[], hienCo: number[]): boolean {
  if (ids.length !== hienCo.length) return false;
  const tap = new Set(hienCo);
  return ids.every((id) => tap.has(id));
}

// Gọi TRONG transaction (route bọc bằng ghiNeuConQuyen): khoá các dòng anh em trước khi so tập để
// hai lần thả đồng thời không đan xen; sort_order = vị trí 1..n theo đúng thứ tự gửi lên.
async function ghiThuTu(
  bang: "work_packages" | "tasks",
  cotCha: string,
  chaId: number,
  ids: number[],
) {
  const hienCo = await query<{ id: number }>(
    `SELECT id FROM ${bang} WHERE ${cotCha} = ? ORDER BY id FOR UPDATE`,
    chaId,
  );
  if (
    !cungTapId(
      ids,
      hienCo.map((r) => r.id),
    )
  )
    throw new LoiLechDanhSach();
  await run(
    `UPDATE ${bang} b SET sort_order = v.ord
       FROM unnest(?::int[]) WITH ORDINALITY AS v(id, ord)
      WHERE b.id = v.id AND b.${cotCha} = ?`,
    ids,
    chaId,
  );
}

/** Đặt lại thứ tự mọi nhóm trong sheet theo `ids`. Ném LoiLechDanhSach nếu tập lệch. */
export function sapXepNhomTrongSheet(sheetTypeId: number, ids: number[]): Promise<void> {
  return ghiThuTu("work_packages", "sheet_type_id", sheetTypeId, ids);
}

/** Đặt lại thứ tự mọi task trong nhóm theo `ids`. Ném LoiLechDanhSach nếu tập lệch. */
export function sapXepTaskTrongNhom(packageId: number, ids: number[]): Promise<void> {
  return ghiThuTu("tasks", "package_id", packageId, ids);
}
