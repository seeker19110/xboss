-- 0091_engineering_child_project_axis.sql — C3 §3 "Project axis" + "Relational invariants"
-- (đặc tả: docs/nang-cap/C3-data-audit-rls-hardening.md mục 3, chia PR mục 8 = C3.2).
--
-- Hai việc, phục vụ đúng một mục tiêu — làm cho RLS ở 0092 CÓ THỂ diễn đạt được:
--   A. Mang `project_id` xuống 6 BẢNG CON chưa có (suy từ cha, NOT NULL). Không có cột này
--      thì policy RLS không viết được cho chúng — đó là lý do kỹ thuật, không phải cho đẹp.
--   B. Khoá 10 đường tham chiếu CHÉO DỰ ÁN còn hở bằng composite FK.
--
-- ĐÃ ĐO TRÊN DB THẬT (không suy từ code): trên schema sau 0090, chèn thử 10 dòng chéo dự án
-- thì **cả 10 đều LỌT**, không lỗi nào:
--   evidence→source_rev, evidence→object, claim→source_rev, obj_rev→source_rev,
--   suggestion→package, suggestion→object, suggestion→workflow, package→source_rev,
--   session→workflow, workflow→suggestion.
-- 0088/0089 mới khoá nhánh sources/objects/relations; nhánh intelligence (ENG-2),
-- workflow (ENG-3) và multi-agent (ENG-4) thì chưa đụng tới.
--
-- ⚠️ MIGRATION NÀY ĐỤNG DỮ LIỆU (backfill `project_id` cho 6 bảng con) → theo DoD
-- (CLAUDE.md) PHẢI chạy staging trước, KHÔNG đi thẳng production. Backfill lũy đẳng
-- (chỉ điền dòng lệch) nên chạy lại nhiều lần vẫn an toàn.
--
-- Ghi chú về ON DELETE: các FK một cột sẵn có giữ NGUYÊN hành vi (CASCADE/SET NULL).
-- Composite FK thêm vào để mặc định NO ACTION — kiểm ở CUỐI CÂU LỆNH, nên khi cha bị xoá
-- thì FK một cột chạy trước (SET NULL/CASCADE), tới lúc kiểm composite cột đã NULL và
-- MATCH SIMPLE coi như thoả. Hành vi này được test lại ở tests/rls.test.ts.

-- ===========================================================================================
-- A. Đích cho composite FK — 4 bảng cha còn thiếu UNIQUE (id, project_id).
--    `id` vốn là PK nên UNIQUE này KHÔNG siết thêm ràng buộc nào, chỉ để Postgres chấp nhận
--    làm FK target (cùng cách 0088/0089 đã dùng).
-- ===========================================================================================
DO $$
DECLARE
  t TEXT;
  cname TEXT;
  parents TEXT[] := ARRAY[
    'engineering_intelligence_packages',
    'engineering_workflows',
    'engineering_agent_sessions',
    'engineering_suggestions'
  ];
BEGIN
  FOREACH t IN ARRAY parents LOOP
    cname := 'uq_' || t || '_id_project';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = cname) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (id, project_id)', t, cname);
    END IF;
  END LOOP;
END $$;

-- ===========================================================================================
-- B. project_id cho 6 bảng con: thêm nullable → backfill từ cha → siết NOT NULL → index →
--    composite FK về cha. Đúng pattern 0027_multi_project.sql / 0069_rls.sql / 0089.
-- ===========================================================================================
DO $$
DECLARE
  r RECORD;
  orphan BIGINT;
  cname TEXT;
  -- (bảng con, cột khoá ngoại, bảng cha) — mọi cột khoá ngoại dưới đây đều NOT NULL sẵn,
  -- nên backfill luôn suy được project_id, không có dòng mồ côi hợp lệ.
  specs CONSTANT TEXT[][] := ARRAY[
    ['engineering_object_revisions', 'object_id',   'engineering_objects'],
    ['engineering_evidence',         'suggestion_id','engineering_suggestions'],
    ['engineering_workflow_gates',   'workflow_id', 'engineering_workflows'],
    ['engineering_workflow_events',  'workflow_id', 'engineering_workflows'],
    ['engineering_agent_claims',     'session_id',  'engineering_agent_sessions'],
    ['engineering_conflicts',        'session_id',  'engineering_agent_sessions']
  ];
BEGIN
  FOR r IN SELECT specs[i][1] AS child, specs[i][2] AS fk_col, specs[i][3] AS parent
             FROM generate_subscripts(specs, 1) AS i
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS project_id INTEGER', r.child);

    EXECUTE format(
      'UPDATE %I c SET project_id = p.project_id FROM %I p'
      || ' WHERE c.%I = p.id AND c.project_id IS DISTINCT FROM p.project_id',
      r.child, r.parent, r.fk_col
    );

    -- Chỉ siết NOT NULL khi đã backfill hết. Còn sót dòng mồ côi thì DỪNG có thông báo rõ
    -- thay vì fail khó hiểu ở bước ALTER (cùng cách 0089 đã làm).
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE project_id IS NULL', r.child) INTO orphan;
    IF orphan > 0 THEN
      -- Chú ý: RAISE dùng placeholder `%` (KHÔNG phải `%s` như format()) — viết `%s` sẽ in
      -- thừa một chữ "s" vào thông báo.
      RAISE EXCEPTION
        'Còn % dòng % không suy được project_id từ cha % — kiểm tra dữ liệu mồ côi trước khi chạy lại migration',
        orphan, r.child, r.parent;
    END IF;

    EXECUTE format('ALTER TABLE %I ALTER COLUMN project_id SET NOT NULL', r.child);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(project_id)',
      'idx_' || r.child || '_project', r.child
    );

    -- Bất biến: con phải cùng dự án với cha trực tiếp của nó. ON DELETE CASCADE khớp với
    -- FK một cột sẵn có (cả 6 quan hệ cha–con này đều đang là CASCADE).
    cname := 'fk_' || r.child || '_same_project';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = cname) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I, project_id)'
        || ' REFERENCES %I(id, project_id) ON DELETE CASCADE',
        r.child, cname, r.fk_col, r.parent
      );
    END IF;
  END LOOP;
END $$;

-- ===========================================================================================
-- C. Khoá 10 đường tham chiếu chéo dự án đã đo được. Tất cả đều là cột NULL-able trỏ sang
--    bảng khác trong cùng nhóm; MATCH SIMPLE nên dòng có cột NULL vẫn hợp lệ như trước.
-- ===========================================================================================
DO $$
DECLARE
  r RECORD;
  -- (bảng, cột trỏ đi, bảng đích)
  specs CONSTANT TEXT[][] := ARRAY[
    -- nhánh ENG-2 Intelligence
    ['engineering_evidence',              'source_revision_id', 'engineering_source_revisions'],
    ['engineering_evidence',              'object_id',          'engineering_objects'],
    ['engineering_suggestions',           'package_id',         'engineering_intelligence_packages'],
    ['engineering_suggestions',           'object_id',          'engineering_objects'],
    ['engineering_intelligence_packages', 'source_revision_id', 'engineering_source_revisions'],
    -- nhánh ENG-1 lõi
    ['engineering_object_revisions',      'source_revision_id', 'engineering_source_revisions'],
    -- nhánh ENG-3 Workflow ↔ ENG-2
    ['engineering_suggestions',           'workflow_id',        'engineering_workflows'],
    ['engineering_workflows',             'suggestion_id',      'engineering_suggestions'],
    -- nhánh ENG-4 Multi-agent
    ['engineering_agent_claims',          'source_revision_id', 'engineering_source_revisions'],
    ['engineering_agent_sessions',        'workflow_id',        'engineering_workflows']
  ];
  cname TEXT;
  bad BIGINT;
  report TEXT := '';
BEGIN
  -- Tiền kiểm: đếm dòng ĐANG vi phạm trước khi thử tạo FK. Không có bước này, dữ liệu bẩn
  -- có sẵn làm migration chết bằng lỗi 23503 thô, chỉ nêu ĐÚNG MỘT dòng đầu tiên gặp phải —
  -- người vận hành phải chạy lại nhiều vòng mới biết hết. Ở đây liệt kê MỘT LẦN đủ 10 đường.
  FOR r IN SELECT specs[i][1] AS tbl, specs[i][2] AS col, specs[i][3] AS target
             FROM generate_subscripts(specs, 1) AS i
  LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM %I c JOIN %I p ON p.id = c.%I WHERE c.project_id <> p.project_id',
      r.tbl, r.target, r.col
    ) INTO bad;
    IF bad > 0 THEN
      report := report || format(E'\n  - %s.%s → %s: %s dòng', r.tbl, r.col, r.target, bad);
    END IF;
  END LOOP;

  IF report <> '' THEN
    RAISE EXCEPTION
      E'Không thể khoá bất biến chéo dự án — dữ liệu hiện có đang vi phạm:%\n\nĐây là dữ liệu SAI có sẵn, không phải lỗi migration. Phải quyết định xử lý từng dòng (sửa project_id hay xoá) rồi mới chạy lại; KHÔNG tự động sửa vì không đoán được dự án nào mới đúng.',
      report;
  END IF;

  FOR r IN SELECT specs[i][1] AS tbl, specs[i][2] AS col, specs[i][3] AS target
             FROM generate_subscripts(specs, 1) AS i
  LOOP
    cname := 'fk_' || r.tbl || '_' || r.col || '_same_project';
    -- Tên constraint tối đa 63 ký tự (NAMEDATALEN) — cắt cho an toàn, vẫn duy nhất vì
    -- tiền tố đã gồm cả tên bảng lẫn tên cột.
    cname := left(cname, 63);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = cname) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I, project_id)'
        || ' REFERENCES %I(id, project_id)',
        r.tbl, cname, r.col, r.target
      );
    END IF;
  END LOOP;
END $$;
