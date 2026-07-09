import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseTechLinkBody, validateTechLink, type TechLinkInput } from "@/lib/tech";

export const dynamic = "force-dynamic";

async function loadExisting(id: number, projectId: number | null) {
  if (projectId == null) return undefined;
  return queryOne<TechLinkInput>(
    `SELECT category, title, url, embed, note FROM tech_links WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/tech-links/:id — chi tiết 1 link. Scoped theo dự án đang chọn (M22).
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
  const link =
    projectId != null
      ? await queryOne(
          `SELECT id, project_id AS "projectId", category, title, url, embed, note,
                  created_by AS "createdBy", created_at AS "createdAt"
             FROM tech_links WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!link) return NextResponse.json({ error: "Không tìm thấy link" }, { status: 404 });

  return NextResponse.json({ link });
}

// PATCH /api/tech-links/:id — sửa link (Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTech(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa link công nghệ (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy link" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of ["category", "title", "url", "embed", "note"])
    if (key in body) merged[key] = body[key];
  const input = parseTechLinkBody(merged);

  const invalid = validateTechLink(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  await run(
    `UPDATE tech_links SET category = ?, title = ?, url = ?, embed = ?, note = ? WHERE id = ?`,
    input.category,
    input.title,
    input.url,
    input.embed,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/tech-links/:id — xoá link (Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTech(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá link công nghệ (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy link" }, { status: 404 });

  await run(`DELETE FROM tech_links WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
