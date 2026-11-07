import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { resolveSystemId } from "@/lib/tien-do/systems";
import { getScheduleControlData } from "@/lib/tien-do/schedule-control";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// GET /api/schedule-control?system=<systems.code> — trang "Đường găng & Chậm tiến độ" (M36 PR3).
// Mọi vai trò đăng nhập xem được (view thuần đọc, như /api/gantt). Logic dựng dữ liệu ở
// `lib/schedule-control.ts` để test tích hợp gọi thẳng, không cần dựng NextRequest/cookie.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const systemId = await resolveSystemId(req.nextUrl.searchParams.get("system"));
  // AUDIT-S16 (A1-AC03): không có dự án khả kiến → rỗng đúng shape, không đọc toàn hệ.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ critical: [], delayed: [], delayPareto: [], groupProgress: {} });
  const data = await getScheduleControlData(systemId, projectId);
  // AUD-SEC-012: thầu phụ vẫn xem danh sách trễ (đọc thuần) nhưng không thấy ghi chú trễ
  // tự do do Admin/PM/thầu khác ghi — cùng chuẩn /api/dashboard* (subcon bị chặn ở đó).
  if (!CAN.viewDashboard(user.role)) {
    return NextResponse.json({
      ...data,
      delayed: data.delayed.map((t) => ({ ...t, delayNote: null })),
    });
  }
  return NextResponse.json(data);
}
