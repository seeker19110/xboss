import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { deriveStatus, recomputePackage } from "@/lib/recompute";
import type { StatusSlug } from "@/lib/status";

export const dynamic = "force-dynamic";

type Task = { id: number; package_id: number; status: string | null; end_date: string | null; progress_percent: number | null };

// PATCH /api/tasks/:id/progress  body: { progress: 0..1, status?, note?, changedBy? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  let progress = Number(body.progress);
  if (isNaN(progress)) return NextResponse.json({ error: "Thiếu progress" }, { status: 400 });
  progress = Math.min(Math.max(progress, 0), 1);

  const task = await queryOne<Task>(`SELECT id, package_id, status, end_date, progress_percent FROM tasks WHERE id = ?`, id);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });

  const status: StatusSlug = body.status ?? deriveStatus(progress, task.end_date, task.status);

  await run(`UPDATE tasks SET progress_percent = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    progress, status, id);
  await run(`INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    id, task.progress_percent ?? 0, progress, status, body.note ?? null, body.changedBy ?? "web");

  await recomputePackage(task.package_id);

  return NextResponse.json({ id, progressPercent: progress, status });
}
