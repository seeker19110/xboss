import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseAlbumBody, validateAlbumInput, listAlbumPhotos, type AlbumInput } from "@/lib/tech";
import { photoPath } from "@/lib/photos";

export const dynamic = "force-dynamic";

async function loadExisting(id: number, projectId: number | null) {
  if (projectId == null) return undefined;
  return queryOne<AlbumInput>(
    `SELECT milestone_label AS "milestoneLabel", captured_date AS "capturedDate", note
       FROM progress_albums WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/progress-albums/:id — chi tiết album kèm danh sách ảnh. Scoped theo dự án
// đang chọn (M22).
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
  if (!existing) return NextResponse.json({ error: "Không tìm thấy album" }, { status: 404 });

  const photos = await listAlbumPhotos(id);
  return NextResponse.json({ album: { id, ...existing }, photos });
}

// PATCH /api/progress-albums/:id — sửa album (Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTech(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa album (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy album" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of ["milestoneLabel", "capturedDate", "note"])
    if (key in body) merged[key] = body[key];
  const input = parseAlbumBody(merged);

  const invalid = validateAlbumInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  await run(
    `UPDATE progress_albums SET milestone_label = ?, captured_date = ?, note = ? WHERE id = ?`,
    input.milestoneLabel,
    input.capturedDate,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/progress-albums/:id — xoá album + toàn bộ ảnh (Admin/PM), kèm file trên đĩa.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTech(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá album (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy album" }, { status: 404 });

  // Lấy tên file trước khi xoá bản ghi để dọn file trên đĩa (tránh mồ côi).
  const fileRows = await query<{ fileName: string }>(
    `SELECT file_name AS "fileName" FROM task_photos WHERE album_id = ?`,
    id,
  );
  await run(`DELETE FROM task_photos WHERE album_id = ?`, id);
  await run(`DELETE FROM progress_albums WHERE id = ?`, id);

  for (const f of fileRows) {
    const p = photoPath(f.fileName);
    if (p)
      await unlink(p).catch(() => {
        /* file đã mất trên đĩa — bỏ qua */
      });
  }

  return NextResponse.json({ deleted: id, photosDeleted: fileRows.length });
}
