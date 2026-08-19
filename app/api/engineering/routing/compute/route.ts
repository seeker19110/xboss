import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { findOptimalRoute3D, recommendClashResolution } from "@/lib/engineering-auto-routing";

export const dynamic = "force-dynamic";

// POST /api/engineering/routing/compute
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền tính toán tuyến đường" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { start, end, obstacles = [], tradeA, tradeB, location } = body;

    if (!start || !end) {
      return NextResponse.json(
        { error: "Thiếu toạ độ điểm đầu (start) hoặc điểm cuối (end)" },
        { status: 422 },
      );
    }

    const route = findOptimalRoute3D(start, end, obstacles);
    let clashAdvice = null;
    if (tradeA && tradeB) {
      clashAdvice = recommendClashResolution(tradeA, tradeB, location || "vị trí giao cắt");
    }

    return NextResponse.json({
      success: true,
      data: {
        route,
        clashAdvice,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
