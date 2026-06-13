import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, run, withTransaction, todayISO } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canManage = (r?: Role) => r === "admin" || r === "pm";

// GET /api/purchase-orders?status=
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");

  const orders = await query(
    `SELECT po.id, po.po_code AS "poCode", po.status,
            po.expected_date AS "expectedDate", po.note,
            po.created_at AS "createdAt",
            s.id AS "supplierId", s.name AS "supplierName",
            u.name AS "createdByName",
            (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) AS "itemCount",
            (SELECT SUM(qty_ordered) FROM po_items WHERE po_id = po.id) AS "totalOrdered",
            (SELECT SUM(qty_received) FROM po_items WHERE po_id = po.id) AS "totalReceived"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.created_by = u.id
       ${status ? "WHERE po.status = ?" : ""}
      ORDER BY po.created_at DESC`,
    ...(status ? [status] : []));

  return NextResponse.json({ orders });
}

// POST /api/purchase-orders  body: { supplierId?, expectedDate?, note?, items: [{materialId, prId?, qtyOrdered, unitPrice?, note?}] }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManage(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được tạo đơn hàng" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const items: { materialId: number; prId?: number; qtyOrdered: number; unitPrice?: number; note?: string }[] =
    Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: "Đơn hàng phải có ít nhất 1 vật tư" }, { status: 400 });

  // Sinh mã PO: PO-YYYYMM-NNN
  const ym = todayISO().slice(0, 7).replace("-", "");
  const last = await queryOne<{ po_code: string }>(
    `SELECT po_code FROM purchase_orders WHERE po_code LIKE ? ORDER BY po_code DESC LIMIT 1`,
    `PO-${ym}-%`);
  const seq = last ? parseInt(last.po_code.split("-")[2]) + 1 : 1;
  const poCode = `PO-${ym}-${String(seq).padStart(3, "0")}`;

  const poId = await withTransaction(async () => {
    const id = await insertId(
      `INSERT INTO purchase_orders (po_code, supplier_id, expected_date, note, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      poCode,
      body.supplierId ? Number(body.supplierId) : null,
      body.expectedDate ? String(body.expectedDate) : null,
      body.note ? String(body.note).trim() : null,
      user.id);

    for (const item of items) {
      await insertId(
        `INSERT INTO po_items (po_id, material_id, pr_id, qty_ordered, qty_received, unit_price, note)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        id,
        Number(item.materialId),
        item.prId ? Number(item.prId) : null,
        Number(item.qtyOrdered),
        item.unitPrice ? Number(item.unitPrice) : null,
        item.note ? String(item.note).trim() : null,
      );
    }

    // Cập nhật PR liên quan → trạng thái 'ordered'
    const prIds = items.filter(i => i.prId).map(i => i.prId!);
    for (const prId of prIds) {
      await run(`UPDATE purchase_requests SET status = 'ordered' WHERE id = ?`, prId);
    }

    return id;
  });

  return NextResponse.json({ id: poId, poCode }, { status: 201 });
}
