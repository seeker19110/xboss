import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/materials/reports → tổng hợp: tồn kho, vượt định mức, tồn lâu, xuất không task, cần nhập
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) {
    return NextResponse.json({
      stockSummary: [],
      overBudget: [],
      lowStock: [],
      warehouseAge: [],
      noTaskIssues: [],
      needsStock: [],
      byFloor: [],
    });
  }

  try {
    const [stockSummary, overBudget, lowStock, warehouseAge, noTaskIssues, needsStock, byFloor] =
      await Promise.all([
        // 1. Tổng quan kho theo hệ
        query(
          `SELECT st.code AS "sheetCode", st.name AS "sheetName",
              COUNT(m.id) AS "totalItems",
              SUM(m.qty_planned) AS "totalPlanned",
              SUM(m.qty_used) AS "totalUsed",
              SUM(COALESCE(m.qty_stock, 0)) AS "totalStock",
              SUM(CASE WHEN m.qty_used > m.qty_planned AND m.qty_planned > 0 THEN 1 ELSE 0 END) AS "overBudgetCount",
              SUM(CASE WHEN COALESCE(m.qty_stock, 0) < COALESCE(m.min_stock_level, 0) AND m.min_stock_level > 0 THEN 1 ELSE 0 END) AS "lowStockCount"
         FROM materials m
         LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
        WHERE m.project_id = ?
        GROUP BY st.id, st.code, st.name
        ORDER BY st.code`,
          projectId,
        ),

        // 2. Vật tư vượt định mức (hao hụt)
        query(
          `SELECT m.id, m.name, m.boq_code AS "boqCode", m.unit,
              m.qty_planned AS "qtyPlanned", m.qty_used AS "qtyUsed",
              m.qty_used - m.qty_planned AS "overage",
              CASE WHEN m.qty_planned > 0 THEN ROUND(((m.qty_used - m.qty_planned) * 100.0 / m.qty_planned)::numeric, 1) ELSE 0 END AS "overPct",
              st.code AS "sheetCode"
         FROM materials m
         LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
        WHERE m.qty_used > m.qty_planned AND m.qty_planned > 0 AND m.project_id = ?
        ORDER BY (m.qty_used - m.qty_planned) DESC
        LIMIT 50`,
          projectId,
        ),

        // 3. Vật tư tồn kho dưới mức tối thiểu
        query(
          `SELECT m.id, m.name, m.boq_code AS "boqCode", m.unit,
              COALESCE(m.qty_stock, 0) AS "qtyStock",
              m.min_stock_level AS "minStockLevel",
              m.qty_planned AS "qtyPlanned",
              st.code AS "sheetCode"
         FROM materials m
         LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
        WHERE m.min_stock_level > 0 AND COALESCE(m.qty_stock, 0) < m.min_stock_level AND m.project_id = ?
        ORDER BY (COALESCE(m.qty_stock, 0) - m.min_stock_level)`,
          projectId,
        ),

        // 4. Vật tư tồn kho lâu (nhập > 30 ngày, tồn > 0)
        query(
          `SELECT m.id, m.name, m.boq_code AS "boqCode", m.unit,
              COALESCE(m.qty_stock, 0) AS "qtyStock",
              MIN(t.created_at) AS "firstReceived",
              EXTRACT(DAY FROM NOW() - MIN(t.created_at)) AS "daysInStock",
              st.code AS "sheetCode"
         FROM materials m
         LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
         LEFT JOIN material_transactions t ON t.material_id = m.id AND t.type = 'nhap_kho'
        WHERE COALESCE(m.qty_stock, 0) > 0 AND m.project_id = ?
        GROUP BY m.id, m.name, m.boq_code, m.unit, m.qty_stock, m.min_stock_level, st.code
       HAVING MIN(t.created_at) IS NOT NULL
          AND EXTRACT(DAY FROM NOW() - MIN(t.created_at)) > 30
        ORDER BY EXTRACT(DAY FROM NOW() - MIN(t.created_at)) DESC
        LIMIT 30`,
          projectId,
        ),

        // 5. Xuất kho không gắn task (cần điều tra)
        query(
          `SELECT m.id AS "materialId", m.name AS "materialName",
              t.id AS "txId", t.delta, t.created_at AS "createdAt",
              u.name AS "createdByName", t.note
         FROM material_transactions t
         LEFT JOIN materials m ON t.material_id = m.id
         LEFT JOIN users u ON t.created_by = u.id
        WHERE t.type = 'xuat_cong_truong' AND t.task_id IS NULL AND m.project_id = ?
        ORDER BY t.created_at DESC
        LIMIT 30`,
          projectId,
        ),

        // 6. Vật tư cần nhập trước 1 tháng: có hạng mục sắp thi công mà kho chưa đủ
        query(
          `SELECT m.id, m.name, m.boq_code AS "boqCode", m.unit,
              m.qty_planned AS "qtyPlanned",
              COALESCE(m.qty_stock, 0) AS "qtyStock",
              m.qty_used AS "qtyUsed",
              GREATEST(0, m.qty_planned - m.qty_used - COALESCE(m.qty_stock, 0)) AS "needQty",
              st.code AS "sheetCode", st.name AS "sheetName",
              MIN(tk.start_date) AS "earliestStart",
              COUNT(DISTINCT tk.id) AS "upcomingTasks"
         FROM materials m
         JOIN sheet_types st ON m.sheet_type_id = st.id
         JOIN work_packages wp ON wp.sheet_type_id = st.id
         JOIN tasks tk ON tk.package_id = wp.id
        WHERE m.qty_planned > 0
          AND (m.qty_used + COALESCE(m.qty_stock, 0)) < m.qty_planned
          AND tk.start_date >= CURRENT_DATE
          AND tk.start_date <= CURRENT_DATE + INTERVAL '30 days'
          AND tk.status NOT IN ('hoan_thanh', 'nghiem_thu')
          AND m.project_id = ?
        GROUP BY m.id, m.name, m.boq_code, m.unit, m.qty_planned, m.qty_stock, m.qty_used, st.code, st.name
        ORDER BY MIN(tk.start_date), GREATEST(0, m.qty_planned - m.qty_used - COALESCE(m.qty_stock, 0)) DESC
        LIMIT 100`,
          projectId,
        ),

        // 7. Tiêu hao theo tầng (M4): Σ xuất kho ra công trường theo vật tư × tầng.
        // Số lượng xuất = trị tuyệt đối delta của loại 'xuat_cong_truong'/'hoan_kho' (route
        // /issue và /return ghi delta theo chiều tồn kho, xuất ÂM/hoàn DƯƠNG nên đảo dấu)
        // HOẶC delta dương của điều chỉnh thủ công (route /transactions, nút "+" nghĩa là
        // dùng thêm) — các route ghi cùng bảng nhưng khác quy ước dấu, xem lib này.
        // Chưa đối chiếu KL thi công theo tầng (cần nối boq_task_map ↔ work_packages.floor_label
        // của M1 — để đợt sau, xem PROGRESS.md).
        query(
          `SELECT m.id AS "materialId", m.name AS "materialName", m.unit,
              m.boq_code AS "boqCode", st.code AS "sheetCode",
              t.floor_label AS "floorLabel",
              SUM(CASE WHEN t.type IN ('xuat_cong_truong', 'hoan_kho') THEN -t.delta ELSE GREATEST(t.delta, 0) END) AS "qtyIssued"
         FROM material_transactions t
         JOIN materials m ON m.id = t.material_id
         LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
        WHERE t.floor_label IS NOT NULL AND m.project_id = ?
        GROUP BY m.id, m.name, m.unit, m.boq_code, st.code, t.floor_label
       HAVING SUM(CASE WHEN t.type IN ('xuat_cong_truong', 'hoan_kho') THEN -t.delta ELSE GREATEST(t.delta, 0) END) > 0
        ORDER BY m.name, t.floor_label`,
          projectId,
        ),
      ]);

    return NextResponse.json({
      stockSummary,
      overBudget,
      lowStock,
      warehouseAge,
      noTaskIssues,
      needsStock,
      byFloor,
    });
  } catch (e) {
    console.error("[reports]", e);
    return NextResponse.json({ error: "Lỗi máy chủ khi tổng hợp báo cáo vật tư" }, { status: 500 });
  }
}
