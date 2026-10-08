import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canViewSubcontractor } from "@/lib/bao-mat/auth";
import { getSubcontractor, subcontractorDebtToWire } from "@/lib/hien-truong/subcontractors";
import { MONEY_FORMAT_HEADER, isMoneyPrecisionError, moneyWireFormat } from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

// GET /api/subcontractors/:supplierId — hồ sơ đầy đủ + công nợ + đánh giá. Mọi vai trò
// đăng nhập xem được; subcon chỉ xem đúng NTP của mình (403 nếu khác). S10c (A3-FR06): header
// decimal-string-v1 → `item.debt.*` là chuỗi canonical + `moneyFormat`; legacy ngoài biên → 422.
export async function GET(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ supplierId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const supplierId = parseInt(params.supplierId);
  if (isNaN(supplierId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  if (!(await canViewSubcontractor(user, supplierId)))
    return NextResponse.json(
      { error: "Bạn chỉ được xem hồ sơ nhà thầu phụ của mình" },
      { status: 403 },
    );

  const detail = await getSubcontractor(supplierId, user.orgId);
  if (!detail) return NextResponse.json({ error: "Không tìm thấy nhà thầu phụ" }, { status: 404 });

  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  try {
    return NextResponse.json(
      {
        item: { ...detail, debt: subcontractorDebtToWire(detail.debt, format) },
        ...nhanDinhDangTien(format),
      },
      { headers: HEADERS_API_TIEN },
    );
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return NextResponse.json(LOI_TIEN_VUOT_DINH_DANG_CU, {
      status: 422,
      headers: HEADERS_API_TIEN,
    });
  }
}
