import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { taskProjectId } from "@/lib/tien-do/workpackages";

export const dynamic = "force-dynamic";

// DELETE /api/comments/:id → xoá bình luận. Tác giả hoặc Admin/PM.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const comment = await queryOne<{ id: number; user_id: number | null; task_id: number }>(
    `SELECT id, user_id, task_id FROM task_comments WHERE id = ?`,
    id,
  );
  if (!comment) return NextResponse.json({ error: "Không tìm thấy bình luận" }, { status: 404 });

  // Cách ly dự án/tổ chức (S02): bình luận phải thuộc task trong dự án đang chọn (khả kiến,
  // cùng org) — khớp GET/POST /api/tasks/:id/comments. Thiếu kiểm này thì Admin/PM tổ chức
  // khác xoá được bình luận bằng id đoán được. Khác scope → 404 như không tồn tại.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null || (await taskProjectId(comment.task_id)) !== projectId)
    return NextResponse.json({ error: "Không tìm thấy bình luận" }, { status: 404 });

  if (comment.user_id !== user.id && !CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Chỉ tác giả hoặc Admin/PM được xoá bình luận" },
      { status: 403 },
    );

  await run(`DELETE FROM task_comments WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
