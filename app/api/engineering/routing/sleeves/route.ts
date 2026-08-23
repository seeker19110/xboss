import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { createSleeveSchedule, listSleeveSchedules } from "@/lib/ky-thuat/engineering-auto-routing";

export const dynamic = "force-dynamic";

// GET /api/engineering/routing/sleeves
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem lỗ khoét dầm" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);
  const drawingCode = searchParams.get("drawingCode") || undefined;

  try {
    const sleeves = await listSleeveSchedules(projectId, drawingCode);
    return NextResponse.json({ success: true, data: sleeves });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/routing/sleeves
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo lỗ khoét dầm" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (
      !body.drawingCode ||
      !body.beamRef ||
      body.diameterMm == null ||
      body.beamDepthMm == null ||
      body.beamSpanMm == null
    ) {
      return NextResponse.json(
        {
          error:
            "Thiếu các trường bắt buộc (drawingCode, beamRef, diameterMm, beamDepthMm, beamSpanMm)",
        },
        { status: 422 },
      );
    }

    const sleeve = await createSleeveSchedule({
      projectId,
      drawingCode: body.drawingCode,
      floorId: body.floorId,
      beamRef: body.beamRef,
      sleeveType: body.sleeveType,
      diameterMm: Number(body.diameterMm),
      widthMm: body.widthMm ? Number(body.widthMm) : undefined,
      heightMm: body.heightMm ? Number(body.heightMm) : undefined,
      beamDepthMm: Number(body.beamDepthMm),
      beamSpanMm: Number(body.beamSpanMm),
      coordX: Number(body.coordX || 1500),
      coordY: Number(body.coordY || 800),
      coordZ: Number(body.coordZ || 3200),
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, data: sleeve });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
