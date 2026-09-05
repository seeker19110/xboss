import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { visibleProjectIds } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// PATCH /api/towers/:id  body: { name } → đổi tên tháp.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Chống ghi xuyên dự án: tháp phải thuộc 1 dự án user thấy được (vá V9, cùng khuôn GET /api/towers).
  const visible = await visibleProjectIds(user);
  const tower0 = await queryOne<{ projectId: number | null }>(
    `SELECT project_id AS "projectId" FROM towers WHERE id = ?`,
    id,
  );
  if (!tower0 || !visible.includes(tower0.projectId as number))
    return NextResponse.json({ error: "Không tìm thấy tháp" }, { status: 404 });

  const { name } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: "Thiếu tên tháp" }, { status: 400 });

  await run(
    `UPDATE towers SET name = ? WHERE id = ? AND project_id = ANY(?)`,
    name.trim(),
    id,
    visible,
  );
  const tower = await queryOne(`SELECT id, name FROM towers WHERE id = ?`, id);
  return NextResponse.json({ tower });
}

// DELETE /api/towers/:id → xoá tháp (chỉ khi không còn sheet nào thuộc tháp).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Chống xoá xuyên dự án: tháp phải thuộc 1 dự án user thấy được (vá V9, cùng khuôn GET /api/towers).
  const visible = await visibleProjectIds(user);
  const tower0 = await queryOne<{ projectId: number | null }>(
    `SELECT project_id AS "projectId" FROM towers WHERE id = ?`,
    id,
  );
  if (!tower0 || !visible.includes(tower0.projectId as number))
    return NextResponse.json({ error: "Không tìm thấy tháp" }, { status: 404 });

  const hasSheets = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sheet_types WHERE tower_id = ?`,
    id,
  );
  if ((hasSheets?.n ?? 0) > 0)
    return NextResponse.json({ error: "Tháp còn sheet — xoá hết sheet trước" }, { status: 409 });

  await run(`DELETE FROM towers WHERE id = ? AND project_id = ANY(?)`, id, visible);
  return NextResponse.json({ deleted: id });
}
