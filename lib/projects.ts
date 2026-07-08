// Nền đa dự án (M22 — xem ADR-0004 + docs/nang-cap/M22-da-du-an.md). Dự án đang
// chọn = cookie `xboss_project`, đối chiếu quyền qua bảng `user_projects`. Route KHÔNG
// tin `project_id` client gửi qua body/query — luôn suy qua getCurrentProjectId(user).
import { cookies } from "next/headers";
import { query, todayISO } from "@/lib/db";
import type { Role } from "@/lib/roles";

export const PROJECT_COOKIE = "xboss_project";

export type ProjectSummary = {
  id: number;
  name: string;
  code: string | null;
  status: string;
  color: string | null;
  totalTasks: number;
  avgProgress: number;
  delayedCount: number;
};

/** Dự án user được thấy: admin thấy mọi dự án; vai trò khác theo `user_projects`;
 *  bảng `user_projects` rỗng toàn hệ thống = mọi user thấy mọi dự án (tương thích
 *  ngược 1 dự án — chỉ khoá khi bắt đầu cấu hình gán). */
export async function visibleProjectIds(user: { id: number; role: Role }): Promise<number[]> {
  if (user.role === "admin") {
    const rows = await query<{ id: number }>(`SELECT id FROM projects ORDER BY id`);
    return rows.map((r) => r.id);
  }

  const [{ n }] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM user_projects`);
  if (Number(n) === 0) {
    const rows = await query<{ id: number }>(`SELECT id FROM projects ORDER BY id`);
    return rows.map((r) => r.id);
  }

  const rows = await query<{ projectId: number }>(
    `SELECT project_id AS "projectId" FROM user_projects WHERE user_id = ? ORDER BY project_id`,
    user.id,
  );
  return rows.map((r) => r.projectId);
}

/** Logic thuần (không đụng cookie/DB) — tách riêng để test được: cookie hợp lệ (nằm
 *  trong dự án user thấy) → dùng; else dự án đầu user thấy (mặc định). Không có dự án
 *  nào (DB trống) → null. Client gửi id lạ/không thấy được → bỏ, không tin. */
export function resolveProjectId(
  visible: number[],
  rawCookieValue: string | undefined,
): number | null {
  if (visible.length === 0) return null;
  const requested = rawCookieValue ? Number(rawCookieValue) : NaN;
  if (Number.isFinite(requested) && visible.includes(requested)) return requested;
  return visible[0];
}

/** Dự án đang chọn của request hiện tại — đọc cookie `xboss_project` + đối chiếu quyền. */
export async function getCurrentProjectId(user: {
  id: number;
  role: Role;
}): Promise<number | null> {
  const visible = await visibleProjectIds(user);
  const store = await cookies();
  return resolveProjectId(visible, store.get(PROJECT_COOKIE)?.value);
}

/** Danh sách dự án user thấy + % tiến độ (trung bình task) + số việc trễ — dùng chung
 *  cho project switcher lẫn trang Portfolio. Tiến độ suy qua towers.project_id (đã có
 *  từ trước M22) — không cần cột project_id riêng ở sheet_types/work_packages/tasks. */
export async function listProjects(user: { id: number; role: Role }): Promise<ProjectSummary[]> {
  const visible = await visibleProjectIds(user);
  if (visible.length === 0) return [];

  const today = todayISO();
  return query<ProjectSummary>(
    `SELECT p.id, p.name, p.code, p.status, p.color,
            COUNT(t.id) AS "totalTasks",
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS "delayedCount"
       FROM projects p
       LEFT JOIN towers tw ON tw.project_id = p.id
       LEFT JOIN sheet_types st ON st.tower_id = tw.id
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE p.id = ANY(?)
      GROUP BY p.id, p.name, p.code, p.status, p.color
      ORDER BY p.id`,
    today,
    visible,
  );
}

export type PortfolioKpi = {
  totalProjects: number;
  byStatus: Record<string, number>;
  totalDelayed: number;
  avgProgress: number; // trung bình có trọng số theo số task mỗi dự án
};

/** KPI gộp cross-project — endpoint riêng, không đụng cache/logic 1 dự án của các trang khác. */
export async function portfolioKpi(user: { id: number; role: Role }): Promise<PortfolioKpi> {
  const projects = await listProjects(user);
  const byStatus: Record<string, number> = {};
  for (const p of projects) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;

  const totalTasks = projects.reduce((sum, p) => sum + Number(p.totalTasks), 0);
  const avgProgress =
    totalTasks > 0
      ? projects.reduce((sum, p) => sum + p.avgProgress * Number(p.totalTasks), 0) / totalTasks
      : 0;

  return {
    totalProjects: projects.length,
    byStatus,
    totalDelayed: projects.reduce((sum, p) => sum + Number(p.delayedCount), 0),
    avgProgress,
  };
}
