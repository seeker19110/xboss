import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/materials/:id/move  body: { direction: 'up' | 'down' }
// Hoán đổi sort_order với vật tư liền kề trong cùng sheet (hoặc toàn bộ nếu không có filter).
export async function PATCH(req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM/Kỹ sư mới di chuyển được" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const dir = String(body.direction ?? "");
  if (dir !== "up" && dir !== "down") return NextResponse.json({ error: "direction phải là 'up' hoặc 'down'" }, { status: 400 });

  const cur = await queryOne<{ sort_order: number; sheet_type_id: number | null }>(
    `SELECT sort_order, sheet_type_id FROM materials WHERE id = ?`, id);
  if (!cur) return NextResponse.json({ error: "Vật tư không tồn tại" }, { status: 404 });

  let neighbor: { id: number; sort_order: number } | undefined;
  if (cur.sheet_type_id != null) {
    neighbor = await queryOne<{ id: number; sort_order: number }>(
      dir === "up"
        ? `SELECT id, sort_order FROM materials WHERE sheet_type_id = ? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1`
        : `SELECT id, sort_order FROM materials WHERE sheet_type_id = ? AND sort_order > ? ORDER BY sort_order ASC LIMIT 1`,
      cur.sheet_type_id, cur.sort_order);
  } else {
    neighbor = await queryOne<{ id: number; sort_order: number }>(
      dir === "up"
        ? `SELECT id, sort_order FROM materials WHERE sheet_type_id IS NULL AND sort_order < ? ORDER BY sort_order DESC LIMIT 1`
        : `SELECT id, sort_order FROM materials WHERE sheet_type_id IS NULL AND sort_order > ? ORDER BY sort_order ASC LIMIT 1`,
      cur.sort_order);
  }

  if (!neighbor) return NextResponse.json({ ok: false, message: "Đã ở đầu/cuối danh sách" });

  await run(`UPDATE materials SET sort_order = ? WHERE id = ?`, neighbor.sort_order, id);
  await run(`UPDATE materials SET sort_order = ? WHERE id = ?`, cur.sort_order, neighbor.id);

  return NextResponse.json({ ok: true });
}
