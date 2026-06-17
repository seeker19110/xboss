import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { run } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/payments/bills/:id — xoá bill thanh toán.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xoá bill thanh toán" }, { status: 403 });

  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  await run(`DELETE FROM payment_bills WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
