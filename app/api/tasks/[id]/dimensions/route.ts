import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, canTouchTask } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";

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

  // Kèm dữ liệu sự kiện theo ô (M120) — cùng bộ trường với lưới nhóm để client dùng chung
  // một kiểu dữ liệu. LEFT JOIN users vì `installed_by` NULL ở ô chưa tick / tick trước M120.
  const dimensions = await query(
    `SELECT pd.id, pd.dimension_label AS label, pd.installed, pd.value,
            pd.installed_at AS "installedAt", pd.installed_by AS "installedBy",
            u.name AS "installedByName", pd.note
       FROM progress_dimensions pd
       LEFT JOIN users u ON u.id = pd.installed_by
      WHERE pd.task_id = ? ORDER BY pd.sort_order, pd.id`,
    id,
  );

  return NextResponse.json({ dimensions });
}
