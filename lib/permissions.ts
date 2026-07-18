// lib/permissions.ts — M50 PR1: cache override quyền (bảng role_permissions) + CRUD.
// M61: thêm chiều DỰ ÁN — override có thể theo dự án (project_id) hoặc toàn hệ (NULL).
//
// Mục tiêu: `CAN.x(role)` trong lib/auth.ts là hàm ĐỒNG BỘ (được gọi ở hàng trăm
// route), nên không thể await DB mỗi lần kiểm quyền. Ta nạp toàn bộ bảng
// role_permissions (<100 dòng) vào 1 snapshot memory và đọc đồng bộ từ đó.
//
// Mô hình stale-while-revalidate (thân thiện serverless — KHÔNG setInterval):
//   - Đọc luôn trả về từ snapshot memory hiện có (không chạm DB).
//   - Khi snapshot quá hạn TTL, lần đọc kế tiếp kích hoạt 1 tác vụ nền reload (không
//     await) — lần đọc sau đó thấy dữ liệu mới. Cold start snapshot rỗng → mọi quyền
//     theo mặc định cho tới lần nạp đầu (an toàn: mặc định = hành vi trước M50).
//   - PATCH ma trận gọi invalidatePermissionCache() để nạp lại NGAY trong cùng
//     process; instance khác tự bắt kịp trong ≤ TTL.
//
// Ngữ nghĩa giải quyền (M61): override dự án > override toàn hệ (project_id NULL) >
// mặc định CAN_DEFAULT (lib/auth.ts). Snapshot key = `${role}|${permKey}|${scope}`
// với scope = id dự án (số) hoặc "*" (toàn hệ).
//
// KHÔNG import lib/auth ở đây (auth import ngược file này) — tránh phụ thuộc vòng.
import { query, run, withTransaction } from "@/lib/db";
import type { Role } from "@/lib/roles";

export type PermOverride = {
  role: Role;
  permKey: string;
  allowed: boolean;
  projectId: number | null;
};

const TTL_MS = 60_000;

// key = `${role}|${permKey}|${projectId ?? "*"}` → allowed
let snapshot = new Map<string, boolean>();
let loadedAt = 0; // 0 = chưa nạp lần nào (cold start)
let loading: Promise<void> | null = null;
// Tính sẵn 1 lần lúc reload (không duyệt Map mỗi lần gọi hasProjectOverrides): snapshot
// có ≥1 override THEO DỰ ÁN (key không kết thúc bằng "|*") hay không.
let hasProjectScope = false;

// projectId = số → key theo dự án; null/undefined → key toàn hệ "*".
const cacheKey = (role: string, permKey: string, projectId?: number | null): string =>
  `${role}|${permKey}|${projectId ?? "*"}`;

async function reload(): Promise<void> {
  const rows = await query<{
    role: string;
    permKey: string;
    allowed: boolean;
    projectId: number | null;
  }>(
    `SELECT role, perm_key AS "permKey", allowed, project_id AS "projectId" FROM role_permissions`,
  );
  const next = new Map<string, boolean>();
  let hasScope = false;
  for (const r of rows) {
    next.set(cacheKey(r.role, r.permKey, r.projectId), r.allowed);
    if (r.projectId != null) hasScope = true;
  }
  snapshot = next;
  hasProjectScope = hasScope;
  loadedAt = Date.now();
}

// Kích hoạt reload nền LƯỜI khi snapshot quá hạn (hoặc chưa nạp lần nào). Nuốt lỗi DB
// để giữ snapshot cũ (an toàn) và thử lại ở lần gọi sau. Không await ở caller đọc.
function maybeRefresh(): void {
  if (loading) return;
  if (loadedAt !== 0 && Date.now() - loadedAt < TTL_MS) return;
  loading = reload()
    .catch(() => {}) // lỗi DB → giữ snapshot cũ, lần sau thử lại
    .finally(() => {
      loading = null;
    });
}

// Đọc override ĐỒNG BỘ từ snapshot memory (KHÔNG chạm DB). Thứ tự giải quyền:
//   1. override theo dự án (khi projectId là số)  2. override toàn hệ ("*").
// Trả undefined khi không có override nào → caller (lib/auth) dùng mặc định CAN_DEFAULT.
export function getPermissionOverride(
  role: string,
  permKey: string,
  projectId?: number | null,
): boolean | undefined {
  maybeRefresh();
  if (projectId != null) {
    const scoped = snapshot.get(cacheKey(role, permKey, projectId));
    if (scoped !== undefined) return scoped;
  }
  return snapshot.get(cacheKey(role, permKey));
}

// Có ít nhất 1 override THEO DỰ ÁN trong cache? Đọc đồng bộ boolean tính sẵn lúc reload.
// lib/auth.ts dùng để chỉ giải projectId trong getCurrentUser khi thật sự cần (chi phí 0
// khi bảng chưa có dòng theo dự án — bất biến "y hệt trước M61").
export function hasProjectOverrides(): boolean {
  maybeRefresh();
  return hasProjectScope;
}

// Nạp lại snapshot NGAY (await). Gọi sau khi ghi override để cùng process không lệch.
export async function invalidatePermissionCache(): Promise<void> {
  if (loading) {
    try {
      await loading;
    } catch {
      /* bỏ qua — reload dưới đây là bản mới nhất */
    }
  }
  await reload();
}

// Chỉ dùng trong test: reset snapshot về trạng thái cold start (module cache rò rỉ giữa
// các file test chạy chung process). Không dùng ở code sản phẩm.
export function _resetPermissionCacheForTests(): void {
  snapshot = new Map();
  loadedAt = 0;
  loading = null;
  hasProjectScope = false;
}

// Danh sách override (cho trang ma trận admin) — đọc thẳng DB (không qua cache).
//   - projectId = undefined → trả hết (toàn hệ + mọi dự án).
//   - projectId = null       → chỉ override toàn hệ (project_id IS NULL).
//   - projectId = số         → chỉ override của dự án đó.
export async function listPermissionOverrides(projectId?: number | null): Promise<PermOverride[]> {
  if (projectId === undefined) {
    return query<PermOverride>(
      `SELECT role, perm_key AS "permKey", allowed, project_id AS "projectId"
         FROM role_permissions ORDER BY role, perm_key, project_id NULLS FIRST`,
    );
  }
  if (projectId === null) {
    return query<PermOverride>(
      `SELECT role, perm_key AS "permKey", allowed, project_id AS "projectId"
         FROM role_permissions WHERE project_id IS NULL ORDER BY role, perm_key`,
    );
  }
  return query<PermOverride>(
    `SELECT role, perm_key AS "permKey", allowed, project_id AS "projectId"
       FROM role_permissions WHERE project_id = ? ORDER BY role, perm_key`,
    projectId,
  );
}

// Ghi/xoá override cho 1 cặp (role, permKey) ở 1 phạm vi (projectId = số | null toàn hệ):
//   - allowed = true|false → upsert.
//   - allowed = null       → xoá override (về mặc định/kế thừa).
// Bọc trong withTransaction để trigger audit (0058) ghi được actor từ SET LOCAL
// (app.user_id/role do request-context truyền). Nạp lại cache ngay sau khi ghi.
export async function setPermissionOverride(
  role: Role,
  permKey: string,
  allowed: boolean | null,
  updatedBy: number | null,
  projectId: number | null = null, // mặc định null = override TOÀN HỆ (tương thích ngược M50)
): Promise<void> {
  await withTransaction(async () => {
    if (allowed === null) {
      // Unique là index biểu thức COALESCE(project_id, 0) nên DELETE phải khớp NULL đúng
      // bằng IS NOT DISTINCT FROM (không dùng "= ?" vì NULL = NULL trả NULL).
      await run(
        `DELETE FROM role_permissions
          WHERE role = ? AND perm_key = ? AND project_id IS NOT DISTINCT FROM ?`,
        role,
        permKey,
        projectId,
      );
    } else {
      await run(
        `INSERT INTO role_permissions (role, perm_key, allowed, project_id, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, now())
         ON CONFLICT (role, perm_key, COALESCE(project_id, 0))
         DO UPDATE SET allowed = EXCLUDED.allowed, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        role,
        permKey,
        allowed,
        projectId,
        updatedBy,
      );
    }
  });
  await invalidatePermissionCache();
}
