import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listCrews, parseCrewBody, validateCrewInput } from "@/lib/hr";

export const dynamic = "force-dynamic";

// GET /api/crews — danh sách tổ đội, scoped theo dự án đang chọn (M22). Xem: mọi vai
// trò đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const crews = projectId != null ? await listCrews(projectId) : [];
  return NextResponse.json({ crews });
}

// POST /api/crews — tạo tổ đội (Admin/PM). Gán project_id = dự án đang chọn (server
// suy, không tin client). UNIQUE(project_id, name) — trùng tên trả 409.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo tổ đội (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo tổ đội" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseCrewBody(body);
  const invalid = validateCrewInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.systemId != null) {
    if (!(await queryOne(`SELECT id FROM systems WHERE id = ?`, input.systemId)))
      return NextResponse.json({ error: "Hệ thi công không tồn tại" }, { status: 422 });
  }
  if (input.supplierId != null) {
    if (!(await queryOne(`SELECT id FROM suppliers WHERE id = ?`, input.supplierId)))
      return NextResponse.json({ error: "Nhà thầu phụ không tồn tại" }, { status: 422 });
  }
  if (input.leaderId != null) {
    if (
      !(await queryOne(
        `SELECT id FROM personnel WHERE id = ? AND project_id = ?`,
        input.leaderId,
        projectId,
      ))
    )
      return NextResponse.json({ error: "Đội trưởng không tồn tại" }, { status: 422 });
  }

  const existing = await queryOne(
    `SELECT id FROM crews WHERE project_id = ? AND name = ?`,
    projectId,
    input.name,
  );
  if (existing)
    return NextResponse.json({ error: "Tên tổ đội đã tồn tại trong dự án" }, { status: 409 });

  const id = await insertId(
    `INSERT INTO crews (project_id, name, system_id, supplier_id, leader_id)
     VALUES (?, ?, ?, ?, ?)`,
    projectId,
    input.name,
    input.systemId,
    input.supplierId,
    input.leaderId,
  );

  return NextResponse.json({ id }, { status: 201 });
}
