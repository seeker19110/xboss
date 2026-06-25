import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

const STATUSES = ["dat_hang", "ve_kho", "da_dung"];
const canEditMaterials = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";
const MAX_UPDATES = 500; // fail-fast: chặn dán quá lớn

// PATCH /api/materials/batch  body: { updates: { id, patch }[] }
// Cập nhật nhiều vật tư trong 1 transaction — phục vụ dán/fill nhiều ô từ lưới.
// Dùng lại đúng quy tắc PATCH đơn: validate trạng thái/BOQ, ghi material_transactions
// khi đổi qtyUsed. Toàn bộ thành công hoặc rollback (idempotent theo lô).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditMaterials(user.role))
    return NextResponse.json({ error: "Không có quyền sửa vật tư" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const updates: { id: unknown; patch: unknown }[] = Array.isArray(body.updates) ? body.updates : [];
  if (!updates.length) return NextResponse.json({ error: "Không có cập nhật" }, { status: 400 });
  if (updates.length > MAX_UPDATES)
    return NextResponse.json({ error: `Tối đa ${MAX_UPDATES} ô mỗi lần` }, { status: 422 });

  const fields: Record<string, string> = {
    name: "name", unit: "unit", qtyBoq: "qty_boq", qtyPlanned: "qty_planned",
    qtyUsed: "qty_used", qtyStock: "qty_stock", minStockLevel: "min_stock_level",
    status: "status", note: "note", boqCode: "boq_code",
  };
  const qtyKeys = new Set(["qtyBoq", "qtyPlanned", "qtyUsed", "qtyStock", "minStockLevel"]);

  try {
    const updated = await withTransaction(async () => {
      let count = 0;
      for (const u of updates) {
        const id = parseInt(String(u.id));
        const patch = (u.patch && typeof u.patch === "object" ? u.patch : {}) as Record<string, unknown>;
        if (isNaN(id)) throw new Error("ID không hợp lệ");

        const m = await queryOne<{ id: number; qty_used: number; qty_stock: number }>(
          `SELECT id, qty_used, COALESCE(qty_stock, 0) AS qty_stock FROM materials WHERE id = ?`, id);
        if (!m) throw new Error(`Không tìm thấy vật tư #${id}`);

        if (patch.status !== undefined && !STATUSES.includes(String(patch.status)))
          throw new Error("Trạng thái không hợp lệ");

        if (patch.boqCode !== undefined) {
          const boq = String(patch.boqCode ?? "").trim();
          patch.boqCode = boq || null;
          if (boq) {
            const usedBy = await boqTakenBy(boq, { table: "materials", id });
            if (usedBy) throw new Error(`Mã BOQ "${boq}" đã được dùng bởi ${usedBy}`);
          }
        }

        const sets: string[] = [];
        const vals: unknown[] = [];
        for (const [key, col] of Object.entries(fields)) {
          if (patch[key] !== undefined) {
            sets.push(`${col} = ?`);
            vals.push(qtyKeys.has(key) ? Number(patch[key]) || 0 : patch[key]);
          }
        }
        if (!sets.length) continue;

        vals.push(id);
        await run(`UPDATE materials SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...vals);

        if (patch.qtyUsed !== undefined) {
          const newQty = Number(patch.qtyUsed) || 0;
          const delta = newQty - (m.qty_used ?? 0);
          if (delta !== 0) {
            await run(
              `INSERT INTO material_transactions (material_id, delta, qty_after, note, created_by)
               VALUES (?, ?, ?, 'Sửa hàng loạt (lưới)', ?)`,
              id, delta, newQty, user.id);
          }
        }
        if (patch.qtyStock !== undefined) {
          const newStock = Number(patch.qtyStock) || 0;
          const delta = newStock - (m.qty_stock ?? 0);
          if (delta !== 0) {
            await run(
              `INSERT INTO material_transactions (material_id, delta, qty_after, type, note, created_by)
               VALUES (?, ?, ?, 'dieu_chinh_kho', 'Điều chỉnh tồn kho (lưới)', ?)`,
              id, delta, newStock, user.id);
          }
        }
        count++;
      }
      return count;
    });
    return NextResponse.json({ ok: true, updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Lỗi máy chủ khi cập nhật vật tư";
    // Lỗi BOQ trùng / dữ liệu xấu là lỗi người dùng → 422; còn lại 500.
    const status = /BOQ|hợp lệ|tìm thấy/i.test(msg) ? 422 : 500;
    if (status === 500) console.error("PATCH /api/materials/batch error:", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
