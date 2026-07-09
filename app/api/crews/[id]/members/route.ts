import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

async function loadCrew(id: number, projectId: number | null) {
  if (projectId == null) return undefined;
  return queryOne<{ id: number }>(
    `SELECT id FROM crews WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// POST /api/crews/:id/members  body: { personnelId } — thêm nhân sự vào tổ đội (Admin/PM).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa thành viên tổ đội (chỉ Admin/PM)" },
      { status: 403 },
    );

  const crewId = parseInt(params.id);
  if (isNaN(crewId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const crew = await loadCrew(crewId, projectId);
  if (!crew) return NextResponse.json({ error: "Không tìm thấy tổ đội" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const personnelId = Number(body?.personnelId);
  if (!Number.isInteger(personnelId))
    return NextResponse.json({ error: "Thiếu personnelId hợp lệ" }, { status: 422 });

  const personnel = await queryOne(
    `SELECT id FROM personnel WHERE id = ? AND project_id = ?`,
    personnelId,
    projectId,
  );
  if (!personnel) return NextResponse.json({ error: "Không tìm thấy nhân sự" }, { status: 404 });

  await run(
    `INSERT INTO crew_members (crew_id, personnel_id) VALUES (?, ?)
     ON CONFLICT (crew_id, personnel_id) DO NOTHING`,
    crewId,
    personnelId,
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/crews/:id/members?personnelId=  — bỏ nhân sự khỏi tổ đội (Admin/PM).
export async function DELETE(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa thành viên tổ đội (chỉ Admin/PM)" },
      { status: 403 },
    );

  const crewId = parseInt(params.id);
  if (isNaN(crewId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const crew = await loadCrew(crewId, projectId);
  if (!crew) return NextResponse.json({ error: "Không tìm thấy tổ đội" }, { status: 404 });

  const personnelId = Number(req.nextUrl.searchParams.get("personnelId"));
  if (!Number.isInteger(personnelId))
    return NextResponse.json({ error: "Thiếu personnelId hợp lệ" }, { status: 422 });

  await run(`DELETE FROM crew_members WHERE crew_id = ? AND personnel_id = ?`, crewId, personnelId);
  return NextResponse.json({ ok: true });
}
