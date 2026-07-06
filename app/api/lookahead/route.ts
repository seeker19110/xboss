import { NextRequest, NextResponse } from "next/server";
import { query, todayISO, daysFromTodayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pendingFrontKeys } from "@/lib/workfronts";

export const dynamic = "force-dynamic";

export type LookaheadTask = {
  id: number;
  code: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  floorLabel: string | null;
  packageCode: string;
  sheetType: string;
  sheetTypeId: number;
  assigneeName: string | null;
  delayReason: string | null;
  waitingFront?: boolean;
};

// GET /api/lookahead?days=14 → kế hoạch ngắn hạn cho họp giao ban:
// task sắp bắt đầu + task đến hạn trong N ngày tới. Mọi vai trò thấy toàn bộ (giống
// lưới tracking — subcon cần ngữ cảnh tầng/nhóm, xem app/api/tasks/route.ts).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const days = Math.min(
    60,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "14") || 14),
  );
  const today = todayISO();
  const until = daysFromTodayISO(days);

  const select = `SELECT t.id, t.code, t.name, t.status,
            t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS "progressPercent", t.delay_reason AS "delayReason",
            wp.floor_label AS "floorLabel", wp.code AS "packageCode",
            st.code AS "sheetType", st.id AS "sheetTypeId", u.name AS "assigneeName"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id`;

  // Sắp bắt đầu: start_date trong cửa sổ, chưa làm gì (progress = 0, chưa hoàn thành).
  const starting = await query<LookaheadTask>(
    `${select}
      WHERE t.start_date IS NOT NULL AND t.start_date >= ? AND t.start_date <= ?
        AND t.progress_percent = 0 AND t.status NOT IN ('hoan_thanh','nghiem_thu')
      ORDER BY t.start_date, st.id, t.id`,
    today,
    until,
  );

  // Đến hạn: end_date trong cửa sổ, chưa xong.
  const due = await query<LookaheadTask>(
    `${select}
      WHERE t.end_date IS NOT NULL AND t.end_date >= ? AND t.end_date <= ?
        AND t.progress_percent < 1 AND t.status NOT IN ('hoan_thanh','nghiem_thu')
      ORDER BY t.end_date, st.id, t.id`,
    today,
    until,
  );

  // Task thuộc tầng chưa bàn giao mặt bằng (M14) → cờ waitingFront cho báo cáo EOT.
  const pendingFronts = await pendingFrontKeys();
  const flag = (t: LookaheadTask) => ({
    ...t,
    waitingFront:
      t.floorLabel != null && pendingFronts.has(`${t.sheetTypeId}:${t.floorLabel}`)
        ? true
        : undefined,
  });

  return NextResponse.json({
    days,
    from: today,
    until,
    starting: starting.map(flag),
    due: due.map(flag),
  });
}
