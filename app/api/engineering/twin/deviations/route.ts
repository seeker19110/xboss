import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  getSpatialDeviations,
  recordSpatialDeviation,
} from "@/lib/ky-thuat/engineering-twin-pinnacle";

export const dynamic = "force-dynamic";

// GET /api/engineering/twin/deviations — Danh sách sai lệch hình học BIM vs As-Built
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem sai lệch Digital Twin" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const severity = searchParams.get("severity") || undefined;
  const remediationStatus = searchParams.get("remediationStatus") || undefined;

  try {
    const deviations = await getSpatialDeviations(projectId, { severity, remediationStatus });
    return NextResponse.json(deviations);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/twin/deviations — Ghi nhận sai lệch hình học
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền ghi nhận sai lệch" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    if (
      !body.captureId ||
      !body.objectId ||
      !body.deviationType ||
      !body.measuredCoords ||
      !body.designCoords
    ) {
      return NextResponse.json(
        {
          error:
            "Thiếu trường bắt buộc: captureId, objectId, deviationType, measuredCoords, designCoords",
        },
        { status: 400 },
      );
    }

    const row = await recordSpatialDeviation(projectId, {
      captureId: body.captureId,
      objectId: body.objectId,
      elementGuid: body.elementGuid,
      deviationType: body.deviationType,
      measuredCoords: body.measuredCoords,
      designCoords: body.designCoords,
      toleranceThresholdMm: body.toleranceThresholdMm,
    });

    return NextResponse.json({ success: true, deviation: row }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
