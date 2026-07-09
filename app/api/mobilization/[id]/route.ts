import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  parseMobilizationBody,
  validateMobilizationInput,
  type MobilizationInput,
} from "@/lib/kickoff";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

async function loadExisting(id: number, projectId: number | null) {
  if (projectId == null) return undefined;
  return queryOne<MobilizationInput & { doneDate: string | null }>(
    `SELECT category, title, status, due_date AS "dueDate", done_date AS "doneDate",
            assignee, note
       FROM mobilization_items WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// PATCH /api/mobilization/:id — sửa hạng mục (Admin/PM). Đổi status → 'done' tự set
// done_date = hôm nay; đổi khỏi 'done' → xoá done_date.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageKickoff(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa hạng mục huy động (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hạng mục" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of ["category", "title", "status", "dueDate", "assignee", "note"])
    if (key in body) merged[key] = body[key];
  const input = parseMobilizationBody(merged);

  const invalid = validateMobilizationInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.assignee != null) {
    if (
      !Number.isInteger(input.assignee) ||
      !(await queryOne(`SELECT id FROM users WHERE id = ?`, input.assignee))
    )
      return NextResponse.json({ error: "Người được gán không tồn tại" }, { status: 422 });
  }

  const doneDate =
    input.status === "done" ? (existing.status === "done" ? existing.doneDate : todayISO()) : null;

  await run(
    `UPDATE mobilization_items SET category = ?, title = ?, status = ?, due_date = ?,
            done_date = ?, assignee = ?, note = ?
      WHERE id = ?`,
    input.category,
    input.title,
    input.status,
    input.dueDate,
    doneDate,
    input.assignee,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/mobilization/:id — xoá hạng mục (Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageKickoff(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá hạng mục huy động (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hạng mục" }, { status: 404 });

  await run(`DELETE FROM mobilization_items WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
