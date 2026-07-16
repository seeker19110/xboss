import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";
import { getScheduleControlData } from "@/lib/schedule-control";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/schedule-control?system=<systems.code> — trang "Đường găng & Chậm tiến độ" (M36 PR3).
// Mọi vai trò đăng nhập xem được (view thuần đọc, như /api/gantt). Logic dựng dữ liệu ở
// `lib/schedule-control.ts` để test tích hợp gọi thẳng, không cần dựng NextRequest/cookie.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const systemId = await resolveSystemId(req.nextUrl.searchParams.get("system"));
  // Lọc theo dự án đang chọn để tránh rò rỉ chéo dự án (M22+); null = không lọc.
  const projectId = await getCurrentProjectId(user);
  const data = await getScheduleControlData(systemId, projectId ?? undefined);
  return NextResponse.json(data);
}
