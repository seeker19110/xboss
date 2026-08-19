import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getSwarmDebateById } from "@/lib/engineering-swarm";

export const dynamic = "force-dynamic";

// GET /api/engineering/swarm/debates/:id — Chi tiết phiên tranh biện và toàn bộ lập luận
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringAgentSessions(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem phiên Swarm" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const debate = await getSwarmDebateById(projectId, params.id);
    if (!debate) {
      return NextResponse.json({ error: "Không tìm thấy phiên tranh biện" }, { status: 404 });
    }
    return NextResponse.json(debate);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
