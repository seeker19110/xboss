// Snapshot quyền chỉ sống trong request đã xác thực, không dùng quyền cũ giữa các request.
// Thiếu snapshot/đang nạp/lỗi DB => từ chối; chỉ dùng mặc định sau khi đọc DB thành công.
// KHÔNG import auth (auth import ngược module này).
import { dangTrongGiaoDich, query, queryOne, run, withTransaction } from "@/lib/db";
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

// Khoá advisory theo org tuần tự hoá "tái kiểm quyền lúc ghi" (khoá chia sẻ) với ghi override
// (khoá độc quyền) — cả hai chỉ sống trong transaction (pg_advisory_xact_*).
const khoaQuyenOrg = (orgId: number) => `role_permissions:${orgId}`;
// Khoá độc quyền của setPermissionOverride chờ tối đa chừng này sau các transaction ghi đang giữ
// khoá chia sẻ; quá hạn ⇒ lỗi 409 `permission_lock_busy` (admin thử lại) thay vì treo request.
export const KHOA_QUYEN_LOCK_TIMEOUT_MS = 5000;

// D01 (A1-AC05) — tái kiểm quyền NGAY TRƯỚC GHI ở đường nghiệm thu/tài chính. Snapshot nạp lúc
// xác thực có thể đã stale khi admin đổi override trong lúc request còn await (khoá dòng, I/O…).
// Cho ghi chỉ khi `kiem()` đúng ở CẢ snapshot lúc xác thực LẪN dữ liệu có hiệu lực đọc lại trong
// transaction ghi — fail-closed hai chiều: allow→deny giữa chừng bị chặn; deny→allow giữa chừng
// không nâng quyền request đang chạy (request mới mới thấy allow). Khoá chia sẻ giữ tới COMMIT nên
// setPermissionOverride phải chờ các lần ghi đã qua kiểm, không còn khe "kiểm xong → deny commit →
// ghi commit". Lỗi DB khi đọc lại ⇒ throw (caller ROLLBACK) và snapshot ở trạng thái đang nạp ⇒
// CAN false; không bao giờ rơi về mặc định allow. Sau lời gọi, snapshot của request là bản mới.
// Giới hạn (chủ đích, ngoài D01): chỉ đọc lại `role_permissions` (override), KHÔNG đọc lại
// `users.role` — admin hạ vai trò giữa chừng thì request đang bay vẫn đi hết; phiên đó hết hiệu
// lực ở request kế tiếp qua `session_version`. Ràng buộc với caller: gọi SAU khi đã khoá dòng
// (FOR UPDATE) và giữ phần ghi còn lại ngắn, vì setPermissionOverride chờ khoá này tối đa
// KHOA_QUYEN_LOCK_TIMEOUT_MS rồi báo bận.
export async function kiemQuyenTaiLucGhi(kiem: () => boolean): Promise<boolean> {
  if (!kiem()) return false;
  const ctx = getRequestContext();
  if (!ctx || !positiveId(ctx.orgId) || !dangTrongGiaoDich())
    throw new Error("Tái kiểm quyền lúc ghi phải chạy trong transaction của request đã xác thực");
  await run(`SELECT pg_advisory_xact_lock_shared(hashtextextended(?, 0))`, khoaQuyenOrg(ctx.orgId));
  await invalidatePermissionCache(ctx.orgId);
  return kiem();
}

// Tiện ích cho route ghi: chạy `ghi` trong MỘT transaction, chỉ sau khi tái kiểm quyền lúc ghi
// (kiemQuyenTaiLucGhi) còn đúng. Bị thu hồi ⇒ `{ ok: false }` TRƯỚC mọi lần ghi (transaction không
// ghi gì) — route tự trả 403 với thông điệp cũ. Ngoại lệ trong `ghi` ⇒ ROLLBACK và ném tiếp.
// Gọi lồng được (withTransaction reentrant); khoá dòng chính (nếu có) nên đặt TRONG `ghi` trước
// khi cần, còn kiểm quyền chạy ngay đầu — đủ vì nó đọc lại dữ liệu có hiệu lực và giữ khoá chia sẻ
// tới COMMIT. Route cần kiểm SAU khi khoá dòng thì gọi trực tiếp kiemQuyenTaiLucGhi trong tx.
export async function ghiNeuConQuyen<T>(
  kiem: () => boolean,
  ghi: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  return withTransaction(async () => {
    if (!(await kiemQuyenTaiLucGhi(kiem))) return { ok: false as const };
    return { ok: true as const, value: await ghi() };
  });
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
    // Chờ các transaction ghi đã tái kiểm quyền (khoá chia sẻ) COMMIT xong — xem kiemQuyenTaiLucGhi.
    // SET LOCAL chỉ sống trong transaction này (không ảnh hưởng kết nối trả về pool).
    await run(`SET LOCAL lock_timeout = ${KHOA_QUYEN_LOCK_TIMEOUT_MS}`);
    try {
      await run(`SELECT pg_advisory_xact_lock(hashtextextended(?, 0))`, khoaQuyenOrg(orgId));
    } catch (err) {
      if ((err as { code?: unknown }).code === "55P03")
        throw Object.assign(
          new Error("Hệ thống đang ghi nghiệm thu/duyệt — thử cấu hình quyền lại sau vài giây"),
          { status: 409, code: "permission_lock_busy" },
        );
      throw err;
    }
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
