import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { runBiddingAnalysis } from "@/lib/ky-thuat/engineering-bidding-matrix";

export const dynamic = "force-dynamic";

// POST /api/engineering/bidding/analyze
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực hiện phân tích đấu thầu" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (!body.packageId) {
      return NextResponse.json({ error: "Thiếu tham số packageId" }, { status: 400 });
    }

    const result = await runBiddingAnalysis(projectId, body.packageId, user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
