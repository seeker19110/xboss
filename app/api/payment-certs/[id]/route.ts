import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  getCert,
  certTotals,
  validateCertItems,
  checkCertLinesBelongToContract,
  saveCertItems,
  dongVuotHopDong,
  certTotalsToWire,
  type CertLineInput,
  type CertTotalsMasked,
} from "@/lib/tai-chinh/paymentcerts";
import {
  MONEY_FORMAT_HEADER,
  MONEY_FORMAT_DECIMAL_V1,
  moneyWireFormat,
  isMoneyPrecisionError,
} from "@/lib/nen/money";
import { getEntityApprovalStatus } from "@/lib/tien-do/approvals";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";

export const dynamic = "force-dynamic";

// Xác nhận đợt thuộc hợp đồng của dự án đang chọn (M22) — chặn xem/sửa đợt của
// hợp đồng thuộc dự án khác qua đoán/liệt kê id.
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
// `totals` là chuỗi canonical + `moneyFormat`; không gửi → JSON number legacy (422 nếu ngoài biên).
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
  const detail = await withProjectScope(projectId ?? "*", async () => {
    const scoped = await certInProject(id, projectId);
    if (!scoped) return null;
    const cert = await getCert(id);
    if (!cert) return null;
    const totals = await certTotals(id);
    // Trạng thái duyệt engine (M46 PR2) — null khi chưa có flow cấu hình cho loại
    // "payment_cert" (hành xử dormant, không đổi UI cũ).
    const approvalStatus = await getEntityApprovalStatus("payment_cert", id);
    // Dòng vượt khối lượng hợp đồng — CẢNH BÁO, không chặn (xem dongVuotHopDong).
    const vuotHopDong = await dongVuotHopDong(id);
    return { cert, totals, approvalStatus, vuotHopDong };
  });
  if (!detail) return json({ error: "Không tìm thấy đợt thanh toán" }, 404);
  const { cert, totals, approvalStatus, vuotHopDong } = detail;
  // M50 PR2: che đơn giá dòng KL + tổng tiền đợt cho user thiếu viewPayments (phòng thủ
  // — gate route hiện cũng là viewPayments). Che TRƯỚC khi đổi sang wire.
  const [maskedCert] = stripSensitive("paymentCert", [cert], user);
  const [maskedTotals] = stripSensitive<CertTotalsMasked>("certTotals", [totals], user);
  let wireTotals;
  try {
    wireTotals = certTotalsToWire(maskedTotals, format);
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
      },
      422,
    );
  }
  return json({
    cert: maskedCert,
    totals: wireTotals,
    approvalStatus,
    vuotHopDong,
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
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa đợt thanh toán (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await certInProject(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  if (existing.status !== "draft")
    return NextResponse.json({ error: "Chỉ sửa được đợt đang ở trạng thái nháp" }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  if (Array.isArray(body.items)) {
    const items: CertLineInput[] = body.items.map((it: Record<string, unknown>) => ({
      boqItemId: Number(it?.boqItemId),
      qtyPeriod: Number(it?.qtyPeriod),
    }));
    const validationErr = validateCertItems(items);
    if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });
    const refErr = await checkCertLinesBelongToContract(
      existing.contractId,
      items.map((i) => i.boqItemId),
    );
    if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

    await saveCertItems(id, existing.contractId, items);
  }
  if (typeof body.periodLabel === "string" || body.periodLabel === null) {
    await run(
      `UPDATE payment_certs SET period_label = ? WHERE id = ?`,
      typeof body.periodLabel === "string" ? body.periodLabel.trim() || null : null,
      id,
    );
  }

  // Lưu xong mới soát: người lập vẫn ghi được (quyết định "cảnh báo, không chặn"), nhưng
  // phải nhìn thấy ngay dòng nào đang vượt khối lượng hợp đồng trước khi trình duyệt.
  const vuotHopDong = await dongVuotHopDong(id);
  return NextResponse.json(
    { updated: id, vuotHopDong },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
