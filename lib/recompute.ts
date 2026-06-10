import { query, queryOne, run, todayISO } from "@/lib/db";
import type { StatusSlug } from "@/lib/status";

export function deriveStatus(progress: number, endDate: string | null, current?: string | null): StatusSlug {
  if (current === "nghiem_thu") return "nghiem_thu";
  if (progress >= 1) return "hoan_thanh";
  if (endDate && endDate < todayISO()) return "tre";
  if (progress > 0) return "dang_thi_cong";
  return "chuan_bi";
}

// Tính lại % của task từ dimensions (nếu có), cập nhật task + work package cha.
export function recomputeTask(taskId: number): { progress: number; status: StatusSlug } | null {
  const task = queryOne<{ id: number; package_id: number; end_date: string | null; status: string | null; progress_percent: number | null }>(
    `SELECT id, package_id, end_date, status, progress_percent FROM tasks WHERE id = ?`, taskId);
  if (!task) return null;

  const dims = query<{ installed: number }>(`SELECT installed FROM progress_dimensions WHERE task_id = ?`, taskId);
  let progress = task.progress_percent ?? 0;
  if (dims.length > 0) {
    const done = dims.filter((d) => d.installed).length;
    progress = Math.round((done / dims.length) * 100) / 100;
  }
  const status = deriveStatus(progress, task.end_date, task.status);
  run(`UPDATE tasks SET progress_percent = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    progress, status, taskId);

  recomputePackage(task.package_id);
  return { progress, status };
}

// % work package = trung bình % các sub-task.
export function recomputePackage(packageId: number): void {
  const r = queryOne<{ avg: number | null; cnt: number }>(
    `SELECT AVG(progress_percent) AS avg, COUNT(*) AS cnt FROM tasks WHERE package_id = ?`, packageId);
  if (!r || !r.cnt) return;
  const progress = Math.round((r.avg ?? 0) * 100) / 100;
  const wp = queryOne<{ end_date: string | null; status: string | null }>(
    `SELECT end_date, status FROM work_packages WHERE id = ?`, packageId);
  run(`UPDATE work_packages SET progress = ?, status = ? WHERE id = ?`,
    progress, deriveStatus(progress, wp?.end_date ?? null, wp?.status), packageId);
}
