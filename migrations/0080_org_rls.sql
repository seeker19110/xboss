-- 0080_org_rls.sql — M54 GĐ1 PR3: RLS theo org trên nhóm bảng gốc (14 bảng gắn org_id ở
-- 0078_org_axis.sql). Cùng khuôn M51 PR1 (migrations/0069_rls.sql): RLS là lưới an toàn
-- thứ hai sau check app, KHÔNG thay check app; policy 3 nhánh với giai đoạn chuyển tiếp
-- "GUC rỗng → cho qua" (đường đọc/route chưa bọc withTransaction/withProjectScope, vd
-- login tra `users` trước khi có org context — xem app/api/auth/login/route.ts). Bảng có
-- project_id (nhóm 0069) giữ nguyên policy theo project — project đã thuộc 1 org nên cô
-- lập bắc cầu, không cần thêm policy org ở đây (đúng đặc tả docs/nang-cap/M54-multi-tenant-saas.md).
--
-- GUC app.org_id đã được set_config trong MỌI withTransaction (lib/db/index.ts, từ M54 PR2)
-- và withProjectScope (bọc withTransaction) — không cần đổi code app ở PR này.
--
-- Lộ trình khoá cửa (bỏ nhánh "GUC rỗng → cho qua") để riêng, làm sau ~1 tuần theo dõi
-- production không còn query nhóm bảng này thiếu GUC — y hệt tiền lệ M62 PR2 cho project_id.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users', 'projects', 'suppliers', 'code_lists', 'role_permissions',
    'custom_field_defs', 'feature_flags', 'alert_rules', 'approval_flows',
    'api_keys', 'webhooks', 'integrations', 'saved_reports', 'boq_codes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS p_%s_org ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY p_%s_org ON %I'
      || ' USING ('
      || '   org_id::text = current_setting(''app.org_id'', true)'
      || '   OR NULLIF(current_setting(''app.org_id'', true), '''') IS NULL'
      || '   OR current_setting(''app.org_id'', true) = ''*'''
      || ' )'
      || ' WITH CHECK ('
      || '   org_id::text = current_setting(''app.org_id'', true)'
      || '   OR NULLIF(current_setting(''app.org_id'', true), '''') IS NULL'
      || '   OR current_setting(''app.org_id'', true) = ''*'''
      || ' )',
      t, t
    );
  END LOOP;
END $$;
