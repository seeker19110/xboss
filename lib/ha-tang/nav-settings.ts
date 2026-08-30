// @deprecated (M52 PR4): granularity mịn hơn feature_flags (per dashboard node, không
// phải per module) — giữ nguyên API/hành vi cho tương thích ngược, KHÔNG xoá/di trú dữ
// liệu. Module mới nên dùng lib/feature-flags.ts (per module × dự án, có enforcement API
// thật qua assertModuleEnabled). Xem docs/nang-cap/M52-mo-rong-cau-hinh.md mục PR4.
//
// Quản trị hiển thị mục AppShell (M21 PR3 — xem docs/nang-cap/M21-appshell-ia.md):
// Admin/PM bật/tắt từng dashboard cấp 3 trong sidebar qua bảng nav_settings. Override
// theo dự án (M22) đã bật thật: `project_id IS NULL` = toàn hệ thống (mặc định), truyền
// `projectId` để merge thêm override riêng dự án đang chọn (đè lên override toàn hệ thống).
import { query, queryOne, run } from "@/lib/db";
import { flattenDashboards } from "@/app/lib/dashboardTree";

// Mặc định khi chưa có bản ghi trong nav_settings: LUÔN bật, kể cả dashboard "coming-soon"
// — giữ đúng hành vi đã có từ M21 PR1 (sidebar hiện badge "Sắp có" cho mọi mục mockup,
// "bản đồ lộ trình sống", đã có e2e test xác nhận). nav_settings chỉ thêm khả năng admin
// TẮT bớt (ẩn hẳn) một mục — không phải cơ chế bật dần roadmap (tránh vô tình ẩn sạch
// mọi mục "Sắp có" ngay khi PR3 lên production, chỉ vì chưa có bản ghi nào trong bảng).
function defaultEnabled(): boolean {
  return true;
}

/** Chặn ghi `node_key` không khớp id dashboard nào trong cây (tránh rác trong bảng). */
export function isKnownNodeKey(key: string): boolean {
  return flattenDashboards().some(({ dashboard }) => dashboard.id === key);
}

/** Đọc bảng nav_settings → Map<node_key, enabled> đã merge mặc định suy từ cây +
 *  override đã lưu (chưa có bản ghi thì dùng mặc định, không seed vào DB). */
export async function getNavSettings(projectId?: number | null): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  for (const { dashboard } of flattenDashboards()) {
    if (dashboard.id) map.set(dashboard.id, defaultEnabled());
  }

  const rows = await query<{ nodeKey: string; enabled: boolean }>(
    `SELECT node_key AS "nodeKey", enabled FROM nav_settings WHERE project_id IS NULL`,
  );
  for (const r of rows) map.set(r.nodeKey, r.enabled);

  if (projectId != null) {
    const overrides = await query<{ nodeKey: string; enabled: boolean }>(
      `SELECT node_key AS "nodeKey", enabled FROM nav_settings WHERE project_id = ?`,
      projectId,
    );
    for (const r of overrides) map.set(r.nodeKey, r.enabled);
  }
  return map;
}

/** Upsert bật/tắt 1 dashboard. Trả `changed`/`wasEnabled` để route quyết định có
 *  phát notification `nav_enabled` hay không (chỉ khi Admin bật false→true). */
export async function setNavEnabled(
  nodeKey: string,
  enabled: boolean,
  projectId: number | null,
  actorId: number,
): Promise<{ changed: boolean; wasEnabled: boolean }> {
  const existing = await queryOne<{ enabled: boolean }>(
    `SELECT enabled FROM nav_settings WHERE node_key = ? AND project_id IS NOT DISTINCT FROM ?`,
    nodeKey,
    projectId,
  );
  const wasEnabled = existing ? existing.enabled : defaultEnabled();

  // Khớp đúng 1 trong 2 index 1 phần ở migrations/0026 (UNIQUE(node_key, project_id)
  // không dùng được: Postgres coi mỗi NULL khác nhau, sẽ chèn thêm dòng mới thay vì update).
  const conflictTarget =
    projectId == null
      ? "(node_key) WHERE project_id IS NULL"
      : "(node_key, project_id) WHERE project_id IS NOT NULL";
  await run(
    `INSERT INTO nav_settings (node_key, project_id, enabled, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT ${conflictTarget} DO UPDATE
       SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    nodeKey,
    projectId,
    enabled,
    actorId,
  );

  return { changed: wasEnabled !== enabled, wasEnabled };
}
