import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: number;
  code: string;
  name: string;
  status: string;
  progressPercent: number;
  boqCode: string | null;
  drawingUrl: string | null;
  assignedTo: number | null;
  assigneeName: string | null;
  photoCount: number;
  commentCount: number;
  delayReason: string | null;
  startDate: string | null;
  endDate: string | null;
  custom: Record<string, unknown>;
};
type DimRow = { id: number; taskId: number; label: string; installed: number };

// GET /api/workpackages/:id/dimensions → ma trận sub-task × dimension (kiểu lưới Excel).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const tasks = await query<TaskRow>(
    `SELECT t.id, t.code, t.name, t.status, t.progress_percent AS "progressPercent",
            t.boq_code AS "boqCode", t.drawing_url AS "drawingUrl",
            t.assigned_to AS "assignedTo", u.name AS "assigneeName", t.delay_reason AS "delayReason",
            t.start_date AS "startDate", t.end_date AS "endDate", t.custom,
            COALESCE(pc.cnt, 0) AS "photoCount",
            COALESCE(cc.cnt, 0) AS "commentCount"
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN (SELECT task_id, COUNT(*) AS cnt FROM task_photos GROUP BY task_id) pc ON pc.task_id = t.id
       LEFT JOIN (SELECT task_id, COUNT(*) AS cnt FROM task_comments GROUP BY task_id) cc ON cc.task_id = t.id
      WHERE t.package_id = ? ORDER BY t.sort_order, t.id`,
    pkgId,
  );

  const dims = await query<DimRow>(
    `SELECT pd.id, pd.task_id AS "taskId", pd.dimension_label AS label, pd.installed
       FROM progress_dimensions pd
       JOIN tasks t ON pd.task_id = t.id
      WHERE t.package_id = ?
      ORDER BY pd.sort_order, pd.id`,
    pkgId,
  );

  // Cột = nhãn dimension theo thứ tự xuất hiện đầu tiên.
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const d of dims)
    if (!seen.has(d.label)) {
      seen.add(d.label);
      columns.push(d.label);
    }

  const byTask = new Map<number, Record<string, { id: number; installed: boolean }>>();
  for (const d of dims) {
    if (!byTask.has(d.taskId)) byTask.set(d.taskId, {});
    byTask.get(d.taskId)![d.label] = { id: d.id, installed: !!d.installed };
  }

  const rows = tasks.map((t) => ({ ...t, cells: byTask.get(t.id) ?? {} }));

  return NextResponse.json({ columns, tasks: rows });
}
