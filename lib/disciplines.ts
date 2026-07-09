// Hệ (discipline) — danh mục chuẩn dùng chung cho BOQ (M1), trang riêng từng hệ (M15)
// và các module sau (M2/M3/M8/M14). Logic tính KPI tách khỏi route để test tích hợp
// trực tiếp qua DB (cùng pattern lib/report.ts, lib/recompute.ts).
import { query, queryOne, todayISO } from "@/lib/db";
import { disciplineBudget } from "@/lib/cost";

export type DisciplineSummary = {
  discipline: { id: number; code: string; name: string; color: string | null };
  sheets: {
    id: number;
    code: string;
    name: string;
    slug: string;
    total: number;
    avgProgress: number;
    delayed: number;
  }[];
  progressPercent: number;
  totalTasks: number;
  delayedCount: number;
  waitingApprovalCount: number;
  contractors: {
    id: number;
    supplierId: number;
    supplierName: string;
    floorLabels: string[] | null;
    zone: string | null;
    isPrimary: boolean;
    note: string | null;
  }[];
  ncrOpen: number; // NCR mở của hệ (M3) — 0 khi chưa có NCR nào, không phải null.
  // Khối module chưa triển khai (M2 khi không có quyền xem chi phí, M8, M14) — null tới khi
  // hoàn thành/đủ quyền (pattern M9: UI ẩn khi null).
  budget: number | null;
  drawingsPending: number | null;
  floorsPending: number | null;
};

export async function listDisciplines() {
  const today = todayISO();
  return query(
    `SELECT d.id, d.code, d.name, d.color,
            COUNT(DISTINCT st.id) AS "sheetCount",
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS delayed
       FROM disciplines d
       LEFT JOIN sheet_types st ON st.discipline_id = d.id
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      GROUP BY d.id, d.code, d.name, d.color
      ORDER BY d.id`,
    today,
  );
}

export async function getDisciplineSummary(
  code: string,
  opts: { withCost?: boolean; projectId?: number } = {},
): Promise<DisciplineSummary | null> {
  const discipline = await queryOne<{
    id: number;
    code: string;
    name: string;
    color: string | null;
  }>(`SELECT id, code, name, color FROM disciplines WHERE code = ?`, code);
  if (!discipline) return null;

  const today = todayISO();

  const sheets = await query<{
    id: number;
    code: string;
    name: string;
    slug: string;
    total: number;
    avgProgress: number;
    delayed: number;
  }>(
    `SELECT st.id, st.code, st.name, st.slug,
            COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS delayed
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE st.discipline_id = ?
      GROUP BY st.id, st.code, st.name, st.slug
      ORDER BY st.sort_order, st.id`,
    today,
    discipline.id,
  );

  const overall = await queryOne<{
    avgProgress: number;
    total: number;
    delayed: number;
    waitingApproval: number;
  }>(
    `SELECT COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            COUNT(t.id) AS total,
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS delayed,
            COALESCE(SUM(CASE WHEN t.progress_percent >= 1 AND t.status <> 'nghiem_thu' THEN 1 ELSE 0 END), 0) AS "waitingApproval"
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE st.discipline_id = ?`,
    today,
    discipline.id,
  );

  const ncrOpen = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM ncrs n
       JOIN tasks t ON t.id = n.task_id
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
      WHERE st.discipline_id = ? AND n.status <> 'closed'`,
    discipline.id,
  );

  const contractors = await query<{
    id: number;
    supplierId: number;
    supplierName: string;
    floorLabels: string[] | null;
    zone: string | null;
    isPrimary: boolean;
    note: string | null;
  }>(
    `SELECT dc.id, dc.supplier_id AS "supplierId", s.name AS "supplierName",
            dc.floor_labels AS "floorLabels", dc.zone, dc.is_primary AS "isPrimary", dc.note
       FROM discipline_contractors dc
       JOIN suppliers s ON s.id = dc.supplier_id
      WHERE dc.discipline_id = ?
      ORDER BY dc.is_primary DESC, s.name`,
    discipline.id,
  );

  return {
    discipline,
    sheets,
    progressPercent: overall?.avgProgress ?? 0,
    totalTasks: overall?.total ?? 0,
    delayedCount: overall?.delayed ?? 0,
    waitingApprovalCount: overall?.waitingApproval ?? 0,
    contractors,
    ncrOpen: ncrOpen?.count ?? 0,
    budget: opts.withCost ? await disciplineBudget(discipline.id, true, opts.projectId) : null,
    drawingsPending: null,
    floorsPending: null,
  };
}
