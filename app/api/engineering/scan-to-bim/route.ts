import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  analyzeScanVsBimDeviations,
  saveScanToBimRun,
  listScanToBimRuns,
  BimSpoolModel,
  ScannedPoint3D,
} from "@/lib/ky-thuat/engineering-scan-to-bim";

export const dynamic = "force-dynamic";

// GET /api/engineering/scan-to-bim — Lịch sử các phiên quét Scan-vs-BIM
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem dữ liệu quét 3D" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listScanToBimRuns(projectId);
    return NextResponse.json({ runs: list, totalCount: list.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/scan-to-bim — Tiếp nhận dữ liệu Point Cloud và phân tích sai lệch
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền thực thi Scan-to-BIM" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const scanCode = body.scanCode || `SCAN-${Date.now().toString(36).toUpperCase()}`;
    const pointCloudSource = body.pointCloudSource || "LiDAR Leica BLK360 (Tầng 5 Zone A)";
    const toleranceThresholdMm = parseFloat(body.toleranceThresholdMm) || 15.0;

    const spoolModels: BimSpoolModel[] = body.spoolModels || [
      {
        spoolCode: "SP-FP-T5-01",
        discipline: "firefighting",
        systemCode: "FP",
        nominalSpec: "DN100",
        designStartPoint: [1000, 2000, 2800],
        designEndPoint: [6000, 2000, 2800],
        lengthM: 5.0,
      },
      {
        spoolCode: "SP-FP-T5-02",
        discipline: "firefighting",
        systemCode: "FP",
        nominalSpec: "DN100",
        designStartPoint: [6000, 2000, 2800],
        designEndPoint: [11000, 2000, 2800],
        lengthM: 5.0,
      },
      {
        spoolCode: "SP-DUCT-T5-01",
        discipline: "hvac",
        systemCode: "ACMV",
        nominalSpec: "600x400",
        designStartPoint: [1000, 4000, 2600],
        designEndPoint: [7000, 4000, 2600],
        lengthM: 6.0,
      },
    ];

    const scannedPoints: ScannedPoint3D[] = body.scannedPoints || [
      { pointId: "PT-01", x: 1005, y: 2002, z: 2806 }, // Lệch 8mm -> OK
      { pointId: "PT-02", x: 6012, y: 2015, z: 2824 }, // Lệch 30mm -> Warning
      { pointId: "PT-03", x: 1010, y: 4008, z: 2605 }, // Lệch 13mm -> OK
    ];

    const result = analyzeScanVsBimDeviations(
      scanCode,
      pointCloudSource,
      spoolModels,
      scannedPoints,
      toleranceThresholdMm,
    );

    const saved = await saveScanToBimRun(projectId, result);

    return NextResponse.json({
      success: true,
      runId: saved.id,
      result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
