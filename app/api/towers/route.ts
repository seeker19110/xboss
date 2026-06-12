import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/towers → danh sách tháp kèm project_id đầu tiên.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const towers = await query<{ id: number; name: string; projectId: number | null }>(
    `SELECT id, name, project_id AS "projectId" FROM towers ORDER BY id`);
  return NextResponse.json({ towers });
}

// POST /api/towers  body: { name } → tạo tháp mới thuộc project đầu tiên.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!CAN.editStructure(user?.role))
    return NextResponse.json({ error: "Chỉ Admin/PM" }, { status: 403 });

  const { name } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: "Thiếu tên tháp" }, { status: 400 });

  const project = await queryOne<{ id: number }>(`SELECT id FROM projects ORDER BY id LIMIT 1`);
  if (!project) return NextResponse.json({ error: "Chưa có dự án" }, { status: 400 });

  const id = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, ?)`, project.id, name.trim());
  return NextResponse.json({ tower: { id, name: name.trim(), projectId: project.id } }, { status: 201 });
}
