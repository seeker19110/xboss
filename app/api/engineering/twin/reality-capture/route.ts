import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { ingestRealityCapture } from "@/lib/ky-thuat/engineering-twin-pinnacle";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/engineering/twin/reality-capture — Danh sách các đợt nạp reality capture
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem Reality Captures" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const rows = await query(
      `SELECT * FROM engineering_twin_reality_captures
       WHERE project_id = ?
       ORDER BY capture_timestamp DESC LIMIT 100`,
      projectId,
    );
    return NextResponse.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/twin/reality-capture — Nạp dữ liệu reality capture mới
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền nạp Reality Capture" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    if (!body.captureCode || !body.captureType || !body.spatialZone || !body.storageUri) {
      return NextResponse.json(
        { error: "Thiếu trường bắt buộc: captureCode, captureType, spatialZone, storageUri" },
        { status: 400 },
      );
    }

    const row = await ingestRealityCapture(projectId, {
      captureCode: body.captureCode,
      captureType: body.captureType,
      spatialZone: body.spatialZone,
      elevationLevel: body.elevationLevel,
      captureTimestamp: body.captureTimestamp || new Date().toISOString(),
      totalPoints: body.totalPoints,
      storageUri: body.storageUri,
      boundingBox: body.boundingBox,
      metadata: body.metadata,
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, capture: row }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
