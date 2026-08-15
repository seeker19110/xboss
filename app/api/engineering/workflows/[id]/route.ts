import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getWorkflow } from "@/lib/engineering-workflow";

export const dynamic = "force-dynamic";

// GET /api/engineering/workflows/:id — workflow + gate + dòng thời gian sự kiện (§11 audit).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringWorkflows(user.role))
    return NextResponse.json({ error: "Không có quyền xem workflow kỹ thuật" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const { id } = await params;
  const found = await getWorkflow(projectId, id);
  if (!found) return NextResponse.json({ error: "Không tìm thấy workflow" }, { status: 404 });
  return NextResponse.json(found);
}
