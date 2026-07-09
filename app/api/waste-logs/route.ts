import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  WASTE_TYPES,
  listWaste,
  parseWasteBody,
  validateWasteInput,
  type WasteType,
} from "@/lib/environment";

export const dynamic = "force-dynamic";

// GET /api/waste-logs?wasteType= — danh sách chất thải, scoped theo dự án đang chọn (M22).
// Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const wasteTypeRaw = req.nextUrl.searchParams.get("wasteType")?.trim() || null;
  if (wasteTypeRaw && !WASTE_TYPES.includes(wasteTypeRaw as WasteType))
    return NextResponse.json({ error: "Loại chất thải không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const logs =
    projectId != null
      ? await listWaste(projectId, { wasteType: (wasteTypeRaw as WasteType) ?? undefined })
      : [];
  return NextResponse.json({ logs });
}

// POST /api/waste-logs — ghi nhận chất thải (Admin/PM/kỹ sư). Gán project_id = dự án
// đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEnv(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền ghi nhận chất thải (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để ghi nhận chất thải" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseWasteBody(body);
  const invalid = validateWasteInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO waste_logs (project_id, log_date, waste_type, quantity, unit,
                              disposal_method, handler, note, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.logDate,
    input.wasteType,
    input.quantity,
    input.unit,
    input.disposalMethod,
    input.handler,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
