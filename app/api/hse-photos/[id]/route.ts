import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { photoPath } from "@/lib/photos";

export const dynamic = "force-dynamic";

type PhotoRow = { id: number; file_path: string; mime: string; uploaded_by: number | null };

// Lấy ảnh HSE, lọc theo dự án đang chọn (M22) — chặn xem/xoá ảnh của biên bản
// thuộc dự án khác qua đoán/liệt kê id.
async function getPhotoInProject(
  id: number,
  projectId: number | null,
): Promise<PhotoRow | undefined> {
  const conds = ["p.id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("r.project_id = ?");
    args.push(projectId);
  }
  return queryOne<PhotoRow>(
    `SELECT p.id, p.file_path, p.mime, p.uploaded_by
       FROM hse_photos p JOIN hse_records r ON r.id = p.record_id
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
}

// GET /api/hse-photos/:id — stream ảnh HSE.
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
  const photo = await getPhotoInProject(id, projectId);
  if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });

  const path = photoPath(photo.file_path);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": photo.mime,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// DELETE /api/hse-photos/:id — xoá ảnh. Người upload hoặc Admin/PM/kỹ sư.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const photo = await getPhotoInProject(id, projectId);
  if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });

  if (photo.uploaded_by !== user.id && !CAN.manageHse(user.role))
    return NextResponse.json(
      { error: "Chỉ người upload hoặc Admin/PM/kỹ sư được xoá ảnh" },
      { status: 403 },
    );

  await run(`DELETE FROM hse_photos WHERE id = ?`, id);
  const path = photoPath(photo.file_path);
  if (path)
    await unlink(path).catch(() => {
      /* file đã mất trên đĩa — bỏ qua */
    });

  return NextResponse.json({ deleted: id });
}
