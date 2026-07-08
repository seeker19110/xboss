import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

const VALID_STATUS = ["active", "handover", "closed"];

// GET /api/projects — mọi user đăng nhập: danh sách dự án user thấy + %/trễ/status/color
// (project switcher + trang Portfolio, M22 PR2).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projects = await listProjects(user);
  return NextResponse.json({ projects }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/projects  body: { name, code?, investor?, contractor?, status?, color? } — tạo
// dự án mới (CAN.manageProjects — Admin).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Thiếu tên dự án" }, { status: 422 });

  const status = body.status ? String(body.status) : "active";
  if (!VALID_STATUS.includes(status))
    return NextResponse.json({ error: "status không hợp lệ" }, { status: 422 });

  const code = body.code ? String(body.code) : null;
  let id: number;
  try {
    id = await insertId(
      `INSERT INTO projects (name, code, investor, contractor, status, color) VALUES (?, ?, ?, ?, ?, ?)`,
      name,
      code,
      body.investor ? String(body.investor) : null,
      body.contractor ? String(body.contractor) : null,
      status,
      body.color ? String(body.color) : null,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json({ error: `Mã dự án "${code}" đã tồn tại` }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ id }, { status: 201 });
}
