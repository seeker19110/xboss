import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listHseVisionScans } from "@/lib/ky-thuat/engineering-hse-vision";

export const dynamic = "force-dynamic";

// GET /api/engineering/hse-vision/scans
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem danh sách quét an toàn HSE" },
      { status: 403 },
    );
  }

  // Route chỉ đọc: dự án suy từ phiên (cookie xboss_project), không nhận từ query —
  // trước đây `?projectId=<B>` đọc chéo được scan HSE của dự án khác (IDOR).
  const projectId = (await getCurrentProjectId(user)) || 1;

  try {
    const scans = await listHseVisionScans(projectId);
    return NextResponse.json({ success: true, data: scans });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
