import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { todayISO } from "@/lib/date";
import { certTotals } from "@/lib/paymentcerts";
import { advanceApproval } from "@/lib/approvals";
import { emitWebhook } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

type Decision = "approved" | "rejected";

// POST /api/payment-certs/:id/decide — CĐT/TVGS quyết định.
// body: { decision: 'approved'|'rejected', rejectReason? } — approved sinh 1 dòng
// payment_bills (amount = giá trị đề nghị sau trừ tạm ứng/giữ lại); rejected bắt
// buộc rejectReason. Scoped theo dự án đang chọn (M22).
// M46 PR2: có approval_request đang pending cho IPC này (openApproval mở lúc tạo, chỉ có
// khi Admin cấu hình flow — PR4) → quyền/SoD do advanceApproval quyết định thay CAN.approve;
// approve ở bước CHƯA CUỐI chỉ ghi nhận bước, chưa sinh payment_bills/đổi status. reject ở
// bất kỳ bước nào chốt ngay. Không có flow/request pending → hành vi y hệt trước đây.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const decision = body?.decision as Decision;
  if (decision !== "approved" && decision !== "rejected")
    return NextResponse.json({ error: "decision phải là approved/rejected" }, { status: 422 });
  const rejectReason = typeof body?.rejectReason === "string" ? body.rejectReason.trim() : "";
  if (decision === "rejected" && !rejectReason)
    return NextResponse.json({ error: "Cần nhập lý do từ chối" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  // withTransaction trả trực tiếp trạng thái "chưa tới bước cuối" thay vì gán qua biến
  // ngoài trong closure — gán qua closure khiến TS CFA narrow biến top-level về `never`
  // ở nhánh `if` bên dưới (không track được nhánh gán bên trong async callback).
  let pendingStep: { currentSeq: number; nextRole: string } | undefined;

  try {
    pendingStep = await withTransaction(async () => {
      const cert =
        projectId != null
          ? await queryOne<{ status: string; contractId: number; periodNo: number }>(
              `SELECT c.status, c.contract_id AS "contractId", c.period_no AS "periodNo"
                 FROM payment_certs c JOIN contracts ct ON ct.id = c.contract_id
                WHERE c.id = ? AND ct.project_id = ? FOR UPDATE OF c`,
              id,
              projectId,
            )
          : undefined;
      if (!cert) throw Object.assign(new Error("Không tìm thấy đợt thanh toán"), { status: 404 });
      if (cert.status !== "submitted")
        throw Object.assign(
          new Error("Chỉ quyết định được đợt đã trình (đã được trình CĐT/TVGS)"),
          { status: 409 },
        );

      const liveRequest = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ? AND status = 'pending'`,
        id,
      );
      if (liveRequest) {
        const result = await advanceApproval({
          entityType: "payment_cert",
          entityId: id,
          user,
          decision: decision === "rejected" ? "reject" : "approve",
          note: decision === "rejected" ? rejectReason : null,
        });
        if (result.status === "pending") {
          // chưa tới bước cuối — không đụng payment_bills/status, dừng ở đây.
          return { currentSeq: result.currentSeq, nextRole: result.nextRole };
        }
        // Bước cuối (approved) hoặc reject → áp domain logic bên dưới như cũ.
      } else if (!CAN.approve(user.role)) {
        throw Object.assign(new Error("Chỉ Admin/PM được duyệt đợt thanh toán"), { status: 403 });
      }

      if (decision === "rejected") {
        await run(
          `UPDATE payment_certs SET status = 'rejected', decided_at = ?, decided_by = ?, reject_reason = ? WHERE id = ?`,
          todayISO(),
          user.id,
          rejectReason,
          id,
        );
        return undefined;
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
      return undefined;
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  if (pendingStep)
    return NextResponse.json({
      decided: id,
      pending: true,
      currentSeq: pendingStep.currentSeq,
      nextRole: pendingStep.nextRole,
    });

  // IPC vừa CHUYỂN sang approved THẬT (pendingStep undefined + decision approved = domain
  // logic đã chạy, đã sinh payment_bills + set status='approved'; gồm cả nhánh legacy lẫn
  // bước cuối engine). Không phát khi reject hay bước giữa. Re-fetch sau commit để tránh CFA.
  if (decision === "approved") {
    const c = await queryOne<{ code: string; contractId: number; periodNo: number }>(
      `SELECT code, contract_id AS "contractId", period_no AS "periodNo" FROM payment_certs WHERE id = ?`,
      id,
    );
    await emitWebhook("payment_cert.approved", projectId, {
      certId: id,
      code: c?.code ?? null,
      contractId: c?.contractId ?? null,
      periodNo: c?.periodNo ?? null,
    });
  }
  return NextResponse.json({ decided: id, decision });
}
