import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  findPersonnelById,
  maskIdNumber,
  parsePersonnelBody,
  validatePersonnelInput,
  type PersonnelInput,
} from "@/lib/hr";

export const dynamic = "force-dynamic";

// GET /api/personnel/:id — chi tiết nhân sự. Scoped theo dự án đang chọn (M22); CCCD
// chỉ admin/pm thấy.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const personnel = await findPersonnelById(id, projectId);
  if (!personnel) return NextResponse.json({ error: "Không tìm thấy nhân sự" }, { status: 404 });

  return NextResponse.json({ personnel: maskIdNumber([personnel], isAdminOrPm(user.role))[0] });
}

// PATCH /api/personnel/:id — sửa nhân sự (Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa nhân sự (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await findPersonnelById(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy nhân sự" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...(existing as unknown as PersonnelInput) };
  for (const key of ["code", "fullName", "roleTitle", "supplierId", "phone", "idNumber", "status"])
    if (key in body) merged[key] = body[key];
  const input = parsePersonnelBody(merged);

  const invalid = validatePersonnelInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.supplierId != null) {
    if (!(await queryOne(`SELECT id FROM suppliers WHERE id = ?`, input.supplierId)))
      return NextResponse.json({ error: "Nhà thầu phụ không tồn tại" }, { status: 422 });
  }

  await run(
    `UPDATE personnel SET code = ?, full_name = ?, role_title = ?, supplier_id = ?, phone = ?,
            id_number = ?, status = ?
      WHERE id = ?`,
    input.code,
    input.fullName,
    input.roleTitle,
    input.supplierId,
    input.phone,
    input.idNumber,
    input.status,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/personnel/:id — xoá nhân sự (Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá nhân sự (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await findPersonnelById(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy nhân sự" }, { status: 404 });

  await run(`DELETE FROM personnel WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
