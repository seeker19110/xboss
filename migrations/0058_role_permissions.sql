-- 0058_role_permissions.sql — M50 PR1: Override quyền trong DB (dữ liệu-hoá phân quyền).
-- Map CAN (lib/auth.ts) vẫn là NGUỒN MẶC ĐỊNH; bảng này CHỈ chứa override theo cặp
-- (vai trò, quyền). Không seed dòng nào → bảng rỗng = hành vi quyền y hệt trước M50.
-- Đọc quyền mỗi request KHÔNG chạm DB: cache memory TTL 60s, stale-while-revalidate
-- (xem lib/permissions.ts). Xem docs/nang-cap/M50-phan-quyen-nang-cao.md mục PR1.
--
-- Vì sao có cột `id` dù khoá tự nhiên là (role, perm_key): trigger audit generic
-- audit_row_change() (0049) lấy entity_id = (to_jsonb(NEW)->>'id')::bigint và
-- audit_log.entity_id là BIGINT NOT NULL — nên bảng BẮT BUỘC có cột `id`. Dùng
-- id BIGSERIAL PK + UNIQUE(role, perm_key) để vẫn giữ ngữ nghĩa "1 override / cặp".
CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGSERIAL PRIMARY KEY,
  role TEXT NOT NULL,             -- lib/roles.ts (admin|pm|engineer|subcon|bch|cdt|viewer)
  perm_key TEXT NOT NULL,         -- tên hàm trong CAN_DEFAULT: 'approve', 'editStructure', 'viewPayments', ...
  allowed BOOLEAN NOT NULL,       -- true = mở, false = siết (không có dòng = theo mặc định CAN_DEFAULT)
  updated_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, perm_key)
);

-- Gắn audit trigger (0049) — M43 audit MỌI thay đổi cấu hình quyền (ai/khi nào/cũ→mới).
-- audit_row_change() đã tồn tại từ 0049; DROP+CREATE cho idempotent.
DO $$
BEGIN
  IF to_regclass('role_permissions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit_role_permissions ON role_permissions;
    CREATE TRIGGER audit_role_permissions
      AFTER INSERT OR UPDATE OR DELETE ON role_permissions
      FOR EACH ROW EXECUTE FUNCTION audit_row_change();
  END IF;
END $$;
