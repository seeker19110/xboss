import { NextRequest, NextResponse } from "next/server";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canCreate = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// GET /api/vehicles?date=YYYY-MM-DD → danh sách xe theo giờ dự kiến trong ngày (mặc định hôm nay).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  const dateFilter = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;

  const vehicles = await query(
    `SELECT v.id, v.plate, v.driver, v.driver_phone AS "driverPhone",
            v.cargo, v.gate, v.expected_at AS "expectedAt",
            v.entered_at AS "enteredAt", v.exited_at AS "exitedAt",
            v.needs_crane AS "needsCrane", v.status,
            v.po_id AS "poId", po.po_code AS "poCode",
            v.supplier_id AS "supplierId", s.name AS "supplierName",
            v.created_at AS "createdAt"
       FROM vehicle_logs v
       LEFT JOIN purchase_orders po ON po.id = v.po_id
       LEFT JOIN suppliers s ON s.id = v.supplier_id
      ${dateFilter ? "WHERE v.expected_at::date = ?" : ""}
      ORDER BY v.expected_at`,
    ...(dateFilter ? [dateFilter] : []),
  );

  return NextResponse.json({ vehicles });
}

// POST /api/vehicles  body: { supplierId?, poId?, plate, driver?, driverPhone?, cargo?, gate?,
//                              expectedAt, needsCrane? }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canCreate(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/Kỹ sư được đăng ký xe" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const plate = String(body.plate ?? "").trim();
  if (!plate) return NextResponse.json({ error: "Thiếu biển số xe" }, { status: 400 });
  const expectedAt = body.expectedAt ? new Date(body.expectedAt) : null;
  if (!expectedAt || isNaN(expectedAt.getTime()))
    return NextResponse.json({ error: "Giờ dự kiến không hợp lệ" }, { status: 422 });

  const id = await insertId(
    `INSERT INTO vehicle_logs
       (po_id, supplier_id, plate, driver, driver_phone, cargo, gate, expected_at, needs_crane, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  );

  return NextResponse.json({ id }, { status: 201 });
}
