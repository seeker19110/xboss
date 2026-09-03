// Ngăn xếp hoàn tác/làm lại cho thao tác tick (M121 FR4) — THUẦN, không React, không fetch.
// Tách riêng để test được đầy đủ mà không phải dựng DOM: mọi luật "hoàn tác cái gì, còn lại
// bao nhiêu bước" nằm ở đây, lớp React chỉ giữ state và gọi.

/** Một thao tác tick đã thực hiện: các ô bị đổi, giá trị TRƯỚC của từng ô, và giá trị đã đặt. */
export type MucTick = {
  dimIds: number[];
  /** Cùng chỉ số với `dimIds` — cần để hoàn tác đúng từng ô (một lô có thể trộn ô đang tick và chưa tick). */
  truoc: boolean[];
  sau: boolean;
};

export type LichSuTick = { hoanTac: MucTick[]; lamLai: MucTick[] };

/** Giữ 50 bước gần nhất — đủ cho một buổi làm việc, không phình bộ nhớ tab. */
export const SO_BUOC_TOI_DA = 50;

export const LICH_SU_RONG: LichSuTick = { hoanTac: [], lamLai: [] };

// Ghi một thao tác vừa làm. Thao tác mới XOÁ nhánh "làm lại" — đúng ngữ nghĩa undo/redo quen
// thuộc: đã rẽ nhánh mới thì nhánh cũ không còn nối tiếp được nữa.
export function ghiThaoTac(ls: LichSuTick, muc: MucTick): LichSuTick {
  if (!muc.dimIds.length) return ls; // không có ô nào → không phải một bước lịch sử
  return { hoanTac: [...ls.hoanTac, muc].slice(-SO_BUOC_TOI_DA), lamLai: [] };
}

/** Các lô cần gửi để đảo ngược một thao tác: gom ô theo giá trị TRƯỚC (tick / bỏ tick). */
export type LoDao = { dimIds: number[]; installed: boolean };

// Một lô có thể trộn ô vốn đang tick và ô vốn chưa tick (vd "tick cả hàng" khi hàng đang dở).
// Hoàn tác vì vậy phải tách thành tối đa 2 lô, không thể gửi một giá trị duy nhất.
export function loDeHoanTac(muc: MucTick): LoDao[] {
  const bat: number[] = [];
  const tat: number[] = [];
  muc.dimIds.forEach((id, i) => (muc.truoc[i] ? bat : tat).push(id));
  const lo: LoDao[] = [];
  if (bat.length) lo.push({ dimIds: bat, installed: true });
  if (tat.length) lo.push({ dimIds: tat, installed: false });
  return lo;
}

/** Lô để làm lại một thao tác — luôn 1 lô vì `sau` là giá trị chung của cả thao tác. */
export function loDeLamLai(muc: MucTick): LoDao[] {
  return muc.dimIds.length ? [{ dimIds: muc.dimIds, installed: muc.sau }] : [];
}

// Lấy thao tác gần nhất để hoàn tác. KHÔNG tự chuyển sang ngăn "làm lại" ngay: lớp gọi phải
// gửi request trước, thành công mới `xacNhanHoanTac`. Nếu server từ chối (hold-point chưa mở)
// thì mục vẫn nằm nguyên trong ngăn hoàn tác để người dùng thử lại sau (M121 FR5) — hoàn tác
// không phải cửa hậu để lách gate.
export function mucDeHoanTac(ls: LichSuTick): MucTick | null {
  return ls.hoanTac.at(-1) ?? null;
}

export function mucDeLamLai(ls: LichSuTick): MucTick | null {
  return ls.lamLai.at(-1) ?? null;
}

/** Gọi SAU khi request hoàn tác thành công: chuyển mục sang ngăn làm lại. */
export function xacNhanHoanTac(ls: LichSuTick): LichSuTick {
  const muc = ls.hoanTac.at(-1);
  if (!muc) return ls;
  return { hoanTac: ls.hoanTac.slice(0, -1), lamLai: [...ls.lamLai, muc].slice(-SO_BUOC_TOI_DA) };
}

/** Gọi SAU khi request làm lại thành công: chuyển mục ngược về ngăn hoàn tác. */
export function xacNhanLamLai(ls: LichSuTick): LichSuTick {
  const muc = ls.lamLai.at(-1);
  if (!muc) return ls;
  return { hoanTac: [...ls.hoanTac, muc].slice(-SO_BUOC_TOI_DA), lamLai: ls.lamLai.slice(0, -1) };
}
