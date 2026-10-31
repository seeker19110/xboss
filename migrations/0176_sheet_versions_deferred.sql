-- 0176_sheet_versions_deferred.sql — Đợt tối ưu 3 (G1/L2): hoãn trigger watermark sheet_versions
-- tới COMMIT.
--
-- Vì sao: 0067 bump watermark bằng trigger AFTER ROW THƯỜNG — mỗi câu ghi tasks upsert đúng 1 dòng
-- sheet_versions của sheet và GIỮ khoá dòng đó tới COMMIT. Transaction nào chạy vòng "khoá task i
-- → UPDATE task i → khoá task i+1…" (sửa ngày hàng loạt, đổi ngày nhóm, upload kế hoạch, xoá cột)
-- giữ khoá sheet từ task đầu tiên rồi đi xin khoá task kế tiếp, trong khi tick đơn giữ task đó và
-- chờ khoá sheet ở câu UPDATE của nó → deadlock (đã tái hiện; nạn nhân là tick của kỹ sư). Kèm
-- theo: mọi transaction ghi task trên cùng sheet bị tuần tự hoá từ câu UPDATE đầu tới COMMIT.
--
-- Sửa: CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED — cùng hàm, cùng sự kiện, cùng điều
-- kiện (`UPDATE OF sheet_type_id` cho nhóm), nhưng chạy lúc COMMIT, SAU mọi khoá task/nhóm. Bất
-- biến watermark giữ nguyên: mọi thay đổi task / di chuyển nhóm vẫn bump ĐÚNG (các) sheet, chỉ
-- muộn hơn tới lúc COMMIT — mà version chỉ được đọc NGOÀI transaction ghi (GET tasks,
-- tasks/version, SSE events) nên không chỗ đọc nào thấy khác.
--
-- Hàm bump_sheet_version thêm 1 điều kiện: chỉ upsert khi sheet CÒN TỒN TẠI lúc chạy. Với trigger
-- hoãn, transaction xoá sheet (DELETE /api/sheets/:id: xoá nhóm rồi xoá sheet_types, dòng
-- watermark tự CASCADE) sẽ chạy trigger của nhóm SAU khi sheet đã bị xoá → INSERT watermark cho
-- sheet không còn → vi phạm khoá ngoại lúc COMMIT. Sheet đã xoá thì không còn ai đọc watermark.
--
-- DDL thuần (không đụng dòng dữ liệu) nhưng DROP TRIGGER cần khoá AccessExclusive NGẮN trên
-- tasks/work_packages (chờ mọi transaction đang đọc/ghi 2 bảng xong) — nên áp ngoài giờ tick. Idempotent: CREATE
-- OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS cả tên cũ lẫn tên mới trước khi tạo.

CREATE OR REPLACE FUNCTION bump_sheet_version() RETURNS trigger AS $$
DECLARE
  v_new_sheet INT;
  v_old_sheet INT;
BEGIN
  IF TG_TABLE_NAME = 'work_packages' THEN
    IF TG_OP <> 'DELETE' THEN v_new_sheet := NEW.sheet_type_id; END IF;
    IF TG_OP <> 'INSERT' THEN v_old_sheet := OLD.sheet_type_id; END IF;
  ELSE
    -- tasks: tra sheet_type_id qua nhóm cha (đọc lúc COMMIT — nhóm đã bị xoá cùng transaction
    -- thì không ra sheet nào; trigger của chính nhóm đó tự bump sheet của nó).
    IF TG_OP <> 'DELETE' THEN
      SELECT sheet_type_id INTO v_new_sheet FROM work_packages WHERE id = NEW.package_id;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      SELECT sheet_type_id INTO v_old_sheet FROM work_packages WHERE id = OLD.package_id;
    END IF;
  END IF;

  IF v_new_sheet IS NOT NULL THEN
    INSERT INTO sheet_versions (sheet_type_id)
      SELECT st.id FROM sheet_types st WHERE st.id = v_new_sheet
      ON CONFLICT (sheet_type_id) DO UPDATE
        SET version = sheet_versions.version + 1, updated_at = NOW();
  END IF;

  -- Chỉ bump sheet cũ khi thực sự khác sheet mới (di chuyển giữa sheet) — tránh bump 2 lần
  -- cho update thường (sheet cũ = sheet mới).
  IF v_old_sheet IS NOT NULL AND v_old_sheet IS DISTINCT FROM v_new_sheet THEN
    INSERT INTO sheet_versions (sheet_type_id)
      SELECT st.id FROM sheet_types st WHERE st.id = v_old_sheet
      ON CONFLICT (sheet_type_id) DO UPDATE
        SET version = sheet_versions.version + 1, updated_at = NOW();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Mọi thay đổi task (thêm/sửa/xoá) → bump sheet chứa task, lúc COMMIT.
DROP TRIGGER IF EXISTS trg_tasks_sheet_version ON tasks;
DROP TRIGGER IF EXISTS trg_tasks_sheet_version_deferred ON tasks;
CREATE CONSTRAINT TRIGGER trg_tasks_sheet_version_deferred
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_sheet_version();

-- Nhóm: giữ đúng điều kiện cũ (tạo/xoá nhóm + đổi sheet_type_id), lúc COMMIT.
DROP TRIGGER IF EXISTS trg_work_packages_sheet_version ON work_packages;
DROP TRIGGER IF EXISTS trg_work_packages_sheet_version_deferred ON work_packages;
CREATE CONSTRAINT TRIGGER trg_work_packages_sheet_version_deferred
  AFTER INSERT OR UPDATE OF sheet_type_id OR DELETE ON work_packages
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_sheet_version();
