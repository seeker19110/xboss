// Suy dự án của task/work_package/sheet_type (vá W0 + W6, Đợt 5) — dùng chung cho mọi route
// ghi/xoá theo :id dưới app/api/workpackages/**, app/api/tasks/[id]/**, app/api/dimensions/**
// để chống ghi/đọc xuyên dự án (id đoán được). Cùng khuôn `workFrontProjectId`
// (lib/tien-do/workfronts.ts). `packageProjectId` từng bị copy riêng lẻ ở
// packages/:id/dependencies — đã đổi sang import từ đây ở W6, không còn bản copy nào khác.
import { queryOne } from "@/lib/db";

/**
 * Dự án của 1 task — suy qua package_id → work_packages.sheet_type_id → sheet_types.tower_id
 * → towers.project_id. LEFT JOIN towers: dòng chưa gán tower ra `projectId = null` → route
 * coi như không thấy được (404), không lộ ra ngoài như thể tồn tại nhưng vô chủ.
 */
export async function taskProjectId(id: number): Promise<number | null> {
  const row = await queryOne<{ projectId: number | null }>(
    `SELECT tw.project_id AS "projectId"
       FROM tasks t
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
      WHERE t.id = ?`,
    id,
  );
  return row?.projectId ?? null;
}

/**
 * Dự án của 1 nhóm việc (work_package) — suy qua sheet_type_id → towers.project_id.
 * LEFT JOIN towers: dòng chưa gán tower ra `projectId = null` → route coi như không thấy được
 * (404), không lộ ra ngoài như thể tồn tại nhưng vô chủ.
 */
export async function packageProjectId(id: number): Promise<number | null> {
  const row = await queryOne<{ projectId: number | null }>(
    `SELECT tw.project_id AS "projectId"
       FROM work_packages wp
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
      WHERE wp.id = ?`,
    id,
  );
  return row?.projectId ?? null;
}

/** Dự án của 1 sheet — suy qua sheet_types.tower_id → towers.project_id. */
export async function sheetTypeProjectId(id: number): Promise<number | null> {
  const row = await queryOne<{ projectId: number | null }>(
    `SELECT tw.project_id AS "projectId"
       FROM sheet_types st
       LEFT JOIN towers tw ON tw.id = st.tower_id
      WHERE st.id = ?`,
    id,
  );
  return row?.projectId ?? null;
}
