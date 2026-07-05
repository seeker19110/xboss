import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { validateBidPrices, type BidPriceInput } from "@/lib/tender";

export const dynamic = "force-dynamic";

async function loadBidAndTender(tenderId: number, bidId: number) {
  return queryOne<{ tenderStatus: string; bidId: number }>(
    `SELECT tp.status AS "tenderStatus", tb.id AS "bidId"
       FROM tender_bids tb JOIN tender_packages tp ON tp.id = tb.tender_id
      WHERE tb.id = ? AND tb.tender_id = ?`,
    bidId,
    tenderId,
  );
}

// PATCH /api/tenders/:id/bids/:bidId — sửa giá chào (Admin/PM, chưa trao thầu).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; bidId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTenders(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa báo giá (chỉ Admin/PM)" },
      { status: 403 },
    );

  const tenderId = parseInt(params.id);
  const bidId = parseInt(params.bidId);
  if (isNaN(tenderId) || isNaN(bidId))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const found = await loadBidAndTender(tenderId, bidId);
  if (!found) return NextResponse.json({ error: "Không tìm thấy báo giá" }, { status: 404 });
  if (found.tenderStatus === "awarded")
    return NextResponse.json({ error: "Gói thầu đã trao thầu — khoá sửa giá" }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const lumpSum =
    "lumpSum" in body ? (body.lumpSum != null ? Number(body.lumpSum) : null) : undefined;
  const note =
    "note" in body ? (typeof body.note === "string" ? body.note.trim() || null : null) : undefined;
  const prices: BidPriceInput[] | undefined = Array.isArray(body.prices)
    ? body.prices.map((p: Record<string, unknown>) => ({
        boqItemId: Number(p?.boqItemId),
        unitPrice: Number(p?.unitPrice),
      }))
    : undefined;

  if (prices) {
    const validationErr = validateBidPrices(prices);
    if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });
  }

  await withTransaction(async () => {
    if (lumpSum !== undefined)
      await run(`UPDATE tender_bids SET lump_sum = ? WHERE id = ?`, lumpSum, bidId);
    if (note !== undefined) await run(`UPDATE tender_bids SET note = ? WHERE id = ?`, note, bidId);
    if (prices) {
      await run(`DELETE FROM tender_bid_prices WHERE bid_id = ?`, bidId);
      for (const p of prices) {
        await run(
          `INSERT INTO tender_bid_prices (bid_id, boq_item_id, unit_price) VALUES (?, ?, ?)`,
          bidId,
          p.boqItemId,
          p.unitPrice,
        );
      }
    }
  });

  return NextResponse.json({ updated: bidId });
}

// DELETE /api/tenders/:id/bids/:bidId — xoá báo giá (Admin/PM, chưa trao thầu).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; bidId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTenders(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá báo giá (chỉ Admin/PM)" },
      { status: 403 },
    );

  const tenderId = parseInt(params.id);
  const bidId = parseInt(params.bidId);
  if (isNaN(tenderId) || isNaN(bidId))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const found = await loadBidAndTender(tenderId, bidId);
  if (!found) return NextResponse.json({ error: "Không tìm thấy báo giá" }, { status: 404 });
  if (found.tenderStatus === "awarded")
    return NextResponse.json({ error: "Gói thầu đã trao thầu — khoá sửa" }, { status: 409 });

  await run(`DELETE FROM tender_bids WHERE id = ?`, bidId);
  return NextResponse.json({ deleted: bidId });
}
