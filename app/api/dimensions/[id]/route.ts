import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { recomputeTask } from "@/lib/recompute";

export const dynamic = "force-dynamic";

// PATCH /api/dimensions/:id  body: { installed: boolean }  → toggle + tính lại % task/package.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const installed = body.installed ? 1 : 0;

  const dim = queryOne<{ task_id: number }>(`SELECT task_id FROM progress_dimensions WHERE id = ?`, id);
  if (!dim) return NextResponse.json({ error: "Không tìm thấy dimension" }, { status: 404 });

  run(`UPDATE progress_dimensions SET installed = ?, value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    installed, installed, id);

  const result = recomputeTask(dim.task_id);
  return NextResponse.json({ id, installed: !!installed, task: result });
}
