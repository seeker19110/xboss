import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { bridgeTaskResultToEngineering } from "@/lib/ky-thuat/engineering-worker-bridge";

export const dynamic = "force-dynamic";

// POST /api/engineering/queue/tasks/[id]/bridge
// Chuyển đổi kết quả của một async task hoàn tất thành các Engineering Objects,
// Suggestion ENG-2 và Luồng phê duyệt Gate 0 trong ENG-3 Workflow OS.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực hiện chuyển đổi đối tượng kỹ thuật" },
      { status: 403 },
    );
  }

  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "ID tác vụ không hợp lệ" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok) {
      return NextResponse.json({ error: "Không có quyền thao tác trên dự án này" }, { status: 403 });
    }
    const projectId = chotDuAn.projectId;

    const result = await bridgeTaskResultToEngineering({
      taskId: id,
      projectId,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
