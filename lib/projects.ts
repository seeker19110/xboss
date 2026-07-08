// Nền đa dự án (M22 PR1 — xem ADR-0004 + docs/nang-cap/M22-da-du-an.md). Dự án đang
// chọn = cookie `xboss_project`, đối chiếu quyền qua bảng `user_projects`. Route KHÔNG
// tin `project_id` client gửi qua body/query — luôn suy qua getCurrentProjectId(user).
import { cookies } from "next/headers";
import { query } from "@/lib/db";
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
  const visible = await visibleProjectIds(user);
  const store = await cookies();
  return resolveProjectId(visible, store.get(PROJECT_COOKIE)?.value);
}
