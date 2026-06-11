import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { deriveStatus, recomputePackage } from "@/lib/recompute";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: number; package_id: number; status: string;
  progress_percent: number; end_date: string | null; name: string;
};

// Workflow nghiệm thu 2 bước: thi công xong (100%) → Admin/PM duyệt nghiệm thu.
// Trạng thái nghiem_thu chỉ đặt được qua endpoint này — có audit trong task_history.

// POST /api/tasks/:id/approve → duyệt nghiệm thu (Admin/PM, task phải đạt 100%).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được duyệt nghiệm thu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<TaskRow>(
    `SELECT id, package_id, status, progress_percent, end_date, name FROM tasks WHERE id = ?`, id);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (task.status === "nghiem_thu")
    return NextResponse.json({ error: "Task đã được nghiệm thu rồi" }, { status: 409 });
  if ((task.progress_percent ?? 0) < 1)
    return NextResponse.json({ error: "Task chưa hoàn thành 100% — không thể nghiệm thu" }, { status: 422 });

  await run(`UPDATE tasks SET status = 'nghiem_thu', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id);
  await run(`INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
       VALUES (?, ?, ?, 'nghiem_thu', ?, ?)`,
    id, task.progress_percent, task.progress_percent, `Nghiệm thu bởi ${user.name}`, user.name);
  await recomputePackage(task.package_id);

  return NextResponse.json({ id, status: "nghiem_thu" });
}

// DELETE /api/tasks/:id/approve → huỷ nghiệm thu (Admin/PM) — trạng thái quay về suy ra từ tiến độ.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được huỷ nghiệm thu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<TaskRow>(
    `SELECT id, package_id, status, progress_percent, end_date, name FROM tasks WHERE id = ?`, id);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (task.status !== "nghiem_thu")
    return NextResponse.json({ error: "Task chưa ở trạng thái nghiệm thu" }, { status: 409 });

  // Truyền current = null để deriveStatus không giữ lại nghiem_thu.
  const status = deriveStatus(task.progress_percent ?? 0, task.end_date, null);
  await run(`UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, status, id);
  await run(`INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    id, task.progress_percent, task.progress_percent, status, `Huỷ nghiệm thu bởi ${user.name}`, user.name);
  await recomputePackage(task.package_id);

  return NextResponse.json({ id, status });
}
