import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listDiaryCalendar } from "@/lib/diary";

export const dynamic = "force-dynamic";

// GET /api/diaries?month=YYYY-MM → trạng thái từng ngày trong tháng (cho lịch) + nhân lực
// theo ngày × tổ đội trong tháng (cho tab biểu đồ), scoped theo dự án đang chọn (M22).
// Mọi user đăng nhập được xem.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const month = req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "Tháng không hợp lệ (YYYY-MM)" }, { status: 422 });

  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const projectId = await getCurrentProjectId(user);
  const { days, manpower } =
    projectId != null
      ? await listDiaryCalendar(start, next, projectId)
      : { days: [], manpower: [] };

  return NextResponse.json({ days, manpower });
}
