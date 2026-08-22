import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  processMepfAutoTakeoff,
  saveMepfTakeoffRun,
  listMepfTakeoffRuns,
  MepfDiscipline,
  MepfSymbolDetection,
  MepfSegment,
} from "@/lib/engineering-mepf-takeoff";

export const dynamic = "force-dynamic";

// GET /api/engineering/mepf-takeoff — Danh sách các phiên bóc tách khối lượng AI
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem MEPF Takeoff" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const runs = await listMepfTakeoffRuns(projectId);
    return NextResponse.json({ runs, totalCount: runs.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/mepf-takeoff — Chạy bóc tách khối lượng AI & đối soát BOQ
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền chạy MEPF Takeoff" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();

    if (body.action === "generative_route") {
      const { solveGenerativeMepfRoute } = await import("@/lib/engineering-mepf-takeoff");
      if (!body.startPoint || !body.endPoint) {
        return NextResponse.json(
          { error: "Vui lòng cung cấp tọa độ điểm đầu (startPoint) và điểm cuối (endPoint)" },
          { status: 400 },
        );
      }
      const startPoint = body.startPoint;
      const endPoint = body.endPoint;
      const obstacles = Array.isArray(body.obstacles) ? body.obstacles : [];
      const solution = solveGenerativeMepfRoute(
        startPoint,
        endPoint,
        obstacles,
        body.pipeDiameterMm || 100,
      );
      return NextResponse.json({ success: true, solution });
    }

    const discipline: MepfDiscipline = body.discipline || "all";
    const drawingName: string = body.drawingName || "Bản vẽ MEPF Mặt bằng";
    const sessionCode: string =
      body.sessionCode || `TKOFF-${Date.now().toString(36).toUpperCase()}`;
    const symbols: MepfSymbolDetection[] = body.symbols || [];
    const segments: MepfSegment[] = body.segments || [];
    const contractBoqItems = body.contractBoqItems || [];
    const drawingId = typeof body.drawingId === "number" ? body.drawingId : null;

    const result = processMepfAutoTakeoff(
      sessionCode,
      discipline,
      drawingName,
      symbols,
      segments,
      contractBoqItems,
    );

    const saved = await saveMepfTakeoffRun(projectId, user.id, drawingId, result);

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
