/** % tiến độ để HIỂN THỊ — làm tròn XUỐNG để 99,6% không hiện thành 100% (chưa xong thật).
 *  `null` khi không có việc hợp lệ nào (A4-FR08): 0% sẽ nói dối là "chưa làm gì". */
export function phanTramTienDo(
  progress: number | null | undefined,
  coDuLieu: boolean,
): number | null {
  if (!coDuLieu || progress == null) return null;
  return Math.floor(progress * 100 + 1e-9);
}
