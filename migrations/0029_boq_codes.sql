-- 0029_boq_codes.sql — đóng race hẹp BOQCODE xuyên bảng (nợ kỹ thuật, xem PROGRESS.md
-- "BOQCODE không có ràng buộc DB xuyên bảng"). Trước đây mỗi bảng (tasks/work_packages/
-- materials/boq_items) chỉ có unique index RIÊNG nên 2 request đồng thời gán CÙNG mã vào
-- HAI bảng khác nhau vẫn có thể lọt qua boqTakenBy() (check-rồi-ghi không transaction).
--
-- Giải pháp: 1 bảng đăng ký dùng chung + trigger đồng bộ tự động trên cả 4 bảng — không
-- cần sửa route nào (14 chỗ gọi boqTakenBy vẫn giữ nguyên để báo lỗi 409 thân thiện ở
-- đường thường; trigger là lưới an toàn cuối cùng, atomic trong đúng transaction ghi,
-- match cách unique index nội bảng đã hoạt động từ trước — cùng 1 pattern, chỉ mở rộng
-- phạm vi từ "trong bảng" ra "xuyên bảng").

CREATE TABLE IF NOT EXISTS boq_codes (
  code TEXT NOT NULL PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  UNIQUE (table_name, row_id)
);

CREATE OR REPLACE FUNCTION boq_codes_sync() RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM boq_codes WHERE table_name = TG_TABLE_NAME AND row_id = OLD.id;
    RETURN OLD;
  END IF;

  new_code := to_jsonb(NEW) ->> TG_ARGV[0];

  IF new_code IS NULL THEN
    DELETE FROM boq_codes WHERE table_name = TG_TABLE_NAME AND row_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Mã đổi (rename) → dọn đăng ký cũ của đúng dòng này trước khi giành mã mới.
  DELETE FROM boq_codes WHERE table_name = TG_TABLE_NAME AND row_id = NEW.id AND code <> new_code;

  INSERT INTO boq_codes (code, table_name, row_id) VALUES (new_code, TG_TABLE_NAME, NEW.id)
    ON CONFLICT (code) DO UPDATE
      SET table_name = EXCLUDED.table_name, row_id = EXCLUDED.row_id
      WHERE boq_codes.table_name = EXCLUDED.table_name AND boq_codes.row_id = EXCLUDED.row_id;

  -- ON CONFLICT DO UPDATE với WHERE không khớp thì không ghi đè NHƯNG cũng không lỗi —
  -- phải tự kiểm lại rồi raise để chặn 2 dòng khác bảng cùng chiếm 1 mã trong im lặng.
  IF NOT EXISTS (
    SELECT 1 FROM boq_codes WHERE code = new_code AND table_name = TG_TABLE_NAME AND row_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Mã BOQ "%" đã được dùng ở bảng khác', new_code USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_boq_codes_tasks ON tasks;
CREATE TRIGGER trg_boq_codes_tasks
  AFTER INSERT OR UPDATE OF boq_code OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION boq_codes_sync('boq_code');

DROP TRIGGER IF EXISTS trg_boq_codes_work_packages ON work_packages;
CREATE TRIGGER trg_boq_codes_work_packages
  AFTER INSERT OR UPDATE OF boq_code OR DELETE ON work_packages
  FOR EACH ROW EXECUTE FUNCTION boq_codes_sync('boq_code');

DROP TRIGGER IF EXISTS trg_boq_codes_materials ON materials;
CREATE TRIGGER trg_boq_codes_materials
  AFTER INSERT OR UPDATE OF boq_code OR DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION boq_codes_sync('boq_code');

DROP TRIGGER IF EXISTS trg_boq_codes_boq_items ON boq_items;
CREATE TRIGGER trg_boq_codes_boq_items
  AFTER INSERT OR UPDATE OF code OR DELETE ON boq_items
  FOR EACH ROW EXECUTE FUNCTION boq_codes_sync('code');

-- Backfill dữ liệu hiện có (best-effort — nếu đã lỡ có trùng mã xuyên bảng từ trước lúc
-- có ràng buộc này, ON CONFLICT DO NOTHING giữ dòng nạp trước, dòng thua giữ nguyên
-- boq_code cột nhưng không có trong registry tới lần sửa kế tiếp; chấp nhận vì migrate
-- không thể tự quyết dòng nào "đúng" khi dữ liệu đã trùng sẵn).
INSERT INTO boq_codes (code, table_name, row_id)
  SELECT boq_code, 'tasks', id FROM tasks WHERE boq_code IS NOT NULL
  ON CONFLICT (code) DO NOTHING;
INSERT INTO boq_codes (code, table_name, row_id)
  SELECT boq_code, 'work_packages', id FROM work_packages WHERE boq_code IS NOT NULL
  ON CONFLICT (code) DO NOTHING;
INSERT INTO boq_codes (code, table_name, row_id)
  SELECT boq_code, 'materials', id FROM materials WHERE boq_code IS NOT NULL
  ON CONFLICT (code) DO NOTHING;
INSERT INTO boq_codes (code, table_name, row_id)
  SELECT code, 'boq_items', id FROM boq_items
  ON CONFLICT (code) DO NOTHING;
