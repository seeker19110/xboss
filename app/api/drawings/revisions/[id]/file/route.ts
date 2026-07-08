import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { photoPath } from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/drawings/revisions/:id/file — stream file bản vẽ của 1 rev. Mọi vai trò
// đăng nhập xem được (kể cả subcon — cần bản vẽ để thi công tại hiện trường). Revision
// không có cột project_id riêng — kiểm qua JOIN drawing cha thuộc đúng dự án (M22).
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
  const rev =
    projectId != null
      ? await queryOne<{
          fileName: string;
          originalName: string | null;
          mimeType: string;
        }>(
          `SELECT r.file_name AS "fileName", r.original_name AS "originalName", r.mime_type AS "mimeType"
             FROM drawing_revisions r
             JOIN drawings d ON d.id = r.drawing_id
            WHERE r.id = ? AND d.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!rev) return NextResponse.json({ error: "Không tìm thấy revision" }, { status: 404 });

  const path = photoPath(rev.fileName);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": rev.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        rev.originalName ?? rev.fileName,
      )}`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
