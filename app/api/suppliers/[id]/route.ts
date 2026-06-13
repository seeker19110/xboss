import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canManage = (r?: Role) => r === "admin" || r === "pm";

const FIELD_MAP: Record<string, string> = {
  name: "name", title: "title", phone: "phone", email: "email", address: "address", note: "note",
  buyerCompany: "buyer_company", buyerProject: "buyer_project", buyerAddress: "buyer_address",
  buyerRep: "buyer_rep", buyerTitle: "buyer_title", buyerPhone: "buyer_phone",
  sellerRep: "seller_rep",
  receiverCompany: "receiver_company", receiverAddress: "receiver_address",
  receiverRep: "receiver_rep", receiverPhone: "receiver_phone", receiverSubcon: "receiver_subcon",
  deliveryTime: "delivery_time", deliveryContact: "delivery_contact",
  deliveryPhone: "delivery_phone", deliveryNote: "delivery_note", deliveryOrder: "delivery_order",
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManage(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa nhà cung cấp" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const s = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, id);
  if (!s) return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(FIELD_MAP)) {
    if (body[k] !== undefined) { sets.push(`${col} = ?`); vals.push(body[k] || null); }
  }
  if (!sets.length) return NextResponse.json({ error: "Không có trường cập nhật" }, { status: 400 });
  vals.push(id);
  await run(`UPDATE suppliers SET ${sets.join(", ")} WHERE id = ?`, ...vals);

  const supplier = await queryOne(
    `SELECT id, name, title, phone, email, address, note,
            buyer_company AS "buyerCompany", buyer_project AS "buyerProject",
            buyer_address AS "buyerAddress", buyer_rep AS "buyerRep",
            buyer_title AS "buyerTitle", buyer_phone AS "buyerPhone",
            seller_rep AS "sellerRep",
            receiver_company AS "receiverCompany", receiver_address AS "receiverAddress",
            receiver_rep AS "receiverRep", receiver_phone AS "receiverPhone",
            receiver_subcon AS "receiverSubcon",
            delivery_time AS "deliveryTime", delivery_contact AS "deliveryContact",
            delivery_phone AS "deliveryPhone", delivery_note AS "deliveryNote",
            delivery_order AS "deliveryOrder"
       FROM suppliers WHERE id = ?`, id);
  return NextResponse.json({ supplier });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin được xoá nhà cung cấp" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const used = await queryOne(`SELECT id FROM purchase_orders WHERE supplier_id = ? LIMIT 1`, id);
  if (used) return NextResponse.json({ error: "Nhà cung cấp đang có đơn hàng, không thể xoá" }, { status: 409 });

  await run(`DELETE FROM suppliers WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
