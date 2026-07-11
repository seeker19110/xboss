import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ensureUploadDir,
  extForDocMime,
  verifyFileMime,
  newDrawingRevisionFileName,
  MAX_DRAWING_BYTES,
} from "@/lib/photos";

export const dynamic = "force-dynamic";

// POST /api/drawings/:id/revisions — upload rev mới (multipart: file, rev, submittedAt?).
// PDF/ảnh, tối đa 50MB. Trạng thái khởi tạo luôn 'submitted' — đổi trạng thái duyệt qua
// PATCH /api/drawings/revisions/:id. Admin/PM/engineer.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền upload bản vẽ (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const drawingId = parseInt(params.id);
  if (isNaN(drawingId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const projectId = await getCurrentProjectId(user);
  const drawing =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM drawings WHERE id = ? AND project_id = ?`,
          drawingId,
          projectId,
        )
      : undefined;
  if (!drawing) return NextResponse.json({ error: "Không tìm thấy bản vẽ" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file')" }, { status: 400 });

  const rev = String(form.get("rev") ?? "").trim();
  if (!rev) return NextResponse.json({ error: "Thiếu số rev (field 'rev')" }, { status: 400 });

  const ext = extForDocMime(file.type);
  if (!ext)
    return NextResponse.json(
      { error: `Chỉ nhận PDF hoặc ảnh, nhận được: ${file.type || "không rõ"}` },
      { status: 415 },
    );
  if (file.size > MAX_DRAWING_BYTES)
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${MAX_DRAWING_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );

  const fileBuf = Buffer.from(await file.arrayBuffer());
  if (!verifyFileMime(fileBuf, file.type))
    return NextResponse.json(
      { error: "Nội dung file không khớp định dạng khai báo (Content-Type giả mạo?)" },
      { status: 415 },
    );

  const existing = await queryOne(
    `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
    drawingId,
    rev,
  );
  if (existing)
    return NextResponse.json({ error: `Rev "${rev}" đã tồn tại cho bản vẽ này` }, { status: 409 });

  const submittedAt = String(form.get("submittedAt") ?? "").trim() || null;

  const fileName = newDrawingRevisionFileName(drawingId, rev, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);

  let id: number;
  try {
    id = await insertId(
      `INSERT INTO drawing_revisions
         (drawing_id, rev, file_name, original_name, mime_type, size_bytes, submitted_at, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      drawingId,
      rev,
      fileName,
      file.name || null,
      file.type,
      file.size,
      submittedAt,
      user.id,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: `Rev "${rev}" đã tồn tại cho bản vẽ này` },
        { status: 409 },
      );
    throw err;
  }

  return NextResponse.json({ id, drawingId, rev }, { status: 201 });
}
