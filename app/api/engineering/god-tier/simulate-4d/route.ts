import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { calculateGodTier4DSimulation, GodTierElementData } from "@/lib/engineering-god-tier";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const targetDate = body.targetDate || new Date().toISOString().split("T")[0];

    const sampleElements: GodTierElementData[] = body.elements || [
      {
        id: "elem-1",
        guid: "GUID-DUCT-SUPP-101",
        elementType: "DUCT_STRAIGHT",
        systemType: "HVAC_SUPPLY",
        name: "Ống gió cấp chính AHU-01 (800x500)",
        position: { x: 0, y: 0, z: 2800 },
        dimensions: { width: 800, height: 500, length: 6000 },
        boundingBox: { min: [-400, 0, 2550], max: [400, 6000, 3050] },
        plannedStartDate: "2026-08-01",
        plannedEndDate: "2026-08-15",
        actualProgressPercent: 100,
      },
      {
        id: "elem-2",
        guid: "GUID-PIPE-DRAIN-201",
        elementType: "PIPE_STRAIGHT",
        systemType: "PLUMBING_DRAINAGE",
        name: "Ống thoát nước trục đứng uPVC DN110",
        position: { x: 0, y: 3000, z: 2750 },
        dimensions: { diameter: 110, length: 4000 },
        boundingBox: { min: [-55, 1000, 2695], max: [55, 5000, 2805] },
        plannedStartDate: "2026-08-10",
        plannedEndDate: "2026-08-25",
        actualProgressPercent: 75,
      },
      {
        id: "elem-3",
        guid: "GUID-CABLE-TRAY-301",
        elementType: "CABLE_TRAY",
        systemType: "ELECTRICAL_POWER",
        name: "Thang máng cáp điện động lực 300x100",
        position: { x: 600, y: 0, z: 3100 },
        dimensions: { width: 300, height: 100, length: 6000 },
        boundingBox: { min: [450, 0, 3050], max: [750, 6000, 3150] },
        plannedStartDate: "2026-08-15",
        plannedEndDate: "2026-08-30",
        actualProgressPercent: 30,
      },
      {
        id: "elem-4",
        guid: "GUID-BEAM-STR-401",
        elementType: "BEAM",
        systemType: "STRUCTURE",
        name: "Dầm bê tông cốt thép B40x60 Trục 2-3",
        position: { x: 0, y: 4000, z: 2900 },
        dimensions: { width: 400, height: 600, length: 8000 },
        boundingBox: { min: [-4000, 3800, 2600], max: [4000, 4200, 3200] },
        plannedStartDate: "2026-07-20",
        plannedEndDate: "2026-08-05",
        actualProgressPercent: 100,
      },
    ];

    const simResult = calculateGodTier4DSimulation(sampleElements, targetDate);
    return NextResponse.json({ success: true, simulation: simResult });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi tính toán mô phỏng 4D";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
