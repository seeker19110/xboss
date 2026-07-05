import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { todayISO } from "@/lib/date";
import { certTotals } from "@/lib/paymentcerts";

export const dynamic = "force-dynamic";

type Decision = "approved" | "rejected";

// POST /api/payment-certs/:id/decide — CĐT/TVGS quyết định (Admin/PM, CAN.approve).
// body: { decision: 'approved'|'rejected', rejectReason? } — approved sinh 1 dòng
// payment_bills (amount = giá trị đề nghị sau trừ tạm ứng/giữ lại); rejected bắt
// buộc rejectReason.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được duyệt đợt thanh toán" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const decision = body?.decision as Decision;
  if (decision !== "approved" && decision !== "rejected")
    return NextResponse.json({ error: "decision phải là approved/rejected" }, { status: 422 });
  const rejectReason = typeof body?.rejectReason === "string" ? body.rejectReason.trim() : "";
  if (decision === "rejected" && !rejectReason)
    return NextResponse.json({ error: "Cần nhập lý do từ chối" }, { status: 422 });

  try {
    await withTransaction(async () => {
      const cert = await queryOne<{ status: string; contractId: number; periodNo: number }>(
        `SELECT status, contract_id AS "contractId", period_no AS "periodNo"
           FROM payment_certs WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!cert) throw Object.assign(new Error("Không tìm thấy đợt thanh toán"), { status: 404 });
      if (cert.status !== "submitted")
        throw Object.assign(
          new Error("Chỉ quyết định được đợt đã trình (đã được trình CĐT/TVGS)"),
          { status: 409 },
        );

      if (decision === "rejected") {
        await run(
          `UPDATE payment_certs SET status = 'rejected', decided_at = ?, decided_by = ?, reject_reason = ? WHERE id = ?`,
          todayISO(),
          user.id,
          rejectReason,
          id,
        );
        return;
      }

      const contract = await queryOne<{
        title: string;
        partyName: string | null;
        supplierName: string | null;
      }>(
        `SELECT ct.title, ct.party_name AS "partyName", s.name AS "supplierName"
           FROM contracts ct LEFT JOIN suppliers s ON s.id = ct.party_supplier_id
          WHERE ct.id = ?`,
        cert.contractId,
      );
      const totals = await certTotals(id);
      const responsible = contract?.supplierName ?? contract?.partyName ?? contract?.title ?? "—";

      await insertId(
        `INSERT INTO payment_bills (responsible, type, amount, description, paid_date, contract_id, payment_cert_id, created_by)
         VALUES (?, 'bill', ?, ?, ?, ?, ?, ?)`,
        responsible,
        totals.approvedValue,
        `Đợt ${cert.periodNo} — ${contract?.title ?? ""}`,
        todayISO(),
        cert.contractId,
        id,
        user.id,
      );
      await run(
        `UPDATE payment_certs SET status = 'approved', decided_at = ?, decided_by = ? WHERE id = ?`,
        todayISO(),
        user.id,
        id,
      );
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  return NextResponse.json({ decided: id, decision });
}
