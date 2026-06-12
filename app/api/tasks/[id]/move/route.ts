import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/tasks/:id/move  body: { direction: 'up' | 'down' }
// Hoán đổi sort_order với task liền kề trong cùng package.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM mới di chuyển được" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const dir = String(body.direction ?? "");
  if (dir !== "up" && dir !== "down") return NextResponse.json({ error: "direction phải là 'up' hoặc 'down'" }, { status: 400 });

  const cur = await queryOne<{ sort_order: number; package_id: number }>(
    `SELECT sort_order, package_id FROM tasks WHERE id = ?`, id);
  if (!cur) return NextResponse.json({ error: "Task không tồn tại" }, { status: 404 });

  const op = dir === "up" ? `< ${cur.sort_order} ORDER BY sort_order DESC` : `> ${cur.sort_order} ORDER BY sort_order ASC`;
  const neighbor = await queryOne<{ id: number; sort_order: number }>(
    `SELECT id, sort_order FROM tasks WHERE package_id = ? AND sort_order ${op} LIMIT 1`,
    cur.package_id);

  if (!neighbor) return NextResponse.json({ ok: false, message: "Đã ở đầu/cuối danh sách" });

  await run(`UPDATE tasks SET sort_order = ? WHERE id = ?`, neighbor.sort_order, id);
  await run(`UPDATE tasks SET sort_order = ? WHERE id = ?`, cur.sort_order, neighbor.id);

  return NextResponse.json({ ok: true });
}
