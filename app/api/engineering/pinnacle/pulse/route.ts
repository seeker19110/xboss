import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  calculatePinnacleApexMetrics,
  recordApexSystemPulse,
  getLatestApexSystemPulse,
  dispatchApexCommandAction,
} from "@/lib/ky-thuat/engineering-pinnacle-synergy";

export const dynamic = "force-dynamic";

// GET /api/engineering/pinnacle/pulse - Lấy snapshot Apex Pulse mới nhất hoặc tính toán trực tiếp
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền truy cập hệ thống Apex Cockpit" },
      { status: 403 },
    );
  }

  // Route chỉ đọc: dự án suy từ phiên (cookie xboss_project), không nhận từ query.
  const projectId = (await getCurrentProjectId(user)) || 1;

  try {
    let latest = await getLatestApexSystemPulse(projectId);
    if (!latest) {
      // Tự động sinh snapshot ban đầu nếu chưa có
      latest = await recordApexSystemPulse(projectId);
    }
    return NextResponse.json({ success: true, data: latest });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/pinnacle/pulse - Kích hoạt quét làm mới chỉ số hoặc điều phối lệnh hợp nhất
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực thi lệnh Apex Cockpit" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok) {
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    }
    const projectId = chotDuAn.projectId;

    if (body.actionType) {
      const action = await dispatchApexCommandAction(
        projectId,
        String(body.actionType),
        body.payload || {},
        user.id,
      );
      const updatedPulse = await recordApexSystemPulse(projectId);
      return NextResponse.json({ success: true, data: { action, pulse: updatedPulse } });
    }

    const newPulse = await recordApexSystemPulse(projectId, body.metrics);
    return NextResponse.json({ success: true, data: newPulse });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
