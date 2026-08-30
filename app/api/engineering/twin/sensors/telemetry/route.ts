import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { ingestSensorTelemetry } from "@/lib/ky-thuat/engineering-twin-pinnacle";

export const dynamic = "force-dynamic";

// POST /api/engineering/twin/sensors/telemetry — Đẩy luồng dữ liệu cảm biến IoT hiện trường
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền gửi dữ liệu cảm biến" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-twin", projectId);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    if (!body.sensorCode || !body.sensorType || body.value === undefined || !body.unit) {
      return NextResponse.json(
        { error: "Thiếu trường bắt buộc: sensorCode, sensorType, value, unit" },
        { status: 400 },
      );
    }

    const row = await ingestSensorTelemetry(projectId, {
      sensorCode: body.sensorCode,
      sensorType: body.sensorType,
      objectId: body.objectId,
      value: Number(body.value),
      unit: body.unit,
      observedAt: body.observedAt,
      thresholdConfig: body.thresholdConfig,
    });

    return NextResponse.json({ success: true, sensor: row }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
