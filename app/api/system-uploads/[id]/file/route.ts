import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { storageGet } from "@/lib/storage";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await paramsP;
  const uploadId = Number(id);
  if (isNaN(uploadId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  const upload = await queryOne<{
    file_name: string;
    original_name: string | null;
    project_id: number | null;
  }>(
    `SELECT file_name, original_name, project_id AS "project_id" FROM system_uploads WHERE id = ?`,
    [uploadId],
  );

  if (!upload) {
    return NextResponse.json({ error: "Không tìm thấy phiên bản upload này" }, { status: 404 });
  }

  const projectId = await getCurrentProjectId(user);
  if (upload.project_id != null && upload.project_id !== projectId) {
    return NextResponse.json(
      { error: "Bạn không có quyền truy cập dự án của file này" },
      { status: 403 },
    );
  }

  const buffer = await storageGet(user.orgId, upload.file_name);
  if (!buffer) {
    return NextResponse.json(
      { error: "Không tìm thấy file trên máy chủ lưu trữ" },
      { status: 404 },
    );
  }

  const filename = upload.original_name ?? upload.file_name;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
