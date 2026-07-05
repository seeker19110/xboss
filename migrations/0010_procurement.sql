-- 0010_procurement.sql — M4: NCC & đơn hàng nâng cao (dòng đời PO, đánh giá NCC,
-- cấp phát theo tầng/tổ đội, xe NCC ra vào). Xem docs/nang-cap/M04-ncc-don-hang.md.
-- purchase_orders.expected_date đã có từ 0001_baseline.sql — không cần thêm.
-- Trạng thái PO ("delivering", "reconciled" mới) không có CHECK constraint trong DB
-- (chỉ validate ở lib/procurement.ts) nên không cần ALTER cột status.

-- Đánh giá nhà cung cấp: 1 đánh giá / PO (UNIQUE), 3 tiêu chí 1-5 sao.
CREATE TABLE IF NOT EXISTS supplier_ratings (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
  quality SMALLINT CHECK (quality BETWEEN 1 AND 5),
  delivery SMALLINT CHECK (delivery BETWEEN 1 AND 5),
  price SMALLINT CHECK (price BETWEEN 1 AND 5),
  note TEXT,
  rated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (supplier_id, po_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_ratings_supplier ON supplier_ratings(supplier_id);

-- Audit đổi trạng thái PO (đối xứng task_history/assignment_log — trước đây PO đổi
-- trạng thái không ghi vết gì).
CREATE TABLE IF NOT EXISTS po_status_history (
  id SERIAL PRIMARY KEY,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_status_history_po ON po_status_history(po_id, changed_at);

-- Cấp phát vật tư: đi tầng nào, tổ đội nào lĩnh (text tự do + datalist gợi ý ở UI).
ALTER TABLE material_transactions ADD COLUMN IF NOT EXISTS floor_label TEXT;
ALTER TABLE material_transactions ADD COLUMN IF NOT EXISTS crew TEXT;
CREATE INDEX IF NOT EXISTS idx_mat_trans_floor ON material_transactions(floor_label) WHERE floor_label IS NOT NULL;

-- Đăng ký & nhật ký xe NCC ra vào công trường.
CREATE TABLE IF NOT EXISTS vehicle_logs (
  id SERIAL PRIMARY KEY,
  po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  plate TEXT NOT NULL,
  driver TEXT,
  driver_phone TEXT,
  cargo TEXT,
  gate TEXT,
  expected_at TIMESTAMPTZ NOT NULL,
  entered_at TIMESTAMPTZ,
  exited_at TIMESTAMPTZ,
  needs_crane BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'approved', 'entered', 'exited', 'no_show', 'cancelled')),
  receipt_id INTEGER REFERENCES warehouse_receipts(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_logs_expected ON vehicle_logs(expected_at);

-- Dedup cảnh báo po_late/vehicle_late — cùng cơ chế partial unique index với
-- cost_group (0007)/ncr_id (0008).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS po_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_po ON notifications(user_id, po_id, type) WHERE po_id IS NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES vehicle_logs(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_vehicle ON notifications(user_id, vehicle_id, type) WHERE vehicle_id IS NOT NULL;
