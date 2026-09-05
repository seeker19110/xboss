import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import {
  addSwarmArgument,
  getSwarmDebateById,
  SwarmAgentRole,
  DebateStance,
} from "@/lib/ky-thuat/engineering-swarm";

export const dynamic = "force-dynamic";

// POST /api/engineering/swarm/debates/:id/arguments — Thêm lập luận từ Agent chuyên ngành
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringAgentSessions(user.role)) {
    return NextResponse.json({ error: "Không có quyền thêm lập luận Swarm" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-swarm", projectId);
  if (blocked) return blocked;

  try {
    // BUG THẬT đã vá: trước đây route gọi thẳng addSwarmArgument(params.id, ...) không hề
    // kiểm phiên tranh biện có thuộc dự án đang chọn hay không — user dự án A có thể ghi
    // lập luận vào debate của dự án B (route anh em debates/[id]/route.ts ĐÃ lọc đúng qua
    // getSwarmDebateById(projectId, id), route này thì không). Xác nhận tồn tại + đúng dự
    // án trước khi ghi, bám khuôn các route :id khác của cụm swarm.
    const debate = await getSwarmDebateById(projectId, params.id);
    if (!debate) {
      return NextResponse.json({ error: "Không tìm thấy phiên tranh biện" }, { status: 404 });
    }

    const body = await req.json();
    const { agentRole, stance, argumentText, citedClauses, impactAssessment } = body;

    if (!agentRole || !stance || !argumentText) {
      return NextResponse.json(
        { error: "Cần cung cấp agentRole, stance và argumentText" },
        { status: 422 },
      );
    }

    const created = await addSwarmArgument(params.id, {
      agent_role: agentRole as SwarmAgentRole,
      stance: stance as DebateStance,
      argument_text: argumentText,
      cited_clauses: citedClauses,
      impact_assessment: impactAssessment,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
