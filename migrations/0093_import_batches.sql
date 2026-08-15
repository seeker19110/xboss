-- 0093_import_batches.sql — C3 §5 "Denominator/import policy" (chia PR mục 8 = C3.4, phần
-- persistence). Đặc tả: docs/nang-cap/C3-data-audit-rls-hardening.md mục 5.
--
-- VẤN ĐỀ ĐANG CÓ: `dimDenominator` ("columns" vs "row-nonempty") quyết định MẪU SỐ khi quy
-- lưới checkbox → %, nhưng chỉ tồn tại trong bộ nhớ đúng một lần lúc import (xem
-- `ImportOptions` trong lib/import.ts, `app/api/import/excel/route.ts`). Sau khi import xong
-- KHÔNG có chỗ nào ghi lại đã dùng chế độ nào, cũng không biết file nguồn là file nào.
-- Hệ quả: nhìn một task 12 ô lưới, KHÔNG ai trả lời được "vì sao 12 mà không phải 20" —
-- con số % không tái lập được. Đó chính là điều C3 §5 yêu cầu đóng.
--
-- CÁCH ĐÓNG (nghĩ cho vòng đời dài, không chỉ cho lần import tới):
--   1. `import_batches` — mỗi lần import thật là một dòng: file nào (tên + SHA-256 nội
--      dung), chế độ mẫu số nào, ai chạy, kết quả ra sao (stats + warnings). SHA-256 để
--      nhiều năm sau vẫn đối chiếu được đúng file gốc, kể cả khi tên file đã đổi.
--   2. `tasks.import_batch_id` + `tasks.dim_denominator_mode` — đóng dấu lên CHÍNH task.
--      Không chỉ join qua batch: task có thể được import đè nhiều lần, cột trên task luôn
--      là "chế độ đang có hiệu lực", còn `import_batches` giữ toàn bộ lịch sử.
--
-- Thuần THÊM (CREATE TABLE / ADD COLUMN / CREATE INDEX), không UPDATE dòng nào → theo DoD
-- (CLAUDE.md) đi thẳng production được. Task cũ có `import_batch_id`/`dim_denominator_mode`
-- NULL, nghĩa đúng là "không biết — import trước khi có sổ này", KHÔNG bịa giá trị mặc định.

CREATE TABLE IF NOT EXISTS import_batches (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  -- SHA-256 nội dung file gốc: định danh bền theo NỘI DUNG, không theo tên file.
  source_sha256 TEXT NOT NULL,
  source_bytes BIGINT,
  dim_denominator_mode TEXT NOT NULL
    CHECK (dim_denominator_mode IN ('columns', 'row-nonempty')),
  -- Tuỳ chọn import khác, để thêm về sau mà không cần migration mới.
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Toàn bộ ImportStats gồm cả `warnings` (vd hàng OGHL/OGCH có công thức Excel không đồng
  -- nhất, C3 §5) — giữ nguyên bằng chứng tại thời điểm import, không tính lại về sau.
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_project_created
  ON import_batches(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_sha256 ON import_batches(source_sha256);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS import_batch_id INTEGER
  REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dim_denominator_mode TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_dim_denominator_mode_check'
  ) THEN
    -- NULL hợp lệ = "task có trước khi có sổ import" (hoặc task tạo tay, không qua import).
    ALTER TABLE tasks ADD CONSTRAINT tasks_dim_denominator_mode_check
      CHECK (dim_denominator_mode IS NULL
             OR dim_denominator_mode IN ('columns', 'row-nonempty'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_import_batch ON tasks(import_batch_id);
