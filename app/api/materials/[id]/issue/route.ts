import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canIssue = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// POST /api/materials/:id/issue  body: { qty, taskId?, note? }
// Xuất vật tư ra công trường: giảm qty_stock, tăng qty_used
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canIssue(user.role))
    return NextResponse.json({ error: "Không có quyền xuất vật tư" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const mat = await queryOne<{ id: number; qty_stock: number; qty_used: number; qty_planned: number }>(
    `SELECT id, COALESCE(qty_stock, 0) AS qty_stock, qty_used, qty_planned FROM materials WHERE id = ?`, id);
  if (!mat) return NextResponse.json({ error: "Không tìm thấy vật tư" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const qty = Number(body.qty);
  if (!qty || qty <= 0) return NextResponse.json({ error: "Số lượng không hợp lệ" }, { status: 400 });
  if (qty > mat.qty_stock)
    return NextResponse.json({ error: `Tồn kho không đủ (còn ${mat.qty_stock})` }, { status: 409 });

  const taskId = body.taskId ? Number(body.taskId) : null;
  const newStock = mat.qty_stock - qty;
  const newUsed = mat.qty_used + qty;
  const noteText = body.note ? String(body.note).trim() : `Xuất công trường${taskId ? ` (task #${taskId})` : ""}`;

  await withTransaction(async () => {
    await run(
      `UPDATE materials SET qty_stock = ?, qty_used = ?, updated_at = NOW() WHERE id = ?`,
      newStock, newUsed, id);

    // Tự động cập nhật trạng thái
    if (newStock === 0 && newUsed > 0) {
      await run(`UPDATE materials SET status = 'da_dung' WHERE id = ?`, id);
    }

    // delta âm = stock ra khỏi kho; qty_after = tồn kho còn lại
    await insertId(
      `INSERT INTO material_transactions (material_id, delta, qty_after, type, task_id, note, created_by)
       VALUES (?, ?, ?, 'xuat_cong_truong', ?, ?, ?)`,
      id, -qty, newStock, taskId, noteText, user.id);
  });

  return NextResponse.json({ qtyStock: newStock, qtyUsed: newUsed });
}
