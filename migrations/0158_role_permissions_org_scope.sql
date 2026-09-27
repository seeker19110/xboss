-- D01: quyền độc lập theo tổ chức, giữ nguyên mọi dòng dữ liệu.
-- Bắt buộc tạm dừng ghi cấu hình quyền và drain writer cũ trước khi triển khai schema/code.
-- Không rollback sang writer thiếu org_id khi đã có quyền của nhiều tổ chức.
-- Runner bọc toàn file trong transaction; chạy lặp kiểm catalog, không nuốt schema sai.
DO $$
BEGIN
  IF to_regclass('uq_role_perm_org_scope') IS NULL THEN
    CREATE UNIQUE INDEX uq_role_perm_org_scope
      ON role_permissions (org_id, role, perm_key, COALESCE(project_id, 0));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = to_regclass('uq_role_perm_org_scope')
       AND i.indrelid = 'role_permissions'::regclass
       AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indnkeyatts = 4
       AND ARRAY[
         pg_get_indexdef(i.indexrelid, 1, true), pg_get_indexdef(i.indexrelid, 2, true),
         pg_get_indexdef(i.indexrelid, 3, true), pg_get_indexdef(i.indexrelid, 4, true)
       ] = ARRAY['org_id', 'role', 'perm_key', 'COALESCE(project_id, 0)']
  ) THEN
    RAISE EXCEPTION 'Sai định nghĩa uq_role_perm_org_scope';
  END IF;

  IF to_regclass('uq_role_perm_scope') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
       WHERE i.indexrelid = to_regclass('uq_role_perm_scope')
         AND i.indrelid = 'role_permissions'::regclass
         AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indnkeyatts = 3
         AND ARRAY[
           pg_get_indexdef(i.indexrelid, 1, true), pg_get_indexdef(i.indexrelid, 2, true),
           pg_get_indexdef(i.indexrelid, 3, true)
         ] = ARRAY['role', 'perm_key', 'COALESCE(project_id, 0)']
    ) THEN
      RAISE EXCEPTION 'Sai định nghĩa uq_role_perm_scope';
    END IF;
    DROP INDEX uq_role_perm_scope;
  END IF;
END $$;
