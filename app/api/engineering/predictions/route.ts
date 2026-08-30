import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { listPredictions, listPredictionModels } from "@/lib/ky-thuat/engineering-predictions";

export const dynamic = "force-dynamic";

// GET /api/engineering/predictions?status=
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringPredictions(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem dự báo kỹ thuật" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-predictions", projectId);
  if (blocked) return blocked;

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") || undefined;

  try {
    const [predictions, models] = await Promise.all([
      listPredictions(projectId, { status }),
      listPredictionModels(),
    ]);
    return NextResponse.json({ predictions, models });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
