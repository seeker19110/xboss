import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/baselines/:id → xoá baseline (Admin/PM). baseline_tasks xoá theo CASCADE.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xoá baseline" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const b = await queryOne<{ id: number }>(`SELECT id FROM baselines WHERE id = ?`, id);
  if (!b) return NextResponse.json({ error: "Không tìm thấy baseline" }, { status: 404 });

  await run(`DELETE FROM baselines WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
