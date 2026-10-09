import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withProjectScope, withTransaction } from "@/lib/db";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { gioiHanGhiTaiChinh } from "@/lib/bao-mat/ratelimit";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  getCert,
  certTotals,
  validateCertItems,
  checkCertLinesBelongToContract,
  saveCertItems,
  dongVuotHopDong,
  certTotalsToWire,
  certItemsExact,
  certItemsToWire,
  type CertLineInput,
  type CertTotalsMasked,
} from "@/lib/tai-chinh/paymentcerts";
import { canhBaoDot, khoaHopDongVaDot } from "@/lib/tai-chinh/ipc-quyet-dinh";
import {
  MONEY_FORMAT_HEADER,
  MONEY_FORMAT_DECIMAL_V1,
  moneyWireFormat,
  isMoneyPrecisionError,
} from "@/lib/nen/money";
import { getEntityApprovalStatus } from "@/lib/tien-do/approvals";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";
import { tomTatDieuChinh } from "@/lib/tai-chinh/ipc-dieu-chinh-doc";
import { moneyOrNullToWire } from "@/lib/nen/money-dto";
import { log } from "@/lib/nen/log";

export const dynamic = "force-dynamic";

// Xác nhận đợt thuộc hợp đồng của dự án đang chọn (M22) — chặn xem đợt của hợp đồng thuộc dự
// án khác qua đoán/liệt kê id. Đường GHI (PATCH) khoá qua `khoaHopDongVaDot` (S13d).
async function certInProject(
  id: number,
  projectId: number | null,
): Promise<{ status: string; contractId: number } | undefined> {
  if (projectId == null) return undefined;
  return queryOne<{ status: string; contractId: number }>(
    `SELECT c.status, c.contract_id AS "contractId"
       FROM payment_certs c JOIN contracts ct ON ct.id = c.contract_id
      WHERE c.id = ? AND ct.project_id = ?`,
    id,
    projectId,
  );
}

// API tài chính: không cache ở bất kỳ tầng nào; nội dung đổi theo header định dạng tiền
// (A3-FR06) nên phải khai Vary dù đã no-store.
const HEADERS_TAI_CHINH = { "Cache-Control": "private, no-store", Vary: MONEY_FORMAT_HEADER };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: HEADERS_TAI_CHINH });

// GET /api/payment-certs/:id — chi tiết đợt kèm dòng KL + tổng hợp giá trị,
// scoped theo dự án đang chọn (M22). Header `X-XBoss-Money-Format: decimal-string-v1` →
// `totals` VÀ `cert.items[].unitPrice/qtyPeriod/qtyCumulative/boqQtyContract` là chuỗi canonical
// (đọc `::text` trong SQL, không qua float) + `moneyFormat`; không gửi → JSON number legacy (422
// `money_precision_unsupported` nếu một giá trị không round-trip được qua number). Che đơn giá
// (stripSensitive) TRƯỚC khi đổi wire — đơn giá bị che là null ở cả hai định dạng.
// M128: kèm `adjustmentsSummary: { open, approvedCount, reversed, grossAmount, netBillAmount }`
// — grossAmount = Σ amount (GỘP, KL × giá) chứng từ điều chỉnh đã duyệt; netBillAmount = Σ tiền
// phiếu điều chỉnh RÒNG chưa huỷ của đợt (adj-sum-v2). Cùng kiểu wire + luật che với totals.
export async function GET(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);
  if (!CAN.viewPayments(user.role))
    return json({ error: "Bạn không có quyền xem đợt thanh toán" }, 403);

  const id = parseInt(params.id);
  if (isNaN(id)) return json({ error: "ID không hợp lệ" }, 400);
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));

  const projectId = await getCurrentProjectId(user);
  // S02a (A1-AC02): không có dự án khả kiến → 404, không mở GUC RLS "*" toàn hệ.
  if (projectId == null) return json({ error: "Không tìm thấy đợt thanh toán" }, 404);
  // REPEATABLE READ (S10a M4): đợt/tổng/dòng exact đọc bằng nhiều câu riêng — cùng một snapshot
  // để PATCH chen giữa không làm dòng exact lệch json_agg (throw 500) hay tổng lệch dòng.
  const detail = await withProjectScope(
    projectId,
    async () => {
      const scoped = await certInProject(id, projectId);
      if (!scoped) return null;
      const cert = await getCert(id);
      if (!cert) return null;
      const totals = await certTotals(id);
      const itemsExact = await certItemsExact(id);
      // Trạng thái duyệt engine (M46 PR2) — null khi chưa có flow cấu hình cho loại
      // "payment_cert" (hành xử dormant, không đổi UI cũ).
      const approvalStatus = await getEntityApprovalStatus("payment_cert", id);
      // Dòng vượt khối lượng hợp đồng — CẢNH BÁO, không chặn (xem dongVuotHopDong). Đợt còn mở:
      // luỹ kế HIỆU LỰC (đúng số quyết định sẽ chốt) + warningVersion để người duyệt xác nhận
      // đúng bản đang xem (S13c, A5-FR07).
      const { vuotHopDong, warningVersion } = await canhBaoDot(id);
      // M128: tóm tắt chứng từ điều chỉnh/huỷ hiệu lực của đợt (cùng snapshot).
      const dieuChinh = await tomTatDieuChinh(id);
      return { cert, totals, itemsExact, approvalStatus, vuotHopDong, warningVersion, dieuChinh };
    },
    { isolation: "repeatable_read" },
  );
  if (!detail) return json({ error: "Không tìm thấy đợt thanh toán" }, 404);
  const { cert, totals, itemsExact, approvalStatus, vuotHopDong, warningVersion, dieuChinh } =
    detail;
  // M50 PR2: che đơn giá dòng KL + tổng tiền đợt cho user thiếu viewPayments (phòng thủ
  // — gate route hiện cũng là viewPayments). Che TRƯỚC khi đổi sang wire.
  const [maskedCert] = stripSensitive("paymentCert", [cert], user);
  const [maskedTotals] = stripSensitive<CertTotalsMasked>("certTotals", [totals], user);
  let wireTotals;
  let wireItems;
  let adjustmentsSummary;
  try {
    wireTotals = certTotalsToWire(maskedTotals, format);
    wireItems = certItemsToWire(maskedCert.items, itemsExact, format);
    // Tiền gộp/ròng cùng kiểu wire + cùng luật che (viewPayments) với totals.
    const xemTien = CAN.viewPayments(user.role);
    adjustmentsSummary = {
      open: dieuChinh.open,
      approvedCount: dieuChinh.approvedCount,
      reversed: dieuChinh.reversed,
      grossAmount: moneyOrNullToWire(xemTien ? dieuChinh.grossAmount : null, format),
      netBillAmount: moneyOrNullToWire(xemTien ? dieuChinh.netBillAmount : null, format),
    };
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return json(
      {
        error:
          "Giá trị tiền vượt độ chính xác của định dạng số cũ — gửi header " +
          `${MONEY_FORMAT_HEADER}: ${MONEY_FORMAT_DECIMAL_V1} để nhận số tiền chính xác`,
        code: "money_precision_unsupported",
        // Cảnh báo vượt KL hợp đồng là khối lượng (không phải tiền) — vẫn trả để không mất.
        vuotHopDong,
        warningVersion,
      },
      422,
    );
  }
  return json({
    cert: { ...maskedCert, items: wireItems },
    totals: wireTotals,
    approvalStatus,
    vuotHopDong,
    warningVersion,
    adjustmentsSummary,
    ...(format === MONEY_FORMAT_DECIMAL_V1 ? { moneyFormat: MONEY_FORMAT_DECIMAL_V1 } : {}),
  });
}

// PATCH /api/payment-certs/:id { items: [{boqItemId, qtyPeriod}], periodLabel? }
// — sửa KL từng dòng (chỉ khi đợt còn nháp, Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const gioiHan = await gioiHanGhiTaiChinh("ipc-sua", user.id);
  if (gioiHan)
    return NextResponse.json(
      { error: gioiHan.error },
      { status: 429, headers: { "Retry-After": gioiHan.retryAfter } },
    );
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa đợt thanh toán (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  let parsedItems: CertLineInput[] | null = null;
  if (Array.isArray(body.items)) {
    const items: CertLineInput[] = body.items.map((it: Record<string, unknown>) => ({
      boqItemId: Number(it?.boqItemId),
      qtyPeriod: Number(it?.qtyPeriod),
    }));
    const validationErr = validateCertItems(items);
    if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });
    parsedItems = items;
  }
  const items = parsedItems;

  const projectId = await getCurrentProjectId(user);
  try {
    // Khoá HỢP ĐỒNG → ĐỢT (S13d — cùng thứ tự với lập đợt/trình/quyết định, `khoaHopDongVaDot`)
    // rồi kiểm nháp + ghi dòng KL + header trong CÙNG transaction: trình/duyệt đồng thời không
    // chen vào sau lúc kiểm trạng thái, luỹ kế kỳ trước đọc khi ghi dòng không đổi giữa chừng
    // (quyết định kỳ trước cùng HĐ phải chờ), và lỗi giữa chừng rollback cả đợt.
    await withTransaction(async () => {
      const existing =
        projectId != null ? await khoaHopDongVaDot(id, projectId, user.orgId) : undefined;
      if (!existing)
        throw Object.assign(new Error("Không tìm thấy đợt thanh toán"), { status: 404 });
      // D01: quyền kiểm đầu route dùng snapshot lúc xác thực — tái kiểm với dữ liệu có hiệu lực
      // dưới khoá hợp đồng/đợt, trước mọi lần ghi.
      if (!(await kiemQuyenTaiLucGhi(() => CAN.manageContracts(user.role))))
        throw Object.assign(new Error("Bạn không có quyền sửa đợt thanh toán (chỉ Admin/PM)"), {
          status: 403,
        });
      if (existing.status !== "draft")
        throw Object.assign(new Error("Chỉ sửa được đợt đang ở trạng thái nháp"), { status: 409 });

      if (items) {
        const refErr = await checkCertLinesBelongToContract(
          existing.contractId,
          items.map((i) => i.boqItemId),
        );
        if (refErr) throw Object.assign(new Error(refErr), { status: 422 });
        await saveCertItems(id, existing.contractId, items);
      }
      if (typeof body.periodLabel === "string" || body.periodLabel === null) {
        await run(
          `UPDATE payment_certs SET period_label = ? WHERE id = ?`,
          typeof body.periodLabel === "string" ? body.periodLabel.trim() || null : null,
          id,
        );
      }
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; code?: string };
    if (e.status)
      return NextResponse.json(
        { error: e.message, ...(e.code ? { code: e.code } : {}) },
        { status: e.status },
      );
    log.error("payment-certs PATCH: lỗi không lường trước", {
      certId: id,
      err: err instanceof Error ? err.message : String(err),
      pgCode: e.code,
    });
    return NextResponse.json({ error: "Lỗi máy chủ khi sửa đợt thanh toán" }, { status: 500 });
  }

  // Lưu xong mới soát: người lập vẫn ghi được (quyết định "cảnh báo, không chặn"), nhưng
  // phải nhìn thấy ngay dòng nào đang vượt khối lượng hợp đồng trước khi trình duyệt.
  // M128: luỹ kế hiệu lực cộng sổ điều chỉnh (bảng FORCE RLS theo dự án) → đọc trong phạm vi
  // dự án, không thì role ứng dụng thấy 0 chứng từ và cảnh báo thiếu phần điều chỉnh.
  const vuotHopDong = await withProjectScope(projectId as number, () => dongVuotHopDong(id));
  return NextResponse.json(
    { updated: id, vuotHopDong },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
