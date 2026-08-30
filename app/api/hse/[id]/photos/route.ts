import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { newHseFileName, MAX_PHOTO_BYTES, parseUploadedFile } from "@/lib/nen/photos";

export const dynamic = "force-dynamic";

// GET /api/hse/:id/photos — ảnh đính kèm ghi nhận HSE.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const recordId = parseInt(params.id);
  if (isNaN(recordId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const record =
    projectId != null
      ? await queryOne(
          `SELECT id FROM hse_records WHERE id = ? AND project_id = ?`,
          recordId,
          projectId,
        )
      : undefined;
  if (!record) return NextResponse.json({ error: "Không tìm thấy ghi nhận" }, { status: 404 });

  const photos = await query(
    `SELECT p.id, p.mime, p.created_at AS "createdAt", p.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM hse_photos p LEFT JOIN users u ON u.id = p.uploaded_by
      WHERE p.record_id = ? ORDER BY p.id DESC`,
    recordId,
  );
  return NextResponse.json({ photos });
}

// POST /api/hse/:id/photos — upload ảnh hiện trường (multipart: file). Mọi vai trò thao
// tác HSE được (kể cả subcon — càng ít ma sát báo cáo càng tốt, giống ghi nhận HSE).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role === "cdt" || user.role === "viewer" || user.role === "bch")
    return NextResponse.json({ error: "Bạn không có quyền upload ảnh HSE" }, { status: 403 });

  const recordId = parseInt(params.id);
  if (isNaN(recordId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const projectId = await getCurrentProjectId(user);
  const record =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM hse_records WHERE id = ? AND project_id = ?`,
          recordId,
          projectId,
        )
      : undefined;
  if (!record) return NextResponse.json({ error: "Không tìm thấy ghi nhận" }, { status: 404 });

  const up = await parseUploadedFile(req, { accept: "image", maxBytes: MAX_PHOTO_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { file, buf: fileBuf } = up;

  const fileName = newHseFileName(recordId, file.type);
  await storagePut(user.orgId, fileName, fileBuf);

  const id = await insertId(
    `INSERT INTO hse_photos (record_id, file_path, mime, uploaded_by) VALUES (?, ?, ?, ?)`,
    recordId,
    fileName,
    file.type,
    user.id,
  );

  return NextResponse.json({ id, recordId }, { status: 201 });
}
