-- Migration 0130: Quản lý danh mục vật tư & BOQ theo các Đại hệ thống MEPF
-- (HVAC, Điện, Cấp Thoát Nước, PCCC).
--
-- ⚠️ MIGRATION NÀY ĐỤNG DỮ LIỆU (backfill `materials.system_id` + đổi `systems.name`)
-- → theo DoD (CLAUDE.md) PHẢI chạy staging trước, KHÔNG đi thẳng production.
-- Cả 2 phần đều lũy đẳng: backfill chỉ điền dòng đang NULL, đổi tên chỉ chạm dòng còn
-- nguyên tên gốc (xem mục 2).
ALTER TABLE materials ADD COLUMN IF NOT EXISTS system_id INTEGER REFERENCES systems(id);

-- Backfill system_id tu sheet_types neu co
UPDATE materials m
   SET system_id = st.system_id
  FROM sheet_types st
 WHERE m.sheet_type_id = st.id
   AND m.system_id IS NULL
   AND st.system_id IS NOT NULL;

-- 2. Cập nhật tên hiển thị chuẩn cho các hệ MEPF.
--
-- ĐIỀU KIỆN BẢO VỆ `AND name = '<tên gốc>'` là BẮT BUỘC, không được bỏ:
-- `systems.name` do người dùng sửa được (Admin/PM đổi tên hệ cho khớp hồ sơ thầu). Bản
-- đầu của migration này ghi đè vô điều kiện (`WHERE code = 'acmv'`) nên sẽ XOÁ VĨNH VIỄN
-- tên PM đã đặt, ngay lúc app boot (`ensureSchema()` tự áp migration), không báo ai và
-- không có gì để hoàn nguyên.
--
-- Chỉ đổi khi tên vẫn đúng y giá trị seed gốc ở `0005_boq.sql` (tức chưa ai chạm vào):
--   acmv→'ACMV'  dien→'Điện'  nuoc→'Nước'  pccc→'PCCC'
-- Tên đã bị đổi khác → giữ nguyên, coi như người dùng đã chủ đích đặt tên riêng.
UPDATE systems SET name = 'HVAC (Điều hòa không khí & Thông gió)'
 WHERE code = 'acmv' AND name = 'ACMV';
UPDATE systems SET name = 'Điện & Điện nhẹ (ELV)'
 WHERE code = 'dien' AND name = 'Điện';
UPDATE systems SET name = 'Cấp Thoát Nước'
 WHERE code = 'nuoc' AND name = 'Nước';
UPDATE systems SET name = 'PCCC (Phòng cháy chữa cháy)'
 WHERE code = 'pccc' AND name = 'PCCC';

CREATE INDEX IF NOT EXISTS idx_materials_system ON materials(system_id);
