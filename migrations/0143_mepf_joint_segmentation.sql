-- 0143_mepf_joint_segmentation.sql — M105 §11: lưu kết quả chia đốt MEPF theo kiểu kết nối
-- (bảng đốt của lệnh XBOSS_VE_CHIADOT / engine web `engineering-joint-segmentation`).
--
-- Migration THUẦN CỘNG THÊM (chỉ CREATE TABLE / CREATE INDEX / policy RLS, không UPDATE,
-- không đổi kiểu cột, không đụng một dòng dữ liệu hiện có) → theo DoD trong CLAUDE.md được
-- đi thẳng production, không cần chạy staging trước.
--
-- Ghi chú kiểu cột (khác đặc tả §11 một chỗ, lấy theo schema THẬT): `projects.id` và
-- `users.id` là SERIAL (INTEGER) trong 0001_baseline.sql — đặc tả ghi BIGINT là sai, ở đây
-- dùng INTEGER cho khớp kiểu khóa ngoại. `drawings.id` là SERIAL (0016_drawings.sql).
--
-- Vì sao `engineering_joint_pieces` cũng mang `project_id`: policy RLS chỉ diễn đạt được khi
-- bảng có sẵn cột dự án (bài học 0091/0092 — "không có cột này thì policy KHÔNG diễn đạt
-- được cho chúng"). Giữ nhất quán với 6 bảng con đã bổ sung cột ở 0091 thay vì viết policy
-- EXISTS trên bảng cha (chậm hơn và lệch mẫu).
--
-- Hardware QTO KHÔNG lưu bảng riêng — suy từ runs × định mức trong rule pack lúc đọc.

CREATE TABLE IF NOT EXISTS engineering_joint_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  drawing_id INTEGER NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  run_key TEXT NOT NULL,              -- handle tim + itemId — khóa idempotency
  system_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  size TEXT NOT NULL,                 -- 'WxH' hoặc 'DN80'
  joint_type TEXT NOT NULL,           -- slug — KHÔNG CHECK cứng: danh mục do rule pack quyết
  divide_mode TEXT NOT NULL CHECK (divide_mode IN ('deu','cay_nguyen')),
  overridden BOOLEAN NOT NULL DEFAULT FALSE,
  rule_pack_version TEXT NOT NULL,
  total_length_mm NUMERIC(12,1) NOT NULL,
  piece_count INT NOT NULL,
  joint_count INT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (drawing_id, run_key)
);

CREATE TABLE IF NOT EXISTS engineering_joint_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  run_id UUID NOT NULL REFERENCES engineering_joint_runs(id) ON DELETE CASCADE,
  piece_index INT NOT NULL,
  length_mm NUMERIC(12,1) NOT NULL,
  tag TEXT NOT NULL,
  UNIQUE (run_id, piece_index)
);

CREATE INDEX IF NOT EXISTS idx_joint_runs_drawing ON engineering_joint_runs(drawing_id);

-- RLS 2 nhánh theo ĐÚNG mẫu 0092: FORCE cho cả role owner, so sánh dạng TEXT (KHÔNG cast
-- GUC ::int — Postgres không bảo đảm short-circuit nên nhánh '*' sẽ lỗi kiểu), và KHÔNG có
-- nhánh "thiếu ngữ cảnh → cho qua".
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['engineering_joint_runs', 'engineering_joint_pieces'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS p_%s_project ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY p_%s_project ON %I'
      || ' USING ('
      || '   project_id::text = current_setting(''app.project_id'', true)'
      || '   OR current_setting(''app.project_id'', true) = ''*'''
      || ' )'
      || ' WITH CHECK ('
      || '   project_id::text = current_setting(''app.project_id'', true)'
      || '   OR current_setting(''app.project_id'', true) = ''*'''
      || ' )',
      t, t
    );
  END LOOP;
END $$;
