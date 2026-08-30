import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  conductMultiAgentDebate,
  saveAgentDebateSession,
  listAgentDebateSessions,
  DebateTopicInput,
} from "@/lib/ky-thuat/engineering-multi-agent-copilot";

export const dynamic = "force-dynamic";

// GET /api/engineering/multi-agent-copilot — Danh sách các phiên tranh luận Co-Pilot
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem phiên Co-Pilot" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listAgentDebateSessions(projectId);
    return NextResponse.json({ sessions: list, totalCount: list.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/multi-agent-copilot — Kích hoạt phiên tranh luận Đa Agent
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền điều hành Co-Pilot" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const sessionCode = body.sessionCode || `DEBATE-${Date.now().toString(36).toUpperCase()}`;
    const input: DebateTopicInput = {
      topicTitle: body.topicTitle || "Xử lý xung đột dầm kết cấu trục C4 & đường ống Chiller DN200",
      issueDescription:
        body.issueDescription ||
        "Dầm bê tông hạ cốt 350mm chặn ngang hướng tuyến ống nước lạnh Chiller chính.",
      discipline: body.discipline || "hvac",
      costImpactVndEstimated: parseFloat(body.costImpactVndEstimated) || 45000000,
      scheduleImpactDaysEstimated: parseFloat(body.scheduleImpactDaysEstimated) || 2,
    };

    const resolution = conductMultiAgentDebate(sessionCode, input);
    const saved = await saveAgentDebateSession(projectId, resolution);

    return NextResponse.json({
      success: true,
      sessionId: saved.id,
      resolution,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
