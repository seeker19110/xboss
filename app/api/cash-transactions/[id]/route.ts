import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  parseCashTransactionBody,
  validateCashTransactionInput,
  type CashTransactionInput,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<CashTransactionInput | undefined> {
  if (projectId == null) return undefined;
  return queryOne<CashTransactionInput>(
    `SELECT tx_date AS "txDate", direction, category, amount, is_petty_cash AS "isPettyCash",
            contract_id AS "contractId", supplier_id AS "supplierId",
            voucher_code AS "voucherCode", description
       FROM cash_transactions WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/cash-transactions/:id — scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem dòng tiền" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const transaction = await loadExisting(id, projectId);
  if (!transaction)
    return NextResponse.json({ error: "Không tìm thấy giao dịch" }, { status: 404 });

  return NextResponse.json({ transaction: { ...transaction, id } });
}

// PATCH /api/cash-transactions/:id — sửa (manageFinance: Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa dòng tiền (Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy giao dịch" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged = { ...existing, ...body };
  const input = parseCashTransactionBody(merged);
  const invalid = validateCashTransactionInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  await run(
    `UPDATE cash_transactions SET tx_date = ?, direction = ?, category = ?, amount = ?,
            is_petty_cash = ?, contract_id = ?, supplier_id = ?, voucher_code = ?, description = ?
      WHERE id = ?`,
    input.txDate,
    input.direction,
    input.category,
    input.amount,
    input.isPettyCash,
    input.contractId,
    input.supplierId,
    input.voucherCode,
    input.description,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/cash-transactions/:id — xoá (manageFinance: Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá dòng tiền (Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy giao dịch" }, { status: 404 });

  await run(`DELETE FROM cash_transactions WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
