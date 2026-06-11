import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type TaskRow = { id: number; code: string; name: string; status: string; progressPercent: number; boqCode: string | null; drawingUrl: string | null; assignedTo: number | null; assigneeName: string | null; photoCount: number; commentCount: number };
type DimRow = { id: number; taskId: number; label: string; installed: number };

// GET /api/workpackages/:id/dimensions → ma trận sub-task × dimension (kiểu lưới Excel).
// Sub-con chỉ thấy task được giao cho mình.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const subconFilter = user.role === "subcon" ? `AND t.assigned_to = ${user.id}` : "";
  const tasks = await query<TaskRow>(
    `SELECT t.id, t.code, t.name, t.status, t.progress_percent AS "progressPercent",
            t.boq_code AS "boqCode", t.drawing_url AS "drawingUrl",
            t.assigned_to AS "assignedTo", u.name AS "assigneeName",
            (SELECT COUNT(*) FROM task_photos p WHERE p.task_id = t.id) AS "photoCount",
            (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS "commentCount"
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.package_id = ? ${subconFilter} ORDER BY t.id`, pkgId);

  const dims = await query<DimRow>(
    `SELECT pd.id, pd.task_id AS "taskId", pd.dimension_label AS label, pd.installed
       FROM progress_dimensions pd
       JOIN tasks t ON pd.task_id = t.id
      WHERE t.package_id = ?
      ORDER BY pd.id`, pkgId);

  // Cột = nhãn dimension theo thứ tự xuất hiện đầu tiên.
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const d of dims) if (!seen.has(d.label)) { seen.add(d.label); columns.push(d.label); }

  const byTask = new Map<number, Record<string, { id: number; installed: boolean }>>();
  for (const d of dims) {
    if (!byTask.has(d.taskId)) byTask.set(d.taskId, {});
    byTask.get(d.taskId)![d.label] = { id: d.id, installed: !!d.installed };
  }

  const rows = tasks.map((t) => ({ ...t, cells: byTask.get(t.id) ?? {} }));

  return NextResponse.json({ columns, tasks: rows });
}
