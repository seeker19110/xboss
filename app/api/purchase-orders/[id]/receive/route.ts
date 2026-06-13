import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, run, withTransaction, todayISO } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canReceive = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// POST /api/purchase-orders/:id/receive  body: { note?, items: [{poItemId, qtyReceived, note?}] }
// Tạo phiếu nhập kho, cập nhật qty_stock + po_items.qty_received
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canReceive(user.role))
    return NextResponse.json({ error: "Không có quyền nhập kho" }, { status: 403 });

  const poId = parseInt(params.id);
  if (isNaN(poId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const po = await queryOne<{ id: number; status: string }>(
    `SELECT id, status FROM purchase_orders WHERE id = ?`, poId);
  if (!po) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (po.status === "cancelled")
    return NextResponse.json({ error: "Đơn hàng đã huỷ" }, { status: 409 });
  if (po.status === "draft")
    return NextResponse.json({ error: "Đơn hàng chưa được xác nhận — cần chuyển sang 'Đã xác nhận' trước khi nhập kho" }, { status: 409 });
  if (po.status === "received")
    return NextResponse.json({ error: "Đơn hàng đã nhập đủ hàng" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const items: { poItemId: number; qtyReceived: number; note?: string }[] =
    Array.isArray(body.items) ? body.items.filter((i: { poItemId: number; qtyReceived: number }) => Number(i.qtyReceived) > 0) : [];
  if (!items.length)
    return NextResponse.json({ error: "Không có dòng nào có số lượng nhập" }, { status: 400 });

  // Sinh mã phiếu: WR-YYYYMM-NNN
  const ym = todayISO().slice(0, 7).replace("-", "");
  const last = await queryOne<{ receipt_code: string }>(
    `SELECT receipt_code FROM warehouse_receipts WHERE receipt_code LIKE ? ORDER BY receipt_code DESC LIMIT 1`,
    `WR-${ym}-%`);
  const seq = last ? parseInt(last.receipt_code.split("-")[2]) + 1 : 1;
  const receiptCode = `WR-${ym}-${String(seq).padStart(3, "0")}`;

  // Lấy toàn bộ po_items để kiểm tra hợp lệ
  const poItems = await query<{ id: number; material_id: number; qty_ordered: number; qty_received: number }>(
    `SELECT id, material_id, qty_ordered, qty_received FROM po_items WHERE po_id = ?`, poId);
  const poItemMap = new Map(poItems.map(p => [p.id, p]));

  const receiptId = await withTransaction(async () => {
    const rid = await insertId(
      `INSERT INTO warehouse_receipts (receipt_code, po_id, received_by, note)
       VALUES (?, ?, ?, ?)`,
      receiptCode, poId, user.id,
      body.note ? String(body.note).trim() : null);

    for (const item of items) {
      const poItem = poItemMap.get(Number(item.poItemId));
      if (!poItem) continue;
      const qty = Math.max(0, Number(item.qtyReceived));
      if (qty === 0) continue;

      // Tạo receipt_item
      const riId = await insertId(
        `INSERT INTO receipt_items (receipt_id, material_id, po_item_id, qty_received, note)
         VALUES (?, ?, ?, ?, ?)`,
        rid, poItem.material_id, poItem.id, qty,
        item.note ? String(item.note).trim() : null);

      // Cộng qty_stock vào materials
      await run(
        `UPDATE materials SET qty_stock = COALESCE(qty_stock, 0) + ?, updated_at = NOW() WHERE id = ?`,
        qty, poItem.material_id);

      // Ghi transaction loại nhap_kho
      const mat = await queryOne<{ qty_stock: number; qty_used: number }>(
        `SELECT qty_stock, qty_used FROM materials WHERE id = ?`, poItem.material_id);
      await insertId(
        `INSERT INTO material_transactions (material_id, delta, qty_after, type, receipt_item_id, note, created_by)
         VALUES (?, ?, ?, 'nhap_kho', ?, ?, ?)`,
        poItem.material_id, qty, (mat?.qty_stock ?? 0),
        riId, `Nhập kho từ ${receiptCode}`, user.id);

      // Cập nhật qty_received trong po_items
      await run(
        `UPDATE po_items SET qty_received = qty_received + ? WHERE id = ?`,
        qty, poItem.id);
    }

    // Tự động cập nhật trạng thái PO
    const updatedItems = await query<{ qty_ordered: number; qty_received: number }>(
      `SELECT qty_ordered, qty_received FROM po_items WHERE po_id = ?`, poId);
    const allReceived = updatedItems.every(i => i.qty_received >= i.qty_ordered);
    const anyReceived = updatedItems.some(i => i.qty_received > 0);
    const newStatus = allReceived ? "received" : anyReceived ? "partial" : "confirmed";
    await run(`UPDATE purchase_orders SET status = ? WHERE id = ?`, newStatus, poId);

    // Cập nhật trạng thái materials: nếu qty_stock > 0 → ve_kho
    for (const item of items) {
      const poItem = poItemMap.get(Number(item.poItemId));
      if (!poItem) continue;
      await run(
        `UPDATE materials SET status = 've_kho' WHERE id = ? AND status = 'dat_hang'`,
        poItem.material_id);
    }

    return rid;
  });

  return NextResponse.json({ receiptId, receiptCode }, { status: 201 });
}
