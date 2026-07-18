import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const canReturn = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// POST /api/materials/:id/return  body: { qty, note? }
// Hoàn vật tư đã xuất công trường về lại kho: tăng qty_stock, giảm qty_used.
// FOR UPDATE trong transaction để tránh race condition, đối xứng /issue.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canReturn(user.role))
    return NextResponse.json({ error: "Không có quyền hoàn kho" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy vật tư" }, { status: 404 });
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const qty = Number(body.qty);
  if (!qty || qty <= 0)
    return NextResponse.json({ error: "Số lượng không hợp lệ" }, { status: 400 });

  const noteText = body.note ? String(body.note).trim() : "Hoàn kho từ công trường";
  // Chống double-submit (bấm nhanh 2 lần / mất mạng công trường retry): client gửi
  // header Idempotency-Key, unique index (material_id, type, key) chặn ghi trùng.
  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim().slice(0, 200) || null;

  type TxResult =
    { ok: true; newStock: number; newUsed: number } | { ok: false; status: number; error: string };

  const result = await withTransaction(async (): Promise<TxResult> => {
    const mat = await queryOne<{ qty_stock: number; qty_used: number }>(
      `SELECT COALESCE(qty_stock, 0) AS qty_stock, qty_used FROM materials WHERE id = ? AND project_id = ? FOR UPDATE`,
      id,
      projectId,
    );
    if (!mat) return { ok: false, status: 404, error: "Không tìm thấy vật tư" };

    if (idempotencyKey) {
      const dup = await queryOne<{ qty_after: number }>(
        `SELECT qty_after FROM material_transactions
          WHERE material_id = ? AND type = 'hoan_kho' AND idempotency_key = ?`,
        id,
        idempotencyKey,
      );
      if (dup) return { ok: true, newStock: dup.qty_after, newUsed: mat.qty_used };
    }

    if (qty > mat.qty_used)
      return {
        ok: false,
        status: 409,
        error: `Số đã dùng không đủ để hoàn (đã dùng ${mat.qty_used})`,
      };

    const newStock = mat.qty_stock + qty;
    const newUsed = mat.qty_used - qty;

    await run(
      `UPDATE materials SET qty_stock = ?, qty_used = ?, updated_at = NOW() WHERE id = ?`,
      newStock,
      newUsed,
      id,
    );

    if (newStock > 0)
      await run(`UPDATE materials SET status = 've_kho' WHERE id = ? AND status = 'da_dung'`, id);

    await insertId(
      `INSERT INTO material_transactions
         (material_id, delta, qty_after, type, note, created_by, idempotency_key)
       VALUES (?, ?, ?, 'hoan_kho', ?, ?, ?)`,
      id,
      qty,
      newStock,
      noteText,
      user.id,
      idempotencyKey,
    );

    return { ok: true, newStock, newUsed };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ qtyStock: result.newStock, qtyUsed: result.newUsed });
}
