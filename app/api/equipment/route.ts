import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  EQUIPMENT_CONDITIONS,
  listEquipment,
  parseEquipmentBody,
  validateEquipmentInput,
  type EquipmentCondition,
} from "@/lib/equipment";

export const dynamic = "force-dynamic";

// GET /api/equipment?kind=&condition=&crew=&q= — sổ thiết bị. Mọi vai trò đăng nhập xem được.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const conditionRaw = sp.get("condition")?.trim() || undefined;
  if (conditionRaw && !EQUIPMENT_CONDITIONS.includes(conditionRaw as EquipmentCondition))
    return NextResponse.json({ error: "Tình trạng không hợp lệ" }, { status: 422 });

  const equipment = await listEquipment({
    kind: sp.get("kind")?.trim() || undefined,
    condition: conditionRaw as EquipmentCondition | undefined,
    crew: sp.get("crew")?.trim() || undefined,
    q: sp.get("q")?.trim() || undefined,
  });
  return NextResponse.json({ equipment });
}

// POST /api/equipment — tạo thiết bị mới (Admin/PM/kỹ sư).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEquipment(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo thiết bị (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseEquipmentBody(body);
  const invalid = validateEquipmentInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const dup = await queryOne(`SELECT id FROM equipment WHERE code = ?`, input.code);
  if (dup) return NextResponse.json({ error: "Mã thiết bị đã tồn tại" }, { status: 409 });

  const id = await insertId(
    `INSERT INTO equipment (code, name, kind, serial, condition, calibration_due,
       current_location, current_crew, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.code,
    input.name,
    input.kind,
    input.serial,
    input.condition,
    input.calibrationDue,
    input.currentLocation,
    input.currentCrew,
    input.note,
  );

  return NextResponse.json({ id }, { status: 201 });
}
