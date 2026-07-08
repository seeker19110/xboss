import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listVehicles } from "@/lib/procurement";

export const dynamic = "force-dynamic";

const canCreate = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// GET /api/vehicles?date=YYYY-MM-DD → danh sách xe theo giờ dự kiến trong ngày (mặc định
// hôm nay). Scoped theo dự án đang chọn (M22).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  const dateFilter = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;

  const projectId = await getCurrentProjectId(user);
  const vehicles = projectId != null ? await listVehicles({ date: dateFilter, projectId }) : [];

  return NextResponse.json({ vehicles });
}

// POST /api/vehicles  body: { supplierId?, poId?, plate, driver?, driverPhone?, cargo?, gate?,
//                              expectedAt, needsCrane? }
// project_id gán = dự án đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canCreate(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/Kỹ sư được đăng ký xe" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để đăng ký xe" }, { status: 422 });

  const body = await req.json().catch(() => ({}));
  const plate = String(body.plate ?? "").trim();
  if (!plate) return NextResponse.json({ error: "Thiếu biển số xe" }, { status: 400 });
  const expectedAt = body.expectedAt ? new Date(body.expectedAt) : null;
  if (!expectedAt || isNaN(expectedAt.getTime()))
    return NextResponse.json({ error: "Giờ dự kiến không hợp lệ" }, { status: 422 });

  const id = await insertId(
    `INSERT INTO vehicle_logs
       (po_id, supplier_id, plate, driver, driver_phone, cargo, gate, expected_at, needs_crane, created_by, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    body.poId ? Number(body.poId) : null,
    body.supplierId ? Number(body.supplierId) : null,
    plate,
    body.driver ? String(body.driver).trim() : null,
    body.driverPhone ? String(body.driverPhone).trim() : null,
    body.cargo ? String(body.cargo).trim() : null,
    body.gate ? String(body.gate).trim() : null,
    expectedAt.toISOString(),
    !!body.needsCrane,
    user.id,
    projectId,
  );

  return NextResponse.json({ id }, { status: 201 });
}
