import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/comments/:id → xoá bình luận. Tác giả hoặc Admin/PM.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const comment = await queryOne<{ id: number; user_id: number | null }>(
    `SELECT id, user_id FROM task_comments WHERE id = ?`, id);
  if (!comment) return NextResponse.json({ error: "Không tìm thấy bình luận" }, { status: 404 });

  if (comment.user_id !== user.id && !CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ tác giả hoặc Admin/PM được xoá bình luận" }, { status: 403 });

  await run(`DELETE FROM task_comments WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
