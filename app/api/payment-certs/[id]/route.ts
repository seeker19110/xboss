import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  getCert,
  certTotals,
  validateCertItems,
  checkCertLinesBelongToContract,
  saveCertItems,
  type CertLineInput,
} from "@/lib/paymentcerts";

export const dynamic = "force-dynamic";

// GET /api/payment-certs/:id — chi tiết đợt kèm dòng KL + tổng hợp giá trị.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đợt thanh toán" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const cert = await getCert(id);
  if (!cert) return NextResponse.json({ error: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  const totals = await certTotals(id);
  return NextResponse.json({ cert, totals });
}

// PATCH /api/payment-certs/:id { items: [{boqItemId, qtyPeriod}], periodLabel? }
// — sửa KL từng dòng (chỉ khi đợt còn nháp, Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa đợt thanh toán (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const existing = await queryOne<{ status: string; contractId: number }>(
    `SELECT status, contract_id AS "contractId" FROM payment_certs WHERE id = ?`,
    id,
  );
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  if (existing.status !== "draft")
    return NextResponse.json({ error: "Chỉ sửa được đợt đang ở trạng thái nháp" }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  if (Array.isArray(body.items)) {
    const items: CertLineInput[] = body.items.map((it: Record<string, unknown>) => ({
      boqItemId: Number(it?.boqItemId),
      qtyPeriod: Number(it?.qtyPeriod),
    }));
    const validationErr = validateCertItems(items);
    if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });
    const refErr = await checkCertLinesBelongToContract(
      existing.contractId,
      items.map((i) => i.boqItemId),
    );
    if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

    await saveCertItems(id, existing.contractId, items);
  }
  if (typeof body.periodLabel === "string" || body.periodLabel === null) {
    await run(
      `UPDATE payment_certs SET period_label = ? WHERE id = ?`,
      typeof body.periodLabel === "string" ? body.periodLabel.trim() || null : null,
      id,
    );
  }

  return NextResponse.json({ updated: id });
}
