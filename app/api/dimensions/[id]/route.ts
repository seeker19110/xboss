import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { recomputeTask } from "@/lib/recompute";
import { getCurrentUser, canTouchTask } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/dimensions/:id  body: { installed: boolean }  → toggle + tính lại % task/package.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const installed = body.installed ? 1 : 0;

  const dim = await queryOne<{ task_id: number }>(`SELECT task_id FROM progress_dimensions WHERE id = ?`, id);
  if (!dim) return NextResponse.json({ error: "Không tìm thấy dimension" }, { status: 404 });

  if (!(await canTouchTask(user, dim.task_id)))
    return NextResponse.json({ error: "Bạn chỉ được cập nhật task được giao cho mình" }, { status: 403 });

  await run(`UPDATE progress_dimensions SET installed = ?, value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    installed, installed, id);

  const result = await recomputeTask(dim.task_id, user.name);
  return NextResponse.json({ id, installed: !!installed, task: result });
}
