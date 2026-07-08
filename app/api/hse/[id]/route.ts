import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  checkHseRefs,
  closeHseAction,
  getHse,
  parseHseBody,
  validateHseInput,
  type HseInput,
} from "@/lib/hse";

export const dynamic = "force-dynamic";

// GET /api/hse/:id — chi tiết 1 ghi nhận.
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
  const record = projectId != null ? await getHse(id, projectId) : null;
  if (!record) return NextResponse.json({ error: "Không tìm thấy ghi nhận" }, { status: 404 });
  return NextResponse.json({ record });
}

// PATCH /api/hse/:id — sửa nội dung/đóng action. Admin/PM/kỹ sư.
// body { closeAction: true } → chỉ đóng action, không đổi field khác.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHse(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa/đóng action HSE (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  if (body.closeAction) {
    const ok = projectId != null ? await closeHseAction(id, projectId) : false;
    if (!ok)
      return NextResponse.json(
        { error: "Không tìm thấy ghi nhận hoặc action không ở trạng thái mở" },
        { status: 404 },
      );
    return NextResponse.json({ updated: id });
  }

  const existing = projectId != null ? await getHse(id, projectId) : null;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy ghi nhận" }, { status: 404 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(merged)) if (key in body) merged[key] = body[key];
  const input: HseInput = parseHseBody(merged);

  const invalid = validateHseInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkHseRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  const actionStatus = input.actionRequired
    ? existing.actionStatus === "closed"
      ? "closed"
      : "open"
    : "none";

  await run(
    `UPDATE hse_records
        SET kind = ?, record_date = ?, floor_label = ?, area = ?, description = ?, severity = ?,
            permit_type = ?, permit_from = ?, permit_to = ?, action_required = ?,
            action_assignee = ?, action_due = ?, action_status = ?
      WHERE id = ?`,
    input.kind,
    input.recordDate,
    input.floorLabel,
    input.area,
    input.description,
    input.severity,
    input.permitType,
    input.permitFrom,
    input.permitTo,
    input.actionRequired,
    input.actionAssignee,
    input.actionDue,
    actionStatus,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/hse/:id — xoá ghi nhận (Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(user.role === "admin" || user.role === "pm"))
    return NextResponse.json({ error: "Không có quyền xoá (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM hse_records WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy ghi nhận" }, { status: 404 });

  await run(`DELETE FROM hse_records WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
