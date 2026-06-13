import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/workpackages/:id/copy
// Tạo bản sao nhóm cùng tất cả tasks và cấu trúc cột (checkbox reset về unchecked).
// Body tuỳ chọn: { code?, name?, floorLabel?, afterId? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM mới copy được nhóm" }, { status: 403 });

  const srcId = parseInt(params.id);
  if (isNaN(srcId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const src = await queryOne<{
    id: number; sheet_type_id: number; code: string; name: string;
    floor_label: string | null; boq_code: string | null; drawing_url: string | null;
    sort_order: number; assigned_to: number | null; assigned_manual: boolean;
  }>(`SELECT id, sheet_type_id, code, name, floor_label, boq_code, drawing_url, sort_order,
             assigned_to, assigned_manual
      FROM work_packages WHERE id = ?`, srcId);
  if (!src) return NextResponse.json({ error: "Nhóm gốc không tồn tại" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const newCode = String(body.code ?? `${src.code}_copy`).trim();
  const newName = String(body.name ?? `${src.name} (bản sao)`).trim();
  const newFloor = body.floorLabel !== undefined ? String(body.floorLabel).trim() || null : src.floor_label;

  const dup = await queryOne(`SELECT id FROM work_packages WHERE sheet_type_id = ? AND code = ?`,
    src.sheet_type_id, newCode);
  if (dup) return NextResponse.json({ error: `Mã "${newCode}" đã tồn tại trong sheet` }, { status: 409 });

  // Tính sort_order: chèn sau afterId hoặc sau nhóm gốc.
  const afterId = body.afterId ? Number(body.afterId) : srcId;
  const afterRow = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM work_packages WHERE id = ? AND sheet_type_id = ?`, afterId, src.sheet_type_id);
  const sortOrder = (afterRow?.sort_order ?? src.sort_order) + 1;

  // Copy tasks nguồn trước khi mở transaction (chỉ đọc, không cần tx).
  const srcTasks = await query<{
    id: number; code: string; name: string; sort_order: number;
    start_date: string | null; end_date: string | null;
    assigned_to: number | null; assigned_manual: boolean; drawing_url: string | null;
  }>(`SELECT id, code, name, sort_order, start_date, end_date, assigned_to, assigned_manual, drawing_url
      FROM tasks WHERE package_id = ? ORDER BY sort_order`, srcId);

  // Bọc sort_order bump + INSERT nhóm + INSERT tasks/dims trong 1 transaction.
  const newPkgId = await withTransaction(async () => {
    await run(
      `UPDATE work_packages SET sort_order = sort_order + 1 WHERE sheet_type_id = ? AND sort_order >= ?`,
      src.sheet_type_id, sortOrder);

    // BOQ không copy (phải duy nhất toàn hệ thống).
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, drawing_url, sort_order, status, progress, assigned_to, assigned_manual)
       VALUES (?, ?, ?, ?, ?, ?, 'chuan_bi', 0, ?, ?)`,
      src.sheet_type_id, newCode, newName, newFloor, src.drawing_url, sortOrder, src.assigned_to, src.assigned_manual);

    for (const t of srcTasks) {
      const newTaskId = await insertId(
        `INSERT INTO tasks (package_id, code, name, start_date, end_date, assigned_to, assigned_manual,
                            drawing_url, sort_order, status, progress_percent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'chuan_bi', 0)`,
        pkgId, t.code, t.name, t.start_date, t.end_date, t.assigned_to, t.assigned_manual, t.drawing_url, t.sort_order);

      const dims = await query<{ dimension_label: string; sort_order: number }>(
        `SELECT dimension_label, sort_order FROM progress_dimensions WHERE task_id = ? ORDER BY sort_order`, t.id);
      for (const d of dims) {
        await insertId(
          `INSERT INTO progress_dimensions (task_id, dimension_label, installed, sort_order) VALUES (?, ?, 0, ?)`,
          newTaskId, d.dimension_label, d.sort_order);
      }
    }
    return pkgId;
  });

  return NextResponse.json({ id: newPkgId, code: newCode, name: newName, tasks: srcTasks.length }, { status: 201 });
}
