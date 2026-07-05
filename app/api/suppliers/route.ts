import { NextRequest, NextResponse } from "next/server";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canManage = (r?: Role) => r === "admin" || r === "pm";

const ALL_FIELDS = [
  "name",
  "title",
  "phone",
  "email",
  "address",
  "note",
  "buyer_company",
  "buyer_project",
  "buyer_address",
  "buyer_rep",
  "buyer_title",
  "buyer_phone",
  "seller_rep",
  "receiver_company",
  "receiver_address",
  "receiver_rep",
  "receiver_phone",
  "receiver_subcon",
  "delivery_time",
  "delivery_contact",
  "delivery_phone",
  "delivery_note",
  "delivery_order",
] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // avgRating: TB của (quality+delivery+price)/3 mỗi đánh giá, NULL nếu chưa có đánh giá nào
  // — dùng để gợi ý xếp NCC theo điểm khi chọn ở form tạo PO (M4).
  const suppliers = await query(
    `SELECT s.id, s.name, s.title, s.phone, s.email, s.address, s.note,
            s.buyer_company AS "buyerCompany", s.buyer_project AS "buyerProject",
            s.buyer_address AS "buyerAddress", s.buyer_rep AS "buyerRep",
            s.buyer_title AS "buyerTitle", s.buyer_phone AS "buyerPhone",
            s.seller_rep AS "sellerRep",
            s.receiver_company AS "receiverCompany", s.receiver_address AS "receiverAddress",
            s.receiver_rep AS "receiverRep", s.receiver_phone AS "receiverPhone",
            s.receiver_subcon AS "receiverSubcon",
            s.delivery_time AS "deliveryTime", s.delivery_contact AS "deliveryContact",
            s.delivery_phone AS "deliveryPhone", s.delivery_note AS "deliveryNote",
            s.delivery_order AS "deliveryOrder",
            s.created_at AS "createdAt",
            r.avg_rating AS "avgRating"
       FROM suppliers s
       LEFT JOIN (
         SELECT supplier_id, AVG((COALESCE(quality,0) + COALESCE(delivery,0) + COALESCE(price,0))
                                  / NULLIF((quality IS NOT NULL)::int + (delivery IS NOT NULL)::int + (price IS NOT NULL)::int, 0)
               ) AS avg_rating
           FROM supplier_ratings GROUP BY supplier_id
       ) r ON r.supplier_id = s.id
      ORDER BY s.name`,
  );
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
    if (v !== undefined) {
      cols.push(f);
      vals.push(v ? String(v).trim() : null);
    }
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
