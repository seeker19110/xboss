import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  calculatePinnacleApexMetrics,
  recordApexSystemPulse,
  getLatestApexSystemPulse,
  dispatchApexCommandAction,
} from "@/lib/engineering-pinnacle-synergy";

export const dynamic = "force-dynamic";

// GET /api/engineering/pinnacle/pulse - Lấy snapshot Apex Pulse mới nhất hoặc tính toán trực tiếp
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền truy cập hệ thống Apex Cockpit" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(
    searchParams.get("projectId") || (user as { projectId?: number }).projectId || 1,
  );

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
    const projectId = Number(body.projectId || (user as { projectId?: number }).projectId || 1);

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
