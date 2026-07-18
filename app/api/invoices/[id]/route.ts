import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseInvoiceBody, validateInvoiceInput, type InvoiceInput } from "@/lib/finance";

export const dynamic = "force-dynamic";

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<InvoiceInput | undefined> {
  if (projectId == null) return undefined;
  return queryOne<InvoiceInput>(
    `SELECT invoice_no AS "invoiceNo", invoice_date AS "invoiceDate", direction,
            net_amount AS "netAmount", vat_amount AS "vatAmount", vat_rate AS "vatRate",
            counterparty, contract_id AS "contractId", payment_bill_id AS "paymentBillId"
       FROM invoices WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
    id,
    projectId,
  );
}

// GET /api/invoices/:id — scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem hoá đơn" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const invoice = await withProjectScope(projectId ?? "*", () => loadExisting(id, projectId));
  if (!invoice) return NextResponse.json({ error: "Không tìm thấy hoá đơn" }, { status: 404 });

  return NextResponse.json({ invoice: { ...invoice, id } });
}

// PATCH /api/invoices/:id — sửa hoá đơn (manageFinance: Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa hoá đơn (Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hoá đơn" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged = { ...existing, ...body };
  const input = parseInvoiceBody(merged);
  const invalid = validateInvoiceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  await run(
    `UPDATE invoices SET invoice_no = ?, invoice_date = ?, direction = ?, net_amount = ?,
            vat_amount = ?, vat_rate = ?, counterparty = ?, contract_id = ?, payment_bill_id = ?
      WHERE id = ?`,
    input.invoiceNo,
    input.invoiceDate,
    input.direction,
    input.netAmount,
    input.vatAmount,
    input.vatRate,
    input.counterparty,
    input.contractId,
    input.paymentBillId,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/invoices/:id — xoá hoá đơn (manageFinance: Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá hoá đơn (Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hoá đơn" }, { status: 404 });

  // Soft-delete (M45 PR4) — khôi phục qua POST /api/invoices/:id/restore.
  await run(`UPDATE invoices SET deleted_at = now() WHERE id = ? AND deleted_at IS NULL`, id);
  return NextResponse.json({ deleted: id });
}
