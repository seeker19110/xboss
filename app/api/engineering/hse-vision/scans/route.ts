import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { listHseVisionScans } from "@/lib/engineering-hse-vision";

export const dynamic = "force-dynamic";

// GET /api/engineering/hse-vision/scans
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem danh sách quét an toàn HSE" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);

  try {
    const scans = await listHseVisionScans(projectId);
    return NextResponse.json({ success: true, data: scans });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
