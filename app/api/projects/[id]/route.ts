import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_STATUS = ["active", "handover", "closed"];
const PATCHABLE_FIELDS = ["name", "code", "investor", "contractor", "status", "color"] as const;

// PATCH /api/projects/:id  body: { name?, code?, investor?, contractor?, status?, color? }
// — sửa dự án (CAN.manageProjects — Admin). Chỉ cập nhật field có mặt trong body.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (body.status !== undefined && !VALID_STATUS.includes(String(body.status)))
    return NextResponse.json({ error: "status không hợp lệ" }, { status: 422 });
  if (body.name !== undefined && !String(body.name).trim())
    return NextResponse.json({ error: "Tên dự án không được rỗng" }, { status: 422 });

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const field of PATCHABLE_FIELDS) {
    if (body[field] === undefined) continue;
    sets.push(`${field} = ?`);
    values.push(body[field] === null ? null : String(body[field]));
  }
  if (sets.length === 0)
    return NextResponse.json({ error: "Không có trường nào để cập nhật" }, { status: 422 });

  try {
    await run(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json({ error: "Mã dự án đã tồn tại" }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/projects/:id — xoá dự án (CAN.manageProjects — Admin), CHỈ khi rỗng dữ liệu
// (mọi bảng nghiệp vụ mang project_id đều FK RESTRICT — Postgres tự chặn, bắt lỗi 23503).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  try {
    const { changes } = await run(`DELETE FROM projects WHERE id = ?`, id);
    if (changes === 0) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
  } catch (err) {
    if ((err as { code?: string }).code === "23503")
      return NextResponse.json(
        { error: "Dự án còn dữ liệu (công trình/hồ sơ/vật tư...) — không thể xoá" },
        { status: 409 },
      );
    throw err;
  }
  return NextResponse.json({ ok: true });
}
