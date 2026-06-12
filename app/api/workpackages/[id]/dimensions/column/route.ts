import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/workpackages/:id/dimensions/column
// body: { label, afterLabel? }
// Thêm cột dimension mới (tạo progress_dimension row cho mọi task trong package).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM mới thêm được cột" }, { status: 403 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "Thiếu tên cột (label)" }, { status: 400 });

  // Lấy danh sách tasks trong package.
  const tasks = await query<{ id: number }>(
    `SELECT id FROM tasks WHERE package_id = ? ORDER BY sort_order, id`, pkgId);
  if (tasks.length === 0)
    return NextResponse.json({ error: "Nhóm này chưa có task" }, { status: 400 });

  const afterLabel = String(body.afterLabel ?? "").trim() || null;
  let sortOrder: number;

  if (afterLabel) {
    // Lấy sort_order của cột afterLabel (từ task đầu tiên làm mẫu).
    const ref = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM progress_dimensions WHERE task_id = ? AND dimension_label = ?`,
      tasks[0].id, afterLabel);
    if (!ref) return NextResponse.json({ error: "afterLabel không tồn tại" }, { status: 400 });
    sortOrder = ref.sort_order + 1;
    // Shift các cột sau vị trí chèn.
    await run(
      `UPDATE progress_dimensions SET sort_order = sort_order + 1
         WHERE task_id IN (SELECT id FROM tasks WHERE package_id = ?) AND sort_order >= ?`,
      pkgId, sortOrder);
  } else {
    // Thêm vào cuối.
    const maxRow = await queryOne<{ m: number | null }>(
      `SELECT MAX(pd.sort_order) AS m FROM progress_dimensions pd
         JOIN tasks t ON pd.task_id = t.id WHERE t.package_id = ?`, pkgId);
    sortOrder = (maxRow?.m ?? 0) + 1;
  }

  // Tạo progress_dimension mới cho mọi task.
  const ids: number[] = [];
  for (const t of tasks) {
    const id = await insertId(
      `INSERT INTO progress_dimensions (task_id, dimension_label, installed, sort_order) VALUES (?, ?, 0, ?)`,
      t.id, label, sortOrder);
    ids.push(id);
  }

  return NextResponse.json({ created: ids.length, label, sortOrder }, { status: 201 });
}

// DELETE /api/workpackages/:id/dimensions/column?label=xxx
// Xoá toàn bộ progress_dimensions theo nhãn trong package này.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM mới xoá được cột" }, { status: 403 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const label = req.nextUrl.searchParams.get("label");
  if (!label) return NextResponse.json({ error: "Thiếu tham số label" }, { status: 400 });

  const { changes } = await run(
    `DELETE FROM progress_dimensions WHERE dimension_label = ?
       AND task_id IN (SELECT id FROM tasks WHERE package_id = ?)`, label, pkgId);

  return NextResponse.json({ deleted: changes });
}
