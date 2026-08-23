import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listAgentSessions } from "@/lib/ky-thuat/engineering-agents";

export const dynamic = "force-dynamic";

// GET /api/engineering/agent-sessions?status= — danh sách phiên phối hợp đa agent (ENG-4).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringAgentSessions(user.role))
    return NextResponse.json({ error: "Không có quyền xem phiên phối hợp agent" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ sessions: [] });

  const status = new URL(req.url).searchParams.get("status") || undefined;
  return NextResponse.json({ sessions: await listAgentSessions(projectId, { status }) });
}
