import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";
import { recomputeTask } from "@/lib/recompute";

export const dynamic = "force-dynamic";

// PATCH /api/tasks/:id  → sửa nội dung task (tên, code, BOQ, ngày, status, ghi chú). Admin/PM.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!CAN.editStructure((await getCurrentUser())?.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // nghiem_thu chỉ đặt/huỷ qua /api/tasks/:id/approve — đảm bảo có audit trong task_history.
  if (body.status === "nghiem_thu")
    return NextResponse.json({ error: "Dùng POST /api/tasks/:id/approve để nghiệm thu" }, { status: 422 });

  // BOQCODE: duy nhất toàn cục (cả nhóm lẫn task); chuỗi rỗng = xoá mã.
  if (body.boqCode !== undefined) {
    const boq = String(body.boqCode ?? "").trim();
    body.boqCode = boq || null;
    if (boq) {
      const usedBy = await boqTakenBy(boq, { table: "tasks", id });
      if (usedBy) return NextResponse.json({ error: `Mã BOQ "${boq}" đã được dùng bởi ${usedBy}` }, { status: 409 });
    }
  }

  const fields: Record<string, string> = {
    name: "name", code: "code", note: "note", status: "status",
    startDate: "start_date", endDate: "end_date", assignedTo: "assigned_to",
    boqCode: "boq_code", drawingUrl: "drawing_url",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); vals.push(body[key]); }
  }
  if (!sets.length) return NextResponse.json({ error: "Không có trường để cập nhật" }, { status: 400 });

  vals.push(id);
  await run(`UPDATE tasks SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...vals);

  // Đổi deadline có thể đổi trạng thái trễ (tre ⇄ dang_thi_cong) → tính lại.
  if (body.endDate !== undefined || body.startDate !== undefined) await recomputeTask(id);

  const task = await queryOne(`SELECT id, code, name, status, boq_code AS "boqCode", drawing_url AS "drawingUrl" FROM tasks WHERE id = ?`, id);
  return NextResponse.json({ task });
}
