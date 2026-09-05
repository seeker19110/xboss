import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  savePipeSpoolTrackingRecord,
  listPipeSpoolTrackingRecords,
  SpoolLifecycleStatus,
} from "@/lib/ky-thuat/engineering-pipe-stash-hunter";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/pipe-spool-tracking — Danh sách các đốt ống Spool đang theo dõi
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringWorkflows(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem dữ liệu Spool tracking" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const floor = url.searchParams.get("floor") || undefined;
  const system = url.searchParams.get("system") || undefined;

  try {
    const spools = await listPipeSpoolTrackingRecords(projectId, { status, floor, system });
    return NextResponse.json({ spools, totalCount: spools.length });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}

// POST /api/engineering/pipe-spool-tracking — Cập nhật trạng thái đốt ống
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createEngineeringWorkflow(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền cập nhật trạng thái Spool" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const saved = await savePipeSpoolTrackingRecord(projectId, {
      spoolCode: body.spoolCode || `SP-PLB-${Date.now().toString(36).toUpperCase()}`,
      systemCode: body.systemCode || "PLUMBING_DRAINAGE",
      nominalDiaMm: parseFloat(body.nominalDiaMm) || 110.0,
      materialType: body.materialType || "uPVC Class 2",
      designLengthMm: parseFloat(body.designLengthMm) || 3200.0,
      cutLengthMm: parseFloat(body.cutLengthMm) || 3140.0,
      towerLabel: body.towerLabel || "Tower-A",
      floorLabel: body.floorLabel || "FL-12",
      zoneLabel: body.zoneLabel || "Zone-01",
      currentStatus: (body.currentStatus as SpoolLifecycleStatus) || "FLOOR_STAGED",
      currentLocationTag: body.currentLocationTag || "BUFFER_ZONE_FL12_A",
      holdingTimeHours: parseFloat(body.holdingTimeHours) || 0.0,
      scanDeviationMm: body.scanDeviationMm ? parseFloat(body.scanDeviationMm) : undefined,
      assignedSubconId: body.assignedSubconId ? parseInt(body.assignedSubconId) : undefined,
    });

    return NextResponse.json({
      success: true,
      spoolId: saved.id,
    });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
