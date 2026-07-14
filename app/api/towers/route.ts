import { NextRequest, NextResponse } from "next/server";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId, visibleProjectIds } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/towers → danh sách tháp thuộc các dự án user thấy được (M22).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const visible = await visibleProjectIds(user);
  if (visible.length === 0) return NextResponse.json({ towers: [] });

  const towers = await query<{ id: number; name: string; projectId: number | null }>(
    `SELECT id, name, project_id AS "projectId" FROM towers WHERE project_id = ANY(?) ORDER BY id`,
    visible,
  );
  return NextResponse.json({ towers });
}

// POST /api/towers  body: { name } → tạo tháp mới thuộc dự án đang chọn (M22).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM" }, { status: 403 });

  const { name } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: "Thiếu tên tháp" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa có dự án nào" }, { status: 400 });

  const id = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    name.trim(),
  );
  return NextResponse.json({ tower: { id, name: name.trim(), projectId } }, { status: 201 });
}
