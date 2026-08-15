import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  transitionWorkflow,
  WorkflowError,
  WORKFLOW_STATES,
  type WorkflowState,
} from "@/lib/engineering-workflow";

export const dynamic = "force-dynamic";

// POST /api/engineering/workflows/:id/transition { to, reason? } — chuyển trạng thái thủ
// công (executing/validating_result/completed/failed/rolled_back/cancelled...).
//
// RANH GIỚI QUAN TRỌNG: hệ thống KHÔNG tự thực thi side effect nghiệp vụ. "executing" ở đây
// nghĩa là NGƯỜI xác nhận đang/đã làm việc đó ngoài đời, hệ chỉ ghi nhận + audit. Autonomy
// thật phải được cấp tường minh theo §26 (workflow type/risk class/rollback capability) —
// chưa có cơ chế cấp đó nên chưa có executor tự động.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createEngineeringWorkflow(user.role))
    return NextResponse.json(
      { error: "Không có quyền chuyển trạng thái workflow" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const to = body?.to as WorkflowState | undefined;
  if (!to || !(WORKFLOW_STATES as readonly string[]).includes(to))
    return NextResponse.json({ error: "Trạng thái đích không hợp lệ" }, { status: 422 });
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 2000) : undefined;

  const { id } = await params;
  try {
    await transitionWorkflow(projectId, id, user.id, to, reason);
  } catch (err) {
    if (err instanceof WorkflowError)
      return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
