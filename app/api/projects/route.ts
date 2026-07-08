import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/projects — dự án user thấy + % tiến độ + số việc trễ (project switcher +
// trang Portfolio). Tôn trọng user_projects qua listProjects().
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projects = await listProjects(user);
  return NextResponse.json({ projects });
}

// POST /api/projects — tạo dự án mới (chỉ Admin). Body: { name, code?, investor?, contractor? }.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Chỉ Admin mới tạo được dự án" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Thiếu tên dự án" }, { status: 400 });
  const code = typeof body?.code === "string" && body.code.trim() ? body.code.trim() : null;
  const investor =
    typeof body?.investor === "string" && body.investor.trim() ? body.investor.trim() : null;
  const contractor =
    typeof body?.contractor === "string" && body.contractor.trim() ? body.contractor.trim() : null;
  const color = typeof body?.color === "string" && body.color.trim() ? body.color.trim() : null;

  if (code && (await queryOne(`SELECT id FROM projects WHERE code = ?`, code)))
    return NextResponse.json({ error: `Mã dự án "${code}" đã tồn tại` }, { status: 409 });

  const id = await insertId(
    `INSERT INTO projects (name, code, investor, contractor, color) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    name,
    code,
    investor,
    contractor,
    color,
  );
  return NextResponse.json({ id }, { status: 201 });
}
