// KPI tiến độ dùng chung — tránh copy-paste SQL dài giữa dashboard nội bộ
// (app/api/dashboard) và API mở /api/v1/dashboard/kpi (M49 PR1).
import { query } from "@/lib/db";

export type SheetKpi = {
  sheetId: number;
  sheetType: string;
  sheetSlug: string | null;
  total: number;
  avgProgress: number;
};

// KPI theo từng sheet (hệ tracking): tổng số task + % TB, lọc theo dự án/hệ. LEFT JOIN
// work_packages/tasks để sheet chưa có task vẫn hiện; JOIN towers (INNER) lọc dự án qua ON.
export async function sheetProgressKpi(opts: {
  projectId?: number | null;
  systemId?: number | null;
}): Promise<SheetKpi[]> {
  const projectId = opts.projectId ?? null;
  const systemId = opts.systemId ?? null;
  return query<SheetKpi>(
    `SELECT st.id AS "sheetId", st.code AS "sheetType", st.slug AS "sheetSlug",
            COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress"
       FROM sheet_types st
       ${projectId != null ? "JOIN towers tw ON tw.id = st.tower_id AND tw.project_id = ?" : ""}
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
       ${systemId != null ? "WHERE st.system_id = ?" : ""}
      GROUP BY st.id, st.code, st.slug
      ORDER BY st.sort_order, st.id`,
    ...(projectId != null ? [projectId] : []),
    ...(systemId != null ? [systemId] : []),
  );
}

export type StatusCount = { status: string; count: number };

// Đếm số task theo trạng thái trong 1 dự án (null = mọi dự án) — dùng cho /api/v1/dashboard/kpi.
export async function taskStatusCounts(projectId: number | null): Promise<StatusCount[]> {
  return query<StatusCount>(
    `SELECT t.status, COUNT(*) AS count
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       ${projectId != null ? "JOIN towers tw ON tw.id = st.tower_id" : ""}
      ${projectId != null ? "WHERE tw.project_id = ?" : ""}
      GROUP BY t.status`,
    ...(projectId != null ? [projectId] : []),
  );
}
