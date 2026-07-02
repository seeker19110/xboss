import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { deriveStatus, recomputePackage } from "@/lib/recompute";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: number;
  package_id: number;
  status: string;
  progress_percent: number;
  end_date: string | null;
  name: string;
};

// Workflow nghiệm thu 2 bước: thi công xong (100%) → Admin/PM duyệt nghiệm thu.
// Trạng thái nghiem_thu chỉ đặt được qua endpoint này — có audit trong task_history.

// POST /api/tasks/:id/approve → duyệt nghiệm thu (Admin/PM, task phải đạt 100%).
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được duyệt nghiệm thu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // FOR UPDATE để tránh 2 PM approve đồng thời tạo duplicate audit record.
  let packageId: number;
  try {
    packageId = await withTransaction(async () => {
      const task = await queryOne<TaskRow>(
        `SELECT id, package_id, status, progress_percent, end_date, name FROM tasks WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!task) throw Object.assign(new Error("Không tìm thấy task"), { status: 404 });
      if (task.status === "nghiem_thu")
        throw Object.assign(new Error("Task đã được nghiệm thu rồi"), { status: 409 });
      if ((task.progress_percent ?? 0) < 1)
        throw Object.assign(new Error("Task chưa hoàn thành 100% — không thể nghiệm thu"), {
          status: 422,
        });

      await run(
        `UPDATE tasks SET status = 'nghiem_thu', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        id,
      );
      await run(
        `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
           VALUES (?, ?, ?, 'nghiem_thu', ?, ?)`,
        id,
        task.progress_percent,
        task.progress_percent,
        `Nghiệm thu bởi ${user.name}`,
        user.name,
      );
      return task.package_id;
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  await recomputePackage(packageId);
  return NextResponse.json({ id, status: "nghiem_thu" });
}

// DELETE /api/tasks/:id/approve → huỷ nghiệm thu (Admin/PM) — trạng thái quay về suy ra từ tiến độ.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được huỷ nghiệm thu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // FOR UPDATE để tránh 2 người cùng huỷ nghiệm thu đồng thời tạo duplicate audit record
  // (đối xứng với POST — cùng nguy cơ TOCTOU nếu bỏ transaction/lock).
  let packageId: number;
  let status: string;
  try {
    ({ packageId, status } = await withTransaction(async () => {
      const task = await queryOne<TaskRow>(
        `SELECT id, package_id, status, progress_percent, end_date, name FROM tasks WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!task) throw Object.assign(new Error("Không tìm thấy task"), { status: 404 });
      if (task.status !== "nghiem_thu")
        throw Object.assign(new Error("Task chưa ở trạng thái nghiệm thu"), { status: 409 });

      // Truyền current = null để deriveStatus không giữ lại nghiem_thu.
      const newStatus = deriveStatus(task.progress_percent ?? 0, task.end_date, null);
      await run(
        `UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        newStatus,
        id,
      );
      await run(
        `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        task.progress_percent,
        task.progress_percent,
        newStatus,
        `Huỷ nghiệm thu bởi ${user.name}`,
        user.name,
      );
      return { packageId: task.package_id, status: newStatus };
    }));
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  await recomputePackage(packageId);

  return NextResponse.json({ id, status });
}
