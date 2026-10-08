import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, isAdminOrPm } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { todayISO } from "@/lib/nen/date";
import { log } from "@/lib/nen/log";
import { certTotals } from "@/lib/tai-chinh/paymentcerts";
import { resyncApprovalAmount } from "@/lib/tien-do/approvals";

export const dynamic = "force-dynamic";

// POST /api/payment-certs/:id/submit — trình đợt lên CĐT/TVGS (nháp → đã trình).
// Admin/PM, scoped theo dự án đang chọn (M22).
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được trình đợt thanh toán" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);

  try {
    await withTransaction(async () => {
      const cert =
        projectId != null
          ? await queryOne<{ status: string }>(
              `SELECT c.status
                 FROM payment_certs c JOIN contracts ct ON ct.id = c.contract_id
                WHERE c.id = ? AND ct.project_id = ? FOR UPDATE OF c`,
              id,
              projectId,
            )
          : undefined;
      if (!cert) throw Object.assign(new Error("Không tìm thấy đợt thanh toán"), { status: 404 });
      if (cert.status !== "draft")
        throw Object.assign(new Error("Chỉ trình được đợt đang ở trạng thái nháp"), {
          status: 409,
        });
      // Giá trị đợt chốt tại lúc TRÌNH: request duyệt mở lúc lập nháp mang amount cũ, mà nháp
      // còn sửa KL được — chưa chốt lại thì ngưỡng min_amount của bước duyệt bị lách. Đã khoá
      // đợt FOR UPDATE nên PATCH KL không chen vào giữa.
      const { periodValue } = await certTotals(id);
      await resyncApprovalAmount({
        entityType: "payment_cert",
        entityId: id,
        projectId: projectId as number,
        amountMinor: periodValue,
      });
      await run(
        `UPDATE payment_certs SET status = 'submitted', submitted_at = ? WHERE id = ?`,
        todayISO(),
        id,
      );
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; code?: string };
    // Lỗi có chủ đích (status) trả nguyên thông điệp tiếng Việt; lỗi bất ngờ (pg/mã nội bộ)
    // chỉ log, không lộ ra client.
    if (e.status)
      return NextResponse.json(
        { error: e.message, ...(e.code ? { code: e.code } : {}) },
        { status: e.status },
      );
    log.error("payment-certs/submit: lỗi không lường trước", {
      certId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Lỗi máy chủ khi trình đợt thanh toán" }, { status: 500 });
  }

  return NextResponse.json({ submitted: id });
}
