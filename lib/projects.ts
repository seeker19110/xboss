// Nền đa dự án (M22 PR1 — xem ADR-0004 + docs/nang-cap/M22-da-du-an.md). Dự án đang
// chọn = cookie `xboss_project`, đối chiếu quyền qua bảng `user_projects`. Route KHÔNG
// tin `project_id` client gửi qua body/query — luôn suy qua getCurrentProjectId(user).
import { cookies } from "next/headers";
import { query, todayISO } from "@/lib/db";
import { patchRequestContext, getRequestContext } from "@/lib/request-context";
import type { Role } from "@/lib/roles";

export const PROJECT_COOKIE = "xboss_project";

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
  // M61: memoize trong request — projectId chỉ được patch vào request-context SAU khi đã
  // qua resolveProjectId (đối chiếu visibleProjectIds) nên tin được trong cùng request.
  // Route gọi cả getCurrentUser (patch sớm) lẫn getCurrentProjectId chỉ tốn 1 lần query.
  const cached = getRequestContext()?.projectId;
  if (cached != null) return cached;

  const visible = await visibleProjectIds(user);
  const store = await cookies();
  const projectId = resolveProjectId(visible, store.get(PROJECT_COOKIE)?.value);
  if (projectId != null) patchRequestContext({ projectId });
  return projectId;
}

export type ProjectListItem = {
  id: number;
  name: string;
  code: string | null;
  status: "active" | "handover" | "closed";
  color: string | null;
  orgId: number | null;
  progressPercent: number;
  delayedCount: number;
};

/** Danh sách dự án user thấy + % tiến độ (TB task qua tower) + số việc trễ — dùng chung
 *  cho project switcher lẫn trang Portfolio. `orgId` (M51 PR4): lọc theo tổ chức khi có
 *  giá trị; NULL/undefined = không lọc (mọi dự án user thấy). */
export async function listProjects(
  user: { id: number; role: Role },
  orgId?: number | null,
): Promise<ProjectListItem[]> {
  const visible = await visibleProjectIds(user);
  if (visible.length === 0) return [];
  const placeholders = visible.map(() => "?").join(",");
  const orgFilter = orgId != null ? ` AND p.org_id = ?` : "";
  // COALESCE(t.end_date, wp.end_date): task.end_date NULL = kế thừa ngày KT nhóm (lib/recompute.ts).
  const rows = await query<ProjectListItem>(
    `SELECT p.id, p.name, p.code, p.status, p.color, p.org_id AS "orgId",
            COALESCE(AVG(t.progress_percent), 0) AS "progressPercent",
            COALESCE(SUM(CASE WHEN COALESCE(t.end_date, wp.end_date) IS NOT NULL AND COALESCE(t.end_date, wp.end_date) < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS "delayedCount"
       FROM projects p
       LEFT JOIN towers tw ON tw.project_id = p.id
       LEFT JOIN sheet_types st ON st.tower_id = tw.id
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE p.id IN (${placeholders})${orgFilter}
      GROUP BY p.id, p.name, p.code, p.status, p.color, p.org_id
      ORDER BY p.id`,
    todayISO(),
    ...visible,
    ...(orgId != null ? [orgId] : []),
  );
  return rows;
}

export type OrganizationItem = { id: number; name: string };

/** Tổ chức có ít nhất 1 dự án user thấy — dùng để trang Portfolio quyết định có hiện
 *  select tổ chức hay không (chỉ hiện khi >1 org). M54 GĐ1 PR1: projects.org_id nay NOT
 *  NULL DEFAULT 1 nên dự án không gán tổ chức thuộc org mặc định 1 (không còn NULL). */
export async function listOrganizations(user: {
  id: number;
  role: Role;
}): Promise<OrganizationItem[]> {
  const visible = await visibleProjectIds(user);
  if (visible.length === 0) return [];
  const placeholders = visible.map(() => "?").join(",");
  return query<OrganizationItem>(
    `SELECT DISTINCT o.id, o.name
       FROM organizations o
       JOIN projects p ON p.org_id = o.id
      WHERE p.id IN (${placeholders})
      ORDER BY o.name`,
    ...visible,
  );
}

export type PortfolioKpi = {
  totalProjects: number;
  activeCount: number;
  handoverCount: number;
  closedCount: number;
  totalDelayed: number;
  avgProgress: number; // trung bình có trọng số theo số task mỗi dự án
};

/** KPI gộp cross-project cho trang Portfolio — không đụng cache dữ liệu 1 dự án. */
export async function portfolioKpi(user: { id: number; role: Role }): Promise<PortfolioKpi> {
  const projects = await listProjects(user);
  const totalDelayed = projects.reduce((s, p) => s + p.delayedCount, 0);
  const avgProgress =
    projects.length === 0
      ? 0
      : projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length;
  return {
    totalProjects: projects.length,
    activeCount: projects.filter((p) => p.status === "active").length,
    handoverCount: projects.filter((p) => p.status === "handover").length,
    closedCount: projects.filter((p) => p.status === "closed").length,
    totalDelayed,
    avgProgress,
  };
}
