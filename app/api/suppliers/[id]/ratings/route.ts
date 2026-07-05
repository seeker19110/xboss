import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/seqcode";

export const dynamic = "force-dynamic";

const canRate = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

function star(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

// POST /api/suppliers/:id/ratings  body: { poId, quality?, delivery?, price?, note? }
// 1 đánh giá / PO (UNIQUE supplier_id+po_id) — PO phải thuộc đúng NCC này, đã ngoài trạng thái nháp.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canRate(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/Kỹ sư được đánh giá NCC" }, { status: 403 });

  const supplierId = parseInt(params.id);
  if (isNaN(supplierId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const supplier = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, supplierId);
  if (!supplier)
    return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const poId = Number(body.poId);
  if (!poId) return NextResponse.json({ error: "Thiếu đơn hàng (poId)" }, { status: 400 });

  const po = await queryOne<{ supplierId: number | null; status: string }>(
    `SELECT supplier_id AS "supplierId", status FROM purchase_orders WHERE id = ?`,
    poId,
  );
  if (!po) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (po.supplierId !== supplierId)
    return NextResponse.json({ error: "Đơn hàng không thuộc nhà cung cấp này" }, { status: 400 });
  if (po.status === "draft" || po.status === "cancelled")
    return NextResponse.json(
      { error: "Chỉ đánh giá được đơn hàng đã xác nhận trở đi" },
      { status: 409 },
    );

  const quality = star(body.quality);
  const delivery = star(body.delivery);
  const price = star(body.price);
  if (quality == null && delivery == null && price == null)
    return NextResponse.json({ error: "Cần ít nhất 1 tiêu chí (1-5 sao)" }, { status: 400 });

  try {
    const id = await insertId(
      `INSERT INTO supplier_ratings (supplier_id, po_id, quality, delivery, price, note, rated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      supplierId,
      poId,
      quality,
      delivery,
      price,
      body.note ? String(body.note).trim().slice(0, 500) : null,
      user.id,
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (e: unknown) {
    if (isUniqueViolation(e))
      return NextResponse.json({ error: "Đơn hàng này đã được đánh giá rồi" }, { status: 409 });
    throw e;
  }
}
