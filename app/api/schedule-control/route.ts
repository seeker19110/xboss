import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveDisciplineId } from "@/lib/disciplines";
import { getScheduleControlData } from "@/lib/schedule-control";

export const dynamic = "force-dynamic";

// GET /api/schedule-control?he=<disciplines.code> — trang "Đường găng & Chậm tiến độ" (M36 PR3).
// Mọi vai trò đăng nhập xem được (view thuần đọc, như /api/gantt). Logic dựng dữ liệu ở
// `lib/schedule-control.ts` để test tích hợp gọi thẳng, không cần dựng NextRequest/cookie.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const disciplineId = await resolveDisciplineId(req.nextUrl.searchParams.get("he"));
  const data = await getScheduleControlData(disciplineId);
  return NextResponse.json(data);
}
