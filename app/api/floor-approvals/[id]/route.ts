import { NextRequest, NextResponse } from "next/server";
import { queryOne, query, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { deriveStatus, recomputePackage } from "@/lib/recompute";

export const dynamic = "force-dynamic";

// DELETE /api/floor-approvals/:id → huỷ nghiệm thu tầng (Admin/PM).
// Xoá bản ghi floor_approval (cascade xoá biên bản đính kèm),
// đặt lại trạng thái task về trạng thái tính từ tiến độ.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được huỷ nghiệm thu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const approval = await queryOne<{ id: number; sheet_type_id: number; floor_label: string; is_approved: boolean }>(
    `SELECT id, sheet_type_id, floor_label, is_approved FROM floor_approvals WHERE id = ?`, id);
  if (!approval) return NextResponse.json({ error: "Không tìm thấy bản ghi nghiệm thu" }, { status: 404 });
  if (!approval.is_approved) return NextResponse.json({ error: "Tầng này chưa được duyệt nghiệm thu" }, { status: 409 });

  // Lấy toàn bộ tasks trong tầng để đặt lại status
  const tasks = await query<{ id: number; package_id: number; progress_percent: number; end_date: string | null }>(
    `SELECT t.id, t.package_id, t.progress_percent, t.end_date
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
      WHERE wp.sheet_type_id = ? AND wp.floor_label = ?`,
    approval.sheet_type_id, approval.floor_label);

  // Hạ về draft — giữ lại biên bản đã upload, chỉ bỏ cờ is_approved
  await run(`UPDATE floor_approvals SET is_approved = FALSE, approved_by = NULL, approved_by_name = NULL, approved_at = NULL WHERE id = ?`, id);

  // Đặt lại trạng thái task
  const packageIds = new Set<number>();
  for (const t of tasks) {
    const status = deriveStatus(t.progress_percent ?? 0, t.end_date, null);
    await run(`UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, status, t.id);
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      t.id, t.progress_percent, t.progress_percent, status,
      `Huỷ nghiệm thu tầng ${approval.floor_label} bởi ${user.name}`, user.name);
    packageIds.add(t.package_id);
  }
  for (const pid of packageIds) await recomputePackage(pid);

  return NextResponse.json({ deleted: id, taskCount: tasks.length });
}
