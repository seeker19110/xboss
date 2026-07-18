import { NextRequest, NextResponse } from "next/server";
import { insertId, query, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  parseCashTransactionBody,
  validateCashTransactionInput,
  type CashTransactionInput,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

export type CashTransactionRow = CashTransactionInput & {
  id: number;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: string;
};

// GET /api/cash-transactions?direction= — sổ quỹ tiền mặt/dòng tiền, scoped theo dự án
// đang chọn (M22). Xem: CAN.viewPayments (admin/pm/bch).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem dòng tiền" }, { status: 403 });

  const direction = req.nextUrl.searchParams.get("direction");
  if (direction && direction !== "in" && direction !== "out")
    return NextResponse.json({ error: "Chiều giao dịch không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ transactions: [] });

  const conds = ["ct.project_id = ?"];
  const args: unknown[] = [projectId];
  if (direction) {
    conds.push("ct.direction = ?");
    args.push(direction);
  }
  const transactions = await withProjectScope(projectId, () =>
    query<CashTransactionRow>(
      `SELECT ct.id, ct.tx_date AS "txDate", ct.direction, ct.category, ct.amount,
              ct.is_petty_cash AS "isPettyCash", ct.contract_id AS "contractId",
              ct.supplier_id AS "supplierId", ct.voucher_code AS "voucherCode",
              ct.description, ct.recorded_by AS "recordedBy", u.name AS "recordedByName",
              ct.created_at AS "createdAt"
         FROM cash_transactions ct
         LEFT JOIN users u ON u.id = ct.recorded_by
        WHERE ${conds.join(" AND ")}
        ORDER BY ct.tx_date DESC, ct.id DESC`,
      ...args,
    ),
  );
  return NextResponse.json({ transactions });
}

// POST /api/cash-transactions — ghi thu/chi quỹ (manageFinance: Admin/PM). project_id
// gán = dự án đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền ghi dòng tiền (Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để ghi dòng tiền" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseCashTransactionBody(body);
  const invalid = validateCashTransactionInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO cash_transactions (project_id, tx_date, direction, category, amount,
                                     is_petty_cash, contract_id, supplier_id, voucher_code,
                                     description, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.txDate,
    input.direction,
    input.category,
    input.amount,
    input.isPettyCash,
    input.contractId,
    input.supplierId,
    input.voucherCode,
    input.description,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
