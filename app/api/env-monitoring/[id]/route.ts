import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  parseEnvMonitoringBody,
  validateMonitoringInput,
  type EnvMonitoringInput,
} from "@/lib/environment";

export const dynamic = "force-dynamic";

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<EnvMonitoringInput | undefined> {
  if (projectId == null) return undefined;
  return queryOne<EnvMonitoringInput>(
    `SELECT measured_at AS "measuredAt", category, indicator, value, unit, threshold,
            location, note
       FROM env_monitoring WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/env-monitoring/:id — chi tiết 1 kỳ quan trắc. Scoped theo dự án đang chọn (M22).
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
  const record =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT m.id, m.project_id AS "projectId", m.measured_at AS "measuredAt", m.category,
                  m.indicator, m.value, m.unit, m.threshold, m.passed, m.location, m.note,
                  m.recorded_by AS "recordedBy", u.name AS "recordedByName", m.created_at AS "createdAt"
             FROM env_monitoring m LEFT JOIN users u ON u.id = m.recorded_by
            WHERE m.id = ? AND m.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!record) return NextResponse.json({ error: "Không tìm thấy kỳ quan trắc" }, { status: 404 });

  return NextResponse.json({ record });
}

// PATCH /api/env-monitoring/:id — sửa kỳ quan trắc (Admin/PM/kỹ sư). `passed` tính lại
// lúc ghi theo giá trị mới (snapshot).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEnv(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa kỳ quan trắc (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy kỳ quan trắc" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in body) merged[key] = body[key];
  const input = parseEnvMonitoringBody(merged);

  const { error, passed } = validateMonitoringInput(input);
  if (error) return NextResponse.json({ error }, { status: 422 });

  await run(
    `UPDATE env_monitoring SET measured_at = ?, category = ?, indicator = ?, value = ?,
            unit = ?, threshold = ?, passed = ?, location = ?, note = ?
      WHERE id = ?`,
    input.measuredAt,
    input.category,
    input.indicator,
    input.value,
    input.unit,
    input.threshold,
    passed,
    input.location,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/env-monitoring/:id — xoá kỳ quan trắc (Admin/PM/kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEnv(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá kỳ quan trắc (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy kỳ quan trắc" }, { status: 404 });

  await run(`DELETE FROM env_monitoring WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
