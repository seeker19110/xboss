import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseCrewBody, validateCrewInput, type CrewInput } from "@/lib/hr";

export const dynamic = "force-dynamic";

async function loadExisting(id: number, projectId: number | null) {
  if (projectId == null) return undefined;
  return queryOne<CrewInput & { id: number }>(
    `SELECT id, name, system_id AS "systemId", supplier_id AS "supplierId",
            leader_id AS "leaderId"
       FROM crews WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// PATCH /api/crews/:id — sửa tổ đội (Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa tổ đội (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy tổ đội" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of ["name", "systemId", "supplierId", "leaderId"])
    if (key in body) merged[key] = body[key];
  const input = parseCrewBody(merged);

  const invalid = validateCrewInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.systemId != null) {
    if (!(await queryOne(`SELECT id FROM systems WHERE id = ?`, input.systemId)))
      return NextResponse.json({ error: "Hệ thi công không tồn tại" }, { status: 422 });
  }
  if (input.supplierId != null) {
    if (!(await queryOne(`SELECT id FROM suppliers WHERE id = ?`, input.supplierId)))
      return NextResponse.json({ error: "Nhà thầu phụ không tồn tại" }, { status: 422 });
  }
  if (input.leaderId != null) {
    if (
      !(await queryOne(
        `SELECT id FROM personnel WHERE id = ? AND project_id = ?`,
        input.leaderId,
        projectId,
      ))
    )
      return NextResponse.json({ error: "Đội trưởng không tồn tại" }, { status: 422 });
  }

  if (input.name !== existing.name) {
    const dup = await queryOne(
      `SELECT id FROM crews WHERE project_id = ? AND name = ? AND id <> ?`,
      projectId,
      input.name,
      id,
    );
    if (dup)
      return NextResponse.json({ error: "Tên tổ đội đã tồn tại trong dự án" }, { status: 409 });
  }

  await run(
    `UPDATE crews SET name = ?, system_id = ?, supplier_id = ?, leader_id = ? WHERE id = ?`,
    input.name,
    input.systemId,
    input.supplierId,
    input.leaderId,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/crews/:id — xoá tổ đội (Admin/PM). Xoá kéo theo crew_members (CASCADE);
// diary_manpower/attendance.crew_id chỉ tham chiếu SET không cần dọn (FK cho phép NULL
// sau khi xoá do ON DELETE mặc định RESTRICT — chặn xoá nếu còn dữ liệu tham chiếu).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá tổ đội (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy tổ đội" }, { status: 404 });

  const usedInAttendance = await queryOne(`SELECT id FROM attendance WHERE crew_id = ?`, id);
  if (usedInAttendance)
    return NextResponse.json(
      { error: "Không thể xoá — tổ đội đã có dữ liệu chấm công" },
      { status: 409 },
    );

  await run(`DELETE FROM crews WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
