import { laLoiKhoaNgoai, phanHoiXungDotPhuThuoc } from "@/lib/nen/loi";
import { NextRequest, NextResponse } from "next/server";
import { moneyInputErrorBody } from "@/lib/nen/money";
import { queryOne, run, withProjectScope, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  checkCashTransactionParents,
  parseCashTransactionBody,
  validateCashTransactionInput,
  type CashTransactionInput,
} from "@/lib/tai-chinh/finance";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

// Dòng DB (GET trả nguyên dạng number legacy); PATCH merge rồi đọc lại qua parseCashTransactionBody
// — number của cột NUMERIC(15,2) (≤ 15 chữ số có nghĩa) đọc lại exact.
type ExistingRow = Omit<CashTransactionInput, "amount"> & { amount: number };

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<ExistingRow | undefined> {
  if (projectId == null) return undefined;
  return queryOne<ExistingRow>(
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
  // Fail-closed (A1-AC02): không có dự án khả kiến → 404, không mở scope toàn hệ "*".
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy giao dịch" }, { status: 404 });
  const transaction = await withProjectScope(projectId, () => loadExisting(id, projectId));
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
  // S10: tiền đọc exact — "1.234.567" kiểu vi-VN → 400, vượt NUMERIC(15,2) → 422.
  let input: CashTransactionInput;
  try {
    input = parseCashTransactionBody(merged);
  } catch (err) {
    const loi = moneyInputErrorBody(err);
    if (loi) return NextResponse.json(loi.body, { status: loi.status });
    throw err;
  }
  const invalid = validateCashTransactionInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  // A1-AC03: kiểm cha SAU khi merge với giá trị đang lưu, cùng transaction với UPDATE.
  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
  const kq = await ghiNeuConQuyen(
    () => CAN.manageFinance(user.role),
    async () => {
      const err = await checkCashTransactionParents(input, projectId!, user.orgId);
      if (err) return err;
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
      return null;
    },
  );
  if (!kq.ok)
    return NextResponse.json(
      { error: "Bạn không có quyền sửa dòng tiền (Admin/PM)" },
      { status: 403 },
    );
  const parentErr = kq.value;
  if (parentErr) return NextResponse.json({ error: parentErr }, { status: 422 });

  return NextResponse.json({ updated: id });
}

// DELETE /api/cash-transactions/:id — xoá (manageFinance: Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  try {
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

    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.manageFinance(user.role),
      () => run(`DELETE FROM cash_transactions WHERE id = ?`, id),
    );
    if (!kq.ok)
      return NextResponse.json(
        { error: "Bạn không có quyền xoá dòng tiền (Admin/PM)" },
        { status: 403 },
      );
    return NextResponse.json({ deleted: id });
  } catch (err) {
    if (laLoiKhoaNgoai(err)) return phanHoiXungDotPhuThuoc();
    throw err;
  }
}
