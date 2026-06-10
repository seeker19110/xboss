import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type TaskRow = { id: number; code: string; name: string; status: string; progressPercent: number };
type DimRow = { id: number; taskId: number; label: string; installed: number };

// GET /api/workpackages/:id/dimensions → ma trận sub-task × dimension (kiểu lưới Excel).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const tasks = query<TaskRow>(
    `SELECT id, code, name, status, progress_percent AS progressPercent
       FROM tasks WHERE package_id = ? ORDER BY id`, pkgId);

  const dims = query<DimRow>(
    `SELECT pd.id, pd.task_id AS taskId, pd.dimension_label AS label, pd.installed
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
