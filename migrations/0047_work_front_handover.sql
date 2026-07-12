-- 0047_work_front_handover.sql — mở rộng trang mặt bằng tầng (/work-fronts/:floor, M46):
-- (1) thêm loại tài liệu "debris" (xà bần - rác tồn đọng) cho floor_stage_front_documents,
-- phục vụ layout 3 cột Biên bản / Hình ảnh bàn giao / Xà bần thay cho dropdown chọn loại cũ;
-- (2) thêm thông tin bàn giao (nhà thầu bàn giao/nhận, công tác chuyển bước, đại diện 2 bên)
-- vào floor_stage_fronts — hiển thị phía trên ô Ghi chú của mỗi công tác.

ALTER TABLE floor_stage_front_documents
  DROP CONSTRAINT IF EXISTS floor_stage_front_documents_doc_kind_check;
ALTER TABLE floor_stage_front_documents
  ADD CONSTRAINT floor_stage_front_documents_doc_kind_check
  CHECK (doc_kind IN ('handover','completion','debris','other'));

ALTER TABLE floor_stage_fronts
  ADD COLUMN IF NOT EXISTS outgoing_supplier_id INTEGER REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS incoming_supplier_id INTEGER REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS transition_stage_id INTEGER REFERENCES construction_stages(id),
  ADD COLUMN IF NOT EXISTS outgoing_rep_name TEXT,
  ADD COLUMN IF NOT EXISTS incoming_rep_name TEXT;
