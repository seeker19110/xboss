-- 0175 — Đợt tối ưu 3 (G2, jobs/P1): dựng lại mv_progress_daily theo kiểu DELTA + TỔNG LUỸ KẾ.
-- Bản 0055 tính mỗi ô (ngày × task) bằng 1 truy vấn con tương quan quét ngược task_history
-- (CASE bị inline 2 lần cho AVG và COUNT FILTER → 2 index scan/ô): O(ngày × task), đo 23,5 s ở
-- 2.000 task × 1 năm, chạm statement_timeout 30 s của pool ở ~0,9 triệu ô → REFRESH hỏng, MV
-- đứng yên, S-curve rơi về nhánh tái dựng chậm. Bản này O(lịch sử + nhóm × ngày).
--
-- GIỮ NGUYÊN: tên MV, tên/kiểu/thứ tự cột (project_id int, system_id int, date date,
-- avg_progress float8, done_count bigint, total_count bigint), unique index ux_mv_progress_daily
-- (REFRESH CONCURRENTLY), sentinel 0, dải ngày (MIN toàn hệ → CURRENT_DATE), và NGỮ NGHĨA của
-- 0055 — kể cả chỗ khác bản JS của route S-curve (giữ y như MV cũ, không "sửa" ở đây):
--   giá trị task tại ngày d =
--     task không lịch sử       → progress_percent hiện tại (có thể NULL);
--     có sự kiện ngày VN ≤ d   → COALESCE(new_progress của sự kiện cuối, old_progress đầu, 0);
--     chưa có sự kiện ≤ d      → COALESCE(old_progress đầu, 0).
--   avg_progress = AVG bỏ qua NULL → mẫu số là số task giá trị KHÁC NULL (tách khỏi total_count);
--   done_count = số task có giá trị ≥ 1; total_count = mọi task của nhóm.
-- Cách tính: v0 = giá trị trước sự kiện đầu; mỗi (task, ngày VN) có sự kiện lấy giá trị cuối ngày
-- (DISTINCT ON); dv = v − LAG(v, v0); cộng dv theo (dự án, hệ, ngày) rồi SUM() OVER theo ngày +
-- Σv0. Tổng làm trên NUMERIC (float8::text::numeric — chuỗi shortest-roundtrip, không mất chữ số
-- như ::numeric trực tiếp) để cộng/trừ delta không trôi sai số; chỉ phép chia cuối ra float8.
-- Trùng changed_at: tie-break theo id (bản 0055 phụ thuộc thứ tự quét, không xác định).
--
-- Phụ thuộc: bi.task_history_daily (0073) đọc MV → DROP + dựng lại nguyên văn + GRANT lại
-- (khuôn 0159/0167). Quyền xboss_app (0069: SELECT/INSERT/UPDATE/DELETE) cấp lại tường minh,
-- không chỉ trông vào ALTER DEFAULT PRIVILEGES của role chạy migration.
-- Chỉ DROP/CREATE đối tượng dẫn xuất (MV + view), không đụng dòng dữ liệu bảng gốc; MV nạp dữ
-- liệu ngay (WITH DATA) nên REFRESH CONCURRENTLY của cron chạy được ngay lần đầu. Idempotent:
-- DROP ... IF EXISTS + CREATE.
DO $$
BEGIN
  DROP VIEW IF EXISTS bi.task_history_daily;
  DROP MATERIALIZED VIEW IF EXISTS mv_progress_daily;

  CREATE MATERIALIZED VIEW mv_progress_daily AS
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
  first_ev AS (
    SELECT DISTINCT ON (h.task_id) h.task_id, h.old_progress AS first_old
      FROM task_history h
     ORDER BY h.task_id, h.changed_at, h.id
  ),
  task_base AS (
    SELECT t.id AS task_id,
           COALESCE(tw.project_id, 0) AS project_id, COALESCE(st.system_id, 0) AS system_id,
           fe.task_id IS NOT NULL AS has_history,
           fe.first_old,
           CASE WHEN fe.task_id IS NULL THEN t.progress_percent
                ELSE COALESCE(fe.first_old, 0) END AS v0
      FROM tasks t
      JOIN work_packages wp ON wp.id = t.package_id
      JOIN sheet_types st ON st.id = wp.sheet_type_id
      LEFT JOIN towers tw ON tw.id = st.tower_id
      LEFT JOIN first_ev fe ON fe.task_id = t.id
  ),
  day_last AS (
    SELECT DISTINCT ON (h.task_id, dd) h.task_id,
           (h.changed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS dd,
           h.new_progress
      FROM task_history h
     ORDER BY h.task_id, dd, h.changed_at DESC, h.id DESC
  ),
  ev AS (
    SELECT tb.project_id, tb.system_id, dl.dd,
           COALESCE(dl.new_progress, tb.first_old, 0) AS v,
           LAG(COALESCE(dl.new_progress, tb.first_old, 0), 1, tb.v0)
             OVER (PARTITION BY dl.task_id ORDER BY dl.dd) AS v_prev
      FROM day_last dl
      JOIN task_base tb ON tb.task_id = dl.task_id
  ),
  delta AS (
    SELECT project_id, system_id, dd,
           SUM(v::text::numeric - v_prev::text::numeric) AS d_sum,
           SUM((v >= 1)::int - (v_prev >= 1)::int) AS d_done
      FROM ev
     GROUP BY project_id, system_id, dd
  ),
  grp AS (
    SELECT project_id, system_id,
           COALESCE(SUM(v0::text::numeric), 0) AS base_sum,
           COUNT(v0) AS n_nonnull,
           COUNT(*) FILTER (WHERE v0 >= 1) AS base_done,
           COUNT(*) AS total_count
      FROM task_base
     GROUP BY project_id, system_id
  ),
  grid AS (
    SELECT g.project_id, g.system_id, d.d AS date, g.base_sum, g.n_nonnull, g.base_done,
           g.total_count,
           COALESCE(SUM(de.d_sum) OVER w, 0) AS cum_sum,
           COALESCE(SUM(de.d_done) OVER w, 0) AS cum_done
      FROM grp g
      CROSS JOIN days d
      LEFT JOIN delta de
        ON de.project_id = g.project_id AND de.system_id = g.system_id AND de.dd = d.d
    WINDOW w AS (PARTITION BY g.project_id, g.system_id ORDER BY d.d
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  )
  SELECT project_id, system_id, date,
         CASE WHEN n_nonnull > 0
              THEN (round(base_sum + cum_sum, 30) / n_nonnull)::double precision
         END AS avg_progress,
         (base_done + cum_done)::bigint AS done_count,
         total_count
    FROM grid;

  CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_progress_daily
    ON mv_progress_daily (project_id, system_id, date);

  -- Nguyên văn 0073.
  CREATE OR REPLACE VIEW bi.task_history_daily AS
  SELECT m.project_id,
         m.system_id,
         m.date,
         m.avg_progress,
         m.done_count,
         m.total_count,
         p.name AS project_name,
         sy.name AS system_name
    FROM mv_progress_daily m
    LEFT JOIN projects p ON p.id = m.project_id
    LEFT JOIN systems sy ON sy.id = m.system_id;
END $$;

DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON mv_progress_daily TO xboss_app;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Role xboss_app chưa tồn tại — bỏ qua GRANT mv_progress_daily.';
END $$;

DO $$
BEGIN
  GRANT SELECT ON bi.task_history_daily TO xboss_bi;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Role xboss_bi chưa tồn tại — bỏ qua GRANT bi.task_history_daily.';
END $$;
