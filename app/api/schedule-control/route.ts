import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";
import { getScheduleControlData } from "@/lib/schedule-control";

export const dynamic = "force-dynamic";

// GET /api/schedule-control?system=<systems.code> — trang "Đường găng & Chậm tiến độ" (M36 PR3).
// Mọi vai trò đăng nhập xem được (view thuần đọc, như /api/gantt). Logic dựng dữ liệu ở
// `lib/schedule-control.ts` để test tích hợp gọi thẳng, không cần dựng NextRequest/cookie.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const systemId = await resolveSystemId(req.nextUrl.searchParams.get("system"));
  const data = await getScheduleControlData(systemId);
  return NextResponse.json(data);
}
