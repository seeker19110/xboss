// Danh mục nguyên nhân trễ — dùng chung cho API validate + UI hiển thị.
export const DELAY_REASONS = [
  "thieu_vat_tu",
  "thieu_nhan_luc",
  "cho_mat_bang",
  "doi_thiet_ke",
  "thoi_tiet",
  "khac",
] as const;

export type DelayReason = (typeof DELAY_REASONS)[number];

export const DELAY_REASON_LABEL: Record<DelayReason, string> = {
  thieu_vat_tu: "Thiếu vật tư",
  thieu_nhan_luc: "Thiếu nhân lực",
  cho_mat_bang: "Chờ mặt bằng",
  doi_thiet_ke: "Đổi thiết kế",
  thoi_tiet: "Thời tiết",
  khac: "Khác",
};

export function isDelayReason(v: unknown): v is DelayReason {
  return typeof v === "string" && (DELAY_REASONS as readonly string[]).includes(v);
}
