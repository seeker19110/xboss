import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, canTouchTask, canTouchPackage } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { taskInProject, validateInspectionResults, workPackageInProject } from "@/lib/qaqc";

export const dynamic = "force-dynamic";

type InspectionRow = {
  id: number;
  checklistId: number;
  checklistName: string;
  taskId: number | null;
  taskCode: string | null;
  workPackageId: number | null;
  packageCode: string | null;
  results: unknown;
  status: string;
  inspectedByName: string | null;
  approvedByName: string | null;
  inspectedAt: string;
};

// GET /api/qc/inspections?status=&taskId=&workPackageId= — danh sách lần kiểm tra.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  const taskId = req.nextUrl.searchParams.get("taskId");
  const workPackageId = req.nextUrl.searchParams.get("workPackageId");

  const conds: string[] = [];
  const values: unknown[] = [];
  if (status) {
    conds.push("i.status = ?");
    values.push(status);
  }
  if (taskId) {
    conds.push("i.task_id = ?");
    values.push(parseInt(taskId));
  }
  if (workPackageId) {
    conds.push("i.work_package_id = ?");
    values.push(parseInt(workPackageId));
  }

  // qc_inspections không có project_id riêng (ADR-0004) — suy qua task/work_package
  // để chặn rò rỉ dữ liệu xuyên dự án (M22).
  const projectId = await getCurrentProjectId(user);
  if (projectId != null) {
    conds.push("tw.project_id = ?");
    values.push(projectId);
  }

  const rows = await query<InspectionRow>(
    `SELECT i.id, i.checklist_id AS "checklistId", c.name AS "checklistName",
            i.task_id AS "taskId", t.code AS "taskCode",
            i.work_package_id AS "workPackageId", wp.code AS "packageCode",
            i.results, i.status,
            iu.name AS "inspectedByName", au.name AS "approvedByName",
            i.inspected_at AS "inspectedAt"
       FROM qc_inspections i
       JOIN qc_checklists c ON c.id = i.checklist_id
       LEFT JOIN tasks t ON t.id = i.task_id
       LEFT JOIN work_packages wp ON wp.id = i.work_package_id
       LEFT JOIN work_packages wp2 ON wp2.id = t.package_id
       LEFT JOIN sheet_types st ON st.id = COALESCE(wp.sheet_type_id, wp2.sheet_type_id)
       LEFT JOIN towers tw ON tw.id = st.tower_id
      ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
      ORDER BY i.inspected_at DESC, i.id DESC`,
    ...values,
  );
  return NextResponse.json({ inspections: rows });
}

// POST /api/qc/inspections — tạo lần kiểm tra mới (subcon tự kiểm task/nhóm được giao).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const checklistId = Number(body?.checklistId);
  const taskId = body?.taskId != null ? Number(body.taskId) : null;
  const workPackageId = body?.workPackageId != null ? Number(body.workPackageId) : null;

  if (!Number.isInteger(checklistId))
    return NextResponse.json({ error: "Thiếu checklist" }, { status: 422 });
  if (!taskId && !workPackageId)
    return NextResponse.json({ error: "Phải gắn task hoặc nhóm công việc" }, { status: 422 });

  if (taskId && !(await canTouchTask(user, taskId)))
    return NextResponse.json({ error: "Bạn không được kiểm task này" }, { status: 403 });
  if (workPackageId && !(await canTouchPackage(user, workPackageId)))
    return NextResponse.json({ error: "Bạn không được kiểm nhóm công việc này" }, { status: 403 });

  // qc_inspections không có project_id riêng (ADR-0004) — suy qua task/work_package (M22).
  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo lần kiểm tra" }, { status: 422 });
  if (taskId && !(await taskInProject(taskId, projectId)))
    return NextResponse.json({ error: "Công việc không thuộc dự án đang chọn" }, { status: 422 });
  if (workPackageId && !(await workPackageInProject(workPackageId, projectId)))
    return NextResponse.json(
      { error: "Nhóm công việc không thuộc dự án đang chọn" },
      { status: 422 },
    );

  const checklist = await queryOne(
    `SELECT id FROM qc_checklists WHERE id = ? AND project_id = ?`,
    checklistId,
    projectId,
  );
  if (!checklist) return NextResponse.json({ error: "Không tìm thấy checklist" }, { status: 404 });

  const results = body?.results ?? [];
  if (!validateInspectionResults(results))
    return NextResponse.json({ error: "Kết quả kiểm tra không hợp lệ" }, { status: 422 });

  const status = ["draft", "submitted"].includes(body?.status) ? body.status : "draft";

  const id = await insertId(
    `INSERT INTO qc_inspections (checklist_id, task_id, work_package_id, results, status, inspected_by)
     VALUES (?, ?, ?, ?::jsonb, ?, ?)`,
    checklistId,
    taskId,
    workPackageId,
    JSON.stringify(results),
    status,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
