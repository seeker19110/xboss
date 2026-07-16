import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { NORM_OVER_THRESHOLD_PCT, overNormItems } from "@/lib/norms";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/norms/over?thresholdPct= — danh sách hạng mục vượt định mức vật tư toàn dự án
// (cảnh báo vận hành công trường, không phải số tiền — mở cho mọi user thao tác vật tư).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role === "cdt" || user.role === "viewer")
    return NextResponse.json({ error: "Không có quyền xem" }, { status: 403 });

  const raw = req.nextUrl.searchParams.get("thresholdPct");
  const thresholdPct = raw ? Number(raw) : NORM_OVER_THRESHOLD_PCT;
  if (!Number.isFinite(thresholdPct) || thresholdPct < 0)
    return NextResponse.json({ error: "thresholdPct không hợp lệ" }, { status: 422 });

  // Lọc theo dự án đang chọn để tránh rò rỉ chéo dự án (M22+); null = không lọc.
  const projectId = await getCurrentProjectId(user);
  const items = await overNormItems(thresholdPct, projectId ?? undefined);
  return NextResponse.json({ items });
}
