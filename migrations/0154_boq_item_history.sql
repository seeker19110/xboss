-- 0154_boq_item_history.sql — lịch sử thay đổi từng dòng BOQ (M124 việc 3).
--
-- Ghi lại field nào đổi, giá trị cũ/mới (NUMERIC ép ::text theo quy ước M45), ai đổi, lúc nào.
-- Nguồn ghi: PATCH /api/boq/:id (chỉ field thật sự đổi) và commitBoqImport (dòng mới thêm ghi
-- 1 dòng field='import'). Xoá dòng BOQ (`boq_items`) cascade xoá luôn lịch sử của nó.
CREATE TABLE IF NOT EXISTS boq_item_history (
  id SERIAL PRIMARY KEY,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
  field TEXT NOT NULL,            -- 'code'|'name'|'unit'|'system_id'|'qty_contract'|'unit_price'|'qty_sub'|'sub_unit_price'|'note'|'import'
  old_value TEXT, new_value TEXT, -- NUMERIC ghi ::text (M45), null khi tạo
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_boq_item_history_item ON boq_item_history(boq_item_id, changed_at DESC);
