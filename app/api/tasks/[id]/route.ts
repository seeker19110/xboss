import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";
import { recomputeTask, recomputePackage } from "@/lib/recompute";
import { assignTask } from "@/lib/assignments";
import { unlink } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// PATCH /api/tasks/:id  → sửa nội dung task (tên, code, BOQ, ngày, status, ghi chú). Admin/PM.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!CAN.editStructure(me?.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // nghiem_thu chỉ đặt/huỷ qua /api/tasks/:id/approve — đảm bảo có audit trong task_history.
  if (body.status === "nghiem_thu")
    return NextResponse.json({ error: "Dùng POST /api/tasks/:id/approve để nghiệm thu" }, { status: 422 });

  // drawingUrl: chỉ chấp nhận http/https hoặc null (chặn javascript: XSS).
  if (body.drawingUrl !== undefined && body.drawingUrl !== null) {
    const url = String(body.drawingUrl).trim();
    if (url && !/^https?:\/\//i.test(url))
      return NextResponse.json({ error: "Link bản vẽ phải bắt đầu bằng http:// hoặc https://" }, { status: 422 });
    body.drawingUrl = url || null;
  }

  // BOQCODE: duy nhất toàn cục (cả nhóm lẫn task); chuỗi rỗng = xoá mã.
  if (body.boqCode !== undefined) {
    const boq = String(body.boqCode ?? "").trim();
    body.boqCode = boq || null;
    if (boq) {
      const usedBy = await boqTakenBy(boq, { table: "tasks", id });
      if (usedBy) return NextResponse.json({ error: `Mã BOQ "${boq}" đã được dùng bởi ${usedBy}` }, { status: 409 });
    }
  }

  // assignedTo đi qua assignTask để đánh dấu gán thủ công
  // (null = đưa về kế thừa người phụ trách nhóm/hệ).
  let assignedHandled = false;
  if (body.assignedTo !== undefined) {
    await assignTask(id, body.assignedTo === null ? null : Number(body.assignedTo), me!.id);
    assignedHandled = true;
  }

  const fields: Record<string, string> = {
    name: "name", code: "code", note: "note", status: "status",
    startDate: "start_date", endDate: "end_date",
    boqCode: "boq_code", drawingUrl: "drawing_url",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); vals.push(body[key]); }
  }
  if (!sets.length && !assignedHandled)
    return NextResponse.json({ error: "Không có trường để cập nhật" }, { status: 400 });
  if (!sets.length) {
    const task = await queryOne(`SELECT id, code, name, status, boq_code AS "boqCode", drawing_url AS "drawingUrl" FROM tasks WHERE id = ?`, id);
    return NextResponse.json({ task });
  }

  vals.push(id);
  await run(`UPDATE tasks SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...vals);

  // Đổi deadline có thể đổi trạng thái trễ (tre ⇄ dang_thi_cong) → tính lại.
  if (body.endDate !== undefined || body.startDate !== undefined) await recomputeTask(id);

  const task = await queryOne(`SELECT id, code, name, status, boq_code AS "boqCode", drawing_url AS "drawingUrl" FROM tasks WHERE id = ?`, id);
  return NextResponse.json({ task });
}

// DELETE /api/tasks/:id — xoá task và toàn bộ dữ liệu liên quan. Admin/PM.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM mới xoá được task" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<{ id: number; package_id: number }>(`SELECT id, package_id FROM tasks WHERE id = ?`, id);
  if (!task) return NextResponse.json({ error: "Task không tồn tại" }, { status: 404 });

  // Xoá file ảnh và tài liệu đính kèm khỏi disk.
  const uploadDir = join(process.cwd(), "data", "uploads");
  const photos = await query<{ file_name: string }>(`SELECT file_name FROM task_photos WHERE task_id = ?`, id);
  const docs = await query<{ file_name: string }>(`SELECT file_name FROM task_documents WHERE task_id = ?`, id);
  for (const f of [...photos, ...docs]) {
    await unlink(join(uploadDir, f.file_name)).catch(() => {/* file đã xoá hoặc không tồn tại */});
  }

  // Xoá theo thứ tự FK.
  await run(`DELETE FROM notifications WHERE task_id = ?`, id);
  await run(`DELETE FROM baseline_tasks WHERE task_id = ?`, id);
  await run(`DELETE FROM task_photos WHERE task_id = ?`, id);
  await run(`DELETE FROM task_documents WHERE task_id = ?`, id);
  await run(`DELETE FROM task_comments WHERE task_id = ?`, id);
  await run(`DELETE FROM task_history WHERE task_id = ?`, id);
  await run(`DELETE FROM materials WHERE task_id = ?`, id);
  await run(`DELETE FROM progress_dimensions WHERE task_id = ?`, id);
  await run(`DELETE FROM tasks WHERE id = ?`, id);

  await recomputePackage(task.package_id);

  return NextResponse.json({ deleted: id });
}
