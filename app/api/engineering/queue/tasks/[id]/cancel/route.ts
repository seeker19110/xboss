import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { cancelAsyncTask } from "@/lib/engineering-task-queue";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền hủy tác vụ" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const taskId = params.id;
  if (!taskId) return NextResponse.json({ error: "Thiếu Task ID" }, { status: 400 });

  try {
    const cancelled = await cancelAsyncTask(taskId, projectId);
    if (!cancelled) {
      return NextResponse.json(
        { error: "Không tìm thấy tác vụ hoặc tác vụ đã kết thúc/hủy trước đó" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Đã hủy thành công tác vụ ${taskId}`,
      taskId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
