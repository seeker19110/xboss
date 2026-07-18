-- 0069_rls.sql — M51 PR1: Row-Level Security làm phòng tuyến thứ hai chống lỗi "quên
-- scope project_id" trên nhóm bảng tài chính/hợp đồng. RLS KHÔNG thay check app —
-- app vẫn filter `project_id = ?`; RLS chỉ đảm bảo nếu app quên thì trả RỖNG thay vì lộ
-- chéo dự án. Xem docs/adr/0005-rls.md + docs/nang-cap/M51-da-du-an-rls.md.
--
-- Cạm bẫy #1 của RLS: app chạy bằng role owner/superuser thì policy bị BỎ QUA ÂM THẦM.
-- Vì vậy: (1) tạo role ứng dụng riêng `xboss_app` NOBYPASSRLS, deploy đổi DATABASE_URL
-- sang role này; (2) mọi bảng dùng FORCE ROW LEVEL SECURITY để áp cả cho owner.

-- Role ứng dụng riêng — KHÔNG owner, KHÔNG BYPASSRLS. Migration vẫn chạy bằng role owner
-- (biến MIGRATE_DATABASE_URL, xem lib/db/migrate.ts). Mật khẩu ở đây là PLACEHOLDER —
-- NGƯỜI VẬN HÀNH PHẢI đổi lúc deploy: `ALTER ROLE xboss_app PASSWORD '<mật khẩu thật>'`
-- rồi đặt DATABASE_URL trỏ user xboss_app (xem docs/adr/0005-rls.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xboss_app') THEN
    CREATE ROLE xboss_app LOGIN NOBYPASSRLS PASSWORD 'CHANGE_ME_ON_DEPLOY';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO xboss_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xboss_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO xboss_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xboss_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO xboss_app;

-- payment_bills chưa có cột project_id (bảng gốc 0001) — thêm trước rồi mới áp RLS,
-- theo đúng pattern migrations/0027_multi_project.sql (ADD COLUMN + backfill + INDEX).
ALTER TABLE payment_bills ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
UPDATE payment_bills SET project_id = (SELECT MIN(id) FROM projects) WHERE project_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_bills_project ON payment_bills(project_id);

-- Áp RLS cho 11 bảng có cột project_id trực tiếp. Biểu thức 3 nhánh (giống nhau cho
-- USING lẫn WITH CHECK):
--   1) project_id khớp GUC app.project_id (đặt trong withTransaction — M43). So sánh dạng
--      TEXT (project_id::text = GUC) thay vì cast GUC ::int: Postgres KHÔNG bảo đảm
--      short-circuit AND/OR, nên nếu cast GUC ::int thì GUC = '*' (nhánh 3) hoặc '' (nhánh 2)
--      vẫn bị cast → lỗi "invalid input syntax for integer"; so text tránh hẳn cast GUC;
--   2) GUC rỗng ('' hoặc NULL) → cho qua — giai đoạn chuyển tiếp PR1 (đường đọc cũ ngoài
--      transaction không có GUC; custom GUC sau SET LOCAL revert về '' chứ không NULL nên
--      dùng NULLIF(...,'') IS NULL để coi '' ≡ NULL). PR2 sẽ bỏ nhánh này để "khoá cửa";
--   3) GUC = '*' → ngữ cảnh cross-project hợp lệ (portfolio/cron/export toàn cục).
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'contracts', 'variation_orders', 'payment_bills', 'invoices', 'payroll',
    'insurance_bonds', 'claims', 'tender_packages', 'purchase_orders',
    'advances', 'cash_transactions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS p_%s_project ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY p_%s_project ON %I'
      || ' USING ('
      || '   project_id::text = current_setting(''app.project_id'', true)'
      || '   OR NULLIF(current_setting(''app.project_id'', true), '''') IS NULL'
      || '   OR current_setting(''app.project_id'', true) = ''*'''
      || ' )'
      || ' WITH CHECK ('
      || '   project_id::text = current_setting(''app.project_id'', true)'
      || '   OR NULLIF(current_setting(''app.project_id'', true), '''') IS NULL'
      || '   OR current_setting(''app.project_id'', true) = ''*'''
      || ' )',
      t, t
    );
  END LOOP;
END $$;
