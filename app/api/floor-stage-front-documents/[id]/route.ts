import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { photoPath } from "@/lib/photos";

export const dynamic = "force-dynamic";

type DocRow = { id: number; file_name: string; mime: string; uploaded_by: number | null };

// GET /api/floor-stage-front-documents/:id — stream biên bản/ảnh mặt bằng bản mới.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const doc = await queryOne<DocRow>(
    `SELECT id, file_name, mime, uploaded_by FROM floor_stage_front_documents WHERE id = ?`,
    id,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  const path = photoPath(doc.file_name);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mime,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// DELETE /api/floor-stage-front-documents/:id — xoá biên bản/ảnh. Người upload hoặc Admin/PM/kỹ sư.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const doc = await queryOne<DocRow>(
    `SELECT id, file_name, mime, uploaded_by FROM floor_stage_front_documents WHERE id = ?`,
    id,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  if (doc.uploaded_by !== user.id && !CAN.manageWorkFronts(user.role))
    return NextResponse.json(
      { error: "Chỉ người upload hoặc Admin/PM/kỹ sư được xoá tài liệu" },
      { status: 403 },
    );

  await run(`DELETE FROM floor_stage_front_documents WHERE id = ?`, id);
  const path = photoPath(doc.file_name);
  if (path)
    await unlink(path).catch(() => {
      /* file đã mất trên đĩa — bỏ qua */
    });

  return NextResponse.json({ deleted: id });
}
