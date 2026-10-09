-- M129: dựng lại matview — CREATE/REFRESH, không UPDATE dữ liệu nghiệp vụ → không cần staging.
-- "Đã duyệt" ≠ "đã chi" (docs/nang-cap/M129-ipc-da-chi-tach-cam-ket-thuc-chi.md): mv_cost_by_month
-- dựng ở 0159 cộng MỌI phiếu vào `actual` theo paid_date → phiếu IPC committed (chưa chi) lọt vào
-- thực chi của BI/báo cáo. Dựng lại theo đúng khuôn 0159, chỉ đổi CTE `actual`: lọc
-- pay_status = 'paid' và gom tháng theo ngày chi thật COALESCE(paid_at, paid_date) — khớp đường
-- fallback trong lib/tien-do/reports.ts. bi.cost_by_month_fin phụ thuộc matview nên DROP + dựng
-- lại + GRANT lại cho xboss_bi như 0159. bi.cash_fin (0073) thêm cột pay_status, paid_at VÀO CUỐI
-- danh sách cột (CREATE OR REPLACE VIEW chỉ cho thêm cột cuối). Idempotent: DROP IF EXISTS +
-- CREATE / CREATE OR REPLACE.
DO $$
BEGIN
  DROP VIEW IF EXISTS bi.cost_by_month_fin;
  DROP MATERIALIZED VIEW IF EXISTS mv_cost_by_month;

  CREATE MATERIALIZED VIEW mv_cost_by_month AS
  WITH committed_po AS (
    SELECT po.project_id, to_char(po.created_at, 'YYYY-MM') AS month,
           SUM(poi.qty_ordered::text::numeric * COALESCE(poi.unit_price, 0)) AS amount
      FROM po_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
     WHERE po.status <> 'cancelled'
     GROUP BY po.project_id, month
  ),
  committed_fc AS (
    SELECT c.project_id,
           to_char(COALESCE(c.signed_date, c.created_at::date), 'YYYY-MM') AS month,
           SUM(fc.contract_value) AS amount
      FROM floor_contracts fc
      JOIN contracts c ON c.id = fc.contract_id
     GROUP BY c.project_id, month
  ),
  committed AS (
    SELECT project_id, month, SUM(amount) AS committed
      FROM (SELECT * FROM committed_po UNION ALL SELECT * FROM committed_fc) u
     GROUP BY project_id, month
  ),
  actual AS (
    SELECT tw.project_id, to_char(COALESCE(pb.paid_at, pb.paid_date), 'YYYY-MM') AS month,
           SUM(pb.amount) AS actual
      FROM payment_bills pb
      JOIN sheet_types st ON st.id = pb.sheet_type_id
      LEFT JOIN towers tw ON tw.id = st.tower_id
     WHERE pb.pay_status = 'paid'
     GROUP BY tw.project_id, month
  ),
  committed_n AS (SELECT COALESCE(project_id, 0) AS project_id, month, committed FROM committed),
  actual_n AS (SELECT COALESCE(project_id, 0) AS project_id, month, actual FROM actual)
  SELECT COALESCE(c.project_id, a.project_id) AS project_id,
         COALESCE(c.month, a.month) AS month,
         ROUND(COALESCE(c.committed, 0), 2) AS committed,
         COALESCE(a.actual, 0) AS actual
    FROM committed_n c
    FULL OUTER JOIN actual_n a ON a.project_id = c.project_id AND a.month = c.month;

  CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_cost_by_month
    ON mv_cost_by_month (project_id, month);

  CREATE OR REPLACE VIEW bi.cost_by_month_fin AS
  SELECT m.project_id,
         m.month,
         m.committed,
         m.actual,
         p.name AS project_name
    FROM mv_cost_by_month m
    LEFT JOIN projects p ON p.id = m.project_id;

  CREATE OR REPLACE VIEW bi.cash_fin AS
  SELECT pb.id AS bill_id,
         pb.type,
         pb.responsible,
         pb.period,
         pb.paid_date,
         pb.amount,
         pb.labor,
         pb.description,
         pb.contract_id,
         pb.payment_cert_id,
         pb.sheet_type_id,
         pb.floor_label,
         pb.project_id,
         p.name AS project_name,
         pb.pay_status,
         pb.paid_at
    FROM payment_bills pb
    LEFT JOIN projects p ON p.id = pb.project_id;
END $$;

DO $$
BEGIN
  GRANT SELECT ON bi.cost_by_month_fin TO xboss_bi;
  GRANT SELECT ON bi.cash_fin TO xboss_bi;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Role xboss_bi chưa tồn tại — bỏ qua GRANT bi.cost_by_month_fin/bi.cash_fin.';
END $$;
