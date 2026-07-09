import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseDemobBody, validateDemobInput, type DemobInput } from "@/lib/handover";

export const dynamic = "force-dynamic";

async function loadExisting(id: number, projectId: number | null): Promise<DemobInput | undefined> {
  if (projectId == null) return undefined;
  return queryOne<DemobInput>(
    `SELECT title, category, status, note FROM demob_items WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/demob/:id — chi tiết hạng mục giải thể. Scoped theo dự án đang chọn (M22).
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
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hạng mục" }, { status: 404 });

  return NextResponse.json({ item: { id, ...existing } });
}

// PATCH /api/demob/:id — sửa hạng mục giải thể (manageHandover: Admin/PM/kỹ sư).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa hạng mục giải thể (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hạng mục" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of ["title", "category", "status", "note"])
    if (key in body) merged[key] = body[key];
  const input = parseDemobBody(merged);

  const invalid = validateDemobInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  await run(
    `UPDATE demob_items SET title = ?, category = ?, status = ?, note = ? WHERE id = ?`,
    input.title,
    input.category,
    input.status,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/demob/:id — xoá hạng mục giải thể (manageHandover: Admin/PM/kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá hạng mục giải thể (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hạng mục" }, { status: 404 });

  await run(`DELETE FROM demob_items WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
