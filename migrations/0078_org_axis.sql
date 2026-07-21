-- 0078_org_axis.sql — M54 Giai đoạn 1 PR1: dựng trục org_id đa tenant (multi-tenant SaaS).
--
-- Mục tiêu: mọi bảng gốc dữ liệu nghiệp vụ có cột org_id NOT NULL trỏ organizations(id),
-- và mã BOQ (boq_codes) trở thành duy nhất TRONG mỗi org thay vì toàn cục — để 2 tổ chức
-- khác nhau đặt cùng 1 mã BOQ vẫn cô lập, còn trong cùng 1 org vẫn chặn trùng xuyên bảng
-- như trước (xem 0029_boq_codes.sql, docs/audit.md §7 "boq_codes + trigger là nguồn sự thật").
--
-- CHẠM DỮ LIỆU (backfill/UPDATE + ALTER COLUMN SET NOT NULL + DROP CONSTRAINT) →
-- BẮT BUỘC chạy qua staging trước production (xem CLAUDE.md DoD, docs/ops/staging.md).
-- Idempotent: mọi backfill có guard WHERE org_id IS NULL; ALTER dùng IF NOT EXISTS / IF EXISTS.
--
-- Giai đoạn này app vẫn chạy 1-org: mọi dữ liệu cũ gán org_id = 1 (tổ chức mặc định).
-- Session CHƯA mang orgId (việc của PR2) — call-site boqTakenBy tạm truyền hằng số 1.

-- ============================================================================
-- 1) organizations: bổ sung cột + đảm bảo tồn tại org mặc định id = 1.
-- ============================================================================
-- organizations.id là SERIAL (0070) — KHÔNG phải GENERATED ALWAYS AS IDENTITY — nên có
-- thể INSERT id tường minh mà không cần OVERRIDING SYSTEM VALUE. Sau khi chèn id=1 phải
-- đồng bộ lại sequence để lần INSERT SERIAL kế tiếp không đụng id=1.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_key ON organizations(slug);

-- Chèn org mặc định id=1 nếu chưa có dòng id=1 (KHÔNG ghi đè org thật đã tồn tại id=1).
INSERT INTO organizations (id, name, slug, status, plan, created_at)
  SELECT 1, 'Tổ chức mặc định', 'xboss-mac-dinh', 'active', NULL, now()
  WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE id = 1);

-- Đồng bộ sequence để nextval() > mọi id hiện có (tránh đụng id=1 vừa chèn tường minh).
SELECT setval(
  pg_get_serial_sequence('organizations', 'id'),
  GREATEST((SELECT MAX(id) FROM organizations), 1),
  true
);

-- ============================================================================
-- 2) Thêm cột org_id (nullable trước) vào 12 bảng gốc. projects.org_id ĐÃ có (0070).
-- ============================================================================
ALTER TABLE users             ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE suppliers         ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE code_lists        ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE role_permissions  ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE custom_field_defs ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE feature_flags     ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE alert_rules       ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE approval_flows    ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE api_keys          ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE webhooks          ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE integrations      ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
ALTER TABLE saved_reports     ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);

-- ============================================================================
-- 3) Backfill toàn bộ org_id = 1 cho dữ liệu cũ (guard WHERE org_id IS NULL → idempotent).
-- ============================================================================
UPDATE users             SET org_id = 1 WHERE org_id IS NULL;
UPDATE suppliers         SET org_id = 1 WHERE org_id IS NULL;
UPDATE code_lists        SET org_id = 1 WHERE org_id IS NULL;
UPDATE role_permissions  SET org_id = 1 WHERE org_id IS NULL;
UPDATE custom_field_defs SET org_id = 1 WHERE org_id IS NULL;
UPDATE feature_flags     SET org_id = 1 WHERE org_id IS NULL;
UPDATE alert_rules       SET org_id = 1 WHERE org_id IS NULL;
UPDATE approval_flows    SET org_id = 1 WHERE org_id IS NULL;
UPDATE api_keys          SET org_id = 1 WHERE org_id IS NULL;
UPDATE webhooks          SET org_id = 1 WHERE org_id IS NULL;
UPDATE integrations      SET org_id = 1 WHERE org_id IS NULL;
UPDATE saved_reports     SET org_id = 1 WHERE org_id IS NULL;
UPDATE projects          SET org_id = 1 WHERE org_id IS NULL;

-- ============================================================================
-- 4) Sau backfill: org_id NOT NULL + DEFAULT 1 cho cả 13 bảng (12 bảng mới + projects).
-- ============================================================================
-- DEFAULT 1 = cầu tương thích GIAI ĐOẠN 1-org: toàn bộ code/test hiện có INSERT vào các
-- bảng này KHÔNG truyền org_id (hơn 200 chỗ). Không có DEFAULT thì SET NOT NULL sẽ làm vỡ
-- mọi INSERT đó (app lẫn test) — không thể vừa SET NOT NULL vừa giữ test/build xanh mà
-- không viết lại 200+ call-site. PR2 (session mang orgId) sẽ truyền org_id tường minh; khi
-- đó có thể bỏ DEFAULT. Giá trị mới omit org_id → gán org mặc định 1 (đúng ngữ cảnh 1-org).
ALTER TABLE users             ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE suppliers         ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE code_lists        ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE role_permissions  ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE custom_field_defs ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE feature_flags     ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE alert_rules       ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE approval_flows    ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE api_keys          ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE webhooks          ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE integrations      ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE saved_reports     ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE projects          ALTER COLUMN org_id SET DEFAULT 1, ALTER COLUMN org_id SET NOT NULL;

-- ============================================================================
-- 5) boq_codes: PK (code) → (org_id, code) + trigger đồng bộ suy org_id từ bảng nguồn.
-- ============================================================================
-- 5a) Thêm cột org_id (nullable trước để backfill).
ALTER TABLE boq_codes ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);

-- 5b) Backfill org_id: suy từ bảng nguồn (row_id) → projects.org_id theo đúng chuỗi khoá.
--     tasks/work_packages đi qua sheet_types→towers→projects; materials/boq_items có
--     project_id trực tiếp (0027). Dòng không join được (project_id NULL) → an toàn về 1.
UPDATE boq_codes bc SET org_id = COALESCE(src.org_id, 1)
  FROM (
    SELECT 'tasks'::text AS tn, t.id AS rid, p.org_id
      FROM tasks t
      JOIN work_packages w ON w.id = t.package_id
      JOIN sheet_types  s ON s.id = w.sheet_type_id
      JOIN towers      tw ON tw.id = s.tower_id
      JOIN projects     p ON p.id = tw.project_id
    UNION ALL
    SELECT 'work_packages', w.id, p.org_id
      FROM work_packages w
      JOIN sheet_types  s ON s.id = w.sheet_type_id
      JOIN towers      tw ON tw.id = s.tower_id
      JOIN projects     p ON p.id = tw.project_id
    UNION ALL
    SELECT 'materials', m.id, p.org_id
      FROM materials m JOIN projects p ON p.id = m.project_id
    UNION ALL
    SELECT 'boq_items', b.id, p.org_id
      FROM boq_items b JOIN projects p ON p.id = b.project_id
  ) src
  WHERE bc.table_name = src.tn AND bc.row_id = src.rid AND bc.org_id IS NULL;

-- Lưới an toàn: dòng còn NULL (nguồn không có project_id) → org mặc định 1 (dữ liệu 1-org).
UPDATE boq_codes SET org_id = 1 WHERE org_id IS NULL;

-- 5c) org_id NOT NULL rồi đổi PK sang (org_id, code).
ALTER TABLE boq_codes ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE boq_codes DROP CONSTRAINT IF EXISTS boq_codes_pkey;
ALTER TABLE boq_codes ADD PRIMARY KEY (org_id, code);

-- 5d) Cập nhật hàm đồng bộ: suy org_id của dòng nguồn, khoá xung đột đổi sang (org_id, code).
--     Giữ NGUYÊN 4 trigger gắn trên tasks/work_packages/materials/boq_items (chỉ sửa thân
--     hàm) — logic dọn mã cũ khi rename + raise khi 2 dòng khác bảng giành cùng mã giữ y hệt
--     0029, chỉ mở rộng phạm vi duy nhất từ "toàn cục" thành "trong 1 org".
CREATE OR REPLACE FUNCTION boq_codes_sync() RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  new_org  INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- (table_name, row_id) là UNIQUE nên xoá không cần org_id.
    DELETE FROM boq_codes WHERE table_name = TG_TABLE_NAME AND row_id = OLD.id;
    RETURN OLD;
  END IF;

  new_code := to_jsonb(NEW) ->> TG_ARGV[0];

  IF new_code IS NULL THEN
    DELETE FROM boq_codes WHERE table_name = TG_TABLE_NAME AND row_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Suy org_id của chính dòng nguồn theo đúng chuỗi khoá tới projects.org_id.
  IF TG_TABLE_NAME = 'tasks' THEN
    SELECT p.org_id INTO new_org
      FROM work_packages w
      JOIN sheet_types  s ON s.id = w.sheet_type_id
      JOIN towers      tw ON tw.id = s.tower_id
      JOIN projects     p ON p.id = tw.project_id
     WHERE w.id = NEW.package_id;
  ELSIF TG_TABLE_NAME = 'work_packages' THEN
    SELECT p.org_id INTO new_org
      FROM sheet_types  s
      JOIN towers      tw ON tw.id = s.tower_id
      JOIN projects     p ON p.id = tw.project_id
     WHERE s.id = NEW.sheet_type_id;
  ELSIF TG_TABLE_NAME = 'materials' THEN
    SELECT org_id INTO new_org FROM projects WHERE id = NEW.project_id;
  ELSIF TG_TABLE_NAME = 'boq_items' THEN
    SELECT org_id INTO new_org FROM projects WHERE id = NEW.project_id;
  END IF;
  -- Dòng chưa gắn dự án (project_id NULL) → org mặc định 1 (giai đoạn 1-org).
  new_org := COALESCE(new_org, 1);

  -- Mã đổi (rename) → dọn đăng ký cũ của đúng dòng này trước khi giành mã mới.
  DELETE FROM boq_codes WHERE table_name = TG_TABLE_NAME AND row_id = NEW.id AND code <> new_code;

  INSERT INTO boq_codes (org_id, code, table_name, row_id)
    VALUES (new_org, new_code, TG_TABLE_NAME, NEW.id)
    ON CONFLICT (org_id, code) DO UPDATE
      SET table_name = EXCLUDED.table_name, row_id = EXCLUDED.row_id
      WHERE boq_codes.table_name = EXCLUDED.table_name AND boq_codes.row_id = EXCLUDED.row_id;

  -- ON CONFLICT DO UPDATE với WHERE không khớp thì không ghi đè NHƯNG cũng không lỗi —
  -- phải tự kiểm lại rồi raise để chặn 2 dòng khác bảng cùng chiếm 1 mã (trong cùng org).
  IF NOT EXISTS (
    SELECT 1 FROM boq_codes
     WHERE org_id = new_org AND code = new_code
       AND table_name = TG_TABLE_NAME AND row_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Mã BOQ "%" đã được dùng ở bảng khác', new_code USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5e) Bỏ 3 unique index boq_code RIÊNG bảng (uniq_tasks_boq/uniq_wp_boq/uniq_materials_boq,
--     0001). Chúng ép boq_code duy nhất TOÀN CỤC trong mỗi bảng (không theo org) nên chặn
--     2 org đặt cùng mã trên cùng loại bảng — trái tiêu chí M54 GĐ1 (cô lập tenant). Không
--     thể tái tạo thành (org_id, boq_code) vì tasks/work_packages/materials KHÔNG có cột
--     org_id (chỉ suy qua chuỗi project→org). Uniqueness giờ do boq_codes (PK (org_id, code))
--     + trigger boq_codes_sync đảm nhiệm: đã bao trùm cả trùng mã CÙNG bảng CÙNG org (ON
--     CONFLICT (org_id, code) → RAISE) lẫn xuyên bảng — nên 3 index này vừa thừa vừa sai
--     phạm vi. boq_codes chính là "nguồn sự thật" duy nhất (docs/audit.md §7).
DROP INDEX IF EXISTS uniq_tasks_boq;
DROP INDEX IF EXISTS uniq_wp_boq;
DROP INDEX IF EXISTS uniq_materials_boq;

-- ============================================================================
-- 6) projects.code: UNIQUE toàn cục → UNIQUE (org_id, code).
-- ============================================================================
-- projects.code khai báo inline `code TEXT UNIQUE` (0001) → constraint tên projects_code_key.
-- DROP cả tên mới để câu này idempotent (chạy lại không lỗi "constraint already exists").
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_code_key;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_org_code_key;
ALTER TABLE projects ADD CONSTRAINT projects_org_code_key UNIQUE (org_id, code);

-- (7) KHÔNG đổi users.email — giữ UNIQUE NOT NULL toàn cục nguyên trạng (đã chốt).
-- (8) KHÔNG thêm UNIQUE mới cho suppliers — chỉ thêm cột org_id ở bước 2.
