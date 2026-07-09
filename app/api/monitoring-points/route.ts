import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listPoints, parsePointBody, validatePointInput } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

// GET /api/monitoring-points — danh sách mốc quan trắc, scoped theo dự án đang chọn
// (M22). Xem: mọi vai trò đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const points = projectId != null ? await listPoints(projectId) : [];
  return NextResponse.json({ points });
}

// POST /api/monitoring-points — tạo mốc quan trắc (Admin/PM/kỹ sư). Gán project_id =
// dự án đang chọn (server suy, không tin client). Mã mốc duy nhất trong phạm vi dự án.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMonitoring(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo mốc quan trắc (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo mốc quan trắc" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parsePointBody(body);
  const invalid = validatePointInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const dup = await queryOne(
    `SELECT id FROM monitoring_points WHERE project_id = ? AND code = ?`,
    projectId,
    input.code,
  );
  if (dup) return NextResponse.json({ error: "Mã mốc quan trắc đã tồn tại" }, { status: 409 });

  const id = await insertId(
    `INSERT INTO monitoring_points (project_id, code, kind, location, warn_threshold,
       alarm_threshold, unit, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.code,
    input.kind,
    input.location,
    input.warnThreshold,
    input.alarmThreshold,
    input.unit,
    input.status,
  );

  return NextResponse.json({ id }, { status: 201 });
}
