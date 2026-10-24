// Danh mục rủi ro dùng chung cho client/server; giữ module thuần, không kéo theo DB.
export const RISK_CATEGORIES = [
  "schedule",
  "cost",
  "quality",
  "safety",
  "material",
  "other",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];
export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  schedule: "Tiến độ",
  cost: "Chi phí",
  quality: "Chất lượng",
  safety: "An toàn",
  material: "Vật tư",
  other: "Khác",
};

export const RISK_STATUSES = ["open", "mitigating", "closed"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];
export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  open: "Đang mở",
  mitigating: "Đang giảm thiểu",
  closed: "Đã đóng",
};
