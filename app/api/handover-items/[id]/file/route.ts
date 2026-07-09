import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { photoPath } from "@/lib/photos";

export const dynamic = "force-dynamic";

// minutes_file không lưu mime_type riêng (bảng gọn, chỉ 1 cột file_name) — suy Content-Type
// từ đuôi file do server tự sinh (lib/photos.ts newHandoverMinutesFileName).
const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
};

// GET /api/handover-items/:id/file — tải biên bản bàn giao. Xem: mọi vai trò đăng nhập.
// Scoped theo dự án đang chọn (M22).
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
  const item =
    projectId != null
      ? await queryOne<{ minutesFile: string | null }>(
          `SELECT minutes_file AS "minutesFile" FROM handover_items WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!item?.minutesFile)
    return NextResponse.json({ error: "Chưa có biên bản đính kèm" }, { status: 404 });

  const path = photoPath(item.minutesFile);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

  const mime = EXT_MIME[extname(item.minutesFile).toLowerCase()] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(item.minutesFile)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
