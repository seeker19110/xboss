import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canIssue = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// POST /api/materials/:id/issue  body: { qty, taskId?, note? }
// Xuất vật tư ra công trường: giảm qty_stock, tăng qty_used.
// Check tồn kho bên trong transaction với FOR UPDATE để tránh race condition
// khi nhiều request xuất cùng lúc vượt quá số dư.
export async function POST(req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canIssue(user.role))
    return NextResponse.json({ error: "Không có quyền xuất vật tư" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const qty = Number(body.qty);
  if (!qty || qty <= 0) return NextResponse.json({ error: "Số lượng không hợp lệ" }, { status: 400 });

  const taskId = body.taskId ? Number(body.taskId) : null;
  const noteText = body.note ? String(body.note).trim() : `Xuất công trường${taskId ? ` (task #${taskId})` : ""}`;

  // FOR UPDATE: khoá hàng trong transaction để tránh race condition khi
  // nhiều request xuất vật tư đồng thời vượt quá số dư tồn kho.
  type TxResult = { ok: true; newStock: number; newUsed: number } | { ok: false; status: number; error: string };

  const result = await withTransaction(async (): Promise<TxResult> => {
    const mat = await queryOne<{ qty_stock: number; qty_used: number }>(
      `SELECT COALESCE(qty_stock, 0) AS qty_stock, qty_used FROM materials WHERE id = ? FOR UPDATE`, id);
    if (!mat) return { ok: false, status: 404, error: "Không tìm thấy vật tư" };
    if (qty > mat.qty_stock)
      return { ok: false, status: 409, error: `Tồn kho không đủ (còn ${mat.qty_stock})` };

    const newStock = mat.qty_stock - qty;
    const newUsed  = mat.qty_used  + qty;

    await run(
      `UPDATE materials SET qty_stock = ?, qty_used = ?, updated_at = NOW() WHERE id = ?`,
      newStock, newUsed, id);

    if (newStock === 0 && newUsed > 0)
      await run(`UPDATE materials SET status = 'da_dung' WHERE id = ?`, id);

    await insertId(
      `INSERT INTO material_transactions (material_id, delta, qty_after, type, task_id, note, created_by)
       VALUES (?, ?, ?, 'xuat_cong_truong', ?, ?, ?)`,
      id, -qty, newStock, taskId, noteText, user.id);

    return { ok: true, newStock, newUsed };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ qtyStock: result.newStock, qtyUsed: result.newUsed });
}
