import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/engineering/iot/devices — Danh sách cảm biến IoT công trường
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("engineering-iot-telemetry", projectId);
  if (blocked) return blocked;
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    // Tự động seed 5 cảm biến mẫu nếu dự án chưa có thiết bị IoT
    const existing = await query(
      `SELECT COUNT(*)::int as count FROM engineering_iot_devices WHERE project_id = $1`,
      [projectId],
    );

    if (existing[0]?.count === 0) {
      await query(
        `INSERT INTO engineering_iot_devices 
         (project_id, device_code, device_name, device_type, location_area, is_active, threshold_min, threshold_max, unit)
         VALUES
         ($1, 'AQI-B2-01', 'Cảm biến Bụi mịn PM2.5 Khu Cắt Hàn Tầng Hầm B2', 'AIR_QUALITY', 'Tầng Hầm B2 - Trục D-E', true, 0, 50.0, 'ug/m3'),
         ($1, 'GAS-B2-PUMP', 'Cảm biến Khí độc CO Bể Nước Ngầm & Trạm Bơm', 'GAS_LEAK', 'Tầng Hầm B2 - Gian máy bơm PCCC', true, 0, 25.0, 'ppm'),
         ($1, 'NOISE-T5-01', 'Cảm biến Tiếng ồn Khu Thi Công Ống Gió Tầng 5', 'NOISE', 'Tầng 5 - Tháp A', true, 0, 70.0, 'dBA'),
         ($1, 'TEMP-HUM-T5', 'Cảm biến Vi khí hậu Nhiệt độ & Độ ẩm', 'TEMPERATURE_HUMIDITY', 'Tầng 5 - Khu vực hành lang chính', true, 18, 38.0, 'degC'),
         ($1, 'METER-MSB-01', 'Đồng hồ Năng lượng Điện Tủ Phân Phối Chính MSB', 'ENERGY_METER', 'Phòng điện tổng tầng 1', true, 0, 250.0, 'kW')`,
        [projectId],
      );
    }

    const rows = await query(
      `SELECT 
         d.id, d.project_id as "projectId", d.device_code as "deviceCode",
         d.device_name as "deviceName", d.device_type as "deviceType",
         d.location_area as "locationArea", d.tower_id as "towerId",
         d.is_active as "isActive", d.threshold_min as "thresholdMin",
         d.threshold_max as "thresholdMax", d.unit,
         l.metric_value as "latestValue", l.status as "latestStatus",
         l.measured_at as "latestMeasuredAt"
       FROM engineering_iot_devices d
       LEFT JOIN LATERAL (
         SELECT metric_value, status, measured_at
         FROM engineering_iot_telemetry_logs
         WHERE device_id = d.id
         ORDER BY measured_at DESC
         LIMIT 1
       ) l ON true
       WHERE d.project_id = $1
       ORDER BY d.created_at ASC`,
      [projectId],
    );

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (error: any) {
    console.error("[IoT Devices GET]", error);
    return NextResponse.json({ error: error.message || "Lỗi tải thiết bị IoT" }, { status: 500 });
  }
}
