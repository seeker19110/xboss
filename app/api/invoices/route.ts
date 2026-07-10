import { NextRequest, NextResponse } from "next/server";
import { insertId, query } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseInvoiceBody, validateInvoiceInput, type InvoiceInput } from "@/lib/finance";

export const dynamic = "force-dynamic";

export type InvoiceRow = InvoiceInput & {
  id: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

// GET /api/invoices?direction= — hoá đơn VAT vào/ra, scoped theo dự án đang chọn (M22).
// Xem: CAN.viewPayments (admin/pm/bch).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem hoá đơn" }, { status: 403 });

  const direction = req.nextUrl.searchParams.get("direction");
  if (direction && direction !== "in" && direction !== "out")
    return NextResponse.json({ error: "Chiều hoá đơn không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ invoices: [] });

  const conds = ["i.project_id = ?"];
  const args: unknown[] = [projectId];
  if (direction) {
    conds.push("i.direction = ?");
    args.push(direction);
  }
  const invoices = await query<InvoiceRow>(
    `SELECT i.id, i.invoice_no AS "invoiceNo", i.invoice_date AS "invoiceDate", i.direction,
            i.net_amount AS "netAmount", i.vat_amount AS "vatAmount", i.vat_rate AS "vatRate",
            i.counterparty, i.contract_id AS "contractId", i.payment_bill_id AS "paymentBillId",
            i.created_by AS "createdBy", u.name AS "createdByName", i.created_at AS "createdAt"
       FROM invoices i
       LEFT JOIN users u ON u.id = i.created_by
      WHERE ${conds.join(" AND ")}
      ORDER BY i.invoice_date DESC NULLS LAST, i.id DESC`,
    ...args,
  );
  return NextResponse.json({ invoices });
}

// POST /api/invoices — tạo hoá đơn VAT (manageFinance: Admin/PM). project_id gán = dự án
// đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hoá đơn (Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo hoá đơn" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseInvoiceBody(body);
  const invalid = validateInvoiceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO invoices (project_id, invoice_no, invoice_date, direction, net_amount,
                            vat_amount, vat_rate, counterparty, contract_id, payment_bill_id,
                            created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.invoiceNo,
    input.invoiceDate,
    input.direction,
    input.netAmount,
    input.vatAmount,
    input.vatRate,
    input.counterparty,
    input.contractId,
    input.paymentBillId,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
