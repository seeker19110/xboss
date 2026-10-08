-- 0161_org_config_scope.sql — QUALITY-FINAL-1 S02e: cấu hình theo TỔ CHỨC thay vì toàn hệ.
-- Đặc tả: docs/nang-cap/AUDIT-S02E-ORG-CONFIG.md (spec cha A1-SCOPE, A1-AC01/Q-AC01).
--
-- ĐỤNG DỮ LIỆU (INSERT backfill + UPDATE căn org/dự án) → BẮT BUỘC qua staging
-- (`bash deploy.sh --staging`) và `npm run db:migrate -- --dry-run` trước production.
-- Idempotent: chạy lại cả file không lỗi, không nhân bản dòng (IF NOT EXISTS / ON CONFLICT /
-- điều kiện IS DISTINCT FROM). Đổi unique: tạo index MỚI trước (index cũ chặt hơn nên index mới
-- luôn dựng được trên dữ liệu đang có), xoá index/constraint CŨ sau. Không down-migration.
-- "Tổ chức mặc định" = organizations.id 1 (0078_org_axis.sql tạo + backfill mọi dữ liệu cũ về 1).

-- ============================================================================
-- 1) cost_settings → org_cost_settings (1 dòng / tổ chức).
-- ============================================================================
-- Bảng cũ `cost_settings` (1 dòng id=1 toàn hệ) GIỮ NGUYÊN, không còn được đọc/ghi bởi code mới —
-- chỉ để rollback code về bản trước vẫn chạy. Tổ chức chưa có dòng → mặc định 90/100 ở app.
CREATE TABLE IF NOT EXISTS org_cost_settings (
  org_id INT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  warn_pct NUMERIC(5,2) NOT NULL DEFAULT 90,
  over_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill: ngưỡng toàn hệ cũ đang áp cho MỌI tổ chức → chép sang từng tổ chức hiện có để hành
-- vi lúc deploy không đổi (mỗi org thấy đúng ngưỡng nó đang thấy). Org đã có dòng: giữ nguyên.
INSERT INTO org_cost_settings (org_id, warn_pct, over_pct)
SELECT o.id, cs.warn_pct, cs.over_pct
  FROM organizations o
 CROSS JOIN cost_settings cs
 WHERE cs.id = 1
ON CONFLICT (org_id) DO NOTHING;

-- RLS theo org — cùng khuôn chuyển tiếp 3 nhánh của 0080 (nhóm bảng cấu hình theo tổ chức).
ALTER TABLE org_cost_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_cost_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_org_cost_settings_org ON org_cost_settings;
CREATE POLICY p_org_cost_settings_org ON org_cost_settings
  USING (
    org_id::text = current_setting('app.org_id', true)
    OR NULLIF(current_setting('app.org_id', true), '') IS NULL
    OR current_setting('app.org_id', true) = '*'
  )
  WITH CHECK (
    org_id::text = current_setting('app.org_id', true)
    OR NULLIF(current_setting('app.org_id', true), '') IS NULL
    OR current_setting('app.org_id', true) = '*'
  );

-- ============================================================================
-- 2) code_lists: UNIQUE(domain, code) toàn hệ → UNIQUE(org_id, domain, code).
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_code_lists_org_domain_code
  ON code_lists (org_id, domain, code);

-- Xoá constraint unique cũ đúng theo ĐỊNH NGHĨA (cột domain, code), không phụ thuộc tên tự sinh.
DO $$
DECLARE
  c TEXT;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'code_lists'::regclass
       AND con.contype = 'u'
       AND con.conkey = ARRAY[
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'code_lists'::regclass AND attname = 'domain'),
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'code_lists'::regclass AND attname = 'code')
           ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE code_lists DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- Backfill: trước đây getList không lọc org nên MỌI tổ chức dùng danh mục của tổ chức mặc định
-- (seed 0060 + chỉnh sửa của admin). Chép các mục (domain, code) tổ chức mặc định có mà tổ chức
-- khác CHƯA có — giữ nguyên label/sort/active/meta — để nguyên nhân trễ / vai trò bắt buộc 2FA
-- của từng org không đổi lúc deploy. Mục org khác đã tự tạo giữ nguyên.
INSERT INTO code_lists (domain, code, label, sort, active, meta, org_id)
SELECT src.domain, src.code, src.label, src.sort, src.active, src.meta, o.id
  FROM code_lists src
 CROSS JOIN organizations o
 WHERE src.org_id = 1
   AND o.id <> 1
ON CONFLICT (org_id, domain, code) DO NOTHING;

-- ============================================================================
-- 3) alert_rules: unique rule active (metric, dự án) toàn hệ → theo (org, metric, dự án).
-- ============================================================================
-- Căn org của rule gắn dự án về org của dự án (bản cũ INSERT không truyền org_id → DEFAULT 1 dù
-- dự án thuộc org khác). Rule toàn cục (project_id NULL) không suy được org khác → giữ org_id đã
-- ghi (dữ liệu cũ = tổ chức mặc định 1).
UPDATE alert_rules ar
   SET org_id = p.org_id
  FROM projects p
 WHERE p.id = ar.project_id
   AND ar.org_id IS DISTINCT FROM p.org_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_rule_org_active
  ON alert_rules (org_id, metric, COALESCE(project_id, 0)) WHERE active;
DROP INDEX IF EXISTS ux_alert_rule_active;

-- ============================================================================
-- 4) sheet_types.slug: unique toàn hệ → unique theo DỰ ÁN.
-- ============================================================================
-- URL /tracking/<slug> luôn được giải trong ngữ cảnh dự án đang chọn (mọi API tra slug đều lọc
-- dự án). Dự án có thể có nhiều tháp nên unique theo tower KHÔNG đủ để slug xác định duy nhất
-- trong dự án → thêm cột suy diễn sheet_types.project_id (luôn = towers.project_id, giữ bằng
-- trigger, không ghi tay) làm khoá unique (project, slug). Không phải trục RLS.
ALTER TABLE sheet_types ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);

UPDATE sheet_types st
   SET project_id = tw.project_id
  FROM towers tw
 WHERE tw.id = st.tower_id
   AND st.project_id IS DISTINCT FROM tw.project_id;

-- Dòng mới/đổi tháp: project_id suy lại từ tháp (ghi tay vào project_id cũng bị ghi đè).
CREATE OR REPLACE FUNCTION sheet_types_sync_project() RETURNS TRIGGER AS $$
BEGIN
  NEW.project_id := (SELECT project_id FROM towers WHERE id = NEW.tower_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sheet_types_sync_project ON sheet_types;
CREATE TRIGGER trg_sheet_types_sync_project
  BEFORE INSERT OR UPDATE OF tower_id, project_id ON sheet_types
  FOR EACH ROW EXECUTE FUNCTION sheet_types_sync_project();

-- Tháp đổi dự án: kéo project_id của các sheet theo (trùng slug ở dự án đích → unique chặn).
CREATE OR REPLACE FUNCTION towers_sync_sheet_project() RETURNS TRIGGER AS $$
BEGIN
  UPDATE sheet_types SET project_id = NEW.project_id WHERE tower_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_towers_sync_sheet_project ON towers;
CREATE TRIGGER trg_towers_sync_sheet_project
  AFTER UPDATE OF project_id ON towers
  FOR EACH ROW WHEN (OLD.project_id IS DISTINCT FROM NEW.project_id)
  EXECUTE FUNCTION towers_sync_sheet_project();

-- Sheet mồ côi (không tháp/dự án) gộp chung nhóm 0 — vẫn không trùng slug với nhau.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sheet_types_project_slug
  ON sheet_types (COALESCE(project_id, 0), slug);
DROP INDEX IF EXISTS uniq_sheet_slug;
