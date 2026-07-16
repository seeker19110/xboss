// lib/permissions.ts — M50 PR1: cache override quyền (bảng role_permissions) + CRUD.
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
// KHÔNG import lib/auth ở đây (auth import ngược file này) — tránh phụ thuộc vòng.
import { query, run, withTransaction } from "@/lib/db";
import type { Role } from "@/lib/roles";

export type PermOverride = { role: Role; permKey: string; allowed: boolean };

const TTL_MS = 60_000;

// key = `${role}|${permKey}` → allowed
let snapshot = new Map<string, boolean>();
let loadedAt = 0; // 0 = chưa nạp lần nào (cold start)
let loading: Promise<void> | null = null;

const cacheKey = (role: string, permKey: string) => `${role}|${permKey}`;

async function reload(): Promise<void> {
  const rows = await query<{ role: string; permKey: string; allowed: boolean }>(
    `SELECT role, perm_key AS "permKey", allowed FROM role_permissions`,
  );
  const next = new Map<string, boolean>();
  for (const r of rows) next.set(cacheKey(r.role, r.permKey), r.allowed);
  snapshot = next;
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

// Đọc override ĐỒNG BỘ từ snapshot memory (KHÔNG chạm DB). Trả undefined khi không có
// override cho cặp (role, permKey) → caller (lib/auth) dùng mặc định CAN_DEFAULT.
export function getPermissionOverride(role: string, permKey: string): boolean | undefined {
  maybeRefresh();
  return snapshot.get(cacheKey(role, permKey));
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
}

// Danh sách toàn bộ override (cho trang ma trận admin) — đọc thẳng DB (không qua cache).
export async function listPermissionOverrides(): Promise<PermOverride[]> {
  return query<PermOverride>(
    `SELECT role, perm_key AS "permKey", allowed FROM role_permissions ORDER BY role, perm_key`,
  );
}

// Ghi/xoá override cho 1 cặp (role, permKey):
//   - allowed = true|false → upsert.
//   - allowed = null       → xoá override (về mặc định).
// Bọc trong withTransaction để trigger audit (0049) ghi được actor từ SET LOCAL
// (app.user_id/role do request-context truyền). Nạp lại cache ngay sau khi ghi.
export async function setPermissionOverride(
  role: Role,
  permKey: string,
  allowed: boolean | null,
  updatedBy: number | null,
): Promise<void> {
  await withTransaction(async () => {
    if (allowed === null) {
      await run(`DELETE FROM role_permissions WHERE role = ? AND perm_key = ?`, role, permKey);
    } else {
      await run(
        `INSERT INTO role_permissions (role, perm_key, allowed, updated_by, updated_at)
         VALUES (?, ?, ?, ?, now())
         ON CONFLICT (role, perm_key)
         DO UPDATE SET allowed = EXCLUDED.allowed, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        role,
        permKey,
        allowed,
        updatedBy,
      );
    }
  });
  await invalidatePermissionCache();
}
