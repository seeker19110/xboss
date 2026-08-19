import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

interface AsyncTaskStatus {
  id: string;
  task_type: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress_percent: number;
  worker_id: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/engineering/queue/tasks/[id]/progress
// Trả về trạng thái và tiến độ hiện tại của một tác vụ MEPF cụ thể.
// Client-side polling mỗi 2–3s để hiển thị progress bar realtime.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem tiến độ tác vụ" }, { status: 403 });
  }

  const { id } = await params;

  // Validate UUID format để tránh SQL injection (dù đã dùng parameterized query)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "ID tác vụ không hợp lệ" }, { status: 400 });
  }

  try {
    const task = await queryOne<AsyncTaskStatus>(
      `SELECT id, task_type, status, progress_percent, worker_id,
              result, error_message, created_at, updated_at
       FROM engineering_async_tasks
       WHERE id = ?`,
      id,
    );

    if (!task) {
      return NextResponse.json({ error: "Không tìm thấy tác vụ" }, { status: 404 });
    }

    return NextResponse.json({
      id: task.id,
      taskType: task.task_type,
      status: task.status,
      progressPercent: Number(task.progress_percent),
      workerId: task.worker_id,
      result: task.result,
      errorMessage: task.error_message,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      // Tính elapsed time để UI hiển thị "đã chạy X giây"
      elapsedMs:
        task.status === "processing" ? Date.now() - new Date(task.created_at).getTime() : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
