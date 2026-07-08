import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getEquipment } from "@/lib/equipment";
import {
  ensureUploadDir,
  extForDocMime,
  newEquipmentCertFileName,
  photoPath,
  MAX_DOC_BYTES,
} from "@/lib/photos";

export const dynamic = "force-dynamic";

type CertRow = { certFileName: string | null; certMime: string | null };

// GET /api/equipment/:id/cert — stream giấy kiểm định/hiệu chuẩn. Scoped theo dự án
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
  const eqInProject = projectId != null ? await getEquipment(id, projectId) : null;
  if (!eqInProject) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });

  const eq = await queryOne<CertRow>(
    `SELECT cert_file_name AS "certFileName", cert_mime AS "certMime" FROM equipment WHERE id = ?`,
    id,
  );
  if (!eq || !eq.certFileName)
    return NextResponse.json({ error: "Chưa có giấy kiểm định" }, { status: 404 });

  const path = photoPath(eq.certFileName);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": eq.certMime ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// POST /api/equipment/:id/cert — upload/thay giấy kiểm định (PDF/ảnh, max 20MB). Admin/PM/kỹ sư.
// Scoped theo dự án đang chọn (M22).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEquipment(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền upload giấy kiểm định (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const eqInProject = projectId != null ? await getEquipment(id, projectId) : null;
  if (!eqInProject) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });

  const eq = await queryOne<CertRow>(
    `SELECT cert_file_name AS "certFileName", cert_mime AS "certMime" FROM equipment WHERE id = ?`,
    id,
  );
  if (!eq) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });

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

  const fileName = newEquipmentCertFileName(id, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  const oldPath = eq.certFileName ? photoPath(eq.certFileName) : null;
  await run(
    `UPDATE equipment SET cert_file_path = ?, cert_file_name = ?, cert_mime = ? WHERE id = ?`,
    fileName,
    fileName,
    file.type,
    id,
  );
  if (oldPath)
    await unlink(oldPath).catch(() => {
      /* file cũ đã mất trên đĩa — bỏ qua */
    });

  return NextResponse.json({ ok: true }, { status: 201 });
}
