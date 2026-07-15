-- 0049_audit_log.sql — M43 PR1: Audit trail toàn hệ bằng trigger Postgres generic.
-- Mọi INSERT/UPDATE/DELETE trên nhóm bảng tài chính/hợp đồng/nghiệm thu được ghi tự động
-- vào audit_log (ai/khi nào/trường nào cũ→mới) — không thể bỏ sót vì không phụ thuộc gọi
-- helper trong code. Actor lấy từ SET LOCAL (app.user_id/role/project_id/request_id) do
-- withTransaction (lib/db) truyền qua ngữ cảnh request (lib/request-context.ts).
-- Xem docs/nang-cap/M43-audit-trail.md. audit_log là lớp phủ chung, KHÔNG thay thế các
-- bảng lịch sử theo domain hiện có (task_history, material_transactions, ...).

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id INT,
  actor_role TEXT,
  entity_type TEXT NOT NULL,          -- tên bảng
  entity_id BIGINT NOT NULL,
  action TEXT NOT NULL,               -- INSERT | UPDATE | DELETE
  changes JSONB,                      -- UPDATE: {col: [old,new]} chỉ cột đổi; INSERT/DELETE: snapshot đầy đủ
  project_id INT,
  request_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $$
DECLARE v_changes JSONB; v_id BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(o.key, jsonb_build_array(o.value, n.value)) INTO v_changes
      FROM jsonb_each(to_jsonb(OLD)) o JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
     WHERE o.value IS DISTINCT FROM n.value;
    IF v_changes IS NULL THEN RETURN NEW; END IF;        -- không có gì đổi thật
    v_id := (to_jsonb(NEW)->>'id')::bigint;
  ELSIF TG_OP = 'INSERT' THEN
    v_changes := to_jsonb(NEW); v_id := (to_jsonb(NEW)->>'id')::bigint;
  ELSE
    v_changes := to_jsonb(OLD); v_id := (to_jsonb(OLD)->>'id')::bigint;
  END IF;
  INSERT INTO audit_log(actor_id, actor_role, entity_type, entity_id, action, changes, project_id, request_id)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::int,
          NULLIF(current_setting('app.role', true), ''),
          TG_TABLE_NAME, v_id, TG_OP, v_changes,
          NULLIF(current_setting('app.project_id', true), '')::int,
          NULLIF(current_setting('app.request_id', true), ''));
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

-- Gắn trigger lên nhóm bảng đợt 1 (tài chính/hợp đồng/nghiệm thu). DROP + CREATE cho idempotent.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contracts', 'variation_orders', 'payment_certs', 'invoices', 'cash_transactions',
    'advances', 'payroll', 'purchase_orders', 'task_documents', 'baselines',
    'insurance_bonds', 'claims'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;

-- Bất biến: khai báo không cho UPDATE/DELETE trên audit_log. Role app hiện là owner DB nên
-- REVOKE chỉ mang tính khai báo (owner bỏ qua GRANT); chặn thật ở tầng app (không viết route
-- UPDATE/DELETE) + nâng hash-chain ở M43 PR3.
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
