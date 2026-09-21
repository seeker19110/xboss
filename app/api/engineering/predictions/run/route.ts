import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { runPredictionPipeline, UseCase } from "@/lib/ky-thuat/engineering-predictions";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// POST /api/engineering/predictions/run
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringPredictions(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền kích hoạt chạy dự báo kỹ thuật" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-predictions", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const useCase = (body?.useCase as UseCase) || "schedule_risk";

  try {
    const result = await runPredictionPipeline(projectId, useCase);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
