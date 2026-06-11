import { NextRequest, NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export type LookaheadTask = {
  id: number; code: string; name: string; status: string;
  startDate: string | null; endDate: string | null; progressPercent: number;
  floorLabel: string | null; packageCode: string; sheetType: string;
  assigneeName: string | null; delayReason: string | null;
};

// GET /api/lookahead?days=14 → kế hoạch ngắn hạn cho họp giao ban:
// task sắp bắt đầu + task đến hạn trong N ngày tới. Subcon chỉ thấy task được giao.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const days = Math.min(60, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "14") || 14));
  const today = todayISO();
  const until = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
  const subconFilter = user.role === "subcon" ? `AND t.assigned_to = ${user.id}` : "";

  const select = `SELECT t.id, t.code, t.name, t.status,
            t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS "progressPercent", t.delay_reason AS "delayReason",
            wp.floor_label AS "floorLabel", wp.code AS "packageCode",
            st.code AS "sheetType", u.name AS "assigneeName"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id`;

  // Sắp bắt đầu: start_date trong cửa sổ, chưa làm gì (progress = 0, chưa hoàn thành).
  const starting = await query<LookaheadTask>(
    `${select}
      WHERE t.start_date IS NOT NULL AND t.start_date >= ? AND t.start_date <= ?
        AND t.progress_percent = 0 AND t.status NOT IN ('hoan_thanh','nghiem_thu') ${subconFilter}
      ORDER BY t.start_date, st.id, t.id`, today, until);

  // Đến hạn: end_date trong cửa sổ, chưa xong.
  const due = await query<LookaheadTask>(
    `${select}
      WHERE t.end_date IS NOT NULL AND t.end_date >= ? AND t.end_date <= ?
        AND t.progress_percent < 1 AND t.status NOT IN ('hoan_thanh','nghiem_thu') ${subconFilter}
      ORDER BY t.end_date, st.id, t.id`, today, until);

  return NextResponse.json({ days, from: today, until, starting, due });
}
