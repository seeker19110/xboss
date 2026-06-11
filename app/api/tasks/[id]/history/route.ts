import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/tasks/:id/history → lịch sử thay đổi tiến độ (mới nhất trước).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<{ id: number; code: string; name: string }>(
    `SELECT id, code, name FROM tasks WHERE id = ?`, id);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });

  const history = await query<{
    id: number; oldProgress: number | null; newProgress: number | null;
    status: string | null; note: string | null; changedBy: string | null; changedAt: string;
  }>(
    `SELECT id, old_progress AS "oldProgress", new_progress AS "newProgress",
            status, note, changed_by AS "changedBy", changed_at AS "changedAt"
       FROM task_history WHERE task_id = ?
      ORDER BY changed_at DESC, id DESC LIMIT 100`, id);

  return NextResponse.json({ task, history });
}
