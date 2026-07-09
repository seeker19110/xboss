import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ENV_MONITORING_CATEGORIES,
  listMonitoring,
  parseEnvMonitoringBody,
  validateMonitoringInput,
  type EnvMonitoringCategory,
} from "@/lib/environment";

export const dynamic = "force-dynamic";

// GET /api/env-monitoring?category= — danh sách kỳ quan trắc, scoped theo dự án đang
// chọn (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const categoryRaw = req.nextUrl.searchParams.get("category")?.trim() || null;
  if (categoryRaw && !ENV_MONITORING_CATEGORIES.includes(categoryRaw as EnvMonitoringCategory))
    return NextResponse.json({ error: "Nhóm quan trắc không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const records =
    projectId != null
      ? await listMonitoring(projectId, {
          category: (categoryRaw as EnvMonitoringCategory) ?? undefined,
        })
      : [];
  return NextResponse.json({ records });
}

// POST /api/env-monitoring — ghi kết quả kỳ quan trắc (Admin/PM/kỹ sư). `passed` tính lúc
// ghi (snapshot value <= threshold) — không phải cột generated trong DB. Gán project_id =
// dự án đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEnv(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền ghi kết quả quan trắc (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để ghi quan trắc" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseEnvMonitoringBody(body);
  const { error, passed } = validateMonitoringInput(input);
  if (error) return NextResponse.json({ error }, { status: 422 });

  const id = await insertId(
    `INSERT INTO env_monitoring (project_id, measured_at, category, indicator, value, unit,
                                  threshold, passed, location, note, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.measuredAt,
    input.category,
    input.indicator,
    input.value,
    input.unit,
    input.threshold,
    passed,
    input.location,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
