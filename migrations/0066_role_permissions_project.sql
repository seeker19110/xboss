-- 0066_role_permissions_project.sql — M61: thêm chiều DỰ ÁN cho override quyền.
-- Trước M61 bảng role_permissions chỉ có override TOÀN HỆ theo cặp (role, perm_key).
-- Thêm cột project_id: NULL = override toàn hệ (mọi dòng hiện có giữ NULL → hành vi
-- không đổi); số = override chỉ trong 1 dự án. Ngữ nghĩa giải quyền (lib/auth.ts):
--   override dự án > override toàn hệ (project_id NULL) > mặc định CAN_DEFAULT.
--
-- Đổi UNIQUE(role, perm_key) → unique theo cả phạm vi bằng index biểu thức
-- COALESCE(project_id, 0): UNIQUE thường coi NULL ≠ NULL nên (role, perm, NULL)
-- lặp lại được — dùng 0 làm sentinel "toàn hệ" (id dự án luôn > 0 nên 0 an toàn),
-- không phụ thuộc NULLS NOT DISTINCT của PG15+.
ALTER TABLE role_permissions
  ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id) ON DELETE CASCADE;

-- Gỡ UNIQUE(role, perm_key) cũ (nếu còn) — tra pg_constraint theo đúng cặp cột thay vì
-- đoán tên constraint (mặc định Postgres đặt role_permissions_role_perm_key_key, nhưng
-- không hardcode để idempotent với mọi tên). Chỉ khớp constraint UNIQUE đúng 2 cột
-- (role, perm_key) — không đụng PK trên (id).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT c.conname INTO cname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'role_permissions'
     AND c.contype = 'u'
     AND c.conkey = ARRAY[
       (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'role'),
       (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'perm_key')
     ]::smallint[]
   LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE role_permissions DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_perm_scope
  ON role_permissions (role, perm_key, COALESCE(project_id, 0));
