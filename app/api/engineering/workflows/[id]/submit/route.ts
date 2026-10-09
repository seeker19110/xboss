import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { submitForApproval, WorkflowError } from "@/lib/ky-thuat/engineering-workflow";

export const dynamic = "force-dynamic";

// POST /api/engineering/workflows/:id/submit — draft → validating → awaiting_approval.
// PROFILE-A (không side effect, không gate) đi thẳng tới approved, ghi rõ lý do trong event.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createEngineeringWorkflow(user.role))
    return NextResponse.json({ error: "Không có quyền trình duyệt workflow" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const { id } = await params;
  try {
    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.createEngineeringWorkflow(user.role),
      () => submitForApproval(projectId, id, user.id),
    );
    if (!kq.ok)
      return NextResponse.json({ error: "Không có quyền trình duyệt workflow" }, { status: 403 });
  } catch (err) {
    if (err instanceof WorkflowError)
      return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
