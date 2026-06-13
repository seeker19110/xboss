import { NextRequest, NextResponse } from "next/server";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canManage = (r?: Role) => r === "admin" || r === "pm";

const ALL_FIELDS = [
  "name","title","phone","email","address","note",
  "buyer_company","buyer_project","buyer_address","buyer_rep","buyer_title","buyer_phone",
  "seller_rep",
  "receiver_company","receiver_address","receiver_rep","receiver_phone","receiver_subcon",
  "delivery_time","delivery_contact","delivery_phone","delivery_note","delivery_order",
] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const suppliers = await query(
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
            delivery_order AS "deliveryOrder",
            created_at AS "createdAt"
       FROM suppliers ORDER BY name`);
  return NextResponse.json({ suppliers });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManage(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được thêm nhà cung cấp" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Thiếu tên nhà cung cấp" }, { status: 400 });

  const cols = ["name"];
  const vals: unknown[] = [name];
  for (const f of ALL_FIELDS) {
    if (f === "name") continue;
    const v = body[camel(f)];
    if (v !== undefined) { cols.push(f); vals.push(v ? String(v).trim() : null); }
  }
  const placeholders = cols.map(() => "?").join(", ");
  const id = await insertId(
    `INSERT INTO suppliers (${cols.join(", ")}) VALUES (${placeholders})`,
    ...vals,
  );
  return NextResponse.json({ id }, { status: 201 });
}

function camel(col: string) {
  return col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
