import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listSwarmDebates, createSwarmDebate, SwarmAgentRole } from "@/lib/engineering-swarm";

export const dynamic = "force-dynamic";

// GET /api/engineering/swarm/debates — Lấy danh sách các phiên Swarm Debate
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringAgentSessions(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem phiên tranh biện Swarm" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const debates = await listSwarmDebates(projectId);
    return NextResponse.json(debates);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/swarm/debates — Khởi tạo một phiên Swarm Debate mới
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringAgentSessions(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo phiên Swarm" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const { topic, triggerEvent, participatingAgents } = body;

    if (!topic || !triggerEvent) {
      return NextResponse.json({ error: "Cần cung cấp topic và triggerEvent" }, { status: 422 });
    }

    const created = await createSwarmDebate(
      projectId,
      topic,
      triggerEvent,
      participatingAgents as SwarmAgentRole[] | undefined,
    );

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
