import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/tasks/:id/dimensions → danh sách dimension của task.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const dimensions = await query(
    `SELECT id, dimension_label AS label, installed, value
       FROM progress_dimensions WHERE task_id = ? ORDER BY id`, id);

  return NextResponse.json({ dimensions });
}
