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
    // Trước đây GET này TỰ CHÈN 5 cảm biến bịa (mã, vị trí, ngưỡng cảnh báo đều là số
    // nghĩ ra) vào dự án ngay lần xem đầu — request đọc lại ghi thiết bị không có thật vào
    // DB thật, và ngưỡng bịa có thể sinh cảnh báo bịa (audit 2026-08-25 §3.3). Đã bỏ hẳn.
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
      projectId,
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
