import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { synthesizeSwarmDebate } from "@/lib/ky-thuat/engineering-swarm";

export const dynamic = "force-dynamic";

// POST /api/engineering/swarm/debates/:id/synthesize — Tổng hợp đồng thuận & hòa giải ý kiến
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.resolveEngineeringConflicts(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền hòa giải / chốt phiên Swarm" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const updated = await synthesizeSwarmDebate(projectId, params.id);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
