import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listAlbums, parseAlbumBody, validateAlbumInput } from "@/lib/tech";

export const dynamic = "force-dynamic";

// GET /api/progress-albums — danh sách album ảnh mốc tiến độ (drone), scoped theo dự
// án đang chọn (M22). Xem: mọi vai trò đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const albums = projectId != null ? await listAlbums(projectId) : [];
  return NextResponse.json({ albums });
}

// POST /api/progress-albums — tạo album mốc tiến độ (Admin/PM). Ảnh thêm sau qua
// POST /api/progress-albums/:id/photos.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTech(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo album (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo album" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseAlbumBody(body);
  const invalid = validateAlbumInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO progress_albums (project_id, milestone_label, captured_date, note, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    projectId,
    input.milestoneLabel,
    input.capturedDate,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
