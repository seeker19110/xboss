import { NextRequest, NextResponse } from "next/server";
import { withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import { phanHoiLoiCoStatus } from "@/lib/nen/loi";
import { docIdempotencyKey, taoOperationId } from "@/lib/tai-chinh/ipc-quyet-dinh";
import { NON_APPROVER_ROLES } from "@/lib/tien-do/approvals";
import { quyetDinhDieuChinh, type KetQuaQuyetDinhDieuChinh } from "@/lib/dich-vu/dieu-chinh-ipc";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_LY_DO_TU_CHOI = 2000;

// POST /api/adjustments/:id/decide — M128: quyết định chứng từ điều chỉnh đã trình.
// body: { decision: 'approved'|'rejected', rejectReason? } — rejected bắt buộc rejectReason.
// header (tuỳ chọn): Idempotency-Key: <uuid> — như IPC: retry cùng key + cùng payload trả kết quả
// cũ (`replayed: true`), không sinh phiếu thứ hai; cùng key khác payload → 409 idempotency_conflict.
// Quyền: qua engine (đợt gốc đã đi engine) → vai trò bước hiện tại; trực tiếp → CAN.approve
// (Admin/PM), tái kiểm lúc ghi. SoD: người quyết định ≠ người lập/trình → 403 sod_same_actor.
// Duyệt: phiếu type 'adjustment' committed (reversal: void mọi phiếu committed của đợt, phiếu âm
// chỉ bù phần đã chi) +
// snapshot quyết định + audit — một transaction, dưới khoá HĐ → đợt → chứng từ.
// 200 { decided, decision, operationId, replayed? } | { decided, pending, currentSeq, nextRole }
// 403 | 404 khác dự án | 409 adjustment_not_submitted / ipc_no_bill (duyệt khi đợt mất phiếu gốc)
// | 422. Phiếu điều chỉnh tính RÒNG ipc-sum-v1 (trừ tạm ứng/giữ lại theo tỷ lệ HĐ).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Vai trò chỉ-xem (trừ cdt — có thể là bước của engine) không bao giờ quyết định được.
  if (NON_APPROVER_ROLES.includes(user.role))
    return NextResponse.json(
      { error: "Vai trò chỉ-xem không được duyệt chứng từ điều chỉnh" },
      { status: 403 },
    );
  const id = parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id <= 0)
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const decision = body?.decision;
  if (decision !== "approved" && decision !== "rejected")
    return NextResponse.json({ error: "decision phải là approved/rejected" }, { status: 422 });
  const rejectReason = typeof body?.rejectReason === "string" ? body.rejectReason.trim() : "";
  if (decision === "rejected" && !rejectReason)
    return NextResponse.json({ error: "Cần nhập lý do từ chối" }, { status: 422 });
  if (rejectReason.length > MAX_LY_DO_TU_CHOI)
    return NextResponse.json(
      { error: `Lý do từ chối tối đa ${MAX_LY_DO_TU_CHOI} ký tự` },
      { status: 422 },
    );
  const key = docIdempotencyKey(req.headers.get("Idempotency-Key"));
  if (key === "invalid")
    return NextResponse.json(
      { error: "Idempotency-Key phải là UUID", code: "idempotency_key_invalid" },
      { status: 422 },
    );
  const operationId = key ?? taoOperationId();

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Không tìm thấy chứng từ điều chỉnh" },
      { status: 404, headers: NO_STORE },
    );
  let kq: KetQuaQuyetDinhDieuChinh;
  try {
    kq = await withProjectScope(
      projectId,
      () =>
        quyetDinhDieuChinh({
          id,
          projectId,
          orgId: user.orgId,
          user,
          decision,
          rejectReason: decision === "rejected" ? rejectReason : "",
          key,
          operationId,
          coQuyenTrucTiep: () => CAN.approve(user.role),
        }),
      { readOnly: false },
    );
  } catch (err) {
    return phanHoiLoiCoStatus(err, "Lỗi máy chủ khi quyết định chứng từ điều chỉnh");
  }
  const phatLai = kq.replayed ? { replayed: true } : {};
  if (kq.result === "pending")
    return NextResponse.json(
      {
        decided: id,
        pending: true,
        currentSeq: kq.currentSeq,
        nextRole: kq.nextRole,
        operationId,
        ...phatLai,
      },
      { headers: NO_STORE },
    );
  return NextResponse.json(
    { decided: id, decision: kq.result, operationId, ...phatLai },
    { headers: NO_STORE },
  );
}
