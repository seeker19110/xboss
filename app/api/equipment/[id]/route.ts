import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getEquipment, parseEquipmentBody, validateEquipmentInput } from "@/lib/equipment";

export const dynamic = "force-dynamic";

// GET /api/equipment/:id — chi tiết 1 thiết bị, scoped theo dự án đang chọn (M22).
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
  const equipment = projectId != null ? await getEquipment(id, projectId) : null;
  if (!equipment) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });
  return NextResponse.json({ equipment });
}

// PATCH /api/equipment/:id — sửa thông tin (Admin/PM/kỹ sư). Scoped theo dự án đang chọn.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEquipment(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa thiết bị (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT code, name, kind, serial, condition, calibration_due AS "calibrationDue",
            current_location AS "currentLocation", current_crew AS "currentCrew", note
       FROM equipment WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in body) merged[key] = body[key];
  const input = parseEquipmentBody(merged);

  const invalid = validateEquipmentInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.code !== existing.code) {
    const dup = await queryOne(
      `SELECT id FROM equipment WHERE code = ? AND id <> ?`,
      input.code,
      id,
    );
    if (dup) return NextResponse.json({ error: "Mã thiết bị đã tồn tại" }, { status: 409 });
  }

  await run(
    `UPDATE equipment
        SET code = ?, name = ?, kind = ?, serial = ?, condition = ?, calibration_due = ?,
            current_location = ?, current_crew = ?, note = ?
      WHERE id = ?`,
    input.code,
    input.name,
    input.kind,
    input.serial,
    input.condition,
    input.calibrationDue,
    input.currentLocation,
    input.currentCrew,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}
