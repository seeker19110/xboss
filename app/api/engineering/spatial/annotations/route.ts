import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  createSpatialAnnotation,
  listSpatialAnnotations,
} from "@/lib/ky-thuat/engineering-spatial-pinning";

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
  // Route chỉ đọc: dự án suy từ phiên (cookie xboss_project), không nhận từ query.
  const projectId = (await getCurrentProjectId(user)) || 1;
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
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok) {
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    }
    const projectId = chotDuAn.projectId;

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
