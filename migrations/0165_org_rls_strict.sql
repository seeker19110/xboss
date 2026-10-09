-- 0165_org_rls_strict.sql — QUALITY-FINAL-1 S16 (AUDIT-S15 mục 6(b)): "khoá cửa" RLS nhóm bảng
-- theo TỔ CHỨC (0080, 0161) và 3 bảng kế hoạch theo DỰ ÁN (0149). Bỏ nhánh chuyển tiếp
-- "GUC rỗng → cho qua" (`NULLIF(current_setting(...), '') IS NULL`) — y hệt tiền lệ 0077 với 11
-- bảng tài chính. Sau migration này: role ứng dụng (xboss_app, NOBYPASSRLS) chạy câu lệnh chạm
-- các bảng dưới mà KHÔNG có GUC app.org_id / app.project_id thì thấy 0 dòng và không ghi được.
-- Xem docs/nang-cap/AUDIT-S16-RLS-STRICT.md.
--
-- Policy mới (USING = WITH CHECK, như cũ trừ nhánh bị bỏ):
--   * 15 bảng theo tổ chức: org_id::text = app.org_id  OR  app.org_id = '*'
--   * baselines, floor_stage_fronts: project_id::text = app.project_id  OR  app.project_id = '*'
--   * construction_stages: giữ nhánh project_id IS NULL (danh mục công tác dùng chung — quyết
--     định D1 của M123, KHÔNG phải nhánh "thiếu ngữ cảnh") + 2 nhánh như trên.
-- '*' chỉ do server đặt tường minh (withOrgScope/withProjectScope trong lib/db) cho đường thật
-- sự liên tổ chức/dự án (tra tài khoản lúc đăng nhập, cron hệ thống). So sánh dạng TEXT, không
-- cast GUC ::int (Postgres không bảo đảm short-circuit OR — ghi chú 0069/0077).
-- Không đổi ENABLE/FORCE ROW LEVEL SECURITY (đã bật ở 0080/0149/0161), không đụng dữ liệu.
--
-- ĐIỀU KIỆN TRIỂN KHAI: migration đổi policy → BẮT BUỘC chạy staging trước production
-- (`bash deploy.sh --staging`, docs/ops/staging.md), kiểm đăng nhập/me/route nghiệp vụ/cron
-- bằng role xboss_app theo docs/nang-cap/AUDIT-S16-RLS-STRICT.md. Code đi kèm (lib/db tự gắn
-- app.org_id cho câu lệnh ngoài transaction của request đã xác thực + withOrgScope ở đường chưa
-- có actor) PHẢI lên cùng/trước migration này.
--
-- ROLLBACK (không có down-migration tự động): tạo lại policy 3 nhánh bằng cách chạy lại thủ công
-- (psql, role owner) khối DO của migrations/0080_org_rls.sql (14 bảng), câu CREATE POLICY
-- p_org_cost_settings_org của migrations/0161_org_config_scope.sql, và khối DO + câu CREATE
-- POLICY p_construction_stages_project của migrations/0149_baseline_stage_project.sql. Các khối
-- đó đều DROP POLICY IF EXISTS trước CREATE nên chạy lại an toàn. KHÔNG xoá dòng 0165 khỏi
-- schema_migrations (runtime kiểm đủ migration; lần deploy sau sẽ áp lại 0165).
--
-- Idempotent: DROP POLICY IF EXISTS trước CREATE POLICY; append-only (không sửa 0080/0149/0161).

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users', 'projects', 'suppliers', 'code_lists', 'role_permissions',
    'custom_field_defs', 'feature_flags', 'alert_rules', 'approval_flows',
    'api_keys', 'webhooks', 'integrations', 'saved_reports', 'boq_codes',
    'org_cost_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS p_%s_org ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY p_%s_org ON %I'
      || ' USING ('
      || '   org_id::text = current_setting(''app.org_id'', true)'
      || '   OR current_setting(''app.org_id'', true) = ''*'''
      || ' )'
      || ' WITH CHECK ('
      || '   org_id::text = current_setting(''app.org_id'', true)'
      || '   OR current_setting(''app.org_id'', true) = ''*'''
      || ' )',
      t, t
    );
  END LOOP;
END $$;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['baselines', 'floor_stage_fronts'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
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

DROP POLICY IF EXISTS p_construction_stages_project ON construction_stages;
CREATE POLICY p_construction_stages_project ON construction_stages
  USING (
    project_id IS NULL
    OR project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  )
  WITH CHECK (
    project_id IS NULL
    OR project_id::text = current_setting('app.project_id', true)
    OR current_setting('app.project_id', true) = '*'
  );
