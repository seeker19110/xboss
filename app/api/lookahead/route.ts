import { NextRequest, NextResponse } from "next/server";
import { query, todayISO, daysFromTodayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pendingStageFloors } from "@/lib/constructionStages";
import { resolveSystemId } from "@/lib/systems";
import { getCurrentProjectId } from "@/lib/projects";

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

// GET /api/lookahead?days=14&system=<systems.code> → kế hoạch ngắn hạn cho họp giao ban:
// task sắp bắt đầu + task đến hạn trong N ngày tới. Mọi vai trò thấy toàn bộ (giống
// lưới tracking — subcon cần ngữ cảnh tầng/nhóm, xem app/api/tasks/route.ts). `system` lọc
// theo hệ thi công (M36) — bổ sung, không breaking.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const days = Math.min(
    60,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "14") || 14),
  );
  const today = todayISO();
  const until = daysFromTodayISO(days);
  const systemId = await resolveSystemId(req.nextUrl.searchParams.get("system"));
  const systemFilter = systemId !== null ? "AND st.system_id = ?" : "";
  const systemParams = systemId !== null ? [systemId] : [];
  // Lọc theo dự án đang chọn để tránh rò rỉ chéo dự án (M22+); null = không lọc.
  const projectId = await getCurrentProjectId(user);
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const projectParams = projectId != null ? [projectId] : [];

  // COALESCE(t.start_date/end_date, wp....): task NULL = kế thừa ngày nhóm (lib/recompute.ts).
  const select = `SELECT t.id, t.code, t.name, t.status,
            COALESCE(t.start_date, wp.start_date) AS "startDate",
            COALESCE(t.end_date, wp.end_date) AS "endDate",
            t.progress_percent AS "progressPercent", t.delay_reason AS "delayReason",
            wp.floor_label AS "floorLabel", wp.code AS "packageCode",
            st.code AS "sheetType", st.id AS "sheetTypeId", u.name AS "assigneeName"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN towers tw ON st.tower_id = tw.id
       LEFT JOIN users u ON t.assigned_to = u.id`;

  // Sắp bắt đầu: start_date trong cửa sổ, chưa làm gì (progress = 0, chưa hoàn thành).
  const starting = await query<LookaheadTask>(
    `${select}
      WHERE COALESCE(t.start_date, wp.start_date) IS NOT NULL AND COALESCE(t.start_date, wp.start_date) >= ? AND COALESCE(t.start_date, wp.start_date) <= ?
        AND t.progress_percent = 0 AND t.status NOT IN ('hoan_thanh','nghiem_thu')
        ${systemFilter}${projectFilter}
      ORDER BY COALESCE(t.start_date, wp.start_date), st.id, t.id`,
    today,
    until,
    ...systemParams,
    ...projectParams,
  );

  // Đến hạn: end_date trong cửa sổ, chưa xong.
  const due = await query<LookaheadTask>(
    `${select}
      WHERE COALESCE(t.end_date, wp.end_date) IS NOT NULL AND COALESCE(t.end_date, wp.end_date) >= ? AND COALESCE(t.end_date, wp.end_date) <= ?
        AND t.progress_percent < 1 AND t.status NOT IN ('hoan_thanh','nghiem_thu')
        ${systemFilter}${projectFilter}
      ORDER BY COALESCE(t.end_date, wp.end_date), st.id, t.id`,
    today,
    until,
    ...systemParams,
    ...projectParams,
  );

  // Task thuộc tầng chưa sẵn sàng mặt bằng (công tác cuối trong chuỗi thi công chưa bàn
  // giao — model tầng×công tác của M46, thay cho model tầng×sheet cũ của M14) → cờ
  // waitingFront cho báo cáo EOT.
  const pendingFronts = await pendingStageFloors(projectId ?? undefined);
  const flag = (t: LookaheadTask) => ({
    ...t,
    waitingFront: t.floorLabel != null && pendingFronts.has(t.floorLabel) ? true : undefined,
  });

  return NextResponse.json({
    days,
    from: today,
    until,
    starting: starting.map(flag),
    due: due.map(flag),
  });
}
