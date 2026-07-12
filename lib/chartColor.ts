// Màu đường biểu đồ so sánh 2 chuỗi số (vd kế hoạch vs thực tế): chỉ số đang cao hơn
// mốc so sánh → xanh, thấp hơn nhẹ → vàng, càng lệch xa mốc thì càng chuyển dần sang đỏ.
// Dùng chung cho mọi biểu đồ có nhu cầu tô màu theo độ lệch (không riêng S-curve).
const GREEN = "var(--color-emerald-400)";
const YELLOW = "var(--color-amber-400)";
const ORANGE = "var(--color-orange-500)";
const RED = "var(--color-red-500)";
const NEUTRAL = "var(--color-zinc-500)";

// Ngưỡng lệch (đơn vị: điểm %) tính từ 0 → càng âm càng lệch xa mốc kế hoạch.
const YELLOW_AT = -8;
const ORANGE_AT = -18;
const RED_AT = -30;

/** Trả về màu (CSS var) theo độ lệch so với mốc so sánh; `diff` = giá trị hiện tại - giá trị mốc. */
export function diffColor(diff: number | null | undefined): string {
  if (diff == null || Number.isNaN(diff)) return NEUTRAL;
  if (diff >= 0) return GREEN;
  if (diff >= YELLOW_AT) return GREEN;
  if (diff >= ORANGE_AT) return YELLOW;
  if (diff >= RED_AT) return ORANGE;
  return RED;
}
