import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/auth";
import { isDelayReason } from "@/lib/delay";

export const dynamic = "force-dynamic";

// POST /api/tasks/:id/delay-reason  body: { reason: slug | null, note? }
// Gán nguyên nhân trễ — mọi vai trò cập nhật tiến độ được gán (người tại hiện trường
// biết lý do rõ nhất); subcon chỉ cho task được giao. reason=null xoá tag.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const task = await queryOne<{ id: number }>(`SELECT id FROM tasks WHERE id = ?`, id);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (!(await canTouchTask(user, id)))
    return NextResponse.json({ error: "Bạn chỉ được gán lý do cho task được giao cho mình" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason = body.reason ?? null;
  if (reason !== null && !isDelayReason(reason))
    return NextResponse.json({ error: "Nguyên nhân không hợp lệ" }, { status: 400 });
  const note = String(body.note ?? "").trim().slice(0, 500) || null;

  await run(`UPDATE tasks SET delay_reason = ?, delay_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    reason, reason ? note : null, id);

  return NextResponse.json({ id, reason, note: reason ? note : null });
}
