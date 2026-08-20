import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { detectGodTierClashes, GodTierElementData } from "@/lib/engineering-god-tier";
import { listGodTierClashes, resolveGodTierClash } from "@/lib/engineering-god-tier-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const modelId = searchParams.get("modelId") || undefined;

  let clashes = await listGodTierClashes(projectId, modelId);

  // Nếu chưa có clash trong DB nhưng có yêu cầu quét trên client
  if (clashes.length === 0) {
    const sampleElements: GodTierElementData[] = [
      {
        id: "elem-1",
        guid: "GUID-DUCT-SUPP-101",
        elementType: "DUCT_STRAIGHT",
        systemType: "HVAC_SUPPLY",
        name: "Ống gió cấp chính AHU-01 (800x500)",
        position: { x: 0, y: 3000, z: 2800 },
        dimensions: { width: 800, height: 500, length: 6000 },
        boundingBox: { min: [-400, 0, 2550], max: [400, 6000, 3050] },
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
      },
    ];

    clashes = detectGodTierClashes(sampleElements, projectId, modelId || "model-default");
  }

  return NextResponse.json({ clashes });
}

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
    const { clashId, status } = body;

    if (!clashId || !status) {
      return NextResponse.json({ error: "Thiếu clashId hoặc status" }, { status: 400 });
    }

    const success = await resolveGodTierClash(
      projectId,
      String(clashId),
      user.id,
      status as "resolved" | "ignored" | "rfi_issued",
    );

    return NextResponse.json({ success });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi cập nhật va chạm";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
