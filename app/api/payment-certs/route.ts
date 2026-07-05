import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { isUniqueViolation, withUniqueRetry } from "@/lib/seqcode";
import {
  listCertsByContract,
  nextCertCode,
  nextPeriodNo,
  suggestQtyForContract,
  saveCertItems,
} from "@/lib/paymentcerts";

export const dynamic = "force-dynamic";

// GET /api/payment-certs?contractId= — danh sách đợt IPC theo hợp đồng.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đợt thanh toán" }, { status: 403 });

  const contractId = Number(req.nextUrl.searchParams.get("contractId"));
  if (!Number.isInteger(contractId))
    return NextResponse.json({ error: "Thiếu contractId" }, { status: 422 });

  const certs = await listCertsByContract(contractId);
  return NextResponse.json({ certs });
}

// POST /api/payment-certs { contractId } — lập đợt mới (Admin/PM), KL gợi ý tự
// động từ tiến độ thực tế trừ luỹ kế đợt trước (suggestQtyForContract).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền lập đợt thanh toán (chỉ Admin/PM)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const contractId = Number(body?.contractId);
  if (!Number.isInteger(contractId))
    return NextResponse.json({ error: "Thiếu hợp đồng" }, { status: 422 });

  const contract = await queryOne<{ id: number }>(
    `SELECT id FROM contracts WHERE id = ?`,
    contractId,
  );
  if (!contract) return NextResponse.json({ error: "Hợp đồng không tồn tại" }, { status: 422 });

  const suggested = await suggestQtyForContract(contractId);
  if (suggested.length === 0)
    return NextResponse.json(
      { error: "Hợp đồng chưa có dòng BOQ nào gắn vào — gán BOQ vào hợp đồng trước" },
      { status: 422 },
    );

  const periodLabel =
    typeof body?.periodLabel === "string" ? body.periodLabel.trim() || null : null;

  try {
    const { id, code } = await withUniqueRetry(() =>
      withTransaction(async () => {
        const periodNo = await nextPeriodNo(contractId);
        const code = await nextCertCode();
        const id = await insertId(
          `INSERT INTO payment_certs (code, contract_id, period_no, period_label, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          code,
          contractId,
          periodNo,
          periodLabel,
          user.id,
        );
        await saveCertItems(
          id,
          contractId,
          suggested.map((s) => ({ boqItemId: s.boqItemId, qtyPeriod: s.qtySuggested })),
        );
        return { id, code };
      }),
    );
    return NextResponse.json({ id, code }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err))
      return NextResponse.json(
        { error: "Mã đợt hoặc số đợt bị trùng do tạo đồng thời — vui lòng thử lại" },
        { status: 409 },
      );
    throw err;
  }
}
