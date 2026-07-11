-- 0043_rename_discipline_to_system.sql — đổi tên định danh "discipline" → "system" trên toàn
-- schema, thống nhất với tầng route/URL vốn đã dùng "hệ" (nay đổi thành "system") — tránh
-- 1 khái niệm nghiệp vụ có 2 tên khác nhau giữa DB và code. Xem kế hoạch đã duyệt.
-- schema_migrations đảm bảo file này chỉ chạy 1 lần nên không cần bọc IF EXISTS phức tạp.

ALTER TABLE disciplines RENAME TO systems;
ALTER TABLE discipline_contractors RENAME TO system_contractors;

ALTER TABLE system_contractors RENAME COLUMN discipline_id TO system_id;
ALTER TABLE sheet_types RENAME COLUMN discipline_id TO system_id;
ALTER TABLE boq_items RENAME COLUMN discipline_id TO system_id;
ALTER TABLE qc_checklists RENAME COLUMN discipline_id TO system_id;
ALTER TABLE contracts RENAME COLUMN discipline_id TO system_id;
ALTER TABLE variation_orders RENAME COLUMN discipline_id TO system_id;
ALTER TABLE crews RENAME COLUMN discipline_id TO system_id;
ALTER TABLE commissioning RENAME COLUMN discipline_id TO system_id;
ALTER TABLE handover_items RENAME COLUMN discipline_id TO system_id;
ALTER TABLE warranty_items RENAME COLUMN discipline_id TO system_id;
ALTER TABLE om_documents RENAME COLUMN discipline_id TO system_id;
ALTER TABLE design_changes RENAME COLUMN discipline_id TO system_id;

ALTER INDEX idx_discipline_contractors_discipline RENAME TO idx_system_contractors_system;
ALTER INDEX idx_discipline_contractors_supplier RENAME TO idx_system_contractors_supplier;
ALTER INDEX idx_boq_items_discipline RENAME TO idx_boq_items_system;
ALTER INDEX idx_qc_checklists_discipline RENAME TO idx_qc_checklists_system;
