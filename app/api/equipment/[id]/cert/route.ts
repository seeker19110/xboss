import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { getEquipment } from "@/lib/vat-tu/equipment";
import { newEquipmentCertFileName, MAX_DOC_BYTES, parseUploadedFile } from "@/lib/nen/photos";
import { storagePut, storageGet, storageDelete } from "@/lib/nen/storage";

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

  const buf = await storageGet(user.orgId, eq.certFileName);
  if (!buf) return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });

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

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DOC_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { file, buf: fileBuf } = up;

  const fileName = newEquipmentCertFileName(id, file.type);
  await storagePut(user.orgId, fileName, fileBuf);

  const oldFileName = eq.certFileName;
  await run(
    `UPDATE equipment SET cert_file_path = ?, cert_file_name = ?, cert_mime = ? WHERE id = ?`,
    fileName,
    fileName,
    file.type,
    id,
  );
  if (oldFileName) await storageDelete(user.orgId, oldFileName);

  return NextResponse.json({ ok: true }, { status: 201 });
}
