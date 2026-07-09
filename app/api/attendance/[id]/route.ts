import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseAttendanceBody, validateAttendanceInput, type AttendanceInput } from "@/lib/hr";

export const dynamic = "force-dynamic";

async function loadExisting(id: number, projectId: number | null) {
  if (projectId == null) return undefined;
  return queryOne<AttendanceInput & { id: number }>(
    `SELECT id, work_date AS "workDate", crew_id AS "crewId", personnel_id AS "personnelId",
            headcount, present, hours, note
       FROM attendance WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// PATCH /api/attendance/:id — sửa bản ghi chấm công (Admin/PM/Kỹ sư).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.recordAttendance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa chấm công (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy bản ghi chấm công" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of ["workDate", "crewId", "personnelId", "headcount", "present", "hours", "note"])
    if (key in body) merged[key] = body[key];
  const input = parseAttendanceBody(merged);

  const invalid = validateAttendanceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.crewId != null) {
    if (
      !(await queryOne(
        `SELECT id FROM crews WHERE id = ? AND project_id = ?`,
        input.crewId,
        projectId,
      ))
    )
      return NextResponse.json({ error: "Không tìm thấy tổ đội" }, { status: 422 });
  }
  if (input.personnelId != null) {
    if (
      !(await queryOne(
        `SELECT id FROM personnel WHERE id = ? AND project_id = ?`,
        input.personnelId,
        projectId,
      ))
    )
      return NextResponse.json({ error: "Không tìm thấy nhân sự" }, { status: 422 });
  }

  await run(
    `UPDATE attendance SET work_date = ?, crew_id = ?, personnel_id = ?, headcount = ?,
            present = ?, hours = ?, note = ?
      WHERE id = ?`,
    input.workDate,
    input.crewId,
    input.personnelId,
    input.headcount,
    input.present,
    input.hours,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/attendance/:id — xoá bản ghi chấm công (Admin/PM/Kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.recordAttendance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá chấm công (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy bản ghi chấm công" }, { status: 404 });

  await run(`DELETE FROM attendance WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
