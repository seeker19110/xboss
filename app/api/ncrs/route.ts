import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { CAN, getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { inspectionInProject, listNcrs, taskInProject } from "@/lib/ky-thuat/qaqc";
import { nextSeqCode, withUniqueRetry } from "@/lib/ha-tang/seqcode";

export const dynamic = "force-dynamic";

// GET /api/ncrs?status=&assignedTo=&taskId= — danh sách NCR (vòng đời mở → đóng),
// scoped theo dự án đang chọn (M22).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") || undefined;
  const assignedTo = req.nextUrl.searchParams.get("assignedTo");
  const taskId = req.nextUrl.searchParams.get("taskId");

  const projectId = await getCurrentProjectId(user);
  const ncrs =
    projectId != null
      ? await listNcrs({
          status,
          assignedTo: assignedTo ? parseInt(assignedTo) : undefined,
          taskId: taskId ? parseInt(taskId) : undefined,
          projectId,
        })
      : [];
  return NextResponse.json({ ncrs });
}

// POST /api/ncrs — ghi nhận điểm không phù hợp mới (mọi vai trò thao tác), gán
// project_id = dự án đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // AUD-SEC-004: vai trò chỉ-xem không ghi nhận NCR (đối xứng PATCH /api/ncrs/:id).
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền ghi nhận NCR" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để ghi nhận NCR" }, { status: 422 });

  const body = await req.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) return NextResponse.json({ error: "Thiếu mô tả NCR" }, { status: 422 });

  const taskId = body?.taskId != null ? Number(body.taskId) : null;
  const inspectionId = body?.inspectionId != null ? Number(body.inspectionId) : null;
  const assignedTo = body?.assignedTo != null ? Number(body.assignedTo) : null;
  const dueDate = typeof body?.dueDate === "string" && body.dueDate ? body.dueDate : null;

  // AUD-SEC-005: tham chiếu phải thuộc dự án/tổ chức đang chọn — trước đây ghi thẳng id client
  // gửi, GET /api/ncrs JOIN tasks trả về mã task của dự án/org khác (dò được bằng id tăng dần).
  if (taskId != null && !(Number.isSafeInteger(taskId) && (await taskInProject(taskId, projectId))))
    return NextResponse.json({ error: "Công việc không thuộc dự án đang chọn" }, { status: 422 });
  if (
    inspectionId != null &&
    !(Number.isSafeInteger(inspectionId) && (await inspectionInProject(inspectionId, projectId)))
  )
    return NextResponse.json(
      { error: "Lần kiểm tra không thuộc dự án đang chọn" },
      { status: 422 },
    );
  if (assignedTo != null) {
    const nguoi = Number.isSafeInteger(assignedTo)
      ? await queryOne<{ id: number }>(
          `SELECT id FROM users WHERE id = ? AND org_id = ?`,
          assignedTo,
          user.orgId,
        )
      : undefined;
    if (!nguoi)
      return NextResponse.json({ error: "Người được giao không thuộc tổ chức" }, { status: 422 });
  }

  const id = await withUniqueRetry(async () => {
    const code = await nextSeqCode("ncrs", "code", "NCR-", 4);
    return insertId(
      `INSERT INTO ncrs (code, task_id, inspection_id, description, assigned_to, due_date, created_by, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      code,
      taskId,
      inspectionId,
      description,
      assignedTo,
      dueDate,
      user.id,
      projectId,
    );
  });

  return NextResponse.json({ id }, { status: 201 });
}
