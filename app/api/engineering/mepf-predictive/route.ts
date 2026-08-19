import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  calculateAssetReliabilityAndRul,
  savePredictiveAsset,
  listPredictiveAssets,
  MepfAssetInput,
} from "@/lib/engineering-mepf-predictive";

export const dynamic = "force-dynamic";

// GET /api/engineering/mepf-predictive — Lịch sử các tài sản bảo trì tiên đoán
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem bảo trì tiên đoán" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listPredictiveAssets(projectId);
    return NextResponse.json({ assets: list, totalCount: list.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/mepf-predictive — Tính toán dự báo MTBF/RUL và lưu tài sản
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực hiện bảo trì tiên đoán" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const assetInput: MepfAssetInput = {
      assetCode: body.assetCode || `PUMP-CHW-${Date.now().toString(36).toUpperCase()}`,
      assetName: body.assetName || "Bơm Nước Lạnh Chiller CHW-P01",
      systemType: body.systemType || "chiller_pump",
      installationDate: body.installationDate || "2025-06-01",
      operatingHoursTotal: parseFloat(body.operatingHoursTotal) || 8500,
      designedMtbfHours: body.designedMtbfHours ? parseFloat(body.designedMtbfHours) : undefined,
    };

    const evaluation = calculateAssetReliabilityAndRul(assetInput);
    const saved = await savePredictiveAsset(projectId, evaluation);

    return NextResponse.json({
      success: true,
      assetId: saved.id,
      evaluation,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
