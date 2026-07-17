// Cờ tính năng theo dự án (M52 PR4) — bật/tắt cả 1 module (lib/modules.ts::MODULES) cho
// từng dự án. Mặc định KHÔNG có dòng = BẬT (tương thích ngược tuyệt đối khi bảng rỗng).
// Cache trong bộ nhớ + watermark version (bám đúng pattern lib/code-lists.ts): mọi ghi
// (setFlag) gọi bumpFeatureFlagsVersion() để vô hiệu cache lần đọc sau.
import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";
import { MODULES } from "@/lib/modules";

let version = 0;
// Cache theo projectId — value là Map<module_key, enabled> chỉ chứa override đã lưu.
const cache = new Map<number, { v: number; overrides: Map<string, boolean> }>();

export function bumpFeatureFlagsVersion(): void {
  version++;
}

export function featureFlagsVersion(): number {
  return version;
}

async function getOverrides(projectId: number): Promise<Map<string, boolean>> {
  const cached = cache.get(projectId);
  if (cached && cached.v === version) return cached.overrides;
  const rows = await query<{ moduleKey: string; enabled: boolean }>(
    `SELECT module_key AS "moduleKey", enabled FROM feature_flags WHERE project_id = ?`,
    projectId,
  );
  const overrides = new Map(rows.map((r) => [r.moduleKey, r.enabled]));
  cache.set(projectId, { v: version, overrides });
  return overrides;
}

/** true nếu module đang bật cho dự án (chưa có dòng ghi đè = bật). */
export async function isModuleEnabled(moduleKey: string, projectId: number): Promise<boolean> {
  const overrides = await getOverrides(projectId);
  return overrides.get(moduleKey) ?? true;
}

/** Toàn bộ module × trạng thái cho 1 dự án (đã merge mặc định bật) — dùng cho UI ma trận
 *  và sidebar (ẩn nav của module tắt). */
export async function getModuleFlags(projectId: number): Promise<Map<string, boolean>> {
  const overrides = await getOverrides(projectId);
  const map = new Map<string, boolean>();
  for (const m of MODULES) map.set(m.key, overrides.get(m.key) ?? true);
  return map;
}

export async function setFlag(
  moduleKey: string,
  projectId: number,
  enabled: boolean,
  actorId: number,
): Promise<void> {
  await run(
    `INSERT INTO feature_flags (module_key, project_id, enabled, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (module_key, project_id) DO UPDATE
       SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    moduleKey,
    projectId,
    enabled,
    actorId,
  );
  bumpFeatureFlagsVersion();
}

/** Chặn đầu route thuộc `routePrefix` của 1 module: trả `NextResponse` 404 khi module bị
 *  tắt cho dự án, `null` khi được đi tiếp (module bật hoặc dự án null — vd route xuyên
 *  dự án/chưa chọn dự án thì không chặn, tránh khoá nhầm khi chưa xác định được dự án). */
export async function assertModuleEnabled(
  moduleKey: string,
  projectId: number | null,
): Promise<NextResponse | null> {
  if (projectId == null) return null;
  const enabled = await isModuleEnabled(moduleKey, projectId);
  if (!enabled)
    return NextResponse.json({ error: "Tính năng đang bị tắt cho dự án này" }, { status: 404 });
  return null;
}

/** Tra module_key theo route API đang gọi — khớp tiền tố dài nhất trong `routePrefix`. */
export function findModuleByRoute(pathname: string): string | undefined {
  let best: { key: string; len: number } | undefined;
  for (const m of MODULES) {
    for (const prefix of m.routePrefix) {
      if (pathname.startsWith(prefix) && (!best || prefix.length > best.len)) {
        best = { key: m.key, len: prefix.length };
      }
    }
  }
  return best?.key;
}
