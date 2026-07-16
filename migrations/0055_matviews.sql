-- 0055_matviews.sql — M47 PR2: materialized views tách đọc-nặng khỏi tái dựng mỗi request.
-- Xem docs/nang-cap/M47-evm-bi.md mục PR2. Thêm thuần (CREATE MATERIALIZED VIEW/INDEX,
-- không đụng dữ liệu hiện có) → đi thẳng production. REFRESH qua GET /api/cron/refresh-views.
--
-- Phạm vi thực tế hẹp hơn đặc tả gốc một chút — ghi rõ, không lặng lẽ bỏ qua:
-- mv_progress_daily chỉ phục vụ ĐƯỜNG THỰC TẾ (không phụ thuộc baseline) của S-curve khi
-- KHÔNG lọc theo sheet (lọc hệ hoặc toàn dự án) — S-curve lọc theo sheet (mịn hơn hệ) vẫn
-- tính trực tiếp như cũ vì MV chỉ gộp tới cấp hệ. EVM (lib/evm.ts) KHÔNG đọc MV này vì % thực
-- tế ở đó cần trọng số giá trị BOQ theo từng task (mv_progress_daily chỉ lưu trung bình
-- KHÔNG trọng số) — dùng sẽ cho SPI/CPI sai; AC của EVM vốn đã 1 query SQL hiệu quả, không
-- cần cache thêm. mv_cost_by_month nối vào cột "committed" của nguồn cost_by_month
-- (lib/reports.ts, M47 PR3) — trước PR2 nguồn đó chỉ có "actual".

-- Composite index tăng tốc lookup "giá trị task tại ngày d" (LATERAL bên dưới) — bổ sung
-- cho idx_history_task/idx_history_changed_at đã có (migrations/0001_baseline.sql).
CREATE INDEX IF NOT EXISTS idx_task_history_task_changed ON task_history(task_id, changed_at DESC);

-- mv_progress_daily(project_id, system_id, date, avg_progress, done_count, total_count):
-- tiến độ trung bình mỗi ngày, gộp theo (dự án, hệ). Task chưa từng có task_history → coi
-- như tiến độ hiện tại không đổi suốt toàn dải ngày (đúng theo giả định hiện có ở
-- app/api/dashboard/scurve/route.ts — "không có lịch sử → % hiện tại từ đầu").
--
-- REFRESH CONCURRENTLY (bắt buộc theo đặc tả — không khoá đọc) chỉ chấp nhận UNIQUE INDEX
-- trên CỘT THẲNG, không được là expression/partial index — nên KHÔNG thể để project_id/
-- system_id NULL rồi COALESCE ở tầng index (Postgres từ chối "cannot refresh ... concurrently").
-- Giải pháp: gán sentinel 0 ngay trong SELECT (SERIAL luôn bắt đầu từ 1 nên 0 không bao giờ
-- trùng ID thật) — tầng đọc (route) phải quy đổi `projectId ?? 0` / `systemId ?? 0` khi
-- truy vấn MV này để khớp sentinel.
-- Bucket theo NGÀY GIỜ VN (AT TIME ZONE 'Asia/Ho_Chi_Minh') — PHẢI khớp hệt cách
-- app/api/dashboard/scurve/route.ts quy đổi changed_at → ngày, nếu không MV sẽ lệch 1 ngày
-- với JS ở các sự kiện gần nửa đêm giờ VN (UTC+7).
-- Trước sự kiện đầu tiên: dùng old_progress của sự kiện đó (khớp `baseline.set(...,
-- oldProgress ?? 0)` trong scurve route) — KHÔNG phải progress hiện tại; chỉ task
-- CHƯA TỪNG có history mới dùng progress hiện tại (khớp nhánh `if (!events) sum += t.progress`).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_progress_daily AS
WITH bounds AS (
  SELECT LEAST(
    (SELECT MIN(start_date) FROM tasks WHERE start_date IS NOT NULL),
    (SELECT MIN((changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) FROM task_history)
  ) AS min_d
),
days AS (
  SELECT generate_series(b.min_d, CURRENT_DATE, interval '1 day')::date AS d
    FROM bounds b WHERE b.min_d IS NOT NULL
),
task_scope AS (
  SELECT t.id AS task_id, t.progress_percent AS current_progress,
         COALESCE(tw.project_id, 0) AS project_id, COALESCE(st.system_id, 0) AS system_id,
         EXISTS (SELECT 1 FROM task_history h WHERE h.task_id = t.id) AS has_history,
         (SELECT h.old_progress FROM task_history h
           WHERE h.task_id = t.id ORDER BY h.changed_at ASC LIMIT 1) AS first_old_progress
    FROM tasks t
    JOIN work_packages wp ON wp.id = t.package_id
    JOIN sheet_types st ON st.id = wp.sheet_type_id
    LEFT JOIN towers tw ON tw.id = st.tower_id
),
per_task_day AS (
  SELECT d.d AS date, ts.project_id, ts.system_id,
         CASE WHEN NOT ts.has_history THEN ts.current_progress
              ELSE COALESCE(
                (SELECT h.new_progress FROM task_history h
                  WHERE h.task_id = ts.task_id
                    AND (h.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= d.d
                  ORDER BY h.changed_at DESC LIMIT 1),
                ts.first_old_progress, 0)
         END AS progress
    FROM days d
    CROSS JOIN task_scope ts
)
SELECT project_id, system_id, date,
       AVG(progress) AS avg_progress,
       COUNT(*) FILTER (WHERE progress >= 1) AS done_count,
       COUNT(*) AS total_count
  FROM per_task_day
 GROUP BY project_id, system_id, date;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_progress_daily
  ON mv_progress_daily (project_id, system_id, date);

-- mv_cost_by_month(project_id, month, committed, actual):
--   committed = Σ po_items (đơn chưa huỷ, quy tháng theo purchase_orders.created_at)
--             + Σ floor_contracts.contract_value (quy tháng theo contracts.signed_date,
--               fallback created_at — LƯU Ý: floor_contracts chưa gắn contract_id (hiếm,
--               dữ liệu cũ) sẽ KHÔNG xuất hiện ở đây, khác committedBySystem() trong
--               lib/cost.ts vốn gộp mọi floor_contract bất kể contract_id — giới hạn đã
--               biết, chấp nhận vì phục vụ biểu đồ theo tháng cần một mốc thời gian).
--   actual = Σ payment_bills.amount theo paid_date (mọi type, nhất quán lib/cost.ts).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_cost_by_month AS
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
-- Sentinel 0 cho project_id NULL — cùng lý do mv_progress_daily ở trên (REFRESH
-- CONCURRENTLY không chấp nhận unique index kiểu COALESCE(...)).
committed_n AS (SELECT COALESCE(project_id, 0) AS project_id, month, committed FROM committed),
actual_n AS (SELECT COALESCE(project_id, 0) AS project_id, month, actual FROM actual)
SELECT COALESCE(c.project_id, a.project_id) AS project_id,
       COALESCE(c.month, a.month) AS month,
       COALESCE(c.committed, 0) AS committed,
       COALESCE(a.actual, 0) AS actual
  FROM committed_n c
  FULL OUTER JOIN actual_n a ON a.project_id = c.project_id AND a.month = c.month;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_cost_by_month
  ON mv_cost_by_month (project_id, month);
