import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { resolveSystemId } from "@/lib/tien-do/systems";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { kiemBaselineThuocDuAn, parseBaselineParam } from "@/lib/tien-do/baseline-scope";
import { EVM_MONEY_FIELDS, getEvmSeries, type EvmSource } from "@/lib/tien-do/evm";
import { MONEY_FORMAT_HEADER, isMoneyPrecisionError, moneyWireFormat } from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  moneyFieldsToWire,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

// GET /api/dashboard/evm?baseline=<id>&system=<systems.code>&source=bills|cash (đều tuỳ chọn)
// EVM chuẩn (M47): PV/EV/AC theo ngày + SPI/CPI/EAC tại hôm nay. Chỉ số gắn tiền
// (ngân sách/thực chi) nên quyền như các trang tài chính (PAYMENT_VIEW_ROLES).
// S10c (A3-FR06): header decimal-string-v1 → tiền trong `summary` là chuỗi canonical exact +
// `moneyFormat`; legacy → number, ngoài biên → 422. `series` là điểm VẼ (đồng nguyên, số xấp xỉ
// cho hình học) ở cả hai định dạng; SPI/CPI là number.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Không có quyền xem chỉ số chi phí" }, { status: 403 });

  const sourceParam = req.nextUrl.searchParams.get("source") ?? "bills";
  if (sourceParam !== "bills" && sourceParam !== "cash")
    return NextResponse.json({ error: "source phải là bills hoặc cash" }, { status: 422 });
  const source = sourceParam as EvmSource;

  const systemId = await resolveSystemId(req.nextUrl.searchParams.get("system"));
  if (source === "cash" && systemId != null)
    return NextResponse.json(
      { error: "Nguồn quỹ tiền mặt không gắn với hệ — bỏ lọc hệ hoặc dùng nguồn thực chi" },
      { status: 422 },
    );

  const baselineRaw = req.nextUrl.searchParams.get("baseline");
  if (parseBaselineParam(baselineRaw) === undefined)
    return NextResponse.json({ error: "baseline phải là số nguyên dương hợp lệ" }, { status: 400 });
  const projectId = await getCurrentProjectId(user);
  // A1-FR06: baseline phải thuộc dự án đang chọn, không thì 404 (không fallback về không-baseline).
  let baselineId: number | null = null;
  if (projectId != null) {
    const kq = await kiemBaselineThuocDuAn(baselineRaw, projectId);
    if (!kq.ok) return NextResponse.json({ error: kq.error }, { status: kq.status });
    baselineId = kq.baselineId;
  }

  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  // QUALITY-FINAL-1 S02 (A1-AC02): không có dự án khả kiến → rỗng đúng shape (như dự án chưa
  // có task), KHÔNG tính EVM gộp mọi dự án/tổ chức như trước (mẫu S02c dashboard/scurve…).
  const data =
    projectId == null ? null : await getEvmSeries({ projectId, baselineId, systemId, source });
  if (data == null)
    return NextResponse.json(
      { series: [], summary: null, ...nhanDinhDangTien(format) },
      { headers: HEADERS_API_TIEN },
    );
  try {
    return NextResponse.json(
      {
        ...data,
        summary: moneyFieldsToWire(data.summary, EVM_MONEY_FIELDS, format),
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
