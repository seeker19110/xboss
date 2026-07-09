import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listPersonnel, maskIdNumber, parsePersonnelBody, validatePersonnelInput } from "@/lib/hr";

export const dynamic = "force-dynamic";

// GET /api/personnel?crewId=&supplierId=&status= — danh sách nhân sự công trường,
// scoped theo dự án đang chọn (M22). Xem: mọi vai trò đăng nhập; CCCD chỉ admin/pm thấy.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const crewId = sp.get("crewId") ? Number(sp.get("crewId")) : undefined;
  const supplierId = sp.get("supplierId") ? Number(sp.get("supplierId")) : undefined;
  const statusRaw = sp.get("status")?.trim() || undefined;
  if (statusRaw && statusRaw !== "active" && statusRaw !== "inactive")
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const personnel =
    projectId != null
      ? await listPersonnel(projectId, {
          crewId,
          supplierId,
          status: statusRaw as "active" | "inactive" | undefined,
        })
      : [];
  return NextResponse.json({ personnel: maskIdNumber(personnel, isAdminOrPm(user.role)) });
}

// POST /api/personnel — tạo nhân sự công trường (Admin/PM). Gán project_id = dự án
// đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo nhân sự (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo nhân sự" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parsePersonnelBody(body);
  const invalid = validatePersonnelInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.supplierId != null) {
    if (!(await queryOne(`SELECT id FROM suppliers WHERE id = ?`, input.supplierId)))
      return NextResponse.json({ error: "Nhà thầu phụ không tồn tại" }, { status: 422 });
  }

  const id = await insertId(
    `INSERT INTO personnel (project_id, code, full_name, role_title, supplier_id, phone,
                             id_number, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.code,
    input.fullName,
    input.roleTitle,
    input.supplierId,
    input.phone,
    input.idNumber,
    input.status,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
