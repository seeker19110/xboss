-- 0059_sso_audit.sql — M49 PR3: SSO OIDC (openid-client).
-- Chỉ 1 việc: gắn audit trigger M43 (0049) cho bảng `users`. User tạo qua SSO / đổi role
-- từ claim của IdP tự vào audit_log (INSERT/UPDATE trên `users`) — không cần cơ chế audit
-- riêng cho đăng nhập. Lúc SSO callback tạo/sửa users, request chưa đăng nhập nên
-- audit_log.actor_id = NULL (hệ thống tự tạo qua IdP) — đúng bản chất, không phải lỗi.
-- Thêm thuần (DROP+CREATE trigger, idempotent) → đi thẳng production.

-- audit_row_change() đã tồn tại từ 0049; DROP+CREATE cho idempotent (copy khối cuối 0053).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
