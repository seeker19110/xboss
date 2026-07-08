import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listQcChecklists, validateChecklistItems } from "@/lib/qaqc";

export const dynamic = "force-dynamic";

// GET /api/qc/checklists?discipline=<code> — mọi user đăng nhập xem mẫu checklist,
// scoped theo dự án đang chọn (M22).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const discipline = req.nextUrl.searchParams.get("discipline")?.trim() || undefined;

  const projectId = await getCurrentProjectId(user);
  const checklists = projectId != null ? await listQcChecklists({ discipline, projectId }) : [];
  return NextResponse.json({ checklists });
}

// POST /api/qc/checklists — tạo mẫu checklist mới (Admin/PM), gán project_id = dự án
// đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được tạo mẫu checklist" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo checklist" }, { status: 422 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const category = ["work", "tc", "hse"].includes(body?.category) ? body.category : "work";
  if (!name) return NextResponse.json({ error: "Thiếu tên checklist" }, { status: 422 });

  const items = body?.items ?? [];
  if (!validateChecklistItems(items))
    return NextResponse.json({ error: "Danh sách hạng mục không hợp lệ" }, { status: 422 });

  let disciplineId: number | null = null;
  if (body?.disciplineId != null) {
    disciplineId = Number(body.disciplineId);
    if (
      !Number.isInteger(disciplineId) ||
      !(await queryOne(`SELECT id FROM disciplines WHERE id = ?`, disciplineId))
    )
      return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
  }

  const required = body?.required === true;

  const id = await insertId(
    `INSERT INTO qc_checklists (name, category, discipline_id, required, items, project_id)
     VALUES (?, ?, ?, ?, ?::jsonb, ?)`,
    name,
    category,
    disciplineId,
    required,
    JSON.stringify(items),
    projectId,
  );

  return NextResponse.json({ id }, { status: 201 });
}
