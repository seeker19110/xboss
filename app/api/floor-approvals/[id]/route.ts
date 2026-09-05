import { NextRequest, NextResponse } from "next/server";
import { queryOne, query, run, withTransaction } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { sheetTypeProjectId } from "@/lib/tien-do/workpackages";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { deriveStatus, recomputePackage } from "@/lib/tien-do/recompute";

export const dynamic = "force-dynamic";

// DELETE /api/floor-approvals/:id → huỷ nghiệm thu tầng (Admin/PM).
// Xoá bản ghi floor_approval (cascade xoá biên bản đính kèm),
// đặt lại trạng thái task về trạng thái tính từ tiến độ.
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

  const approval = await queryOne<{
    id: number;
    sheet_type_id: number;
    floor_label: string;
    is_approved: boolean;
  }>(`SELECT id, sheet_type_id, floor_label, is_approved FROM floor_approvals WHERE id = ?`, id);
  if (!approval)
    return NextResponse.json({ error: "Không tìm thấy bản ghi nghiệm thu" }, { status: 404 });

  // Cách ly dự án — cùng khối đã có ở 3 route anh em (`floor-approvals` POST và
  // `floor-approvals/:id/documents` POST/DELETE). Thiếu ở đây thì Admin/PM dự án A đoán
  // `id` (số nguyên tuần tự) là huỷ được nghiệm thu tầng của dự án B (audit 2026-09-05).
  const projectId = await getCurrentProjectId(user);
  if (projectId == null || (await sheetTypeProjectId(approval.sheet_type_id)) !== projectId)
    return NextResponse.json({ error: "Không tìm thấy bản ghi nghiệm thu" }, { status: 404 });

  // Toàn bộ chuỗi huỷ (bỏ cờ duyệt → đặt lại status task → ghi audit) bọc trong MỘT
  // transaction + FOR UPDATE như `/api/approvals` (đường duyệt). Trước đây chạy rời: lỗi
  // giữa chừng để lại tầng đã bỏ cờ duyệt nhưng task vẫn `nghiem_thu`, và race được với
  // tick checkbox đang chạy đồng thời.
  const taskCount = await withTransaction(async () => {
    const locked = await queryOne<{ is_approved: boolean }>(
      `SELECT is_approved FROM floor_approvals WHERE id = ? FOR UPDATE`,
      id,
    );
    if (!locked?.is_approved)
      throw Object.assign(new Error("Tầng này chưa được duyệt nghiệm thu"), { status: 409 });

    // Lấy toàn bộ tasks trong tầng để đặt lại status. COALESCE(t.end_date, wp.end_date):
    // task.end_date NULL = kế thừa ngày KT nhóm (lib/recompute.ts).
    const tasks = await query<{
      id: number;
      package_id: number;
      progress_percent: number;
      end_date: string | null;
    }>(
      `SELECT t.id, t.package_id, t.progress_percent, COALESCE(t.end_date, wp.end_date) AS end_date
         FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
        WHERE wp.sheet_type_id = ? AND wp.floor_label = ?
        FOR UPDATE OF t`,
      approval.sheet_type_id,
      approval.floor_label,
    );

    // Hạ về draft — giữ lại biên bản đã upload, chỉ bỏ cờ is_approved
    await run(
      `UPDATE floor_approvals SET is_approved = FALSE, approved_by = NULL, approved_by_name = NULL, approved_at = NULL WHERE id = ?`,
      id,
    );

    // Đặt lại trạng thái task — bulk UPDATE + bulk INSERT audit history để tránh N+1.
    // `deriveStatus(..., null)` cố ý bỏ qua trạng thái hiện tại: đây là hành vi huỷ do
    // Admin/PM chủ động (không phải hạ cấp TỰ ĐỘNG), và sau khi duyệt tầng thì mọi task
    // trong tầng đều đang `nghiem_thu` — truyền trạng thái hiện tại vào sẽ khiến nút huỷ
    // không làm gì cả. Đánh đổi đã biết: task từng được duyệt riêng lẻ trước đó cũng bị
    // huỷ theo (schema chưa có cờ phân biệt nguồn duyệt) — ghi nợ trong PROGRESS.md.
    if (tasks.length > 0) {
      const statuses = tasks.map((t) => deriveStatus(t.progress_percent ?? 0, t.end_date, null));
      const updatePh = tasks.map(() => "(?::int, ?::text)").join(", ");
      const updateVals = tasks.flatMap((t, i) => [t.id, statuses[i]]);
      await run(
        `UPDATE tasks t SET status = v.status, updated_at = CURRENT_TIMESTAMP
           FROM (VALUES ${updatePh}) AS v(id, status)
          WHERE t.id = v.id`,
        ...updateVals,
      );

      const note = `Huỷ nghiệm thu tầng ${approval.floor_label} bởi ${user.name}`;
      const histPh = tasks.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      const histVals = tasks.flatMap((t, i) => [
        t.id,
        t.progress_percent,
        t.progress_percent,
        statuses[i],
        note,
        user.name,
      ]);
      await run(
        `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by) VALUES ${histPh}`,
        ...histVals,
      );
    }

    const packageIds = new Set(tasks.map((t) => t.package_id));
    for (const pid of packageIds) await recomputePackage(pid);
    return tasks.length;
  }).catch((e: unknown) => {
    const status = (e as { status?: number })?.status;
    if (status) return NextResponse.json({ error: (e as Error).message }, { status });
    throw e;
  });
  if (typeof taskCount !== "number") return taskCount;

  return NextResponse.json({ deleted: id, taskCount });
}
