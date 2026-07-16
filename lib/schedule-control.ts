// Dữ liệu cho trang "Đường găng & Chậm tiến độ" (M36 PR3) — tách khỏi route để test
// tích hợp gọi thẳng (không cần dựng NextRequest/auth), cùng pattern lib/report.ts.
import { query, todayISO } from "@/lib/db";
import { computeCpm } from "@/lib/cpm";
import { getCpmData } from "@/lib/gantt-data";
import { DELAY_REASON_LABEL, type DelayReason } from "@/lib/delay";
import { getGroupProgressMap } from "@/lib/group-progress";

export type CriticalRow = {
  id: number;
  code: string;
  name: string;
  floorLabel: string | null;
  startDate: string;
  endDate: string;
  progress: number;
  sheetType: string;
  sheetSlug: string | null;
  float: number;
};

export type DelayedRow = {
  id: number;
  code: string;
  name: string;
  status: string;
  endDate: string;
  progressPercent: number;
  floorLabel: string | null;
  sheetType: string;
  sheetSlug: string | null;
  delayReason: string | null;
  delayNote: string | null;
};

export type DelayParetoRow = { slug: string | null; label: string; count: number };

export type ScheduleControlData = {
  critical: CriticalRow[];
  delayed: DelayedRow[];
  delayPareto: DelayParetoRow[];
  groupProgress: Record<string, number>;
};

export async function getScheduleControlData(
  systemId: number | null,
  projectId?: number,
): Promise<ScheduleControlData> {
  const today = todayISO();
  const systemFilterAnd = systemId !== null ? "AND st.system_id = ?" : "";
  const systemParams = systemId !== null ? [systemId] : [];
  // Lọc theo dự án để tránh rò rỉ chéo dự án (M22+); undefined = không lọc.
  const projectFilterAnd = projectId != null ? "AND tw.project_id = ?" : "";
  const projectParams = projectId != null ? [projectId] : [];

  // Đường găng: CPM trên tập nhóm việc đã lọc theo hệ (nhất quán với /api/gantt).
  const { nodes, edges, meta } = await getCpmData(systemId, projectId);
  const cpm = computeCpm(nodes, edges);
  const critical: CriticalRow[] = [...cpm.criticalNodes]
    .map((id) => {
      const m = meta.get(id)!;
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        floorLabel: m.floorLabel,
        startDate: m.startDate,
        endDate: m.endDate,
        progress: m.progress,
        sheetType: m.sheetType,
        sheetSlug: m.sheetSlug,
        float: cpm.float.get(id) ?? 0,
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.code.localeCompare(b.code));

  // Task trễ — cùng điều kiện lọc trễ đang dùng ở /api/dashboard. COALESCE(t.end_date,
  // wp.end_date): task.end_date NULL = kế thừa ngày KT nhóm (xem lib/recompute.ts) —
  // dùng ngày hiệu lực để lọc VÀ hiển thị đúng.
  const delayed = await query<DelayedRow>(
    `SELECT t.id, t.code, t.name, t.status,
            COALESCE(t.end_date, wp.end_date) AS "endDate", t.progress_percent AS "progressPercent",
            wp.floor_label AS "floorLabel", st.code AS "sheetType", st.slug AS "sheetSlug",
            t.delay_reason AS "delayReason", t.delay_note AS "delayNote"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN towers tw ON st.tower_id = tw.id
      WHERE COALESCE(t.end_date, wp.end_date) IS NOT NULL AND COALESCE(t.end_date, wp.end_date) < ?
        AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')
        ${systemFilterAnd}
        ${projectFilterAnd}
      ORDER BY COALESCE(t.end_date, wp.end_date)`,
    today,
    ...systemParams,
    ...projectParams,
  );

  // Pareto lý do trễ — cùng cách đếm với panel Pareto trên Dashboard (app/page.tsx):
  // nhóm theo delay_reason, giảm dần theo count, kèm mục "chưa gán lý do" ở cuối.
  const reasonCounts = (Object.keys(DELAY_REASON_LABEL) as DelayReason[])
    .map((slug) => ({
      slug: slug as string,
      label: DELAY_REASON_LABEL[slug],
      count: delayed.filter((t) => t.delayReason === slug).length,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const noReasonCount = delayed.filter((t) => !t.delayReason).length;
  const delayPareto: DelayParetoRow[] =
    noReasonCount > 0
      ? [...reasonCounts, { slug: null, label: "Chưa gán lý do", count: noReasonCount }]
      : reasonCounts;

  // Tiến độ trung bình của TOÀN BỘ công tác trong từng hạng mục (sheet+tầng) — dùng cho
  // cột "Tiến độ TB" ở bảng hạng mục trễ, tránh nhầm với avg chỉ tính trên công tác trễ.
  const groupProgress = Object.fromEntries(await getGroupProgressMap({ systemId, projectId }));

  return { critical, delayed, delayPareto, groupProgress };
}
