-- 0148_dimension_events.sql — M120: dữ liệu sự kiện theo ô tick + ngày thực tế của task.
-- Thuần thêm cột NULL-able + 1 index → không đụng dòng dữ liệu hiện có, không đổi bất kỳ
-- con số progress_percent/work_packages.progress nào (M120 không sửa công thức %).
-- Cột `value DOUBLE PRECISION` (0001) là cột CHẾT từ lâu (mọi đường ghi set = installed, không
-- đường nào đọc) — giữ nguyên, deprecated; KHÔNG đổi nghĩa để tránh làm hỏng dữ liệu cũ.
-- KHÔNG tạo cột `qty` ở đây: quyết định R1 (M120 §18) tách sang Giai đoạn 3, nơi đổi công thức %
-- sang trọng số khối lượng — tạo trước sẽ thành cột chết thứ hai bên cạnh `value`.

ALTER TABLE progress_dimensions ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ;
ALTER TABLE progress_dimensions ADD COLUMN IF NOT EXISTS installed_by INTEGER REFERENCES users(id);
ALTER TABLE progress_dimensions ADD COLUMN IF NOT EXISTS note TEXT;

-- Ngày thực tế của task — SUY TỰ ĐỘNG từ chuỗi tick trong recomputeTask, không nhập tay.
-- Kiểu DATE (không TIMESTAMPTZ) để đồng bộ với start_date/end_date: lib/db parse DATE thành
-- CHUỖI 'YYYY-MM-DD', toàn bộ code so sánh ngày bằng so sánh chuỗi.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- Truy vấn "ai tick gì trong khoảng thời gian" (điều tra số liệu bất thường).
CREATE INDEX IF NOT EXISTS idx_dims_installed_at
  ON progress_dimensions(installed_at DESC) WHERE installed_at IS NOT NULL;
