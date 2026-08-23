import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  runMepfHydraulicAnalysis,
  saveHydraulicCalculation,
  listHydraulicCalculations,
  HydraulicSystemType,
} from "@/lib/ky-thuat/engineering-mepf-hydraulic";

export const dynamic = "force-dynamic";

// GET /api/engineering/mepf-hydraulic — Tra cứu lịch sử tính toán thủy lực
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem tính toán thủy lực" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listHydraulicCalculations(projectId);
    return NextResponse.json({ calculations: list, totalCount: list.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/mepf-hydraulic — Chạy tính toán thủy lực & chọn cỡ ống tự động
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực hiện tính toán thủy lực" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const systemType: HydraulicSystemType = body.systemType || "chilled_water";
    const flowRateM3h = parseFloat(body.flowRateM3h) || 25.0;
    const pipeLengthM = parseFloat(body.pipeLengthM) || 45.0;
    const maxVelocityMs = parseFloat(body.maxVelocityMs) || 1.5;
    const calcCode = body.calcCode || `HYDR-${Date.now().toString(36).toUpperCase()}`;

    const analysis = runMepfHydraulicAnalysis(
      calcCode,
      systemType,
      flowRateM3h,
      pipeLengthM,
      maxVelocityMs,
    );

    const saved = await saveHydraulicCalculation(projectId, analysis);

    return NextResponse.json({
      success: true,
      calcId: saved.id,
      analysis,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
