import type { Cell } from "./types";

// Logic THUẦN của thao tác tick theo lô (M121) — không fetch, không React, để test được
// không cần dựng DOM hay giả lập mạng. Lớp gọi (`TrackingGrid`) chỉ nối dây.

// Trần của `PATCH /api/dimensions/batch` (app/api/dimensions/batch/route.ts). Chặn Ở CLIENT
// trước khi gửi: gửi rồi ăn 422 vẫn tốn một vòng mạng trên 3G công trường, và người dùng chỉ
// nhận được thông báo chậm hơn chứ không có thêm thông tin gì.
export const MAX_O_MOI_LO = 1000;

// `ids` rỗng là kết quả HỢP LỆ (vùng chọn toàn ô không có thật) — lớp gọi tự no-op, không
// coi là lỗi và không gửi request rỗng.
export type KetQuaDungLo = { ok: true; ids: number[] } | { ok: false; loi: string };

// Dựng danh sách id ô để gửi cho một lô.
//
// Bỏ ô `undefined`: lưới thưa (sparse) — task thêm sau có thể chưa có đủ cột, chỗ đó render
// dấu "·" chứ không có bản ghi `progress_dimensions` nào. Gửi id `undefined` lên sẽ thành
// `NaN` rồi bị route lọc, nhưng làm lệch số ô báo cho người dùng.
//
// KHÔNG lọc ô đã đúng trạng thái đích: lô ở server là atomic và idempotent (`ghiDauVetTick`),
// gửi cả cụm giữ cho "hoàn tác" khôi phục đúng nguyên cụm. Lọc bớt sẽ làm undo hụt ô.
export function dungLoTick(cells: (Cell | undefined)[]): KetQuaDungLo {
  const ids = cells.filter((c): c is Cell => !!c).map((c) => c.id);
  if (ids.length > MAX_O_MOI_LO)
    return { ok: false, loi: `Chọn tối đa ${MAX_O_MOI_LO} ô mỗi lần (đang chọn ${ids.length})` };
  return { ok: true, ids };
}

// Gom các ô của một vùng chọn chữ nhật trên lưới (hàng = task, cột = nhãn dimension).
// Trả về theo thứ tự hàng rồi cột để lô gửi lên có thứ tự ổn định (dễ đọc log, dễ so sánh test).
export function oTrongVung<T extends { cells: Record<string, Cell> }>(
  tasks: T[],
  columns: string[],
  vung: { r0: number; c0: number; r1: number; c1: number },
): Cell[] {
  const ket: Cell[] = [];
  for (let r = vung.r0; r <= vung.r1; r++) {
    const task = tasks[r];
    if (!task) continue;
    for (let c = vung.c0; c <= vung.c1; c++) {
      const nhan = columns[c];
      if (nhan === undefined) continue;
      const o = task.cells[nhan];
      if (o) ket.push(o);
    }
  }
  return ket;
}
