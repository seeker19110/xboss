import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getAgentSession } from "@/lib/engineering-agents";

export const dynamic = "force-dynamic";

// GET /api/engineering/agent-sessions/:id — phiên + claim từng agent + xung đột kèm đề xuất
// phân xử (phương pháp + lý do + có cần người quyết không).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringAgentSessions(user.role))
    return NextResponse.json({ error: "Không có quyền xem phiên phối hợp agent" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const { id } = await params;
  const detail = await getAgentSession(projectId, id);
  if (!detail) return NextResponse.json({ error: "Không tìm thấy phiên" }, { status: 404 });
  return NextResponse.json(detail);
}
