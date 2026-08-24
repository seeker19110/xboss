import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { runPrescriptiveSimulation } from "@/lib/ky-thuat/engineering-prescriptive";

export const dynamic = "force-dynamic";

// POST /api/engineering/prescriptive/simulate — Kích hoạt mô phỏng Monte Carlo & Pareto Frontier
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringPrescriptive(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền kích hoạt mô phỏng Prescriptive" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-prescriptive", projectId);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    if (
      !body.scenarioCode ||
      !body.triggerReason ||
      body.baselineScheduleDays == null ||
      body.baselineCostVnd == null
    ) {
      return NextResponse.json(
        {
          error:
            "Thiếu trường bắt buộc: scenarioCode, triggerReason, baselineScheduleDays, baselineCostVnd",
        },
        { status: 400 },
      );
    }

    const record = await runPrescriptiveSimulation(projectId, {
      scenarioCode: body.scenarioCode,
      triggerReason: body.triggerReason,
      targetMetric: body.targetMetric,
      baselineScheduleDays: Number(body.baselineScheduleDays),
      baselineCostVnd: Number(body.baselineCostVnd),
      maxCrashBudgetVnd: body.maxCrashBudgetVnd ? Number(body.maxCrashBudgetVnd) : undefined,
      targetDaysSaved: body.targetDaysSaved ? Number(body.targetDaysSaved) : undefined,
      simulationIterations: body.simulationIterations ? Number(body.simulationIterations) : 25,
    });

    return NextResponse.json({ success: true, scenario: record }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
