import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { ensureUploadDir, extForDocMime, newWorkFrontFileName, MAX_DOC_BYTES } from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/work-fronts/:id/documents — biên bản bàn giao/ảnh hiện trạng.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const workFrontId = parseInt(params.id);
  if (isNaN(workFrontId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const documents = await query(
    `SELECT d.id, d.file_name AS "fileName", d.mime, d.created_at AS "createdAt",
            d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM work_front_documents d LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.work_front_id = ? ORDER BY d.id DESC`,
    workFrontId,
  );
  return NextResponse.json({ documents });
}

// POST /api/work-fronts/:id/documents — upload biên bản bàn giao/ảnh hiện trạng (PDF/ảnh, max 20MB).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWorkFronts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền upload biên bản mặt bằng (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const workFrontId = parseInt(params.id);
  if (isNaN(workFrontId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const workFront = await queryOne<{ id: number }>(
    `SELECT id FROM work_fronts WHERE id = ?`,
    workFrontId,
  );
  if (!workFront) return NextResponse.json({ error: "Không tìm thấy mặt bằng" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file')" }, { status: 400 });

  const ext = extForDocMime(file.type);
  if (!ext)
    return NextResponse.json(
      { error: `Chỉ nhận PDF hoặc ảnh, nhận được: ${file.type || "không rõ"}` },
      { status: 415 },
    );
  if (file.size > MAX_DOC_BYTES)
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${MAX_DOC_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );

  const fileName = newWorkFrontFileName(workFrontId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  const id = await insertId(
    `INSERT INTO work_front_documents (work_front_id, file_path, file_name, mime, uploaded_by)
     VALUES (?, ?, ?, ?, ?)`,
    workFrontId,
    fileName,
    fileName,
    file.type,
    user.id,
  );

  return NextResponse.json({ id, workFrontId }, { status: 201 });
}
