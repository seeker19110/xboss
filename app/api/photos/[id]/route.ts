import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { photoPath } from "@/lib/photos";

export const dynamic = "force-dynamic";

type PhotoRow = { id: number; file_name: string; mime_type: string; uploaded_by: number | null };

// GET /api/photos/:id → trả về nội dung file ảnh (cần đăng nhập).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const photo = await queryOne<PhotoRow>(
    `SELECT id, file_name, mime_type, uploaded_by FROM task_photos WHERE id = ?`, id);
  if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });

  const path = photoPath(photo.file_name);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try { buf = await readFile(path); }
  catch { return NextResponse.json({ error: "File ảnh không còn trên đĩa" }, { status: 404 }); }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": photo.mime_type,
      "Cache-Control": "private, max-age=86400", // ảnh bất biến theo id — cache 1 ngày
    },
  });
}

// DELETE /api/photos/:id → xoá ảnh. Người upload hoặc Admin/PM.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const photo = await queryOne<PhotoRow>(
    `SELECT id, file_name, mime_type, uploaded_by FROM task_photos WHERE id = ?`, id);
  if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });

  if (photo.uploaded_by !== user.id && !CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ người upload hoặc Admin/PM được xoá ảnh" }, { status: 403 });

  await run(`DELETE FROM task_photos WHERE id = ?`, id);
  const path = photoPath(photo.file_name);
  if (path) await unlink(path).catch(() => { /* file đã mất trên đĩa — bỏ qua */ });

  return NextResponse.json({ deleted: id });
}
