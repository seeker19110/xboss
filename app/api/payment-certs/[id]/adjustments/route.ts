import { NextRequest, NextResponse } from "next/server";
import { withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import { phanHoiLoiCoStatus } from "@/lib/nen/loi";
import { isMoneyPrecisionError, moneyWireFormat, MONEY_FORMAT_HEADER } from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";
import { docDauVaoTao, taoDieuChinh } from "@/lib/tai-chinh/ipc-dieu-chinh";
import {
  dieuChinhToWire,
  dotThuocDuAn,
  getDieuChinh,
  listDieuChinhCuaDot,
} from "@/lib/tai-chinh/ipc-dieu-chinh-doc";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: HEADERS_API_TIEN });
const KHONG_THAY = "Không tìm thấy đợt thanh toán";

// GET /api/payment-certs/:id/adjustments — M128: chứng từ điều chỉnh/huỷ hiệu lực của một đợt
// (PAYMENT_VIEW_ROLES, scope dự án đang chọn — khác dự án → 404). Header `X-XBoss-Money-Format:
// decimal-string-v1` → amount/items.unitPrice là chuỗi canonical (như route IPC); không gửi → JSON
// number legacy, ngoài biên → 422 money_precision_unsupported. qtyDelta luôn là chuỗi 3 số lẻ.
// 200 { adjustments: [...] }
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const user = await getCurrentUser();
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);
  if (!CAN.viewPayments(user.role))
    return json({ error: "Bạn không có quyền xem đợt thanh toán" }, 403);
  const certId = parseInt(idStr, 10);
  if (!Number.isSafeInteger(certId) || certId <= 0) return json({ error: "ID không hợp lệ" }, 400);
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null) return json({ error: KHONG_THAY }, 404);
  const rows = await withProjectScope(projectId, async () =>
    (await dotThuocDuAn(certId, projectId)) ? listDieuChinhCuaDot(certId, projectId) : null,
  );
  if (!rows) return json({ error: KHONG_THAY }, 404);
  try {
    return json({ adjustments: dieuChinhToWire(rows, user, format), ...nhanDinhDangTien(format) });
  } catch (err) {
    if (isMoneyPrecisionError(err)) return json(LOI_TIEN_VUOT_DINH_DANG_CU, 422);
    throw err;
  }
}

// POST /api/payment-certs/:id/adjustments — lập chứng từ NHÁP cho đợt đã duyệt (Admin/PM).
// body: { kind: 'adjustment'|'reversal', reason (≥10 ký tự), items?: [{ boqItemId, qtyDelta, note? }] }
// amount luôn GỘP (KL × đơn giá gốc, adj-sum-v2), tính trong SQL — tiền phiếu RÒNG sinh lúc duyệt.
// reversal: dòng = −(KL kỳ + Σ KL điều chỉnh đã duyệt) từng dòng (server sinh, bỏ qua items);
//   amount = −(giá trị kỳ gộp của đợt + Σ amount gộp điều chỉnh đã duyệt).
// adjustment: amount = ROUND(Σ qtyDelta × đơn giá gốc, 2).
// 201 chứng từ | 403 | 404 khác dự án | 409 cert_not_approved / ipc_no_bill (đợt legacy không có
// phiếu gốc) / cert_reversed / adjustment_open_exists | 422 reason_too_short / items_required / item_not_in_cert /
// qty_delta_invalid / qty_below_zero. Logic: lib/tai-chinh/ipc-dieu-chinh.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const user = await getCurrentUser();
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);
  if (!CAN.manageContracts(user.role))
    return json({ error: "Chỉ Admin/PM được lập chứng từ điều chỉnh" }, 403);
  const certId = parseInt(idStr, 10);
  if (!Number.isSafeInteger(certId) || certId <= 0) return json({ error: "ID không hợp lệ" }, 400);

  const input = docDauVaoTao(await req.json().catch(() => null));
  if ("error" in input) return json({ error: input.error, code: input.code }, input.status);
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null) return json({ error: KHONG_THAY }, 404);
  try {
    const row = await withProjectScope(
      projectId,
      async () => {
        const id = await taoDieuChinh({ certId, projectId, orgId: user.orgId, user, input });
        return getDieuChinh(id, projectId);
      },
      { readOnly: false },
    );
    return json({ ...dieuChinhToWire([row!], user, format)[0], ...nhanDinhDangTien(format) }, 201);
  } catch (err) {
    if (isMoneyPrecisionError(err)) return json(LOI_TIEN_VUOT_DINH_DANG_CU, 422);
    return phanHoiLoiCoStatus(err, "Lỗi máy chủ khi lập chứng từ điều chỉnh");
  }
}
