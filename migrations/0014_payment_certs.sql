-- 0014_payment_certs.sql — M17: nghiệm thu khối lượng & thanh toán theo đợt
-- (IPC — Interim Payment Certificate), 2 chiều (thu từ CĐT / chi cho thầu phụ)
-- theo từng hợp đồng (M16). Duyệt xong tự sinh 1 dòng payment_bills (giữ nguyên
-- bảng cũ, /payments hiện tại tiếp tục hoạt động). Xem docs/nang-cap/M17-thanh-toan-kl.md.

CREATE TABLE IF NOT EXISTS payment_certs (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                          -- IPC-0001
  contract_id INTEGER NOT NULL REFERENCES contracts(id),
  period_no INTEGER NOT NULL,                         -- đợt số mấy của HĐ này (1, 2, 3...)
  period_label TEXT,                                  -- vd "Tháng 7/2026" (hiển thị, không tính toán)
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at DATE, decided_at DATE, decided_by INTEGER REFERENCES users(id),
  reject_reason TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, period_no)
);

CREATE TABLE IF NOT EXISTS payment_cert_items (
  id SERIAL PRIMARY KEY,
  cert_id INTEGER NOT NULL REFERENCES payment_certs(id) ON DELETE CASCADE,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id),
  qty_period NUMERIC(15,3) NOT NULL DEFAULT 0,        -- KL nghiệm thu đợt này
  qty_cumulative NUMERIC(15,3) NOT NULL DEFAULT 0,    -- luỹ kế tới hết đợt này (snapshot lúc lập)
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,        -- snapshot đơn giá lúc lập (HĐ có thể đổi giá sau)
  UNIQUE(cert_id, boq_item_id)
);

ALTER TABLE payment_bills ADD COLUMN IF NOT EXISTS payment_cert_id INTEGER REFERENCES payment_certs(id);

-- Dedup cảnh báo cert_over_contract/cert_pending — cùng cơ chế partial unique
-- index với contract_expiry (M16) / vo_pending (M6).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payment_cert_id INTEGER REFERENCES payment_certs(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_cert ON notifications(user_id, type, payment_cert_id)
  WHERE payment_cert_id IS NOT NULL;
