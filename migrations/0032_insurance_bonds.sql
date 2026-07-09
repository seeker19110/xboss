-- 0032_insurance_bonds.sql — M28: Bảo hiểm & Bảo lãnh. Sổ theo dõi bảo hiểm (công
-- trình CAR, trách nhiệm bên thứ ba, tai nạn LĐ) + bảo lãnh (thực hiện HĐ, tạm ứng,
-- bảo hành) — 1 bảng gọn, gắn hợp đồng (nullable — có loại cấp toàn dự án không theo
-- 1 HĐ), kèm giá trị + hiệu lực + cảnh báo sắp hết hiệu lực. Xem
-- docs/nang-cap/M28-bao-hiem-bao-lanh.md (đặc tả gốc ghi số 0033 — đã đổi số vì
-- 0031 (M24 hr) đã chiếm khi rebase lên main mới nhất).
CREATE TABLE IF NOT EXISTS insurance_bonds (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  contract_id INTEGER REFERENCES contracts(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'car', 'tnbt', 'tai_nan_ld',
    'bao_lanh_thuc_hien', 'bao_lanh_tam_ung', 'bao_lanh_bao_hanh', 'khac'
  )),
  title TEXT NOT NULL,
  provider TEXT,                                          -- đơn vị bảo hiểm/ngân hàng phát hành
  code TEXT,
  value NUMERIC(15,2),
  issued_date DATE, expiry_date DATE,                      -- expiry_date NULL = không hạn
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'expired', 'released')),
  note TEXT,
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER, -- 1 file chính (pattern gọn)
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS insurance_bond_id INTEGER REFERENCES insurance_bonds(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_insurance_bond ON notifications(user_id, type, insurance_bond_id)
  WHERE insurance_bond_id IS NOT NULL;
