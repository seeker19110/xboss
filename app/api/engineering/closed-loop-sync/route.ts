import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  syncSpoolToWbsAndPayment,
  listClosedLoopSyncLogs,
} from "@/lib/ky-thuat/engineering-closed-loop-sync";

export const dynamic = "force-dynamic";

// GET /api/engineering/closed-loop-sync — Tra cứu nhật ký đồng bộ 2 chiều
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem log đồng bộ" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const logs = await listClosedLoopSyncLogs(projectId);
    return NextResponse.json({ logs, totalCount: logs.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/closed-loop-sync — Thực hiện đồng bộ khép kín Spool -> Task -> Payment IPC
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền đồng bộ tiến độ & thanh toán" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const spoolId = body.spoolId || "SP-FP-T5-01";
    const wbsTaskId = body.wbsTaskId ? parseInt(body.wbsTaskId, 10) : null;
    const discipline = body.discipline || "firefighting";
    const calculatedQty = parseFloat(body.calculatedQty) || 25.5;
    const unit = body.unit || "m";
    const unitRateVnd = parseFloat(body.unitRateVnd) || 520000;

    const result = await syncSpoolToWbsAndPayment(projectId, {
      spoolId,
      wbsTaskId,
      discipline,
      calculatedQty,
      unit,
      unitRateVnd,
      approvedByUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
