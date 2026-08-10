-- 0083 — po_items.unit_price: DOUBLE PRECISION → NUMERIC(15,2)
--
-- Vì sao: `po_items.unit_price` là cột TIỀN duy nhất còn ở kiểu float, trong khi mọi cột
-- tiền khác của dự án đều là NUMERIC(15,2) (contracts.value, payment_cert_items.unit_price,
-- boq_items.unit_price...). Hệ quả: `SUM(qty_ordered * COALESCE(unit_price, 0))` — dùng ở
-- lib/finance.ts (payables), lib/contracts.ts (poCommitted) và matview mv_cost_by_month
-- (0055_matviews.sql) — CỘNG/NHÂN TIỀN TRÊN FLOAT ngay trong SQL, trái quy ước tiền tệ
-- M45 PR1 trong CLAUDE.md. Cast `::text` ở tầng JS không cứu được vì sai số đã sinh ra
-- từ phép SUM trong Postgres.
--
-- `qty_ordered`/`qty_received` GIỮ NGUYÊN DOUBLE PRECISION — đó là KHỐI LƯỢNG (mét, kg,
-- cái...), không phải tiền; đổi kiểu chúng sẽ chặn số lẻ hợp lệ ngoài 2 chữ số thập phân.
--
-- ⚠️ Migration ĐỤNG DỮ LIỆU (ALTER COLUMN ... TYPE, viết lại toàn bảng + khoá ACCESS
-- EXCLUSIVE trên po_items). Theo DoD trong CLAUDE.md: PHẢI chạy staging trước
-- (`bash deploy.sh --staging`, xem docs/ops/staging.md), kiểm trước bằng
-- `npm run db:migrate -- --dry-run`, rồi mới lên production.
--
-- Làm tròn: giá trị float hiện có được ép về 2 chữ số thập phân (đơn vị đồng). Đơn giá
-- VND trong dữ liệu thật là số nguyên nên không mất gì; nếu có đơn giá ngoại tệ lẻ >2 chữ
-- số thập phân thì sẽ bị làm tròn — kiểm bằng câu SELECT này TRƯỚC khi chạy staging:
--
--   SELECT COUNT(*) FROM po_items
--    WHERE unit_price IS NOT NULL AND unit_price <> ROUND(unit_price::numeric, 2);
--
-- Vì sao phải DROP/CREATE lại matview: Postgres từ chối `ALTER COLUMN ... TYPE` khi có
-- view/matview phụ thuộc cột đó ("rule _RETURN on materialized view mv_cost_by_month
-- depends on column unit_price", SQLSTATE 0A000 — đã tái hiện thật trên Postgres 16 khi
-- viết migration này). `mv_cost_by_month` là dependent DUY NHẤT (kiểm bằng pg_depend +
-- pg_rewrite); định nghĩa dưới đây COPY NGUYÊN VĂN từ 0055_matviews.sql, không đổi một
-- dòng logic nào — chỉ dựng lại để cột committed đổi theo kiểu mới của unit_price.
-- `bi.cost_by_month_fin` (0073_bi_schema.sql) lại phụ thuộc chính matview đó nên cũng
-- phải dựng lại (cũng copy nguyên văn) + GRANT lại cho role xboss_bi. Cả 2 phụ thuộc này
-- đều tìm ra bằng cách CHẠY THẬT migration trên Postgres 16, không phải suy từ code.
-- Matview tạo lại được nạp dữ liệu ngay (CREATE ... AS); cron `refresh-views` vẫn làm
-- mới định kỳ như trước.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'po_items' AND column_name = 'unit_price'
       AND data_type = 'double precision'
  ) THEN
    RETURN;  -- đã đổi kiểu ở lần chạy trước → không làm gì (idempotent)
  END IF;

  DROP VIEW IF EXISTS bi.cost_by_month_fin;
  DROP MATERIALIZED VIEW IF EXISTS mv_cost_by_month;

  ALTER TABLE po_items
    ALTER COLUMN unit_price TYPE NUMERIC(15,2)
    USING ROUND(unit_price::numeric, 2);

  -- Dựng lại y hệt 0055_matviews.sql.
  CREATE MATERIALIZED VIEW mv_cost_by_month AS
  WITH committed_po AS (
    SELECT po.project_id, to_char(po.created_at, 'YYYY-MM') AS month,
           SUM(poi.qty_ordered * COALESCE(poi.unit_price, 0)) AS amount
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
         COALESCE(c.committed, 0) AS committed,
         COALESCE(a.actual, 0) AS actual
    FROM committed_n c
    FULL OUTER JOIN actual_n a ON a.project_id = c.project_id AND a.month = c.month;

  -- Unique index bắt buộc cho REFRESH MATERIALIZED VIEW CONCURRENTLY (0055).
  CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_cost_by_month
    ON mv_cost_by_month (project_id, month);

  -- Dựng lại y hệt 0073_bi_schema.sql.
  CREATE OR REPLACE VIEW bi.cost_by_month_fin AS
  SELECT m.project_id,
         m.month,
         m.committed,
         m.actual,
         p.name AS project_name
    FROM mv_cost_by_month m
    LEFT JOIN projects p ON p.id = m.project_id;
END $$;

-- GRANT lại cho role BI (view vừa dựng lại là object MỚI). Bọc EXCEPTION y hệt 0073 —
-- role xboss_bi tạo tay lúc deploy, có thể chưa tồn tại.
DO $$
BEGIN
  GRANT SELECT ON bi.cost_by_month_fin TO xboss_bi;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Role xboss_bi chưa tồn tại — bỏ qua GRANT bi.cost_by_month_fin.';
END $$;
