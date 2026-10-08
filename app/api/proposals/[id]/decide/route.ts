import { NextRequest, NextResponse } from "next/server";
import { queryOne, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { parseMoneyExact } from "@/lib/nen/money";
import { canDecideProposal, decideProposal } from "@/lib/tai-chinh/proposals";
import { advanceApproval, kiemAmountTruocKhiDuyet } from "@/lib/tien-do/approvals";

export const dynamic = "force-dynamic";

// POST /api/proposals/:id/decide  body: { decision: 'approved'|'rejected', rejectReason?,
// createBill? } — quyết đề xuất đã trình (CAN.approve = Admin/PM). Duyệt tạm ứng/thanh toán
// có gắn HĐ + createBill=true → tạo phiếu payment_bills tương ứng (không tự động ép).
// M46 PR3: có approval_request đang pending cho đề xuất này (openApproval mở lúc tạo, chỉ
// xảy ra khi Admin cấu hình flow 'proposal' — PR4) → quyền + SoD do engine (advanceApproval)
// quyết định thay canDecideProposal; approve ở bước CHƯA CUỐI chỉ ghi nhận bước (không đụng
// proposals.status/payment_bills). reject ở bất kỳ bước nào chốt ngay. Không có flow/request
// pending → hành vi y hệt trước đây (canDecideProposal).
// S13e: toàn bộ (khoá đề xuất → chốt amount → bước engine → đổi trạng thái/phiếu) trong MỘT
// transaction; lỗi có `status` của engine trả đúng mã thay vì 500.
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
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  const { decision } = body;
  if (decision !== "approved" && decision !== "rejected")
    return NextResponse.json(
      { error: "decision phải là 'approved' hoặc 'rejected'" },
      { status: 422 },
    );
  const rejectReason = typeof body.rejectReason === "string" ? body.rejectReason.trim() : "";

  const projectId = await getCurrentProjectId(user);

  type KetQua =
    | { pending: true; currentSeq: number; nextRole: string }
    | { pending: false; billId: number | null };
  let ketQua: KetQua;
  try {
    ketQua = await withTransaction(async (): Promise<KetQua> => {
      // S13e: khoá dòng đề xuất TRƯỚC mọi lookup — thứ tự khoá đề xuất → approval_requests,
      // trùng với submit (S13d) nên không khoá chéo. Hai lượt quyết định đồng thời xếp hàng ở
      // đây: lượt sau đọc lại trạng thái dưới khoá → 409, không ghi bước/phiếu lần hai.
      const dx =
        projectId != null
          ? await queryOne<{ status: string; amount: string | null }>(
              `SELECT status, amount::text AS amount FROM proposals
                WHERE id = ? AND project_id = ? FOR UPDATE`,
              id,
              projectId,
            )
          : undefined;
      if (!dx) throw loi(404, "Không tìm thấy đề xuất");
      if (dx.status !== "submitted") throw loi(409, "Đề xuất không ở trạng thái đã trình");

      const liveRequest = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'proposal' AND entity_id = ? AND status = 'pending'`,
        id,
      );
      if (liveRequest) {
        // S13e (như IPC S13d): ngưỡng bước duyệt so theo approval_requests.amount — chốt lại theo
        // số tiền HIỆN TẠI của đề xuất (so exact, dưới khoá) trước khi engine chọn bước; request
        // trình trước S13d còn mang số tiền lúc lập. Từ chối không phụ thuộc ngưỡng → bỏ qua.
        if (decision === "approved")
          await kiemAmountTruocKhiDuyet({
            entityType: "proposal",
            entityId: id,
            projectId: projectId as number,
            amountMinor: dx.amount == null ? null : parseMoneyExact(dx.amount),
          });
        const adv = await advanceApproval({
          entityType: "proposal",
          entityId: id,
          user,
          decision: decision === "rejected" ? "reject" : "approve",
          note: decision === "rejected" ? rejectReason || null : null,
        });
        if (adv.status === "pending")
          return { pending: true, currentSeq: adv.currentSeq, nextRole: adv.nextRole };
        // Bước cuối (approved) hoặc reject → áp domain logic bên dưới như cũ.
      } else if (!canDecideProposal(user)) {
        throw loi(403, "Chỉ Admin/PM được quyết đề xuất");
      }

      // Cùng transaction với bước engine: lỗi nghiệp vụ ở đây (vd từ chối thiếu lý do) rollback
      // luôn bước vừa ghi — trước S13e bước reject đã commit, request mất, PM duyệt tiếp được
      // qua đường cũ không qua flow.
      const result = await decideProposal({
        proposalId: id,
        decision,
        rejectReason: rejectReason || null,
        createBill: body.createBill === true,
        decidedBy: user.id,
        projectId: projectId as number,
      });
      if (typeof result === "string")
        throw loi(result === "Không tìm thấy đề xuất" ? 404 : 409, result);
      return { pending: false, billId: result.billId };
    });
  } catch (err) {
    // Lỗi có chủ đích (của route hoặc engine phê duyệt: 403 quyền/SoD, 404, 409, 422) trả đúng
    // mã + thông điệp; lỗi bất ngờ ném tiếp như các route anh em.
    const { status, code } = err as { status?: number; code?: string };
    if (!status) throw err;
    return NextResponse.json(
      { error: (err as Error).message, ...(code ? { code } : {}) },
      { status },
    );
  }

  if (ketQua.pending)
    return NextResponse.json({
      pending: true,
      currentSeq: ketQua.currentSeq,
      nextRole: ketQua.nextRole,
    });
  return NextResponse.json({ ok: true, status: decision, billId: ketQua.billId });
}

/** Lỗi có chủ đích mang mã HTTP — bắt ở catch của handler. */
function loi(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}
