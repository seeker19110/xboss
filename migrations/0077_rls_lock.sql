-- 0077_rls_lock.sql — M62 PR2: "khoá cửa" RLS. Bỏ hẳn nhánh "thiếu ngữ cảnh (GUC rỗng)
-- → cho qua" khỏi policy của 11 bảng tài chính/hợp đồng (đặt ở 0069_rls.sql, giai đoạn
-- chuyển tiếp M51 PR1). Sau migration này: query chạm 11 bảng mà KHÔNG có GUC
-- app.project_id (rỗng/NULL) trả RỖNG thay vì cho qua — RLS thực sự có hiệu lực.
--
-- ĐIỀU KIỆN TIÊN QUYẾT VẬN HÀNH (xem PR description, KHÔNG áp production khi chưa đủ):
--   1) DATABASE_URL production đã trỏ role xboss_app (NOBYPASSRLS) và chạy ổn định.
--   2) PR1 đã lên production ≥ ~1 tuần, log warn "query nhóm 11 bảng thiếu GUC" không còn.
--
-- Policy mới CHỈ còn 2 nhánh (giống nhau cho USING lẫn WITH CHECK):
--   1) project_id::text = current_setting('app.project_id', true) — khớp dự án đang chọn;
--   2) current_setting('app.project_id', true) = '*' — ngữ cảnh cross-project hợp lệ.
-- So sánh dạng TEXT (KHÔNG cast GUC ::int): Postgres KHÔNG bảo đảm short-circuit AND/OR,
-- cast GUC sang int sẽ làm nhánh '*' lỗi "invalid input syntax for integer" (ghi chú M51 PR1).
-- Idempotent (DROP POLICY IF EXISTS trước CREATE), append-only (không sửa 0069).
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
