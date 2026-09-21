import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { synthesizeSwarmDebate } from "@/lib/ky-thuat/engineering-swarm";
import { phanHoiLoi } from "@/lib/nen/loi";

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
  const blocked = await assertModuleEnabled("engineering-swarm", projectId);
  if (blocked) return blocked;

  try {
    const updated = await synthesizeSwarmDebate(projectId, params.id);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
