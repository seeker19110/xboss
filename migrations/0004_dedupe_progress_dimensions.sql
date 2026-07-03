-- 0004_dedupe_progress_dimensions.sql
-- Sửa dữ liệu hỏng do lỗi ở route thêm/copy cột kích thước
-- (app/api/workpackages/[id]/dimensions/column/route.ts): route POST (thêm cột) không kiểm tra
-- tồn tại chút nào, route PATCH (copy cột) chỉ kiểm tra trên 1 task mẫu (tasks[0]) — khi các task
-- trong cùng nhóm đã lệch bộ cột, thao tác tạo thêm 1 dòng progress_dimensions TRÙNG
-- (task_id, dimension_label) cho task đã có sẵn cột đó. Lưới tracking
-- (GET /api/workpackages/:id/dimensions) gộp cột theo nhãn nên chỉ hiện 1 ô/nhãn — dòng trùng bị
-- "che", không có checkbox nào trỏ tới, nhưng vẫn tính vào mẫu số recomputeTask → % hiển thị thấp
-- hơn thực tế vĩnh viễn dù mọi ô hiển thị đều đã tick, và không tự sửa được qua UI.

-- 1) Gộp trùng: mỗi (task_id, dimension_label) chỉ giữ 1 dòng — ưu tiên dòng installed=1 (không
--    âm thầm bỏ tick tiến độ đã ghi nhận), cùng installed thì giữ id lớn nhất (dòng đang được lưới
--    hiển thị, theo đúng thứ tự ORDER BY sort_order, id mà route GET dimensions dùng để dựng map).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY task_id, dimension_label
           ORDER BY installed DESC, id DESC
         ) AS rn
    FROM progress_dimensions
)
DELETE FROM progress_dimensions pd
 USING ranked r
WHERE pd.id = r.id AND r.rn > 1;

-- 2) Chặn tái phát ở tầng DB — bất kể route nào sau này lỡ quên kiểm tra tồn tại theo từng task.
CREATE UNIQUE INDEX IF NOT EXISTS uq_progress_dimensions_task_label
  ON progress_dimensions(task_id, dimension_label);

-- 3) Tính lại progress_percent + status mọi task còn dòng progress_dimensions (công thức bám
--    lib/recompute.ts: % = checked/total; nghiệm thu giữ nguyên, còn lại suy theo end_date/progress).
WITH dim_agg AS (
  SELECT task_id,
         COUNT(*) FILTER (WHERE installed = 1) AS checked,
         COUNT(*) AS total
    FROM progress_dimensions
   GROUP BY task_id
), new_progress AS (
  SELECT t.id, ROUND((dim_agg.checked::numeric / dim_agg.total) * 100) / 100 AS progress
    FROM tasks t
    JOIN dim_agg ON dim_agg.task_id = t.id
   WHERE dim_agg.total > 0
)
UPDATE tasks t
   SET progress_percent = np.progress,
       status = CASE
         WHEN t.status = 'nghiem_thu' THEN 'nghiem_thu'
         WHEN np.progress >= 1 THEN 'hoan_thanh'
         WHEN t.end_date IS NOT NULL AND t.end_date < CURRENT_DATE THEN 'tre'
         WHEN np.progress > 0 THEN 'dang_thi_cong'
         ELSE 'chuan_bi'
       END,
       updated_at = CURRENT_TIMESTAMP
  FROM new_progress np
 WHERE t.id = np.id
   AND t.progress_percent IS DISTINCT FROM np.progress;

-- 4) Tính lại progress + status mọi work_package theo % task con vừa cập nhật (trung bình, giống
--    recomputePackage).
WITH pkg_agg AS (
  SELECT package_id, ROUND(AVG(progress_percent)::numeric * 100) / 100 AS progress
    FROM tasks
   GROUP BY package_id
)
UPDATE work_packages wp
   SET progress = pkg_agg.progress,
       status = CASE
         WHEN pkg_agg.progress >= 1 THEN 'hoan_thanh'
         WHEN wp.end_date IS NOT NULL AND wp.end_date < CURRENT_DATE THEN 'tre'
         WHEN pkg_agg.progress > 0 THEN 'dang_thi_cong'
         ELSE 'chuan_bi'
       END
  FROM pkg_agg
 WHERE wp.id = pkg_agg.package_id
   AND wp.progress IS DISTINCT FROM pkg_agg.progress;
