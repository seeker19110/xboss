import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseWasteBody, validateWasteInput, type WasteLogInput } from "@/lib/environment";

export const dynamic = "force-dynamic";

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<WasteLogInput | undefined> {
  if (projectId == null) return undefined;
  return queryOne<WasteLogInput>(
    `SELECT log_date AS "logDate", waste_type AS "wasteType", quantity, unit,
            disposal_method AS "disposalMethod", handler, note
       FROM waste_logs WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/waste-logs/:id — chi tiết 1 lượt ghi chất thải. Scoped theo dự án đang chọn (M22).
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
  const log =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT w.id, w.project_id AS "projectId", w.log_date AS "logDate", w.waste_type AS "wasteType",
                  w.quantity, w.unit, w.disposal_method AS "disposalMethod", w.handler, w.note,
                  w.recorded_by AS "recordedBy", u.name AS "recordedByName", w.created_at AS "createdAt"
             FROM waste_logs w LEFT JOIN users u ON u.id = w.recorded_by
            WHERE w.id = ? AND w.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!log) return NextResponse.json({ error: "Không tìm thấy lượt ghi" }, { status: 404 });

  return NextResponse.json({ log });
}

// PATCH /api/waste-logs/:id — sửa lượt ghi chất thải (Admin/PM/kỹ sư).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEnv(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa lượt ghi chất thải (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy lượt ghi" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in body) merged[key] = body[key];
  const input = parseWasteBody(merged);

  const invalid = validateWasteInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  await run(
    `UPDATE waste_logs SET log_date = ?, waste_type = ?, quantity = ?, unit = ?,
            disposal_method = ?, handler = ?, note = ?
      WHERE id = ?`,
    input.logDate,
    input.wasteType,
    input.quantity,
    input.unit,
    input.disposalMethod,
    input.handler,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/waste-logs/:id — xoá lượt ghi chất thải (Admin/PM/kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEnv(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá lượt ghi chất thải (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy lượt ghi" }, { status: 404 });

  await run(`DELETE FROM waste_logs WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
