import { NextRequest, NextResponse } from "next/server";
import { run, withTransaction } from "@/lib/db";
import { getCurrentUser, isAdminOrPm } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { todayISO } from "@/lib/nen/date";
import { log } from "@/lib/nen/log";
import { certTotals, tinhLaiLuyKeDot } from "@/lib/tai-chinh/paymentcerts";
import { khoaHopDongVaDot } from "@/lib/tai-chinh/ipc-quyet-dinh";
import { fitsNumeric } from "@/lib/nen/money";
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
      // S13c: khoá hợp đồng → đợt (cùng thứ tự với decide/lập đợt) rồi mới tính lại luỹ kế.
      const cert =
        projectId != null ? await khoaHopDongVaDot(id, projectId, user.orgId) : undefined;
      if (!cert) throw Object.assign(new Error("Không tìm thấy đợt thanh toán"), { status: 404 });
      if (cert.status !== "draft")
        throw Object.assign(new Error("Chỉ trình được đợt đang ở trạng thái nháp"), {
          status: 409,
        });
      // Luỹ kế lưu lúc nháp có thể đã cũ (kỳ trước vừa được duyệt, hoặc đợt legacy mở song
      // song) — tính lại dưới khoá từ tập đợt approved kỳ trước trước khi chốt giá trị trình.
      await tinhLaiLuyKeDot(id);
      // Giá trị đợt chốt tại lúc TRÌNH: request duyệt mở lúc lập nháp mang amount cũ, mà nháp
      // còn sửa KL được — chưa chốt lại thì ngưỡng min_amount của bước duyệt bị lách. Đã khoá
      // đợt FOR UPDATE nên PATCH KL không chen vào giữa.
      const { periodValue, approvedValue } = await certTotals(id);
      // S10a L6: chặn đợt tràn NUMERIC(15,2) ngay tại lúc TRÌNH (vô điều kiện, có hay không có
      // luồng duyệt) — không để đợt tràn tới bước duyệt, nơi người duyệt có thể không được xem
      // tiền. Kiểm cả approvedValue (phòng tỷ lệ âm/dữ liệu lạ). Người trình là Admin/PM (có
      // viewPayments) nên thông điệp cụ thể được phép.
      if (!fitsNumeric(periodValue, 15) || !fitsNumeric(approvedValue, 15))
        throw Object.assign(
          new Error(
            "Giá trị đợt vượt giới hạn lưu trữ (tối đa 13 chữ số phần nguyên) — giảm khối lượng đợt trước khi trình",
          ),
          { status: 422, code: "amount_overflow" },
        );
      await resyncApprovalAmount({
        entityType: "payment_cert",
        entityId: id,
        projectId: projectId as number,
        openAs: user,
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
      pgCode: e.code,
    });
    return NextResponse.json({ error: "Lỗi máy chủ khi trình đợt thanh toán" }, { status: 500 });
  }

  return NextResponse.json({ submitted: id });
}
