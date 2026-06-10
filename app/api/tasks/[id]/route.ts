import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/tasks/:id  → sửa nội dung task (tên, code, ngày, status, ghi chú). Admin/PM.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!CAN.editStructure(getCurrentUser()?.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const fields: Record<string, string> = {
    name: "name", code: "code", note: "note", status: "status",
    startDate: "start_date", endDate: "end_date",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); vals.push(body[key]); }
  }
  if (!sets.length) return NextResponse.json({ error: "Không có trường để cập nhật" }, { status: 400 });

  vals.push(id);
  run(`UPDATE tasks SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...vals);
  const task = queryOne(`SELECT id, code, name, status FROM tasks WHERE id = ?`, id);
  return NextResponse.json({ task });
}
