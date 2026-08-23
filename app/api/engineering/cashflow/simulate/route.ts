import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { runAndSaveCashflowForecast } from "@/lib/ky-thuat/engineering-cashflow";

export const dynamic = "force-dynamic";

// POST /api/engineering/cashflow/simulate
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền mô phỏng dòng tiền dự án" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (!body.runName || !body.totalContractValue) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (runName, totalContractValue)" },
        { status: 422 },
      );
    }

    const simulation = await runAndSaveCashflowForecast({
      projectId,
      runName: body.runName,
      totalContractValue: Number(body.totalContractValue),
      advancePercent: Number(body.advancePercent || 15),
      retentionPercent: Number(body.retentionPercent || 5),
      paymentDelayDays: Number(body.paymentDelayDays || 30),
      durationPeriods: Number(body.durationPeriods || 12),
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, data: simulation });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
