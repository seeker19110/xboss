-- 0050_document_hash.sql — M43 PR3: sha256 tài liệu (task/claim/contract/vo documents)
-- + hash-chain cho audit_log (mỗi dòng băm nối tiếp hash dòng trước — phát hiện sửa/xoá
-- tay ngoài luồng app, kể cả khi có quyền UPDATE trực tiếp trên DB). Xem
-- docs/nang-cap/M43-audit-trail.md mục PR3, scripts/verify-audit-chain.ts.

-- Hash nội dung file lúc upload — cho phép đối chiếu khi tải xuống (route GET stream)
-- để phát hiện file trên đĩa bị tráo/hỏng ngoài ý muốn. NULL với file upload trước PR3
-- (bỏ qua kiểm tra, không có gì để so).
ALTER TABLE task_documents ADD COLUMN IF NOT EXISTS sha256 TEXT;
ALTER TABLE claim_documents ADD COLUMN IF NOT EXISTS sha256 TEXT;
ALTER TABLE vo_documents ADD COLUMN IF NOT EXISTS sha256 TEXT;
ALTER TABLE contract_documents ADD COLUMN IF NOT EXISTS sha256 TEXT;

-- Hash-chain cho audit_log: mỗi dòng băm nối `hash dòng trước || id || at || changes`.
-- NULL với dòng ghi trước migration này (chưa có gì để nối) — trigger COALESCE về ''.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS row_hash TEXT;

-- Thay hàm audit_row_change() (định nghĩa gốc ở migrations/0049_audit_log.sql — KHÔNG sửa
-- file đó, migration append-only): thêm tính row_hash. Dùng hàm sha256() core Postgres 16
-- (pgcrypto không cần thiết). Trigger AFTER FOR EACH ROW chạy tuần tự trong 1 transaction
-- nên đọc row_hash của dòng audit_log có id lớn nhất NGAY TRƯỚC KHI insert là đủ chính xác
-- (đủ dùng cho mục đích audit — không cần khoá thêm, chấp nhận serialize theo bigserial).
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $$
DECLARE v_changes JSONB; v_id BIGINT; v_prev_hash TEXT; v_row_hash TEXT;
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

  SELECT row_hash INTO v_prev_hash FROM audit_log ORDER BY id DESC LIMIT 1;
  -- now() ổn định trong cả transaction nên trùng khớp với giá trị DEFAULT now() được dùng
  -- cho cột `at` của chính dòng đang insert (không truyền `at` tường minh ở dưới).
  v_row_hash := encode(
    sha256(convert_to(COALESCE(v_prev_hash, '') || v_id::text || now()::text || v_changes::text, 'UTF8')),
    'hex'
  );

  INSERT INTO audit_log(actor_id, actor_role, entity_type, entity_id, action, changes, project_id, request_id, row_hash)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::int,
          NULLIF(current_setting('app.role', true), ''),
          TG_TABLE_NAME, v_id, TG_OP, v_changes,
          NULLIF(current_setting('app.project_id', true), '')::int,
          NULLIF(current_setting('app.request_id', true), ''),
          v_row_hash);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
