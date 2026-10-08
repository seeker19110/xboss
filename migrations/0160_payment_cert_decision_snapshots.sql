-- 0160_payment_cert_decision_snapshots.sql — QUALITY-FINAL-1 S13c: snapshot quyết định IPC
-- bất biến (DATA-MIGRATIONS §7, DATA-CONTRACTS §6, A5-FR07..FR09).
--
-- Mỗi quyết định (bước pending của luồng duyệt / approved / rejected) qua
-- POST /api/payment-certs/:id/decide ghi ĐÚNG 1 dòng, cùng transaction với chuyển trạng thái
-- + phiếu thanh toán + audit trigger: đóng băng KL/đơn giá/tỷ lệ/tổng (chuỗi exact), cảnh báo
-- vượt HĐ, warningVersion, xác nhận + lý do, quy tắc tính (ipc-sum-v1). `operation_id` =
-- Idempotency-Key (hoặc UUID server sinh khi client không gửi): retry cùng key trả kết quả bước
-- cũ, không chạy bước kế. `result_status = 'pending'` là kết quả BƯỚC của engine duyệt — KHÔNG
-- thêm 'pending' vào enum payment_certs.status.
--
-- Vì sao bảng mới (so sánh ghi ở PROGRESS.md mục S13c): audit_log (trigger 0049) chỉ có
-- old/new dòng payment_certs, approval_actions chỉ có bước/ghi chú — không bên nào giữ KL/giá/
-- tỷ lệ/cảnh báo/xác nhận/version hay khoá idempotency (cert_id, operation_id).
--
-- Chỉ thêm thuần tuý (CREATE TABLE/POLICY/GRANT), không đụng dòng dữ liệu có sẵn. Chạy lặp an
-- toàn; bảng trùng tên mà sai định nghĩa → RAISE (không để IF NOT EXISTS nuốt schema sai).

CREATE TABLE IF NOT EXISTS payment_cert_decision_snapshots (
  id uuid PRIMARY KEY,
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
  UNIQUE (cert_id, operation_id)
);

DO $$
BEGIN
  IF (
    SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'payment_cert_decision_snapshots'
       AND (column_name, data_type, is_nullable) IN (
         ('id', 'uuid', 'NO'), ('cert_id', 'integer', 'NO'), ('contract_id', 'integer', 'NO'),
         ('project_id', 'integer', 'NO'), ('org_id', 'integer', 'NO'),
         ('actor_id', 'integer', 'NO'), ('operation_id', 'uuid', 'NO'),
         ('request_hash', 'text', 'NO'), ('result_status', 'text', 'NO'),
         ('snapshot', 'jsonb', 'NO'), ('created_at', 'timestamp with time zone', 'NO')
       )
  ) <> 11 THEN
    RAISE EXCEPTION 'Sai định nghĩa cột payment_cert_decision_snapshots';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'payment_cert_decision_snapshots'::regclass AND contype = 'u'
       AND pg_get_constraintdef(oid) = 'UNIQUE (cert_id, operation_id)'
  ) THEN
    RAISE EXCEPTION 'Thiếu UNIQUE (cert_id, operation_id) trên payment_cert_decision_snapshots';
  END IF;
END $$;

-- RLS (ADR-0005, khuôn DATA-MIGRATIONS §7): đọc đúng org + dự án đang chọn; ghi thêm điều kiện
-- người ký = actor của phiên. So sánh dạng TEXT với GUC (không cast GUC ::integer) theo ghi chú
-- 0069/0077 — Postgres không bảo đảm short-circuit, GUC '*'/'' cast sang int sẽ lỗi. Không có
-- nhánh '*'/GUC rỗng: thiếu ngữ cảnh → rỗng/từ chối ghi.
ALTER TABLE payment_cert_decision_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_cert_decision_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ipc_snapshot_read ON payment_cert_decision_snapshots;
CREATE POLICY ipc_snapshot_read ON payment_cert_decision_snapshots FOR SELECT
  USING (
    org_id::text = current_setting('app.org_id', true)
    AND project_id::text = current_setting('app.project_id', true)
  );
DROP POLICY IF EXISTS ipc_snapshot_insert ON payment_cert_decision_snapshots;
CREATE POLICY ipc_snapshot_insert ON payment_cert_decision_snapshots FOR INSERT
  WITH CHECK (
    org_id::text = current_setting('app.org_id', true)
    AND project_id::text = current_setting('app.project_id', true)
    AND actor_id::text = current_setting('app.user_id', true)
  );

-- Bất biến ở tầng quyền: ALTER DEFAULT PRIVILEGES của 0069 tự cấp UPDATE/DELETE cho xboss_app
-- trên bảng mới — thu hồi, chỉ giữ SELECT/INSERT (không route nào được sửa/xoá snapshot).
REVOKE UPDATE, DELETE, TRUNCATE ON payment_cert_decision_snapshots FROM xboss_app;
GRANT SELECT, INSERT ON payment_cert_decision_snapshots TO xboss_app;
