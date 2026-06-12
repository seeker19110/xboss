import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/workpackages/:id/dimensions/column/move
// body: { label, direction: 'left' | 'right' }
// Hoán đổi sort_order cột dimension với cột liền kề.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM mới di chuyển được" }, { status: 403 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const label = String(body.label ?? "").trim();
  const dir = String(body.direction ?? "");
  if (!label) return NextResponse.json({ error: "Thiếu label" }, { status: 400 });
  if (dir !== "left" && dir !== "right") return NextResponse.json({ error: "direction phải là 'left' hoặc 'right'" }, { status: 400 });

  // Lấy task đầu tiên làm mẫu để đọc sort_order.
  const firstTask = await queryOne<{ id: number }>(`SELECT id FROM tasks WHERE package_id = ? ORDER BY sort_order, id LIMIT 1`, pkgId);
  if (!firstTask) return NextResponse.json({ error: "Nhóm không có task" }, { status: 400 });

  const cur = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM progress_dimensions WHERE task_id = ? AND dimension_label = ?`,
    firstTask.id, label);
  if (!cur) return NextResponse.json({ error: "Cột không tồn tại" }, { status: 404 });

  const op = dir === "left"
    ? `< ${cur.sort_order} ORDER BY sort_order DESC`
    : `> ${cur.sort_order} ORDER BY sort_order ASC`;
  const neighbor = await queryOne<{ dimension_label: string; sort_order: number }>(
    `SELECT dimension_label, sort_order FROM progress_dimensions WHERE task_id = ? AND sort_order ${op} LIMIT 1`,
    firstTask.id);

  if (!neighbor) return NextResponse.json({ ok: false, message: "Đã ở vị trí đầu/cuối" });

  // Lấy tất cả task trong package để cập nhật sort_order đồng loạt.
  const tasks = await query<{ id: number }>(`SELECT id FROM tasks WHERE package_id = ?`, pkgId);
  for (const t of tasks) {
    await run(
      `UPDATE progress_dimensions SET sort_order = ? WHERE task_id = ? AND dimension_label = ?`,
      neighbor.sort_order, t.id, label);
    await run(
      `UPDATE progress_dimensions SET sort_order = ? WHERE task_id = ? AND dimension_label = ?`,
      cur.sort_order, t.id, neighbor.dimension_label);
  }

  return NextResponse.json({ ok: true });
}
