import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canManage = (r?: Role) => r === "admin" || r === "pm";

// GET /api/purchase-orders/:id → chi tiết PO + danh sách items
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const po = await queryOne(
    `SELECT po.id, po.po_code AS "poCode", po.status,
            po.expected_date AS "expectedDate", po.note,
            po.created_at AS "createdAt",
            s.id AS "supplierId", s.name AS "supplierName", s.phone AS "supplierPhone",
            u.name AS "createdByName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = ?`, id);
  if (!po) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });

  const items = await query(
    `SELECT pi.id, pi.material_id AS "materialId", m.name AS "materialName",
            m.unit AS "unit", m.boq_code AS "boqCode",
            pi.qty_ordered AS "qtyOrdered", pi.qty_received AS "qtyReceived",
            pi.unit_price AS "unitPrice", pi.note,
            pi.pr_id AS "prId"
       FROM po_items pi
       LEFT JOIN materials m ON pi.material_id = m.id
      WHERE pi.po_id = ?
      ORDER BY pi.id`, id);

  return NextResponse.json({ po, items });
}

// PATCH /api/purchase-orders/:id  body: { status?, supplierId?, expectedDate?, note? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManage(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa đơn hàng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const po = await queryOne<{ id: number; status: string }>(
    `SELECT id, status FROM purchase_orders WHERE id = ?`, id);
  if (!po) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const VALID_STATUSES = ["draft", "confirmed", "partial", "received", "cancelled"];
  if (body.status && !VALID_STATUSES.includes(body.status))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });

  const sets: string[] = [];
  const vals: unknown[] = [];
  const fields: Record<string, string> = {
    status: "status", supplierId: "supplier_id",
    expectedDate: "expected_date", note: "note",
  };
  for (const [k, col] of Object.entries(fields)) {
    if (body[k] !== undefined) { sets.push(`${col} = ?`); vals.push(body[k] || null); }
  }
  if (!sets.length) return NextResponse.json({ error: "Không có trường cập nhật" }, { status: 400 });
  vals.push(id);
  await run(`UPDATE purchase_orders SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin được xoá đơn hàng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const po = await queryOne<{ status: string }>(
    `SELECT status FROM purchase_orders WHERE id = ?`, id);
  if (!po) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });

  await run(`DELETE FROM po_items WHERE po_id = ?`, id);
  await run(`DELETE FROM purchase_orders WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
