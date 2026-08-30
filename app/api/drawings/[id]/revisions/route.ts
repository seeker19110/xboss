import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { newDrawingRevisionFileName, MAX_DRAWING_BYTES, parseUploadedFile } from "@/lib/nen/photos";

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

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DRAWING_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { form, file, buf: fileBuf } = up;

  const rev = String(form.get("rev") ?? "").trim();
  if (!rev) return NextResponse.json({ error: "Thiếu số rev (field 'rev')" }, { status: 400 });

  const existing = await queryOne(
    `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
    drawingId,
    rev,
  );
  if (existing)
    return NextResponse.json({ error: `Rev "${rev}" đã tồn tại cho bản vẽ này` }, { status: 409 });

  const submittedAt = String(form.get("submittedAt") ?? "").trim() || null;

  const fileName = newDrawingRevisionFileName(drawingId, rev, file.type);
  await storagePut(user.orgId, fileName, fileBuf);

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
