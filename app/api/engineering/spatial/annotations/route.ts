import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { createSpatialAnnotation, listSpatialAnnotations } from "@/lib/engineering-spatial-pinning";

export const dynamic = "force-dynamic";

// GET /api/engineering/spatial/annotations
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền truy cập dữ liệu không gian" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);
  const drawingCode = searchParams.get("drawingCode") || undefined;
  const floorId = searchParams.get("floorId") || undefined;
  const annotType = (searchParams.get("annotType") as any) || undefined;
  const status = (searchParams.get("status") as any) || undefined;
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 100;

  try {
    const annotations = await listSpatialAnnotations(projectId, {
      drawingCode,
      floorId,
      annotType,
      status,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: annotations,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/spatial/annotations
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo điểm ghim không gian" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (
      !body.drawingCode ||
      !body.annotType ||
      body.coordX == null ||
      body.coordY == null ||
      !body.title
    ) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (drawingCode, annotType, coordX, coordY, title)" },
        { status: 422 },
      );
    }

    const annotation = await createSpatialAnnotation({
      projectId,
      drawingCode: body.drawingCode,
      floorId: body.floorId,
      annotType: body.annotType,
      coordX: Number(body.coordX),
      coordY: Number(body.coordY),
      coordZ: body.coordZ != null ? Number(body.coordZ) : 0,
      geomPayload: body.geomPayload || {},
      entityRefType: body.entityRefType,
      entityRefId: body.entityRefId,
      title: body.title,
      description: body.description,
      severity: body.severity || "normal",
      metadata: body.metadata || {},
      createdBy: user.id,
    });

    return NextResponse.json({
      success: true,
      data: annotation,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
