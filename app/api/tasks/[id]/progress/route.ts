import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { deriveStatus, recomputePackage } from "@/lib/recompute";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import { handoverBlocked, methodStatementBlocked } from "@/lib/qaqc";
import type { StatusSlug } from "@/lib/status";

export const dynamic = "force-dynamic";

type Task = {
  id: number;
  package_id: number;
  status: string | null;
  end_date: string | null;
  progress_percent: number | null;
};

// PATCH /api/tasks/:id/progress  body: { progress: 0..1, status?, note? }
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Vai trò chỉ-xem (BCH/CĐT/Viewer) không được sửa tiến độ.
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền cập nhật tiến độ" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  if (!(await canTouchTask(user, id)))
    return NextResponse.json(
      { error: "Bạn chỉ được cập nhật task được giao cho mình" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  let progress = Number(body.progress);
  if (isNaN(progress)) return NextResponse.json({ error: "Thiếu progress" }, { status: 400 });
  progress = Math.min(Math.max(progress, 0), 1);

  // Bọc trong transaction + FOR UPDATE: tránh 2 request PATCH progress đồng thời trên
  // cùng task đọc chung 1 snapshot rồi ghi đè lẫn nhau (giống pattern ở dimensions route).
  const result = await withTransaction(async () => {
    const task = await queryOne<Task>(
      `SELECT id, package_id, status, end_date, progress_percent FROM tasks WHERE id = ? FOR UPDATE`,
      id,
    );
    if (!task) return { error: "Không tìm thấy task", httpStatus: 404 } as const;

    // Hold point chuyển bước (M3) + gate biện pháp thi công (M8): chỉ chặn khi tiến độ
    // TĂNG (thi công thêm) — hạ tiến độ để sửa sai không cần mở khoá.
    if (progress > (task.progress_percent ?? 0)) {
      const gate = await handoverBlocked(task.package_id);
      if (gate.blocked) return { error: gate.reason, httpStatus: 409 } as const;
      const methodGate = await methodStatementBlocked(task.package_id);
      if (methodGate.blocked) return { error: methodGate.reason, httpStatus: 409 } as const;
    }

    // status từ client chỉ nhận các slug hợp lệ, KHÔNG nhận nghiem_thu —
    // nghiệm thu bắt buộc đi qua POST /api/tasks/:id/approve (kiểm quyền + 100% + audit).
    // Thiếu chốt này thì subcon/engineer có thể tự nghiệm thu qua route progress.
    const ALLOWED_STATUS: StatusSlug[] = ["chuan_bi", "dang_thi_cong", "hoan_thanh", "tre"];
    let status: StatusSlug;
    if (body.status !== undefined) {
      if (!ALLOWED_STATUS.includes(body.status))
        return {
          error: "Trạng thái không hợp lệ (nghiệm thu phải qua /approve)",
          httpStatus: 422,
        } as const;
      status = body.status;
    } else {
      status = deriveStatus(progress, task.end_date, task.status);
    }

    await run(
      `UPDATE tasks SET progress_percent = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      progress,
      status,
      id,
    );
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      task.progress_percent ?? 0,
      progress,
      status,
      body.note ?? null,
      user.name,
    );

    return { packageId: task.package_id, status } as const;
  });

  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });

  await recomputePackage(result.packageId);

  return NextResponse.json({ id, progressPercent: progress, status: result.status });
}
