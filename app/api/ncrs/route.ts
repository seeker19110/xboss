import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listNcrs } from "@/lib/qaqc";
import { nextSeqCode, withUniqueRetry } from "@/lib/seqcode";

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
