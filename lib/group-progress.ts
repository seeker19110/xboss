// Tiến độ trung bình của TOÀN BỘ công tác trong từng hạng mục trễ (cặp sheet + tầng) —
// dùng cho cột "Tiến độ TB" ở bảng hạng mục trễ (dashboard/schedule-control/progress/[system]/
// báo cáo), tránh nhầm với trung bình chỉ tính trên các công tác đang trễ trong nhóm.
import { query } from "@/lib/db";
import { delayedGroupKey } from "@/lib/delayed-groups";

export async function getGroupProgressMap(
  opts: { systemId?: number | null; projectId?: number | null } = {},
): Promise<Map<string, number>> {
  const systemId = opts.systemId ?? null;
  const projectId = opts.projectId ?? null;
  const projectJoin =
    projectId != null ? "JOIN towers tw ON tw.id = st.tower_id AND tw.project_id = ?" : "";
  const projectParams = projectId != null ? [projectId] : [];
  const systemFilterAnd = systemId !== null ? "AND st.system_id = ?" : "";
  const systemParams = systemId !== null ? [systemId] : [];

  const rows = await query<{ sheetType: string; floorLabel: string; avgProgress: number }>(
    `SELECT st.code AS "sheetType", COALESCE(wp.floor_label, '') AS "floorLabel",
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       ${projectJoin}
      WHERE 1=1 ${systemFilterAnd}
      GROUP BY st.code, wp.floor_label`,
    ...projectParams,
    ...systemParams,
  );

  return new Map(rows.map((r) => [delayedGroupKey(r.sheetType, r.floorLabel), r.avgProgress]));
}
