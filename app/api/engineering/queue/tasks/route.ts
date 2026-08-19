import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { enqueueAsyncTask, listAsyncTasks } from "@/lib/engineering-task-queue";

export const dynamic = "force-dynamic";

// GET /api/engineering/queue/tasks — Danh sách tác vụ trong hàng đợi
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem hàng đợi" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    const tasks = await listAsyncTasks(projectId, { status, limit, offset });
    return NextResponse.json({ tasks, totalCount: tasks.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/queue/tasks — Nạp tác vụ mới vào hàng đợi
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo tác vụ hàng đợi" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const taskType = body.taskType || "batch_spatial_clash_analysis";
    const payload = body.payload || {};
    const priority = typeof body.priority === "number" ? body.priority : 10;
    const maxRetries = typeof body.maxRetries === "number" ? body.maxRetries : 3;

    const task = await enqueueAsyncTask({
      projectId,
      taskType,
      payload,
      priority,
      maxRetries,
      createdBy: Number(user.id),
    });

    return NextResponse.json({
      success: true,
      task,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
