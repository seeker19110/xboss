// lib/notification-prefs.ts — Cấu hình và danh mục tuỳ chọn thông báo
export const PREF_KEYS = [
  "delayed", // quá hạn
  "due_soon", // sắp đến hạn (5 ngày)
  "upcoming_start", // sắp bắt đầu (7 ngày)
  "activity_progress", // cập nhật tiến độ (48h)
  "activity_photo", // ảnh hiện trường (48h)
  "activity_document", // bản vẽ / tài liệu (48h)
  "activity_comment", // bình luận (48h)
  "material_over", // vật tư vượt định mức
] as const;

export type PrefKey = (typeof PREF_KEYS)[number];
export type Prefs = Partial<Record<PrefKey, boolean>>;
