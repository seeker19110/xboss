-- 0168_payment_cert_adjustments.sql — M128: chứng từ điều chỉnh (adjustment) / huỷ hiệu lực
-- (reversal) cho đợt IPC ĐÃ DUYỆT. Xem docs/nang-cap/M128-chung-tu-dieu-chinh-ipc.md §2.1–2.2.
--
-- IPC đã duyệt là hồ sơ chốt (D07, A5-FR10): không sửa/xoá dòng, không sửa snapshot kỳ sau. Sửa
-- sai đi qua chứng từ RIÊNG — sổ cái điều chỉnh cộng vào luỹ kế hợp đồng:
--   payment_cert_adjustments        1 chứng từ (nháp → trình → duyệt/từ chối), mã ADJ-<năm>-<số>
--   payment_cert_adjustment_items   dòng KL ± theo dòng BOQ của đợt gốc (đơn giá = đơn giá gốc)
--   payment_cert_adjustment_decisions  snapshot quyết định bất biến + Idempotency-Key (khuôn 0160;
--                                   không tái dùng payment_cert_decision_snapshots vì bảng đó có
--                                   bất biến "1 dòng/quyết định IPC" và khoá idempotency theo đợt)
--
-- Bất biến ở tầng DB (route vẫn kiểm trước để trả 409 có mã):
--   * ≤ 1 chứng từ đang mở (draft/submitted) mỗi đợt        → uq_pca_open
--   * ≤ 1 reversal đã duyệt mỗi đợt                          → uq_pca_reversal
--   * lý do ≥ 10 ký tự; qty_delta ≠ 0
--   * dòng + snapshot quyết định thuộc đúng dự án của chứng từ (FK kép (adjustment_id, project_id))
--   * chứng từ đã duyệt/từ chối là HỒ SƠ CHỐT: trigger chặn mọi UPDATE/DELETE chứng từ + dòng;
--     chỉ cho đúng luồng code: nháp→nháp/đã trình, đã trình→đã trình/đã duyệt/từ chối; dòng chỉ
--     ghi khi chứng từ còn nháp; chỉ xoá nháp; không đổi mã/đợt/HĐ/dự án/loại/người lập
-- items có cột project_id (ngoài DDL đặc tả) để áp RLS theo dự án trực tiếp như bảng cha.
--
-- Mã chứng từ: SEQUENCE riêng (không MAX+1) — bảng FORCE RLS theo dự án nên MAX chỉ thấy dự án
-- hiện hành mà cột code UNIQUE toàn hệ → MAX+1 sẽ đụng mã của dự án khác. Số tăng toàn hệ, không
-- reset theo năm; năm trong mã chỉ là thông tin.
--
-- Thêm thuần tuý (CREATE TABLE/SEQUENCE/INDEX/POLICY/TRIGGER/FUNCTION + nới CHECK type của payment_bills
-- thêm giá trị 'adjustment'), không đụng dòng dữ liệu có sẵn → đi thẳng production. Idempotent.

CREATE SEQUENCE IF NOT EXISTS payment_cert_adjustment_code_seq;

CREATE TABLE IF NOT EXISTS payment_cert_adjustments (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  cert_id       INT NOT NULL REFERENCES payment_certs(id),
  contract_id   INT NOT NULL REFERENCES contracts(id),
  project_id    INT NOT NULL REFERENCES projects(id),
  kind          TEXT NOT NULL CHECK (kind IN ('adjustment', 'reversal')),
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  reason        TEXT NOT NULL CHECK (char_length(btrim(reason)) >= 10),
  amount        NUMERIC(15,2) NOT NULL,
  bill_id       INT REFERENCES payment_bills(id),
  created_by    INT NOT NULL REFERENCES users(id),
  submitted_at  DATE,
  decided_at    DATE,
  decided_by    INT REFERENCES users(id),
  reject_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, project_id)
);

CREATE TABLE IF NOT EXISTS payment_cert_adjustment_items (
  id            SERIAL PRIMARY KEY,
  adjustment_id INT NOT NULL,
  project_id    INT NOT NULL,
  boq_item_id   INT NOT NULL REFERENCES boq_items(id),
  qty_delta     NUMERIC(15,3) NOT NULL CHECK (qty_delta <> 0),
  unit_price    NUMERIC(15,2) NOT NULL,
  note          TEXT,
  UNIQUE (adjustment_id, boq_item_id),
  FOREIGN KEY (adjustment_id, project_id)
    REFERENCES payment_cert_adjustments (id, project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pca_cert ON payment_cert_adjustments (cert_id, status);
CREATE INDEX IF NOT EXISTS idx_pca_contract ON payment_cert_adjustments (contract_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pca_open
  ON payment_cert_adjustments (cert_id) WHERE status IN ('draft', 'submitted');
CREATE UNIQUE INDEX IF NOT EXISTS uq_pca_reversal
  ON payment_cert_adjustments (cert_id) WHERE kind = 'reversal' AND status = 'approved';
CREATE INDEX IF NOT EXISTS idx_pcai_boq ON payment_cert_adjustment_items (boq_item_id);

-- Phiếu sinh khi duyệt chứng từ điều chỉnh: type 'adjustment' (amount ±, pay_status committed).
ALTER TABLE payment_bills DROP CONSTRAINT IF EXISTS payment_bills_type_chk;
ALTER TABLE payment_bills ADD CONSTRAINT payment_bills_type_chk
  CHECK (type IN ('bill', 'advance', 'item', 'adjustment'));

-- RLS theo dự án — khuôn 0077 (2 nhánh, KHÔNG có nhánh GUC rỗng), FORCE để áp cả owner.
-- So sánh dạng TEXT (không cast GUC ::int — Postgres không bảo đảm short-circuit OR).
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['payment_cert_adjustments', 'payment_cert_adjustment_items'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
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

-- Vết kiểm toán (khuôn 0049/0166): chứng từ điều chỉnh là thao tác tài chính.
DROP TRIGGER IF EXISTS audit_payment_cert_adjustments ON payment_cert_adjustments;
CREATE TRIGGER audit_payment_cert_adjustments
  AFTER INSERT OR UPDATE OR DELETE ON payment_cert_adjustments
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
DROP TRIGGER IF EXISTS audit_payment_cert_adjustment_items ON payment_cert_adjustment_items;
CREATE TRIGGER audit_payment_cert_adjustment_items
  AFTER INSERT OR UPDATE OR DELETE ON payment_cert_adjustment_items
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Hồ sơ chốt ở tầng DB (audit M128): route đã chặn sửa/xoá chứng từ không còn nháp, nhưng lỗi
-- code/đường ghi khác (script, sửa tay) vẫn có thể sửa lặng lẽ một chứng từ đã duyệt — đã đổi luỹ
-- kế HĐ và sinh phiếu tiền. Trigger BEFORE chặn ở mọi role.
-- Cờ bảo trì `xboss.bao_tri_chung_tu = 'on'` (SET LOCAL) chỉ có tác dụng với role CHỦ BẢNG (role
-- migration/bảo trì, superuser) — role ứng dụng xboss_app không sở hữu bảng (ADR-0005) nên đặt cờ
-- cũng vô hiệu. Dùng để dọn dữ liệu test / sửa dữ liệu có biên bản; app không bao giờ đặt cờ này.
CREATE OR REPLACE FUNCTION pca_bao_tri_chung_tu(bang oid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('xboss.bao_tri_chung_tu', true), '') = 'on'
     AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = bang), 'MEMBER')
$$;

CREATE OR REPLACE FUNCTION pca_khoa_chung_tu_chot() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF pca_bao_tri_chung_tu(TG_RELID) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Chứng từ điều chỉnh % đã chốt (%) — không sửa/xoá được; sửa sai bằng chứng từ mới',
      OLD.code, OLD.status;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Chỉ xoá được chứng từ điều chỉnh nháp (% đang %)', OLD.code, OLD.status;
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.code, NEW.cert_id, NEW.contract_id, NEW.project_id, NEW.kind, NEW.created_by)
     IS DISTINCT FROM
     (OLD.code, OLD.cert_id, OLD.contract_id, OLD.project_id, OLD.kind, OLD.created_by) THEN
    RAISE EXCEPTION 'Không đổi được mã/đợt/hợp đồng/dự án/loại/người lập của chứng từ điều chỉnh %',
      OLD.code;
  END IF;
  IF (OLD.status, NEW.status) NOT IN (
       ('draft', 'draft'), ('draft', 'submitted'), ('submitted', 'submitted'),
       ('submitted', 'approved'), ('submitted', 'rejected')) THEN
    RAISE EXCEPTION 'Chuyển trạng thái chứng từ điều chỉnh % không hợp lệ: % → %',
      OLD.code, OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

-- Dòng chỉ ghi được khi chứng từ cha còn NHÁP (ghiDong/ghiReversal). DELETE không thấy cha = xoá
-- theo cascade khi chính chứng từ nháp bị xoá (trigger của cha đã kiểm) → cho qua.
CREATE OR REPLACE FUNCTION pcai_khoa_dong_chung_tu() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  cha RECORD;
BEGIN
  IF pca_bao_tri_chung_tu(TG_RELID) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    SELECT code, status INTO cha FROM payment_cert_adjustments WHERE id = OLD.adjustment_id;
    IF FOUND AND cha.status IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Dòng của chứng từ điều chỉnh % đã chốt (%) — không sửa/xoá được',
        cha.code, cha.status;
    END IF;
    IF FOUND AND cha.status <> 'draft' THEN
      RAISE EXCEPTION 'Chứng từ điều chỉnh % đã trình — chỉ sửa dòng khi còn nháp', cha.code;
    END IF;
    IF NOT FOUND AND TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'Không thấy chứng từ điều chỉnh của dòng #%', OLD.id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT code, status INTO cha FROM payment_cert_adjustments WHERE id = NEW.adjustment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không thấy chứng từ điều chỉnh #% của dòng', NEW.adjustment_id;
  END IF;
  IF cha.status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Dòng của chứng từ điều chỉnh % đã chốt (%) — không sửa/xoá được',
      cha.code, cha.status;
  END IF;
  IF cha.status <> 'draft' THEN
    RAISE EXCEPTION 'Chứng từ điều chỉnh % đã trình — chỉ sửa dòng khi còn nháp', cha.code;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS khoa_payment_cert_adjustments ON payment_cert_adjustments;
CREATE TRIGGER khoa_payment_cert_adjustments
  BEFORE UPDATE OR DELETE ON payment_cert_adjustments
  FOR EACH ROW EXECUTE FUNCTION pca_khoa_chung_tu_chot();
DROP TRIGGER IF EXISTS khoa_payment_cert_adjustment_items ON payment_cert_adjustment_items;
CREATE TRIGGER khoa_payment_cert_adjustment_items
  BEFORE INSERT OR UPDATE OR DELETE ON payment_cert_adjustment_items
  FOR EACH ROW EXECUTE FUNCTION pcai_khoa_dong_chung_tu();

-- Snapshot quyết định bất biến (khuôn 0160): mỗi quyết định qua POST /api/adjustments/:id/decide
-- ghi ĐÚNG 1 dòng cùng transaction với chuyển trạng thái + phiếu; operation_id = Idempotency-Key.
CREATE TABLE IF NOT EXISTS payment_cert_adjustment_decisions (
  id uuid PRIMARY KEY,
  adjustment_id integer NOT NULL,
  cert_id integer NOT NULL REFERENCES payment_certs(id),
  contract_id integer NOT NULL REFERENCES contracts(id),
  project_id integer NOT NULL REFERENCES projects(id),
  org_id integer NOT NULL REFERENCES organizations(id),
  actor_id integer NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result_status text NOT NULL CHECK (result_status IN ('pending', 'approved', 'rejected')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adjustment_id, operation_id),
  -- Khuôn _items: snapshot thuộc đúng dự án của chứng từ (RLS đọc theo project_id của snapshot).
  FOREIGN KEY (adjustment_id, project_id) REFERENCES payment_cert_adjustments (id, project_id)
);

ALTER TABLE payment_cert_adjustment_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_cert_adjustment_decisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS adj_decision_read ON payment_cert_adjustment_decisions;
CREATE POLICY adj_decision_read ON payment_cert_adjustment_decisions FOR SELECT
  USING (
    org_id::text = current_setting('app.org_id', true)
    AND project_id::text = current_setting('app.project_id', true)
  );
DROP POLICY IF EXISTS adj_decision_insert ON payment_cert_adjustment_decisions;
CREATE POLICY adj_decision_insert ON payment_cert_adjustment_decisions FOR INSERT
  WITH CHECK (
    org_id::text = current_setting('app.org_id', true)
    AND project_id::text = current_setting('app.project_id', true)
    AND actor_id::text = current_setting('app.user_id', true)
  );
REVOKE UPDATE, DELETE, TRUNCATE ON payment_cert_adjustment_decisions FROM xboss_app;
GRANT SELECT, INSERT ON payment_cert_adjustment_decisions TO xboss_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_cert_adjustments, payment_cert_adjustment_items
  TO xboss_app;
GRANT USAGE, SELECT ON SEQUENCE payment_cert_adjustment_code_seq TO xboss_app;
