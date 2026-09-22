import { spreadPaste, type Rect } from "@/lib/tien-do/grid";
import { MAX_O_MOI_LO } from "./tick";
import type { Grid } from "./types";

// Logic THUẦN của thao tác dán ma trận TSV vào vùng tick (M124 việc 5) — không fetch, không
// React, để test được không cần dựng DOM. Lớp gọi (`useTickVung`) chỉ nối dây: parse clipboard
// → gọi các hàm ở đây → gửi lô lên server.

/** Đổi giá trị một ô nguồn (từ Excel dán vào) sang trạng thái tick. `null` = ô không nhận
 * diện được (khác "x"/"○"...) — bỏ qua, không đoán mò. */
export function doiOSangTick(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "x" || v === "1" || v === "true") return true;
  if (v === "" || v === "0" || v === "○" || v === "o" || v === "false") return false;
  return null;
}

export type KetQuaDan = { tick: number[]; boTick: number[]; boQua: number } | { loi: string };

// Lát ma trận dán từ góc trên-trái của vùng chọn (`vung.r0/c0` — bỏ qua r1/c1: dán luôn theo
// đúng kích thước ma trận nguồn, giống `spreadPaste`), gom id ô theo 2 nhóm tick/bỏ tick.
//
// Ô vượt biên lưới (hết hàng/cột) bị cắt âm thầm — dán từ Excel thường dư thừa ô trống ở rìa.
// Ô có toạ độ hợp lệ nhưng không có bản ghi dimension (lưới thưa) cũng bị bỏ qua tương tự.
// Ô có toạ độ hợp lệ nhưng giá trị nguồn không nhận diện được (`doiOSangTick` trả `null`) thì
// tính vào `boQua` để báo lại cho người dùng.
export function dungLoTuDan(matrix: string[][], vung: Rect, grid: Grid): KetQuaDan {
  const tick: number[] = [];
  const boTick: number[] = [];
  let boQua = 0;
  for (const { r, c, raw } of spreadPaste(matrix, vung.r0, vung.c0)) {
    if (r < 0 || r >= grid.tasks.length || c < 0 || c >= grid.columns.length) continue;
    const colName = grid.columns[c];
    const cell = grid.tasks[r].cells[colName];
    if (!cell) continue;
    const gia = doiOSangTick(raw);
    if (gia === null) {
      boQua++;
      continue;
    }
    (gia ? tick : boTick).push(cell.id);
  }
  if (tick.length > MAX_O_MOI_LO || boTick.length > MAX_O_MOI_LO) {
    return {
      loi: `Chọn tối đa ${MAX_O_MOI_LO} ô mỗi lần (đang có ${Math.max(tick.length, boTick.length)})`,
    };
  }
  return { tick, boTick, boQua };
}
