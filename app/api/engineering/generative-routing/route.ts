import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import {
  solve3DGenerativeRoute,
  saveGenerativeRoutingRun,
  listGenerativeRoutingRuns,
  GenerativeRoutingInput,
} from "@/lib/ky-thuat/engineering-generative-routing";

export const dynamic = "force-dynamic";

// GET /api/engineering/generative-routing — Lấy lịch sử các đợt giải tuyến 3D
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringWorkflows(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem dữ liệu giải tuyến 3D" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-nextgen-apex", projectId);
  if (blocked) return blocked;

  try {
    const runs = await listGenerativeRoutingRuns(projectId);
    return NextResponse.json({ runs, totalCount: runs.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/generative-routing — Chạy thuật toán 3D A* Generative Routing
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createEngineeringWorkflow(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực thi Generative Routing" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-nextgen-apex", projectId);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const input: GenerativeRoutingInput = {
      routingCode: body.routingCode || `ROUTE-GEN-${Date.now().toString(36).toUpperCase()}`,
      systemType: body.systemType || "PLUMBING_DRAINAGE_GRAVITY",
      startPoint: body.startPoint || { x: 1000, y: 2000, z: 3200 },
      endPoint: body.endPoint || { x: 9000, y: 2000, z: 3000 },
      nominalSizeMm: parseFloat(body.nominalSizeMm) || 100.0,
      flowRateLps: parseFloat(body.flowRateLps) || 5.0,
      obstacles: body.obstacles || [
        {
          id: "BEAM-01",
          name: "Dầm D500x300 Trục 3",
          type: "BEAM",
          min: { x: 4500, y: 0, z: 2800 },
          max: { x: 5500, y: 4000, z: 3300 },
          beamSpan: { startX: 0, endX: 10000, heightMm: 500 },
        },
      ],
    };

    const result = solve3DGenerativeRoute(input);
    const saved = await saveGenerativeRoutingRun(projectId, result, user.id);

    return NextResponse.json({
      success: true,
      runId: saved.id,
      result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
