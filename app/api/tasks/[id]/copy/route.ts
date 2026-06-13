import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/tasks/:id/copy
// Tạo bản sao task (code mới, không copy ảnh/bình luận/lịch sử).
// Body tuỳ chọn: { code?, name?, afterId? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM mới copy được task" }, { status: 403 });

  const srcId = parseInt(params.id);
  if (isNaN(srcId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const src = await queryOne<{
    id: number; package_id: number; code: string; name: string;
    start_date: string | null; end_date: string | null;
    assigned_to: number | null; assigned_manual: boolean; drawing_url: string | null;
  }>(`SELECT id, package_id, code, name, start_date, end_date, assigned_to, assigned_manual, drawing_url
      FROM tasks WHERE id = ?`, srcId);
  if (!src) return NextResponse.json({ error: "Task gốc không tồn tại" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const newCode = String(body.code ?? `${src.code}_copy`).trim();
  const newName = String(body.name ?? `${src.name} (bản sao)`).trim();

  const dup = await queryOne(`SELECT id FROM tasks WHERE package_id = ? AND code = ?`, src.package_id, newCode);
  if (dup) return NextResponse.json({ error: `Mã "${newCode}" đã tồn tại trong nhóm` }, { status: 409 });

  // Tính sort_order: chèn sau afterId hoặc sau task gốc.
  const afterId = body.afterId ? Number(body.afterId) : srcId;
  const afterRow = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM tasks WHERE id = ? AND package_id = ?`, afterId, src.package_id);
  const sortOrder = (afterRow?.sort_order ?? 0) + 1;

  // Copy cấu trúc cột nguồn trước khi mở transaction (chỉ đọc).
  const dims = await query<{ dimension_label: string; sort_order: number }>(
    `SELECT dimension_label, sort_order FROM progress_dimensions WHERE task_id = ? ORDER BY sort_order`, srcId);

  // Bọc sort_order bump + INSERT task + INSERT dims trong 1 transaction.
  const newId = await withTransaction(async () => {
    await run(`UPDATE tasks SET sort_order = sort_order + 1 WHERE package_id = ? AND sort_order >= ?`,
      src.package_id, sortOrder);

    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, start_date, end_date, assigned_to, assigned_manual,
                          drawing_url, sort_order, status, progress_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'chuan_bi', 0)`,
      src.package_id, newCode, newName, src.start_date, src.end_date,
      src.assigned_to, src.assigned_manual, src.drawing_url, sortOrder);

    for (const d of dims) {
      await insertId(
        `INSERT INTO progress_dimensions (task_id, dimension_label, installed, sort_order) VALUES (?, ?, 0, ?)`,
        taskId, d.dimension_label, d.sort_order);
    }
    return taskId;
  });

  return NextResponse.json({ id: newId, code: newCode, name: newName }, { status: 201 });
}
