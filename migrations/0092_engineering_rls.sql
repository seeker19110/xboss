-- 0092_engineering_rls.sql — C3 §3 "Policy" (chia PR mục 8 = C3.3): bật Row-Level Security
-- cho TOÀN BỘ 15 bảng `engineering_*`, làm phòng tuyến thứ hai chống lỗi "quên scope
-- project_id" ở tầng app. Đặc tả: docs/nang-cap/C3-data-audit-rls-hardening.md mục 3.
--
-- Điều kiện tiên quyết đã xong TRƯỚC migration này (không có thì bật RLS = trả rỗng âm thầm):
--   - PR1 (#347): mọi đường đọc/ghi engineering đã đặt GUC `app.project_id`
--     (`requireApiKey` patch ngữ cảnh cho 4 route API key; 6 hàm đọc ENG-2/3/4 bọc
--     `withProjectScope`). Đã ĐO bằng role `xboss_app` thật, không suy từ code.
--   - 0091: 6 bảng con đã có cột `project_id` NOT NULL — không có cột này thì policy
--     KHÔNG diễn đạt được cho chúng.
--
-- Khác 0069 (nhóm bảng tài chính) ở MỘT điểm quan trọng: nhóm engineering đi thẳng
-- policy NGHIÊM NGẶT 2 nhánh, KHÔNG có giai đoạn chuyển tiếp "GUC rỗng → cho qua".
-- Lý do chính đáng, không phải làm tắt:
--   1. C3 §3 quy định rõ "Không có nhánh missing context → allow";
--   2. nhóm này còn MỚI, không có đường đọc cũ ngoài transaction như nhóm tài chính hồi M51
--      (0069 cần nhánh chuyển tiếp vì lý do lịch sử đó, tới 0077 mới bỏ được);
--   3. mọi đường vào đều là route API key project-bound (ENG-0 mục 4.5) hoặc route phiên
--      đã có GUC sẵn — đã rà hết ở PR1.
--
-- Hai nhánh của policy (giống nhau cho USING lẫn WITH CHECK), sao đúng 0077:
--   1) project_id::text = current_setting('app.project_id', true) — khớp dự án đang chọn;
--   2) current_setting('app.project_id', true) = '*' — ngữ cảnh cross-project hợp lệ.
-- So sánh dạng TEXT, KHÔNG cast GUC ::int: Postgres KHÔNG bảo đảm short-circuit AND/OR nên
-- cast GUC sẽ làm nhánh '*' lỗi "invalid input syntax for integer" (bài học ghi ở 0069/0077).
--
-- FORCE ROW LEVEL SECURITY để policy áp cả cho role owner. Lưu ý cạm bẫy #1 của RLS:
-- SUPERUSER vẫn BỎ QUA hoàn toàn — vì vậy test kiểm RLS phải chạy bằng `xboss_app`
-- (NOBYPASSRLS), xem tests/rls.test.ts. Bộ test còn lại chạy bằng role owner nên không
-- bị ảnh hưởng.
--
-- Migration này CHỈ đụng policy/metadata, KHÔNG đụng dòng dữ liệu nào. Nhưng nó chỉ an toàn
-- khi 0091 đã chạy xong, mà 0091 thì có backfill → cả cặp phải qua staging trước.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- ENG-1 lõi
    'engineering_sources', 'engineering_source_revisions', 'engineering_objects',
    'engineering_object_revisions', 'engineering_object_relations',
    -- ENG-5 hợp đồng ingest
    'engineering_ingest_requests',
    -- ENG-2 intelligence
    'engineering_intelligence_packages', 'engineering_suggestions', 'engineering_evidence',
    -- ENG-3 workflow
    'engineering_workflows', 'engineering_workflow_gates', 'engineering_workflow_events',
    -- ENG-4 multi-agent
    'engineering_agent_sessions', 'engineering_agent_claims', 'engineering_conflicts'
  ];
  missing TEXT := '';
BEGIN
  -- Chặn trước: bảng nào thiếu cột project_id thì policy sẽ lỗi khó hiểu ở CREATE POLICY.
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'project_id'
    ) THEN
      missing := missing || ' ' || t;
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'Thiếu cột project_id ở:% — migration 0091 phải chạy trước 0092', missing;
  END IF;

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
