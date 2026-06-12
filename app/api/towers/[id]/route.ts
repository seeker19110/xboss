import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/towers/:id  body: { name } → đổi tên tháp.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!CAN.editStructure(user?.role))
    return NextResponse.json({ error: "Chỉ Admin/PM" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const { name } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: "Thiếu tên tháp" }, { status: 400 });

  await run(`UPDATE towers SET name = ? WHERE id = ?`, name.trim(), id);
  const tower = await queryOne(`SELECT id, name FROM towers WHERE id = ?`, id);
  return NextResponse.json({ tower });
}

// DELETE /api/towers/:id → xoá tháp (chỉ khi không còn sheet nào thuộc tháp).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!CAN.editStructure(user?.role))
    return NextResponse.json({ error: "Chỉ Admin/PM" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const hasSheets = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sheet_types WHERE tower_id = ?`, id);
  if ((hasSheets?.n ?? 0) > 0)
    return NextResponse.json({ error: "Tháp còn sheet — xoá hết sheet trước" }, { status: 409 });

  await run(`DELETE FROM towers WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
