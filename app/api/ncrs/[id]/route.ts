import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// PATCH /api/ncrs/:id — cập nhật NCR (mọi vai trò sửa mô tả/gán/hạn/chuyển trạng thái
// open→fixing→recheck; đóng (status=closed) chỉ Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing =
    projectId != null
      ? await queryOne<{ status: string }>(
          `SELECT status FROM ncrs WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy NCR" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const sets: string[] = [];
  const values: unknown[] = [];

  if (typeof body?.description === "string") {
    const description = body.description.trim();
    if (!description) return NextResponse.json({ error: "Mô tả không được rỗng" }, { status: 422 });
    sets.push("description = ?");
    values.push(description);
  }
  if (body?.assignedTo !== undefined) {
    sets.push("assigned_to = ?");
    values.push(body.assignedTo === null ? null : Number(body.assignedTo));
  }
  if (body?.dueDate !== undefined) {
    sets.push("due_date = ?");
    values.push(body.dueDate || null);
  }
  if (typeof body?.status === "string") {
    if (!["open", "fixing", "recheck", "closed"].includes(body.status))
      return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
    if (body.status === "closed") {
      if (!CAN.approve(user.role))
        return NextResponse.json({ error: "Chỉ Admin/PM được đóng NCR" }, { status: 403 });
      sets.push("status = ?", "closed_at = NOW()");
      values.push(body.status);
    } else {
      sets.push("status = ?", "closed_at = NULL");
      values.push(body.status);
    }
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });

  await run(`UPDATE ncrs SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
  return NextResponse.json({ ok: true });
}
