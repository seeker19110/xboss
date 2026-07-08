import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

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

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ days: [], manpower: [] });

  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const days = await query<{ date: string; status: string }>(
    `SELECT diary_date AS "date", status FROM site_diaries
      WHERE diary_date >= ? AND diary_date < ? AND project_id = ? ORDER BY diary_date`,
    start,
    next,
    projectId,
  );

  const manpower = await query<{ date: string; crew: string; headcount: number }>(
    `SELECT sd.diary_date AS "date", dm.crew, dm.headcount
       FROM diary_manpower dm
       JOIN site_diaries sd ON sd.id = dm.diary_id
      WHERE sd.diary_date >= ? AND sd.diary_date < ? AND sd.project_id = ?
      ORDER BY sd.diary_date, dm.crew`,
    start,
    next,
    projectId,
  );

  return NextResponse.json({ days, manpower });
}
