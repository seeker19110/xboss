-- 0090_audit_uuid_entity_key.sql — C3 §2 "Audit UUID": cho audit trail chung nhận được cả
-- khoá SERIAL lẫn UUID, và vá luôn 1 lỗi crash thật của trigger khi ngữ cảnh cross-project.
-- Đặc tả: docs/nang-cap/C3-data-audit-rls-hardening.md §2.
--
-- Hai lỗi ĐÃ ĐO trực tiếp trên Postgres (không suy từ code):
--   1) Gắn trigger audit lên bảng khoá UUID (engineering_*) → MỌI INSERT vỡ ngay:
--      `invalid input syntax for type bigint: "ee7a6766-6deb-..."` — vì hàm khai `v_id BIGINT`
--      rồi ép `(to_jsonb(NEW)->>'id')::bigint`, còn `audit_log.entity_id` cũng là BIGINT
--      NOT NULL nên về bản chất không chứa nổi UUID. Đây chính là nợ kỹ thuật ghi ở ENG-2:
--      toàn bộ bảng `engineering_*` (ENG-1..ENG-5) nằm NGOÀI audit trail tự động.
--   2) Ghi vào BẤT KỲ bảng đang có trigger audit (contracts, invoices, ...) trong ngữ cảnh
--      `app.project_id = '*'` — ngữ cảnh cross-project HỢP LỆ do chính RLS định nghĩa
--      (`withProjectScope("*")`, xem lib/db/index.ts) → vỡ:
--      `invalid input syntax for type integer: "*"`. Hiện chưa nổ vì 2 route dùng '*'
--      (`payments/bills`, `payments/floors`) mới chỉ ĐỌC; thêm 1 lệnh ghi là thành sự cố thật.
--
-- Migration THUẦN THÊM: ADD COLUMN nullable / DROP NOT NULL / CREATE INDEX / CREATE OR
-- REPLACE FUNCTION / CREATE TRIGGER — KHÔNG có UPDATE, không backfill, không đụng dòng dữ
-- liệu nào → đi thẳng production được theo DoD.
--
-- CỐ Ý KHÔNG backfill `entity_key` cho dòng lịch sử: `audit_log` là bảng chỉ-ghi-thêm và có
-- thể rất lớn, một UPDATE toàn bảng vừa khoá lâu vừa không cần thiết — mọi chỗ đọc dùng
-- COALESCE(entity_key, entity_id::text) là đủ (xem lib/audit-chain.ts).

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_key TEXT;

-- entity_id không còn bắt buộc: dòng của bảng khoá UUID sẽ để NULL và định danh nằm ở
-- entity_key. Dòng cũ giữ nguyên giá trị, không đụng tới.
ALTER TABLE audit_log ALTER COLUMN entity_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_entity_key
  ON audit_log(entity_type, entity_key, at DESC);

-- Hàm trigger: giữ NGUYÊN cơ chế hash-chain của 0050 (nếu đổi cách tính hash thì toàn bộ
-- chuỗi cũ sẽ báo sai). Điểm mấu chốt để tương thích ngược: hash trên `v_key` — với khoá số
-- thì v_key CHÍNH LÀ chuỗi mà bản cũ đã hash (`v_id::text`), nên hash của mọi dòng cũ và mọi
-- dòng số mới đều không đổi; chỉ dòng UUID là chuỗi mới (trước đây không ghi được).
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $$
DECLARE
  v_changes JSONB;
  v_key TEXT;
  v_id BIGINT;
  v_project INT;
  v_project_raw TEXT;
  v_prev_hash TEXT;
  v_row_hash TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(o.key, jsonb_build_array(o.value, n.value)) INTO v_changes
      FROM jsonb_each(to_jsonb(OLD)) o JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
     WHERE o.value IS DISTINCT FROM n.value;
    IF v_changes IS NULL THEN RETURN NEW; END IF;        -- không có gì đổi thật
    v_key := to_jsonb(NEW)->>'id';
  ELSIF TG_OP = 'INSERT' THEN
    v_changes := to_jsonb(NEW); v_key := to_jsonb(NEW)->>'id';
  ELSE
    v_changes := to_jsonb(OLD); v_key := to_jsonb(OLD)->>'id';
  END IF;

  -- Chỉ điền entity_id khi khoá THỰC SỰ là số nguyên nằm trong tầm BIGINT. UUID (hay bất kỳ
  -- khoá text nào khác) → để NULL, định danh nằm ở entity_key.
  v_id := CASE
            WHEN v_key ~ '^-?[0-9]{1,18}$' THEN v_key::bigint
            ELSE NULL
          END;

  -- app.project_id có thể là '*' (ngữ cảnh cross-project hợp lệ của RLS) hoặc rỗng — ép
  -- thẳng ::int là vỡ. Chỉ nhận chuỗi số.
  v_project_raw := NULLIF(current_setting('app.project_id', true), '');
  v_project := CASE
                 WHEN v_project_raw ~ '^[0-9]{1,9}$' THEN v_project_raw::int
                 ELSE NULL
               END;

  SELECT row_hash INTO v_prev_hash FROM audit_log ORDER BY id DESC LIMIT 1;
  -- now() ổn định trong cả transaction nên trùng khớp với giá trị DEFAULT now() được dùng
  -- cho cột `at` của chính dòng đang insert (không truyền `at` tường minh ở dưới).
  v_row_hash := encode(
    sha256(convert_to(COALESCE(v_prev_hash, '') || COALESCE(v_key, '') || now()::text || v_changes::text, 'UTF8')),
    'hex'
  );

  INSERT INTO audit_log(actor_id, actor_role, entity_type, entity_id, entity_key, action,
                        changes, project_id, request_id, row_hash)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::int,
          NULLIF(current_setting('app.role', true), ''),
          TG_TABLE_NAME, v_id, v_key, TG_OP, v_changes,
          v_project,
          NULLIF(current_setting('app.request_id', true), ''),
          v_row_hash);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

-- Giờ hàm đã nhận được UUID → gắn audit cho nhóm bảng engineering_* mang dữ liệu kỹ thuật
-- có thể sửa (đóng nợ ghi ở ENG-2).
-- CỐ Ý KHÔNG gắn cho engineering_workflow_events / engineering_object_revisions: hai bảng đó
-- vốn đã là sổ append-only có ngữ nghĩa riêng — gắn thêm sẽ đếm trùng sự kiện, đúng cảnh báo
-- "không copy event workflow vào hai bảng gây double count" (C3 §2).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'engineering_objects', 'engineering_sources', 'engineering_source_revisions',
    'engineering_object_relations', 'engineering_suggestions'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$s', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s '
        'FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
