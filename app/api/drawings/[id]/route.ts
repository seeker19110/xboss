import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  checkDrawingRefs,
  getDrawing,
  listRevisions,
  parseDrawingBody,
  validateDrawingInput,
  type DrawingInput,
} from "@/lib/drawings";

export const dynamic = "force-dynamic";

// GET /api/drawings/:id — chi tiết bản vẽ + toàn bộ revision (mới nhất trước).
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
  const drawing = projectId != null ? await getDrawing(id, projectId) : undefined;
  if (!drawing) return NextResponse.json({ error: "Không tìm thấy bản vẽ" }, { status: 404 });

  const revisions = await listRevisions(id);
  return NextResponse.json({ drawing, revisions });
}

// PATCH /api/drawings/:id — sửa metadata bản vẽ (số/tên/loại/hệ/tầng/nhóm gắn).
// Admin/PM/kỹ sư — cần để đổi mã "WP-<id>" tạm sinh lúc migrate dữ liệu cũ.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa bản vẽ (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT code, name, kind, system_group AS "systemGroup", floor_label AS "floorLabel",
                  work_package_id AS "workPackageId"
             FROM drawings WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy bản vẽ" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in body) merged[key] = body[key];
  const input: DrawingInput = parseDrawingBody(merged);

  const invalid = validateDrawingInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkDrawingRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  try {
    await run(
      `UPDATE drawings SET code = ?, name = ?, kind = ?, system_group = ?, floor_label = ?,
              work_package_id = ?
        WHERE id = ?`,
      input.code,
      input.name,
      input.kind,
      input.systemGroup,
      input.floorLabel,
      input.workPackageId,
      id,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json({ error: `Số bản vẽ "${input.code}" đã tồn tại` }, { status: 409 });
    throw err;
  }

  return NextResponse.json({ updated: id });
}
