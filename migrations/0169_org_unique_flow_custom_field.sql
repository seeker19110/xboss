-- 0169_org_unique_flow_custom_field.sql — AUDIT-S16 nợ (5): hai unique index còn TOÀN HỆ trên bảng
-- cấu hình theo tổ chức (đã FORCE RLS org ở 0165) → đổi sang theo (org, …), cùng mẫu
-- ux_alert_rule_org_active ở 0161 §3.
--
-- Trước: flow active toàn cục (project_id NULL) của org B chặn org A tạo flow cùng loại (23505 →
-- "Đã có flow đang bật") dù A không nhìn thấy flow đó; tương tự trường tuỳ biến toàn cục cùng key.
--
-- Đụng dữ liệu: căn org_id của dòng GẮN DỰ ÁN về org của dự án (bản ghi cũ trước 0078 nhận DEFAULT
-- 1 dù dự án thuộc org khác) — idempotent, chỉ sửa dòng lệch. Dòng toàn cục giữ org_id đã ghi.

-- Bảng FORCE RLS org (0165): mở phạm vi mọi tổ chức trong transaction của migration.
SELECT set_config('app.org_id', '*', true);

UPDATE approval_flows af
   SET org_id = p.org_id
  FROM projects p
 WHERE p.id = af.project_id
   AND af.org_id IS DISTINCT FROM p.org_id;

UPDATE custom_field_defs cf
   SET org_id = p.org_id
  FROM projects p
 WHERE p.id = cf.project_id
   AND cf.org_id IS DISTINCT FROM p.org_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_flow_org_active
  ON approval_flows (org_id, entity_type, COALESCE(project_id, 0)) WHERE active;
DROP INDEX IF EXISTS ux_flow_active;

CREATE UNIQUE INDEX IF NOT EXISTS custom_field_defs_org_scope_key_uidx
  ON custom_field_defs (org_id, entity_type, COALESCE(project_id, 0), key);
DROP INDEX IF EXISTS custom_field_defs_scope_key_uidx;
