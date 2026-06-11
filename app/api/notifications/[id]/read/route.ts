import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/notifications/:id/read → đánh dấu đã đọc (chỉ của chính mình).
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const n = await queryOne<{ id: number }>(`SELECT id FROM notifications WHERE id = ? AND user_id = ?`, id, user.id);
  if (!n) return NextResponse.json({ error: "Không tìm thấy thông báo" }, { status: 404 });

  await run(`UPDATE notifications SET is_read = 1 WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
