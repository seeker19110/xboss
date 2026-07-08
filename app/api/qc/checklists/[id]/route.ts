import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { validateChecklistItems } from "@/lib/qaqc";

export const dynamic = "force-dynamic";

// PATCH /api/qc/checklists/:id — sửa mẫu checklist (Admin/PM), scoped theo dự án đang
// chọn (M22) — sai dự án → 404 "không tìm thấy" (tránh lộ tồn tại của bản ghi).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa checklist" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing =
    projectId != null
      ? await queryOne(
          `SELECT id FROM qc_checklists WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy checklist" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const sets: string[] = [];
  const values: unknown[] = [];

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Tên không được rỗng" }, { status: 422 });
    sets.push("name = ?");
    values.push(name);
  }
  if (typeof body?.category === "string") {
    if (!["work", "tc", "hse"].includes(body.category))
      return NextResponse.json({ error: "Loại checklist không hợp lệ" }, { status: 422 });
    sets.push("category = ?");
    values.push(body.category);
  }
  if (body?.disciplineId !== undefined) {
    const disciplineId = body.disciplineId === null ? null : Number(body.disciplineId);
    if (disciplineId !== null) {
      if (
        !Number.isInteger(disciplineId) ||
        !(await queryOne(`SELECT id FROM disciplines WHERE id = ?`, disciplineId))
      )
        return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
    }
    sets.push("discipline_id = ?");
    values.push(disciplineId);
  }
  if (typeof body?.required === "boolean") {
    sets.push("required = ?");
    values.push(body.required);
  }
  if (typeof body?.active === "boolean") {
    sets.push("active = ?");
    values.push(body.active);
  }
  if (body?.items !== undefined) {
    if (!validateChecklistItems(body.items))
      return NextResponse.json({ error: "Danh sách hạng mục không hợp lệ" }, { status: 422 });
    sets.push("items = ?::jsonb");
    values.push(JSON.stringify(body.items));
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });

  await run(`UPDATE qc_checklists SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
  return NextResponse.json({ ok: true });
}

// DELETE /api/qc/checklists/:id — xoá mẫu checklist (Admin/PM), scoped theo dự án đang
// chọn. Chặn nếu đã có lần kiểm dùng mẫu (giữ nguyên logic 409 hiện có).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xoá checklist" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy checklist" }, { status: 404 });

  try {
    const result = await run(
      `DELETE FROM qc_checklists WHERE id = ? AND project_id = ?`,
      id,
      projectId,
    );
    if (result.changes === 0)
      return NextResponse.json({ error: "Không tìm thấy checklist" }, { status: 404 });
  } catch (err) {
    if ((err as { code?: string }).code === "23503")
      return NextResponse.json(
        { error: "Không thể xoá: đã có lần kiểm tra dùng mẫu này" },
        { status: 409 },
      );
    throw err;
  }
  return NextResponse.json({ ok: true });
}
