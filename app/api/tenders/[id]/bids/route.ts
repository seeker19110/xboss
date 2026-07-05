import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { validateBidPrices, type BidPriceInput } from "@/lib/tender";

export const dynamic = "force-dynamic";

// POST /api/tenders/:id/bids — nhập giá chào của 1 NCC (Admin/PM nhập hộ). body:
// { supplierId, lumpSum?, note?, prices: [{boqItemId, unitPrice}] } — chấp nhận
// chào thiếu dòng (không bắt buộc đủ 100% dòng mời — xem lib/tender.ts).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTenders(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền nhập giá chào (chỉ Admin/PM)" },
      { status: 403 },
    );

  const tenderId = parseInt(params.id);
  if (isNaN(tenderId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const tender = await queryOne<{ status: string }>(
    `SELECT status FROM tender_packages WHERE id = ?`,
    tenderId,
  );
  if (!tender) return NextResponse.json({ error: "Không tìm thấy gói thầu" }, { status: 404 });
  if (tender.status === "awarded")
    return NextResponse.json(
      { error: "Gói thầu đã trao thầu — không thể thêm báo giá" },
      {
        status: 409,
      },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 422 });

  const supplierId = Number(body.supplierId);
  if (!Number.isInteger(supplierId))
    return NextResponse.json({ error: "Thiếu nhà thầu" }, { status: 422 });
  const supplier = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, supplierId);
  if (!supplier) return NextResponse.json({ error: "Nhà thầu không tồn tại" }, { status: 422 });

  const lumpSum = body.lumpSum != null ? Number(body.lumpSum) : null;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;
  const prices: BidPriceInput[] = Array.isArray(body.prices)
    ? body.prices.map((p: Record<string, unknown>) => ({
        boqItemId: Number(p?.boqItemId),
        unitPrice: Number(p?.unitPrice),
      }))
    : [];

  if (lumpSum == null && prices.length === 0)
    return NextResponse.json(
      { error: "Cần chào trọn gói hoặc ít nhất 1 dòng giá" },
      { status: 422 },
    );
  const validationErr = validateBidPrices(prices);
  if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });

  // Mọi dòng giá phải thuộc phạm vi mời thầu (tender_items) — chặn nhầm gói.
  const items = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tender_items WHERE tender_id = ? AND boq_item_id = ANY(?)`,
    tenderId,
    prices.map((p) => p.boqItemId),
  );
  if (prices.length > 0 && Number(items?.n ?? 0) !== prices.length)
    return NextResponse.json(
      { error: "Có dòng giá không thuộc phạm vi mời thầu của gói này" },
      { status: 422 },
    );

  try {
    const id = await withTransaction(async () => {
      const id = await insertId(
        `INSERT INTO tender_bids (tender_id, supplier_id, lump_sum, note) VALUES (?, ?, ?, ?)`,
        tenderId,
        supplierId,
        lumpSum,
        note,
      );
      for (const p of prices) {
        await run(
          `INSERT INTO tender_bid_prices (bid_id, boq_item_id, unit_price) VALUES (?, ?, ?)`,
          id,
          p.boqItemId,
          p.unitPrice,
        );
      }
      return id;
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: "Nhà thầu này đã có báo giá cho gói thầu — sửa báo giá cũ thay vì thêm mới" },
        { status: 409 },
      );
    throw err;
  }
}
