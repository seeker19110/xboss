// Danh mục HSE dùng chung cho client/server; giữ module thuần, không kéo theo DB.
export const HSE_KINDS = ["inspection", "toolbox", "incident", "near_miss", "permit"] as const;
export type HseKind = (typeof HSE_KINDS)[number];
export const HSE_KIND_LABEL: Record<HseKind, string> = {
  inspection: "Kiểm tra định kỳ",
  toolbox: "Toolbox talk",
  incident: "Sự cố",
  near_miss: "Cận nguy",
  permit: "Giấy phép làm việc",
};

export const HSE_SEVERITIES = ["low", "medium", "high"] as const;
export type HseSeverity = (typeof HSE_SEVERITIES)[number];
export const HSE_SEVERITY_LABEL: Record<HseSeverity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

export const HSE_PERMIT_TYPES = ["hot_work", "height", "confined", "electrical"] as const;
export type HsePermitType = (typeof HSE_PERMIT_TYPES)[number];
export const HSE_PERMIT_TYPE_LABEL: Record<HsePermitType, string> = {
  hot_work: "Hàn/cắt nóng",
  height: "Làm việc trên cao",
  confined: "Không gian hạn chế",
  electrical: "Điện",
};

export const HSE_ACTION_STATUSES = ["none", "open", "closed"] as const;
export type HseActionStatus = (typeof HSE_ACTION_STATUSES)[number];
