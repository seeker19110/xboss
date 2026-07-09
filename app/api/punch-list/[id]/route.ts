import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parsePunchBody, validatePunchInput, type PunchInput } from "@/lib/handover";

export const dynamic = "force-dynamic";

async function loadExisting(id: number, projectId: number | null): Promise<PunchInput | undefined> {
  if (projectId == null) return undefined;
  return queryOne<PunchInput>(
    `SELECT handover_item_id AS "handoverItemId", description, severity, status,
            due_date AS "dueDate", assignee
       FROM punch_list WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/punch-list/:id — chi tiết tồn tại. Scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const item =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT p.id, p.project_id AS "projectId", p.handover_item_id AS "handoverItemId",
                  hi.title AS "handoverItemTitle", p.description, p.severity, p.status,
                  p.due_date AS "dueDate", p.assignee, u.name AS "assigneeName",
                  p.created_by AS "createdBy", p.created_at AS "createdAt"
             FROM punch_list p
             LEFT JOIN handover_items hi ON hi.id = p.handover_item_id
             LEFT JOIN users u ON u.id = p.assignee
            WHERE p.id = ? AND p.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!item) return NextResponse.json({ error: "Không tìm thấy tồn tại" }, { status: 404 });

  return NextResponse.json({ item });
}

// PATCH /api/punch-list/:id — sửa/đổi vòng đời open→fixing→closed (manageHandover:
// Admin/PM/kỹ sư — không cần CAN.approve, khác commissioning/handover-items vì đóng
// punch không phải nghiệm thu chính thức).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa tồn tại (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy tồn tại" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of ["handoverItemId", "description", "severity", "status", "dueDate", "assignee"])
    if (key in body) merged[key] = body[key];
  const input = parsePunchBody(merged);

  const invalid = validatePunchInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.handoverItemId != null) {
    const hi = await queryOne(
      `SELECT id FROM handover_items WHERE id = ? AND project_id = ?`,
      input.handoverItemId,
      projectId,
    );
    if (!hi)
      return NextResponse.json({ error: "Hạng mục bàn giao không tồn tại" }, { status: 422 });
  }
  if (input.assignee != null) {
    if (!(await queryOne(`SELECT id FROM users WHERE id = ?`, input.assignee)))
      return NextResponse.json({ error: "Người được gán không tồn tại" }, { status: 422 });
  }

  await run(
    `UPDATE punch_list SET handover_item_id = ?, description = ?, severity = ?, status = ?,
            due_date = ?, assignee = ?
      WHERE id = ?`,
    input.handoverItemId,
    input.description,
    input.severity,
    input.status,
    input.dueDate,
    input.assignee,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/punch-list/:id — xoá tồn tại (manageHandover: Admin/PM/kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá tồn tại (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy tồn tại" }, { status: 404 });

  await run(`DELETE FROM punch_list WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
