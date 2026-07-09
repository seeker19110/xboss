import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  computeLevel,
  getPoint,
  parseReadingBody,
  readingsSeries,
  validateReadingInput,
} from "@/lib/monitoring";

export const dynamic = "force-dynamic";

// GET /api/monitoring-points/:id/readings — chuỗi kỳ đo theo thời gian (cho biểu đồ),
// scoped theo dự án đang chọn.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const point = projectId != null ? await getPoint(id, projectId) : null;
  if (!point) return NextResponse.json({ error: "Không tìm thấy mốc quan trắc" }, { status: 404 });

  const readings = await readingsSeries(id);
  return NextResponse.json({ readings });
}

// POST /api/monitoring-points/:id/readings — ghi kỳ đo mới (Admin/PM/kỹ sư). Tự tính
// `level` qua computeLevel trước khi INSERT (so ngưỡng của mốc lúc ghi — snapshot).
// UNIQUE(point, measured_at) → 409 khi trùng ngày.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMonitoring(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền ghi kỳ đo (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const point = projectId != null ? await getPoint(id, projectId) : null;
  if (!point) return NextResponse.json({ error: "Không tìm thấy mốc quan trắc" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseReadingBody(body);
  const invalid = validateReadingInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const dup = await queryOne(
    `SELECT id FROM monitoring_readings WHERE point_id = ? AND measured_at = ?`,
    id,
    input.measuredAt,
  );
  if (dup) return NextResponse.json({ error: "Đã có kỳ đo cho ngày này" }, { status: 409 });

  const level = computeLevel(input.value, input.cumulative, point);

  const readingId = await insertId(
    `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level, note, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.measuredAt,
    input.value,
    input.cumulative,
    level,
    input.note,
    user.id,
  );

  return NextResponse.json({ id: readingId, level }, { status: 201 });
}
