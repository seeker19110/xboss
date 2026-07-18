import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { queryOne, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { photoPath } from "@/lib/photos";

export const dynamic = "force-dynamic";

type FileRow = { fileName: string | null; mimeType: string | null; originalName: string | null };

// GET /api/insurance-bonds/:id/file — tải chứng thư chính của bảo hiểm/bảo lãnh. Xem:
// Admin/PM/BCH (viewPayments). Scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xem bảo hiểm & bảo lãnh" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const bond =
    projectId != null
      ? await withProjectScope(projectId, () =>
          queryOne<FileRow>(
            `SELECT file_name AS "fileName", mime_type AS "mimeType", original_name AS "originalName"
               FROM insurance_bonds WHERE id = ? AND project_id = ?`,
            id,
            projectId,
          ),
        )
      : undefined;
  if (!bond?.fileName)
    return NextResponse.json({ error: "Chưa có file đính kèm" }, { status: 404 });

  const path = photoPath(bond.fileName);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": bond.mimeType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(bond.originalName ?? bond.fileName)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
