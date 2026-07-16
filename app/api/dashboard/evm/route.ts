import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";
import { getCurrentProjectId } from "@/lib/projects";
import { getEvmSeries, type EvmSource } from "@/lib/evm";

export const dynamic = "force-dynamic";

// GET /api/dashboard/evm?baseline=<id>&system=<systems.code>&source=bills|cash (đều tuỳ chọn)
// EVM chuẩn (M47): PV/EV/AC theo ngày + SPI/CPI/EAC tại hôm nay. Chỉ số gắn tiền
// (ngân sách/thực chi) nên quyền như các trang tài chính (PAYMENT_VIEW_ROLES).
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

  const baselineRaw = parseInt(req.nextUrl.searchParams.get("baseline") ?? "");
  const baselineId = Number.isNaN(baselineRaw) ? null : baselineRaw;
  const projectId = await getCurrentProjectId(user);

  const data = await getEvmSeries({ projectId, baselineId, systemId, source });
  if (data == null) return NextResponse.json({ series: [], summary: null });
  return NextResponse.json(data);
}
