import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, run, withTransaction, todayISO } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { nextSeqCode, withUniqueRetry } from "@/lib/seqcode";
import { logPoStatusChange } from "@/lib/procurement";

export const dynamic = "force-dynamic";

const canReceive = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// POST /api/purchase-orders/:id/receive  body: { note?, items: [{poItemId, qtyReceived, note?}] }
// Tạo phiếu nhập kho, cập nhật qty_stock + po_items.qty_received
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canReceive(user.role))
    return NextResponse.json({ error: "Không có quyền nhập kho" }, { status: 403 });

  const poId = parseInt(params.id);
  if (isNaN(poId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const po = await queryOne<{ id: number; status: string }>(
    `SELECT id, status FROM purchase_orders WHERE id = ?`,
    poId,
  );
  if (!po) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (po.status === "cancelled")
    return NextResponse.json({ error: "Đơn hàng đã huỷ" }, { status: 409 });
  if (po.status === "draft")
    return NextResponse.json(
      { error: "Đơn hàng chưa được xác nhận — cần chuyển sang 'Đã xác nhận' trước khi nhập kho" },
      { status: 409 },
    );
  if (po.status === "received" || po.status === "reconciled")
    return NextResponse.json({ error: "Đơn hàng đã nhập đủ hàng" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const items: { poItemId: number; qtyReceived: number; note?: string }[] = Array.isArray(
    body.items,
  )
    ? body.items.filter((i: { poItemId: number; qtyReceived: number }) => Number(i.qtyReceived) > 0)
    : [];
  if (!items.length)
    return NextResponse.json({ error: "Không có dòng nào có số lượng nhập" }, { status: 400 });

  const ym = todayISO().slice(0, 7).replace("-", "");

  // Lấy toàn bộ po_items để kiểm tra hợp lệ
  const poItems = await query<{
    id: number;
    material_id: number;
    qty_ordered: number;
    qty_received: number;
  }>(`SELECT id, material_id, qty_ordered, qty_received FROM po_items WHERE po_id = ?`, poId);
  const poItemMap = new Map(poItems.map((p) => [p.id, p]));

  // Pre-fetch qty_used của tất cả vật tư liên quan (1 query thay vì N query trong loop)
  const neededMatIds = [
    ...new Set(
      items
        .map((i) => poItemMap.get(Number(i.poItemId))?.material_id)
        .filter((id): id is number => id != null),
    ),
  ];
  const matRows =
    neededMatIds.length > 0
      ? await query<{ id: number; qty_used: number }>(
          `SELECT id, qty_used FROM materials WHERE id IN (${neededMatIds.map(() => "?").join(",")})`,
          ...neededMatIds,
        )
      : [];
  const matMap = new Map(matRows.map((m) => [m.id, m]));

  let receiptId: number;
  let receiptCode: string;
  try {
    // Sinh mã phiếu WR-YYYYMM-NNN trong retry — đụng mã (tạo đồng thời) thì sinh lại.
    ({ receiptId, receiptCode } = await withUniqueRetry(() =>
      withTransaction(async () => {
        const receiptCode = await nextSeqCode("warehouse_receipts", "receipt_code", `WR-${ym}-`);
        const rid = await insertId(
          `INSERT INTO warehouse_receipts (receipt_code, po_id, received_by, note)
       VALUES (?, ?, ?, ?)`,
          receiptCode,
          poId,
          user.id,
          body.note ? String(body.note).trim() : null,
        );

        for (const item of items) {
          const poItem = poItemMap.get(Number(item.poItemId));
          if (!poItem) continue;
          const qty = Math.max(0, Number(item.qtyReceived));
          if (qty === 0) continue;

          // Khoá dòng po_item trong transaction để đọc qty_received hiện tại chính xác
          // (chống race khi 2 phiếu nhập đồng thời cùng vượt số đã đặt).
          const locked = await queryOne<{ qty_ordered: number; qty_received: number }>(
            `SELECT qty_ordered, qty_received FROM po_items WHERE id = ? FOR UPDATE`,
            poItem.id,
          );
          if (!locked) continue;
          // Throw (không return) để rollback toàn bộ phiếu nhập đang dở — return sẽ COMMIT.
          if (locked.qty_received + qty > locked.qty_ordered)
            throw new Error(
              `OVERRECEIVE:Nhập vượt số đặt cho 1 vật tư (đã đặt ${locked.qty_ordered}, đã nhận ${locked.qty_received}, nhận thêm ${qty})`,
            );

          // Tạo receipt_item
          const riId = await insertId(
            `INSERT INTO receipt_items (receipt_id, material_id, po_item_id, qty_received, note)
         VALUES (?, ?, ?, ?, ?)`,
            rid,
            poItem.material_id,
            poItem.id,
            qty,
            item.note ? String(item.note).trim() : null,
          );

          // Cộng qty_stock vào materials
          await run(
            `UPDATE materials SET qty_stock = COALESCE(qty_stock, 0) + ?, updated_at = NOW() WHERE id = ?`,
            qty,
            poItem.material_id,
          );

          // Ghi transaction loại nhap_kho — qty_after = qty_used để nhất quán với các endpoint khác.
          const mat = matMap.get(poItem.material_id);
          await insertId(
            `INSERT INTO material_transactions (material_id, delta, qty_after, type, receipt_item_id, note, created_by)
         VALUES (?, ?, ?, 'nhap_kho', ?, ?, ?)`,
            poItem.material_id,
            qty,
            mat?.qty_used ?? 0,
            riId,
            `Nhập kho từ ${receiptCode}`,
            user.id,
          );

          // Cập nhật qty_received trong po_items
          await run(
            `UPDATE po_items SET qty_received = qty_received + ? WHERE id = ?`,
            qty,
            poItem.id,
          );
        }

        // Tự động cập nhật trạng thái PO
        const updatedItems = await query<{ qty_ordered: number; qty_received: number }>(
          `SELECT qty_ordered, qty_received FROM po_items WHERE po_id = ?`,
          poId,
        );
        const allReceived = updatedItems.every((i) => i.qty_received >= i.qty_ordered);
        const anyReceived = updatedItems.some((i) => i.qty_received > 0);
        const newStatus = allReceived ? "received" : anyReceived ? "partial" : po.status;
        if (newStatus !== po.status) {
          await run(`UPDATE purchase_orders SET status = ? WHERE id = ?`, newStatus, poId);
          await logPoStatusChange(poId, po.status, newStatus, user.id);
        }

        // Cập nhật trạng thái materials: nếu qty_stock > 0 → ve_kho
        for (const item of items) {
          const poItem = poItemMap.get(Number(item.poItemId));
          if (!poItem) continue;
          await run(
            `UPDATE materials SET status = 've_kho' WHERE id = ? AND status = 'dat_hang'`,
            poItem.material_id,
          );
        }

        return { receiptId: rid, receiptCode };
      }),
    ));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("OVERRECEIVE:"))
      return NextResponse.json({ error: msg.slice("OVERRECEIVE:".length) }, { status: 409 });
    console.error("POST /api/purchase-orders/:id/receive error:", msg);
    return NextResponse.json({ error: "Lỗi máy chủ khi nhập kho" }, { status: 500 });
  }

  return NextResponse.json({ receiptId, receiptCode }, { status: 201 });
}
