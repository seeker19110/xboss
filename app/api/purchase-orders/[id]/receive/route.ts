import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, run, withTransaction, todayISO } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { nextSeqCode, withUniqueRetry } from "@/lib/ha-tang/seqcode";
import { getPurchaseOrder, logPoStatusChange } from "@/lib/tai-chinh/procurement";
import { log } from "@/lib/nen/log";

export const dynamic = "force-dynamic";

const canReceive = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// POST /api/purchase-orders/:id/receive  body: { note?, items: [{poItemId, qtyReceived, note?}] }
// Tạo phiếu nhập kho, cập nhật qty_stock + po_items.qty_received. Scoped theo dự án
// đang chọn (M22) — PO không thuộc dự án hiện tại → 404.
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

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const po = projectId != null ? await getPurchaseOrder(poId, projectId) : undefined;
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

  // Chống double-submit (bấm nhanh 2 lần / mất mạng công trường retry): client gửi
  // header Idempotency-Key, unique index (po_id, key) chặn tạo phiếu nhập trùng.
  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim().slice(0, 200) || null;

  const ym = todayISO().slice(0, 7).replace("-", "");

  // Lấy toàn bộ po_items để kiểm tra hợp lệ
  const poItems = await query<{
    id: number;
    material_id: number;
    qty_ordered: number;
    qty_received: number;
  }>(`SELECT id, material_id, qty_ordered, qty_received FROM po_items WHERE po_id = ?`, poId);
  const poItemMap = new Map(poItems.map((p) => [p.id, p]));

  let receiptId: number;
  let receiptCode: string;
  try {
    // Sinh mã phiếu WR-YYYYMM-NNN trong retry — đụng mã (tạo đồng thời) thì sinh lại.
    ({ receiptId, receiptCode } = await withUniqueRetry(() =>
      withTransaction(async () => {
        // Khoá dòng PO trong transaction để serialize các lần nhập kho đồng thời
        // trên cùng PO — cần thiết để check trùng idempotency-key bên dưới không
        // bị race (2 request cùng key cùng lúc đều thấy "chưa có" rồi cùng insert).
        // Đọc lại trạng thái DƯỚI khoá (N3, audit logic 2026-10-01): kiểm ở trên chỉ để trả 409
        // sớm; dùng trạng thái đọc trước khoá thì 2 phiếu nhập đồng thời đều thấy 'confirmed' và
        // cùng ghi nhật ký 'confirmed → partial'.
        const cur = await queryOne<{ status: string }>(
          `SELECT status FROM purchase_orders WHERE id = ? FOR UPDATE`,
          poId,
        );

        if (idempotencyKey) {
          const dup = await queryOne<{ id: number; receipt_code: string }>(
            `SELECT id, receipt_code FROM warehouse_receipts WHERE po_id = ? AND idempotency_key = ?`,
            poId,
            idempotencyKey,
          );
          if (dup) return { receiptId: dup.id, receiptCode: dup.receipt_code };
        }

        const statusHienTai = cur?.status ?? po.status;
        // Throw (không return) để rollback — return sẽ COMMIT phiếu dở.
        if (statusHienTai === "cancelled") throw new Error("POSTATUS:Đơn hàng đã huỷ");
        if (statusHienTai === "received" || statusHienTai === "reconciled")
          throw new Error("POSTATUS:Đơn hàng đã nhập đủ hàng");

        const receiptCode = await nextSeqCode("warehouse_receipts", "receipt_code", `WR-${ym}-`);
        const rid = await insertId(
          `INSERT INTO warehouse_receipts (receipt_code, po_id, received_by, note, idempotency_key)
       VALUES (?, ?, ?, ?, ?)`,
          receiptCode,
          poId,
          user.id,
          body.note ? String(body.note).trim() : null,
          idempotencyKey,
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

          // Cộng qty_stock vào materials — RETURNING lấy số dư SAU khi cộng, ngay trong
          // transaction (khoá dòng tới COMMIT), không dùng số đọc trước đó ngoài transaction.
          const mat = await queryOne<{ qty_stock: number }>(
            `UPDATE materials SET qty_stock = COALESCE(qty_stock, 0) + ?, updated_at = NOW()
              WHERE id = ? RETURNING qty_stock`,
            qty,
            poItem.material_id,
          );

          // Ghi transaction loại nhap_kho. qty_after = TỒN KHO sau giao dịch — cùng nghĩa với
          // mọi giao dịch kho khác (xuat_cong_truong, hoan_kho, dieu_chinh_kho). Trước đây ghi
          // qty_used (đọc ngoài transaction) nên sổ kho có 1 loại dòng mang số dư của cột khác.
          await insertId(
            `INSERT INTO material_transactions (material_id, delta, qty_after, type, receipt_item_id, note, created_by)
         VALUES (?, ?, ?, 'nhap_kho', ?, ?, ?)`,
            poItem.material_id,
            qty,
            mat?.qty_stock ?? qty,
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
        const newStatus = allReceived ? "received" : anyReceived ? "partial" : statusHienTai;
        if (newStatus !== statusHienTai) {
          await run(`UPDATE purchase_orders SET status = ? WHERE id = ?`, newStatus, poId);
          await logPoStatusChange(poId, statusHienTai, newStatus, user.id);
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
    if (msg.startsWith("POSTATUS:"))
      return NextResponse.json({ error: msg.slice("POSTATUS:".length) }, { status: 409 });
    log.error("POST /api/purchase-orders/:id/receive lỗi", {
      route: "POST /api/purchase-orders/:id/receive",
      err: msg,
    });
    return NextResponse.json({ error: "Lỗi máy chủ khi nhập kho" }, { status: 500 });
  }

  return NextResponse.json({ receiptId, receiptCode }, { status: 201 });
}
