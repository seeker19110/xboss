import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  assignSheetManager,
  assignPackage,
  assignTask,
  userWorkloads,
} from "@/lib/tien-do/assignments";
import {
  sheetTypeProjectId,
  packageProjectId,
  taskProjectId,
} from "@/lib/tien-do/workpackages";

export const dynamic = "force-dynamic";

// GET /api/admin/assignments?unassignedOnly=1 → cây phân công: hệ → nhóm → task (Admin/PM).
// Kèm workload từng user (total tasks đang làm + số đang trễ).
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.assign(me.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới xem được phân công" }, { status: 403 });

  const onlyUnassigned = req.nextUrl.searchParams.get("unassignedOnly") === "1";

  const projectId = await getCurrentProjectId(me);
  if (projectId == null)
    return NextResponse.json({ sheets: [], packages: [], tasks: [], workload: {} });

  type SheetRow = {
    id: number;
    code: string;
    name: string;
    slug: string;
    managerId: number | null;
    managerName: string | null;
  };
  type PkgRow = {
    id: number;
    sheetId: number;
    code: string;
    name: string;
    floorLabel: string | null;
    assignedTo: number | null;
    assignedManual: boolean;
    assigneeName: string | null;
  };
  type TaskRow = {
    id: number;
    packageId: number;
    code: string;
    name: string;
    assignedTo: number | null;
    assignedManual: boolean;
    assigneeName: string | null;
  };

  const sheets = await query<SheetRow>(
    `SELECT st.id, st.code, st.name, st.slug, st.manager_id AS "managerId", u.name AS "managerName"
       FROM sheet_types st LEFT JOIN users u ON st.manager_id = u.id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE tw.project_id = ?
      ORDER BY st.id`,
    projectId,
  );
  const packages = await query<PkgRow>(
    `SELECT wp.id, wp.sheet_type_id AS "sheetId", wp.code, wp.name, wp.floor_label AS "floorLabel",
            wp.assigned_to AS "assignedTo", wp.assigned_manual AS "assignedManual", u.name AS "assigneeName"
       FROM work_packages wp LEFT JOIN users u ON wp.assigned_to = u.id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE tw.project_id = ?
      ORDER BY wp.sheet_type_id, wp.sort_order, wp.id`,
    projectId,
  );
  const tasks = await query<TaskRow>(
    `SELECT t.id, t.package_id AS "packageId", t.code, t.name,
            t.assigned_to AS "assignedTo", t.assigned_manual AS "assignedManual", u.name AS "assigneeName"
       FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE tw.project_id = ?
      ORDER BY t.package_id, t.sort_order, t.id`,
    projectId,
  );

  const wl = await userWorkloads(projectId);
  const workload = Object.fromEntries([...wl.entries()].map(([id, v]) => [id, v]));

  if (onlyUnassigned) {
    const unassignedTasks = tasks.filter((t) => !t.assignedTo);
    const unassignedPkgs = packages.filter((p) => !p.assignedTo);
    const pkgIds = new Set(unassignedTasks.map((t) => t.packageId));
    const sheetIds = new Set([
      ...unassignedPkgs.map((p) => p.sheetId),
      ...packages.filter((p) => pkgIds.has(p.id)).map((p) => p.sheetId),
    ]);
    return NextResponse.json({
      sheets: sheets.filter((s) => sheetIds.has(s.id)),
      packages: packages.filter((p) => sheetIds.has(p.sheetId)),
      tasks: unassignedTasks,
      workload,
    });
  }

  return NextResponse.json({ sheets, packages, tasks, workload });
}

// POST /api/admin/assignments  body: { level: 'sheet'|'package'|'task', id, userId }
// userId = null: với sheet → bỏ quản lý hệ; với nhóm/task → đưa về kế thừa từ cấp trên.
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.assign(me.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới được phân công" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const level = String(body.level ?? "");
  const id = Number(body.id);
  const userId = body.userId === null || body.userId === undefined ? null : Number(body.userId);
  if (!["sheet", "package", "task"].includes(level) || isNaN(id))
    return NextResponse.json({ error: "Tham số không hợp lệ (level / id)" }, { status: 400 });
  if (userId !== null && isNaN(userId))
    return NextResponse.json({ error: "userId không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(me);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để phân công" }, { status: 422 });

  if (userId !== null) {
    // Cách ly tổ chức (Đợt 6, Việc G): users.org_id — thiếu lọc thì gán được người dùng
    // của tổ chức khác làm quản lý hệ/nhóm/task (id đoán được), cùng lớp lỗi đã vá ở
    // app/api/users/[id]/route.ts (Đợt 5, M54 GĐ1 PR2).
    const u = await queryOne(`SELECT id FROM users WHERE id = ? AND org_id = ?`, userId, me.orgId);
    if (!u) return NextResponse.json({ error: "Người dùng không tồn tại" }, { status: 404 });
  }

  // Đối chiếu dự án của thực thể (id đoán được, đợt 6 Việc I) — không chỉ kiểm tồn tại như
  // trước, mà phải thuộc đúng dự án đang chọn mới cho phân công.
  const projectIdOf =
    level === "sheet" ? sheetTypeProjectId : level === "package" ? packageProjectId : taskProjectId;
  const targetProjectId = await projectIdOf(id);
  if (targetProjectId !== projectId)
    return NextResponse.json({ error: "Đối tượng không tồn tại" }, { status: 404 });

  if (level === "sheet") await assignSheetManager(id, userId, me.id);
  else if (level === "package") await assignPackage(id, userId, me.id);
  else await assignTask(id, userId, me.id);

  return NextResponse.json({ ok: true });
}
