import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/package-dependencies/:id → xoá 1 quan hệ phụ thuộc (Admin/PM).
export async function DELETE(_req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa phụ thuộc" }, { status: 403 });

  const params = await paramsP;
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });

  await run(`DELETE FROM package_dependencies WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
