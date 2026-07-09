import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getPoint, parsePointBody, validatePointInput } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

// GET /api/monitoring-points/:id — chi tiết mốc quan trắc, scoped theo dự án đang chọn.
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
  const point = projectId != null ? await getPoint(id, projectId) : null;
  if (!point) return NextResponse.json({ error: "Không tìm thấy mốc quan trắc" }, { status: 404 });

  return NextResponse.json({ point });
}

// PATCH /api/monitoring-points/:id — sửa mốc (Admin/PM/kỹ sư). Field không gửi giữ giá
// trị cũ. Đổi mã kiểm tra trùng trong phạm vi dự án.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMonitoring(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa mốc quan trắc (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = projectId != null ? await getPoint(id, projectId) : null;
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy mốc quan trắc" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in body) merged[key] = body[key];
  const input = parsePointBody(merged);

  const invalid = validatePointInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.code !== existing.code) {
    const dup = await queryOne(
      `SELECT id FROM monitoring_points WHERE project_id = ? AND code = ? AND id <> ?`,
      projectId,
      input.code,
      id,
    );
    if (dup) return NextResponse.json({ error: "Mã mốc quan trắc đã tồn tại" }, { status: 409 });
  }

  await run(
    `UPDATE monitoring_points SET code = ?, kind = ?, location = ?, warn_threshold = ?,
            alarm_threshold = ?, unit = ?, status = ?
      WHERE id = ?`,
    input.code,
    input.kind,
    input.location,
    input.warnThreshold,
    input.alarmThreshold,
    input.unit,
    input.status,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/monitoring-points/:id — xoá mốc (Admin/PM/kỹ sư) + toàn bộ kỳ đo (CASCADE).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMonitoring(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá mốc quan trắc (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = projectId != null ? await getPoint(id, projectId) : null;
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy mốc quan trắc" }, { status: 404 });

  await run(`DELETE FROM monitoring_points WHERE id = ?`, id);

  return NextResponse.json({ deleted: id });
}
