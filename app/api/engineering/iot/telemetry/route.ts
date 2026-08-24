import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { query } from "@/lib/db";
import { evaluateTelemetryStatus, IotDeviceType } from "@/lib/ky-thuat/engineering-iot-telemetry";

export const dynamic = "force-dynamic";

// GET /api/engineering/iot/telemetry — Lịch sử telemetry gần đây
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.viewEngineeringIot(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem telemetry IoT" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get("deviceId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    let sql = `
      SELECT 
        l.id, l.project_id as "projectId", l.device_id as "deviceId",
        l.metric_value as "metricValue", l.status, l.measured_at as "measuredAt",
        d.device_code as "deviceCode", d.device_name as "deviceName",
        d.device_type as "deviceType", d.unit, d.location_area as "locationArea"
      FROM engineering_iot_telemetry_logs l
      JOIN engineering_iot_devices d ON l.device_id = d.id
      WHERE l.project_id = $1
    `;
    const params: any[] = [projectId];

    if (deviceId) {
      params.push(deviceId);
      sql += ` AND l.device_id = $${params.length}`;
    }

    sql += ` ORDER BY l.measured_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const rows = await query(sql, params);

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (error: any) {
    console.error("[IoT Telemetry GET]", error);
    return NextResponse.json(
      { error: error.message || "Lỗi lấy nhật ký telemetry" },
      { status: 500 },
    );
  }
}

// POST /api/engineering/iot/telemetry — Ghi nhận giá trị đo mới & tự động sinh cảnh báo
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.manageEngineeringIot(user.role)) {
    return NextResponse.json({ error: "Không có quyền thao tác telemetry IoT" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { deviceId, metricValue, rawPayload } = body;

    if (!deviceId || metricValue === undefined || metricValue === null) {
      return NextResponse.json({ error: "Thiếu deviceId hoặc metricValue" }, { status: 400 });
    }

    // Lấy thông tin thiết bị
    const devRows = await query<any>(
      `SELECT device_type, threshold_max, unit, device_name FROM engineering_iot_devices WHERE id = $1 AND project_id = $2`,
      [deviceId, projectId],
    );

    if (devRows.length === 0) {
      return NextResponse.json({ error: "Không tìm thấy thiết bị IoT" }, { status: 404 });
    }

    const dev = devRows[0];
    const val = Number(metricValue);

    // Đánh giá ngưỡng an toàn
    const evalRes = evaluateTelemetryStatus(
      dev.device_type as IotDeviceType,
      val,
      dev.threshold_max ? Number(dev.threshold_max) : undefined,
    );

    // Ghi log telemetry
    const logRows = await query(
      `INSERT INTO engineering_iot_telemetry_logs (project_id, device_id, metric_value, status, raw_payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [projectId, deviceId, val, evalRes.status, JSON.stringify(rawPayload || {})],
    );

    // Nếu vi phạm ngưỡng cảnh báo, tự động tạo Alert.
    // Dedup (V3): mỗi thiết bị chỉ giữ 1 cảnh báo ĐANG MỞ — thiết bị lỗi liên tục không
    // sinh hàng loạt cảnh báo HSE trùng nhau. Chốt bằng unique index một phần
    // (migration 0134, cùng cơ chế dedup notifications); ON CONFLICT DO NOTHING nên
    // chạy nhiều instance song song vẫn đúng.
    let alertCreated = null;
    if (evalRes.status !== "NORMAL" && evalRes.alertTitle) {
      const alertRows = await query(
        `INSERT INTO engineering_iot_threshold_alerts
         (project_id, device_id, severity, alert_title, alert_message, standard_reference, triggered_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (device_id) WHERE is_resolved = false DO NOTHING
         RETURNING *`,
        [
          projectId,
          deviceId,
          evalRes.status,
          evalRes.alertTitle,
          evalRes.alertMessage || "",
          evalRes.standardReference || null,
          val,
        ],
      );
      // Rỗng = đã có cảnh báo đang mở cho thiết bị này (bị dedup), không tạo thêm.
      alertCreated = alertRows[0] ?? null;
    }

    return NextResponse.json({
      success: true,
      data: logRows[0],
      alert: alertCreated,
    });
  } catch (error: any) {
    console.error("[IoT Telemetry POST]", error);
    return NextResponse.json({ error: error.message || "Lỗi ghi nhận telemetry" }, { status: 500 });
  }
}
