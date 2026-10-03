// Snapshot quyền chỉ sống trong request đã xác thực, không dùng quyền cũ giữa các request.
// Thiếu snapshot/đang nạp/lỗi DB => từ chối; chỉ dùng mặc định sau khi đọc DB thành công.
// KHÔNG import auth (auth import ngược module này).
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getRequestContext, type RequestContext } from "@/lib/nen/request-context";
import { log } from "@/lib/nen/log";
import type { Role } from "@/lib/nen/roles";

export type PermOverride = {
  role: Role;
  permKey: string;
  allowed: boolean;
  projectId: number | null;
};

type PermissionSnapshot = {
  userId: number;
  orgId: number;
  role: string;
  overrides: Map<string, boolean> | null;
};

let snapshots = new WeakMap<RequestContext, PermissionSnapshot>();
const overrideLechDaCanhBao = new Set<string>();
const positiveId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id > 0;
const cacheKey = (orgId: number, role: string, permKey: string, projectId?: number | null) =>
  `${orgId}|${role}|${permKey}|${projectId ?? "*"}`;

function currentSnapshot(orgId: number): PermissionSnapshot | undefined {
  const ctx = getRequestContext();
  const state = ctx && snapshots.get(ctx);
  if (
    !ctx ||
    !state ||
    !state.overrides ||
    ctx.orgId !== orgId ||
    state.orgId !== orgId ||
    state.userId !== ctx.userId ||
    state.role !== ctx.role
  )
    return undefined;
  return state;
}

// false còn biểu thị chưa có snapshot hợp lệ, để caller không fallback về quyền mặc định.
export function getPermissionOverride(
  orgId: number,
  role: string,
  permKey: string,
  projectId?: number | null,
): boolean | undefined {
  const state = currentSnapshot(orgId);
  if (!state) return false;
  if (projectId != null) {
    if (!positiveId(projectId)) return false;
    const scoped = state.overrides!.get(cacheKey(orgId, role, permKey, projectId));
    if (scoped !== undefined) return scoped;
  }
  return state.overrides!.get(cacheKey(orgId, role, permKey));
}

export function clearPermissionSnapshot(): void {
  const ctx = getRequestContext();
  if (ctx) snapshots.delete(ctx);
}

// Nạp mới sau khi xác thực actor/project hoặc sau khi cấu hình quyền thay đổi.
// Không giữ snapshot allow cũ trong lúc await; request khác luôn phải đọc nguồn riêng.
export async function invalidatePermissionCache(orgId: number): Promise<void> {
  const ctx = getRequestContext();
  if (!ctx || !positiveId(orgId) || ctx.orgId !== orgId || !positiveId(ctx.userId) || !ctx.role)
    throw new Error("Thiếu ngữ cảnh xác thực để đọc quyền");
  const state: PermissionSnapshot = {
    userId: ctx.userId,
    orgId,
    role: ctx.role,
    overrides: null,
  };
  snapshots.set(ctx, state);
  const rows = await withTransaction(() =>
    query<PermOverride & { projectOrgId: number | null }>(
      `SELECT rp.role, rp.perm_key AS "permKey", rp.allowed, rp.project_id AS "projectId",
              p.org_id AS "projectOrgId"
         FROM role_permissions rp LEFT JOIN projects p ON p.id = rp.project_id
        WHERE rp.org_id = ?`,
      orgId,
    ),
  );
  const next = new Map<string, boolean>();
  for (const row of rows) {
    // Dòng override cũ trỏ dự án của tổ chức khác (writer trước PR #544 không kiểm org của dự
    // án): bỏ qua, KHÔNG cấp quyền gì từ nó. Throw ở đây từng làm getCurrentUser của MỌI user
    // trong org lỗi 500 — kể cả admin, không còn đường sửa trong app (audit logic PR #544).
    if (row.projectId !== null && row.projectOrgId !== orgId) {
      // Snapshot nạp lại mỗi request — chỉ cảnh báo một lần mỗi (org, dự án) mỗi tiến trình.
      const khoa = `${orgId}|${row.projectId}`;
      if (!overrideLechDaCanhBao.has(khoa)) {
        overrideLechDaCanhBao.add(khoa);
        log.warn("Bỏ qua override quyền trỏ dự án ngoài tổ chức", {
          orgId,
          projectId: row.projectId,
          permKey: row.permKey,
        });
      }
      continue;
    }
    next.set(cacheKey(orgId, row.role, row.permKey, row.projectId), row.allowed);
  }
  if (
    snapshots.get(ctx) !== state ||
    ctx.userId !== state.userId ||
    ctx.orgId !== state.orgId ||
    ctx.role !== state.role
  )
    throw new Error("Ngữ cảnh xác thực đã thay đổi trong khi đọc quyền");
  state.overrides = next;
}

// Chỉ dùng trong test; không có đường cấp quyền giả hoặc fallback mặc định.
export function _resetPermissionCacheForTests(): void {
  snapshots = new WeakMap();
}

async function assertProjectOrg(orgId: number, projectId?: number | null): Promise<void> {
  if (!positiveId(orgId)) throw new Error("Mã tổ chức không hợp lệ");
  if (projectId == null) return;
  if (!positiveId(projectId)) throw new Error("Mã dự án không hợp lệ");
  const project = await queryOne<{ id: number }>(
    `SELECT id FROM projects WHERE id = ? AND org_id = ? FOR SHARE`,
    projectId,
    orgId,
  );
  if (!project) throw new Error("Dự án không thuộc tổ chức hiện tại");
}

// undefined = mọi override trong org; null = cấp tổ chức; số = dự án cùng org.
export async function listPermissionOverrides(
  orgId: number,
  projectId?: number | null,
): Promise<PermOverride[]> {
  return withTransaction(async () => {
    await assertProjectOrg(orgId, projectId);
    return query<PermOverride>(
      `SELECT role, perm_key AS "permKey", allowed, project_id AS "projectId"
         FROM role_permissions WHERE org_id = ?${projectId === undefined ? "" : " AND project_id IS NOT DISTINCT FROM ?"}
         ORDER BY role, perm_key, project_id NULLS FIRST`,
      orgId,
      ...(projectId === undefined ? [] : [projectId]),
    );
  });
}

// Xóa/upsert cùng key org + role + action + project. Transaction giữ audit actor hiện có.
export async function setPermissionOverride(
  role: Role,
  permKey: string,
  allowed: boolean | null,
  updatedBy: number | null,
  orgId: number,
  projectId: number | null = null,
): Promise<void> {
  const ctx = getRequestContext();
  if (!ctx || ctx.orgId !== orgId || !positiveId(ctx.userId))
    throw new Error("Thiếu ngữ cảnh tổ chức để cấu hình quyền");
  clearPermissionSnapshot();
  await withTransaction(async () => {
    await assertProjectOrg(orgId, projectId);
    if (allowed === null) {
      await run(
        `DELETE FROM role_permissions WHERE org_id = ? AND role = ? AND perm_key = ?
          AND project_id IS NOT DISTINCT FROM ?`,
        orgId,
        role,
        permKey,
        projectId,
      );
    } else {
      await run(
        `INSERT INTO role_permissions (role, perm_key, allowed, project_id, updated_by, org_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, now())
         ON CONFLICT (org_id, role, perm_key, COALESCE(project_id, 0))
         DO UPDATE SET allowed = EXCLUDED.allowed, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        role,
        permKey,
        allowed,
        projectId,
        updatedBy,
        orgId,
      );
    }
  });
  await invalidatePermissionCache(orgId);
}
