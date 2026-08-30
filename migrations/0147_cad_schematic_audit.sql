-- 0147_cad_schematic_audit.sql — M117 PR2 (§9 "sửa graph = UPDATE cột graph kèm audit (bảng audit
-- hiện hành)"): gắn trigger audit generic của 0049 lên `cad_schematic_graphs`.
--
-- Vì sao dùng trigger thay vì gọi helper trong route: đó là cơ chế audit hiện hành của XBoss
-- (0049) — không thể bỏ sót vì không phụ thuộc việc code có nhớ gọi hay không. Duyệt graph là
-- thao tác khoá dữ liệu cho plugin sinh tuyến, phải biết ai chốt và chốt cái gì.
--
-- Migration THÊM THUẦN (chỉ CREATE TRIGGER), không đụng dòng dữ liệu nào.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cad_schematic_graphs'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
