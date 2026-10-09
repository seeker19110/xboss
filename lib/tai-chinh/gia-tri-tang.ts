import { query, queryOne } from "@/lib/db";

export type FloorRow = {
  sheetTypeId: number;
  sheetType: string;
  sheetSlug: string | null;
  responsible: string | null;
  floorLabel: string;
  progress: number;
  taskCount: number;
  delayed: number;
  // S10c: tiền đọc `::text` (exact) rồi mới đổi sang wire ở biên DTO.
  contractValue: string;
  earned: string;
};

/**
 * Giá trị hợp đồng + tiến độ theo tầng × hệ của một dự án (dùng chung GET /api/payments và
 * export Excel trang Thanh toán). Tiền giữ `::text`; tổng tính trong SQL.
 */
export async function giaTriTheoTangHe(
  projectId: number,
): Promise<{ rows: FloorRow[]; totalContract: string; totalEarned: string }> {
  const towerJoin = " JOIN towers tw ON tw.id = st.tower_id";
  const towerFilter = " AND tw.project_id = ?";

  const rows = await query<FloorRow>(
    `
    SELECT st.id AS "sheetTypeId", st.code AS "sheetType", st.slug AS "sheetSlug",
           st.responsible AS responsible,
           wp.floor_label AS "floorLabel",
           COALESCE(AVG(t.progress_percent), 0) AS progress,
           COUNT(DISTINCT t.id)::int AS "taskCount",
           COALESCE(SUM(CASE WHEN t.status = 'tre' THEN 1 ELSE 0 END), 0)::int AS delayed,
           COALESCE(fc.contract_value, 0)::text AS "contractValue",
           ROUND(COALESCE(fc.contract_value, 0)
                 * COALESCE(AVG(t.progress_percent::numeric), 0), 2)::text AS earned
      FROM work_packages wp
      JOIN sheet_types st ON wp.sheet_type_id = st.id${towerJoin}
      LEFT JOIN tasks t ON t.package_id = wp.id
      LEFT JOIN floor_contracts fc
             ON fc.sheet_type_id = st.id AND fc.floor_label = wp.floor_label
     WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''${towerFilter}
     GROUP BY st.id, st.code, st.slug, st.responsible, wp.floor_label, fc.contract_value
     ORDER BY st.id, wp.floor_label`,
    projectId,
  );

  // Tổng hợp làm trong SQL (không cộng/nhân tiền trên số JS parse từ NUMERIC —
  // xem CLAUDE.md mục Quy ước / lib/money.ts) — cùng điều kiện lọc/nhóm với câu trên.
  // progress_percent float8 ép ::numeric TRƯỚC khi nhân tiền (A3-FR04) — tích float8 cũ mất xu.
  const totals = await queryOne<{ totalContract: string; totalEarned: string }>(
    `
    WITH floor_data AS (
      SELECT st.id, wp.floor_label,
             COALESCE(fc.contract_value, 0) AS contract_value,
             ROUND(COALESCE(fc.contract_value, 0)
                   * COALESCE(AVG(t.progress_percent::numeric), 0), 2) AS earned
        FROM work_packages wp
        JOIN sheet_types st ON wp.sheet_type_id = st.id${towerJoin}
        LEFT JOIN tasks t ON t.package_id = wp.id
        LEFT JOIN floor_contracts fc
               ON fc.sheet_type_id = st.id AND fc.floor_label = wp.floor_label
       WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''${towerFilter}
       GROUP BY st.id, wp.floor_label, fc.contract_value
    )
    SELECT COALESCE(SUM(contract_value), 0)::text AS "totalContract",
           COALESCE(SUM(earned), 0)::text AS "totalEarned"
      FROM floor_data`,
    projectId,
  );

  return {
    rows,
    totalContract: totals?.totalContract ?? "0.00",
    totalEarned: totals?.totalEarned ?? "0.00",
  };
}
