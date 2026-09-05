import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  calculateEngineeringHealthIndex,
  saveProjectHealthSnapshot,
  listProjectHealthSnapshots,
  ProjectHealthMetricsInput,
} from "@/lib/ky-thuat/engineering-project-health";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/project-health — Lịch sử chỉ số sức khỏe dự án
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem sức khỏe dự án" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listProjectHealthSnapshots(projectId);
    return NextResponse.json({ snapshots: list, totalCount: list.length });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}

// POST /api/engineering/project-health — Tính toán EHI % và mô phỏng Monte Carlo
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền cập nhật sức khỏe dự án" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const input: ProjectHealthMetricsInput = {
      spiIndex: parseFloat(body.spiIndex) || 1.03,
      cpiIndex: parseFloat(body.cpiIndex) || 1.05,
      qualityPassRatePercent: parseFloat(body.qualityPassRatePercent) || 96.5,
      bimGeometryAccuracyPercent: parseFloat(body.bimGeometryAccuracyPercent) || 94.2,
      lcaCarbonScorePercent: parseFloat(body.lcaCarbonScorePercent) || 91.0,
      baselinePlannedCompletionDate: body.baselinePlannedCompletionDate || "2026-12-30",
      scheduleVarianceDays: parseFloat(body.scheduleVarianceDays) || -3, // Nhanh hơn 3 ngày
    };

    const snapshot = calculateEngineeringHealthIndex(input);
    const saved = await saveProjectHealthSnapshot(projectId, snapshot);

    return NextResponse.json({
      success: true,
      snapshotId: saved.id,
      snapshot,
    });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
