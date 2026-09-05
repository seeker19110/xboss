import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listCashflowForecasts } from "@/lib/ky-thuat/engineering-cashflow";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/cashflow/forecasts
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem dự báo dòng tiền" }, { status: 403 });
  }

  // Route chỉ đọc: dự án suy từ phiên (cookie xboss_project), không nhận từ query —
  // trước đây `?projectId=<B>` đọc chéo được dự báo dòng tiền của dự án khác (IDOR).
  const projectId = (await getCurrentProjectId(user)) || 1;

  try {
    const forecasts = await listCashflowForecasts(projectId);
    return NextResponse.json({ success: true, data: forecasts });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
