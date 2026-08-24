import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/engineering/iot/alerts — Danh sách cảnh báo ngưỡng an toàn HSE
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.viewEngineeringIot(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem cảnh báo ngưỡng IoT" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("engineering-iot-telemetry", projectId);
  if (blocked) return blocked;
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const rows = await query(
      `SELECT 
         a.id, a.project_id as "projectId", a.device_id as "deviceId",
         a.severity, a.alert_title as "alertTitle", a.alert_message as "alertMessage",
         a.standard_reference as "standardReference", a.triggered_value as "triggeredValue",
         a.is_resolved as "isResolved", a.resolved_at as "resolvedAt",
         a.created_at as "createdAt",
         d.device_code as "deviceCode", d.device_name as "deviceName",
         d.location_area as "locationArea", d.unit
       FROM engineering_iot_threshold_alerts a
       JOIN engineering_iot_devices d ON a.device_id = d.id
       WHERE a.project_id = $1
       ORDER BY a.is_resolved ASC, a.created_at DESC`,
      [projectId],
    );

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (error: any) {
    console.error("[IoT Alerts GET]", error);
    return NextResponse.json(
      { error: error.message || "Lỗi tải danh sách cảnh báo" },
      { status: 500 },
    );
  }
}

// PATCH /api/engineering/iot/alerts — Đánh dấu xử lý cảnh báo
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.manageEngineeringIot(user.role)) {
    return NextResponse.json({ error: "Không có quyền thao tác cảnh báo ngưỡng IoT" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("engineering-iot-telemetry", projectId);
  if (blocked) return blocked;
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { alertId, isResolved } = body;

    if (!alertId) {
      return NextResponse.json({ error: "Thiếu alertId" }, { status: 400 });
    }

    const rows = await query(
      `UPDATE engineering_iot_threshold_alerts
       SET is_resolved = $1,
           resolved_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           resolved_by = CASE WHEN $1 THEN $2 ELSE NULL END
       WHERE id = $3 AND project_id = $4
       RETURNING *`,
      [isResolved ?? true, user.id, alertId, projectId],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Không tìm thấy cảnh báo" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: rows[0],
    });
  } catch (error: any) {
    console.error("[IoT Alerts PATCH]", error);
    return NextResponse.json({ error: error.message || "Lỗi cập nhật cảnh báo" }, { status: 500 });
  }
}
