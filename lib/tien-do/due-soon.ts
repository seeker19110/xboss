// lib/tien-do/due-soon.ts — M127: điều kiện "sắp đến hạn" dùng chung.
//
// Trước đây điều kiện này chỉ nằm trong lib/dich-vu/thong-bao.ts (sinh thông báo
// `due_soon`). M127 cần đúng điều kiện đó cho khối `dueSoon` của /api/dashboard và
// `summary.dueSoon` của /api/my-tasks → tách ra đây để dùng chung, không copy SQL.
//
// Quy ước: COALESCE(t.end_date, wp.end_date) — task.end_date NULL = kế thừa ngày KT
// của nhóm (lib/tien-do/recompute.ts). Alias bảng cố định `t` (tasks) và `wp`
// (work_packages) — mọi query dùng hằng này phải đặt đúng alias đó.
import { daysFromTodayISO, todayISO } from "@/lib/db";
import { getAlertThreshold } from "@/lib/van-hanh/alerts";

/**
 * Mệnh đề WHERE "sắp đến hạn" — cần đúng 3 tham số theo thứ tự:
 * `today`, `soon`, `progress` (xem `dueSoonParams`).
 */
export const DUE_SOON_COND = `COALESCE(t.end_date, wp.end_date) IS NOT NULL AND COALESCE(t.end_date, wp.end_date) >= ? AND COALESCE(t.end_date, wp.end_date) <= ?
        AND t.progress_percent < ? AND t.status NOT IN ('hoan_thanh','nghiem_thu')`;

export type DueSoonThresholds = {
  /** Số ngày trước hạn bắt đầu cảnh báo (alert_rules.due_soon_days, mặc định 3). */
  days: number;
  /** Ngưỡng tiến độ (alert_rules.due_soon_progress, mặc định 0.7). */
  progress: number;
  /** Ngày hôm nay ISO. */
  today: string;
  /** Mốc cuối khoảng: hôm nay + days. */
  soon: string;
};

/** Đọc ngưỡng "sắp đến hạn" của dự án (null = mức mặc định toàn hệ thống). */
export async function loadDueSoonThresholds(
  projectId: number | null,
): Promise<DueSoonThresholds> {
  const days = await getAlertThreshold("due_soon_days", projectId);
  const progress = await getAlertThreshold("due_soon_progress", projectId);
  return { days, progress, today: todayISO(), soon: daysFromTodayISO(days) };
}

/** Bộ tham số khớp đúng thứ tự placeholder trong `DUE_SOON_COND`. */
export function dueSoonParams(th: DueSoonThresholds): [string, string, number] {
  return [th.today, th.soon, th.progress];
}

/** Kiểm tra "sắp đến hạn" phía JS (dùng cho danh sách task đã tải sẵn). */
export function isDueSoon(
  task: { endDate: string | null; progressPercent: number; status: string },
  th: DueSoonThresholds,
): boolean {
  if (!task.endDate) return false;
  if (task.endDate < th.today || task.endDate > th.soon) return false;
  if (task.progressPercent >= th.progress) return false;
  return task.status !== "hoan_thanh" && task.status !== "nghiem_thu";
}
