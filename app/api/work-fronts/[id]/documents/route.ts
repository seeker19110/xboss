import { NextRequest, NextResponse } from "next/server";
import { storagePut } from "@/lib/nen/storage";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId, visibleProjectIds } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { newWorkFrontFileName, MAX_DOC_BYTES, parseUploadedFile } from "@/lib/nen/photos";
import { workFrontProjectId } from "@/lib/tien-do/workfronts";

export const dynamic = "force-dynamic";

// GET /api/work-fronts/:id/documents — biên bản bàn giao/ảnh hiện trạng.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("field", projectId);
  if (blocked) return blocked;

  const workFrontId = parseInt(params.id);
  if (isNaN(workFrontId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Chống đọc xuyên dự án (vá V9).
  const visible = await visibleProjectIds(user);
  const pid = await workFrontProjectId(workFrontId);
  if (pid == null || !visible.includes(pid))
    return NextResponse.json({ error: "Không tìm thấy mặt bằng" }, { status: 404 });

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

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("field", projectId);
  if (blocked) return blocked;

  const workFrontId = parseInt(params.id);
  if (isNaN(workFrontId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Chống ghi xuyên dự án (vá V9).
  const visible = await visibleProjectIds(user);
  const pid = await workFrontProjectId(workFrontId);
  if (pid == null || !visible.includes(pid))
    return NextResponse.json({ error: "Không tìm thấy mặt bằng" }, { status: 404 });

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DOC_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { file, buf: fileBuf } = up;

  const fileName = newWorkFrontFileName(workFrontId, file.type);
  await storagePut(user.orgId, fileName, fileBuf);

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
