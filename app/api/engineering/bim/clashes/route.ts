import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listBimElements, detectSpatialClashesForElements } from "@/lib/engineering-bim-cad";

export const dynamic = "force-dynamic";

// GET /api/engineering/bim/clashes — Quét và lấy danh sách xung đột không gian BIM-CAD
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem xung đột BIM" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const clearanceThresholdMm = Number(searchParams.get("clearance") || "50");

    const elements = await listBimElements(projectId);
    const clashes = await detectSpatialClashesForElements(
      projectId,
      elements,
      clearanceThresholdMm,
    );

    return NextResponse.json(clashes);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
