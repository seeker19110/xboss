-- 0064_sheet_versions.sql — M53 PR2: watermark 1 dòng/sheet thay cho aggregate JOIN mỗi
-- tick SSE (lib/version.ts). Trước đây mỗi client SSE gọi sheetVersion() mỗi 3s =
-- MAX(updated_at)+COUNT JOIN tasks⋈work_packages⋈sheet_types; N client => N/3 query
-- aggregate/giây tranh pool. Nay watermark là 1 dòng đếm version/sheet, được bump ATOMIC
-- bằng trigger ngay trong transaction ghi tasks/work_packages, còn sheetVersion() chỉ SELECT
-- 1 dòng theo khoá chính. Pattern trigger có tiền lệ: boq_codes_sync (0029), audit_row_change
-- (0049). Migration thuần thêm (CREATE TABLE/FUNCTION/TRIGGER + backfill INSERT) → đi thẳng
-- production; idempotent qua IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.

CREATE TABLE IF NOT EXISTS sheet_versions (
  sheet_type_id INT PRIMARY KEY REFERENCES sheet_types(id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bump version của (các) sheet liên quan tới dòng vừa đổi.
-- Bất biến: mọi INSERT/UPDATE/DELETE trên tasks HOẶC đổi sheet_type_id trên work_packages
-- đều bump ĐÚNG sheet. Move (đổi package_id của task / đổi sheet_type_id của work_package)
-- bump CẢ sheet cũ LẪN mới. Dùng chung 1 hàm cho cả hai bảng, phân biệt qua TG_TABLE_NAME:
--  - work_packages: sheet_type_id nằm ngay trên dòng.
--  - tasks: sheet_type_id suy ra qua work_packages của package_id.
-- Ghi chú: false-positive rẻ được chấp nhận — mọi UPDATE tasks (kể cả sửa note không đổi
-- tiến độ) đều bump, chỉ khiến client refresh thừa 1 lần, không sai dữ liệu.
CREATE OR REPLACE FUNCTION bump_sheet_version() RETURNS trigger AS $$
DECLARE
  v_new_sheet INT;
  v_old_sheet INT;
BEGIN
  IF TG_TABLE_NAME = 'work_packages' THEN
    IF TG_OP <> 'DELETE' THEN v_new_sheet := NEW.sheet_type_id; END IF;
    IF TG_OP <> 'INSERT' THEN v_old_sheet := OLD.sheet_type_id; END IF;
  ELSE
    -- tasks: tra sheet_type_id qua nhóm cha.
    IF TG_OP <> 'DELETE' THEN
      SELECT sheet_type_id INTO v_new_sheet FROM work_packages WHERE id = NEW.package_id;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      SELECT sheet_type_id INTO v_old_sheet FROM work_packages WHERE id = OLD.package_id;
    END IF;
  END IF;

  IF v_new_sheet IS NOT NULL THEN
    INSERT INTO sheet_versions (sheet_type_id) VALUES (v_new_sheet)
      ON CONFLICT (sheet_type_id) DO UPDATE
        SET version = sheet_versions.version + 1, updated_at = NOW();
  END IF;

  -- Chỉ bump sheet cũ khi thực sự khác sheet mới (di chuyển giữa sheet) — tránh bump 2 lần
  -- cho update thường (sheet cũ = sheet mới).
  IF v_old_sheet IS NOT NULL AND v_old_sheet IS DISTINCT FROM v_new_sheet THEN
    INSERT INTO sheet_versions (sheet_type_id) VALUES (v_old_sheet)
      ON CONFLICT (sheet_type_id) DO UPDATE
        SET version = sheet_versions.version + 1, updated_at = NOW();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Mọi thay đổi task (thêm/sửa/xoá) → bump sheet chứa task.
DROP TRIGGER IF EXISTS trg_tasks_sheet_version ON tasks;
CREATE TRIGGER trg_tasks_sheet_version
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION bump_sheet_version();

-- Nhóm: bump khi tạo/xoá nhóm (dòng nhóm xuất hiện/biến mất trên lưới) và khi đổi
-- sheet_type_id (move nhóm giữa sheet → bump cả sheet cũ và mới). UPDATE OF sheet_type_id
-- để KHÔNG bump vô ích khi chỉ đổi progress/tên nhóm (những thay đổi đó luôn đi kèm 1 thay
-- đổi task đã tự bump — giữ nguyên hành vi watermark cũ vốn chỉ nhìn tasks).
DROP TRIGGER IF EXISTS trg_work_packages_sheet_version ON work_packages;
CREATE TRIGGER trg_work_packages_sheet_version
  AFTER INSERT OR UPDATE OF sheet_type_id OR DELETE ON work_packages
  FOR EACH ROW EXECUTE FUNCTION bump_sheet_version();

-- Backfill 1 dòng version=1 cho mọi sheet hiện có (idempotent).
INSERT INTO sheet_versions (sheet_type_id)
  SELECT id FROM sheet_types
  ON CONFLICT (sheet_type_id) DO NOTHING;
