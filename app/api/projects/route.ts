import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { listProjects, listOrganizations } from "@/lib/ha-tang/projects";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

// GET /api/projects — dự án user thấy + % tiến độ + số việc trễ (project switcher +
// trang Portfolio). Tôn trọng user_projects qua listProjects().
// M51 PR4: `?org=<id>` lọc theo tổ chức; trả kèm `orgs` (tổ chức có dự án user thấy)
// để trang Portfolio quyết định hiện select tổ chức (chỉ khi có >1 org).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const orgParam = req.nextUrl.searchParams.get("org");
  const orgId = orgParam && Number.isFinite(Number(orgParam)) ? Number(orgParam) : null;

  const [projects, orgs] = await Promise.all([listProjects(user, orgId), listOrganizations(user)]);
  return NextResponse.json({ projects, orgs });
}

// POST /api/projects — tạo dự án mới (chỉ Admin). Body: { name, code?, investor?, contractor? }.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Chỉ Admin mới tạo được dự án" }, { status: 403 });
  if (!Number.isSafeInteger(user.orgId) || user.orgId < 1)
    return NextResponse.json({ error: "Không xác định được tổ chức của Admin" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Thiếu tên dự án" }, { status: 400 });
  const code = typeof body?.code === "string" && body.code.trim() ? body.code.trim() : null;
  const investor =
    typeof body?.investor === "string" && body.investor.trim() ? body.investor.trim() : null;
  const contractor =
    typeof body?.contractor === "string" && body.contractor.trim() ? body.contractor.trim() : null;
  const color = typeof body?.color === "string" && body.color.trim() ? body.color.trim() : null;

  if (
    code &&
    (await queryOne(`SELECT id FROM projects WHERE code = ? AND org_id = ?`, code, user.orgId))
  )
    return NextResponse.json({ error: `Mã dự án "${code}" đã tồn tại` }, { status: 409 });

  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
  const kq = await ghiNeuConQuyen(
    () => CAN.manageProjects(user.role),
    () =>
      insertId(
        `INSERT INTO projects (name, code, investor, contractor, color, org_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        name,
        code,
        investor,
        contractor,
        color,
        user.orgId,
      ),
  );
  if (!kq.ok) return NextResponse.json({ error: "Chỉ Admin mới tạo được dự án" }, { status: 403 });
  const id = kq.value;
  return NextResponse.json({ id }, { status: 201 });
}
