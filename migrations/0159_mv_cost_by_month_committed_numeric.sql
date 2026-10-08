-- S10 đuôi (A3 money): mv_cost_by_month.committed là float8 vì qty_ordered (DOUBLE PRECISION, khối
-- lượng) * unit_price (NUMERIC) ép về float8 trong 0055/0083 → mất chính xác ở giá trị lớn (>2^53
-- đơn vị nhỏ) và tổng nhiều dòng lẻ. Dựng lại matview với committed NUMERIC exact: cast
-- `qty_ordered::text::numeric` (chuỗi shortest-roundtrip của float8, không dùng ::numeric trực tiếp
-- vốn làm tròn 15 chữ số) rồi nhân unit_price NUMERIC(15,2), SUM trong NUMERIC, ROUND 2 số lẻ.
-- Giữ nguyên tên cột/unique index `ux_mv_cost_by_month`; `bi.cost_by_month_fin` phụ thuộc matview
-- nên DROP + dựng lại + GRANT lại cho xboss_bi (copy 0083). Chỉ DROP/CREATE view dẫn xuất, không
-- đụng dữ liệu bảng gốc; matview nạp dữ liệu ngay, cron refresh-views vẫn làm mới định kỳ.
-- Idempotent: DROP ... IF EXISTS + CREATE.
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
    SELECT tw.project_id, to_char(pb.paid_date, 'YYYY-MM') AS month,
           SUM(pb.amount) AS actual
      FROM payment_bills pb
      JOIN sheet_types st ON st.id = pb.sheet_type_id
      LEFT JOIN towers tw ON tw.id = st.tower_id
     WHERE pb.paid_date IS NOT NULL
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
END $$;

DO $$
BEGIN
  GRANT SELECT ON bi.cost_by_month_fin TO xboss_bi;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Role xboss_bi chưa tồn tại — bỏ qua GRANT bi.cost_by_month_fin.';
END $$;
