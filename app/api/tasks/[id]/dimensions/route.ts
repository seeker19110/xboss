import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, canTouchTask } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

// GET /api/tasks/:id/dimensions → danh sách dimension của task.
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
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;
  if (!(await canTouchTask(user, id)))
    return NextResponse.json({ error: "Không có quyền xem dimension task này" }, { status: 403 });

  const dimensions = await query(
    `SELECT id, dimension_label AS label, installed, value
       FROM progress_dimensions WHERE task_id = ? ORDER BY id`,
    id,
  );

  return NextResponse.json({ dimensions });
}
