-- 0037_finance.sql — M27 PR1: Tài chính & Kế toán công trường. Quỹ tiền mặt/dòng tiền
-- (cash_transactions), tạm ứng & hoàn ứng (advances), hoá đơn VAT (invoices — dùng ở
-- PR2), kỳ lương (payroll — dùng ở PR3). Xem docs/nang-cap/M27-tai-chinh-ke-toan.md
-- (đặc tả gốc ghi số 0032 — đã đổi số vì 0032 bị chiếm bởi insurance_bonds, M28).
CREATE TABLE IF NOT EXISTS cash_transactions (             -- thu/chi quỹ tiền mặt + dòng tiền
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  tx_date DATE NOT NULL, direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  category TEXT,                                             -- lương/vật tư/tạm ứng/quỹ...
  amount NUMERIC(15,2) NOT NULL, is_petty_cash BOOLEAN DEFAULT FALSE,
  contract_id INTEGER REFERENCES contracts(id), supplier_id INTEGER REFERENCES suppliers(id),
  voucher_code TEXT, description TEXT,
  recorded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS advances (                       -- tạm ứng / hoàn ứng
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  code TEXT, advance_date DATE, amount NUMERIC(15,2) NOT NULL,
  recipient TEXT, reason TEXT,
  settled_amount NUMERIC(15,2) DEFAULT 0, status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partially_settled','settled')),
  proposal_id INTEGER REFERENCES proposals(id),             -- nối M19 (đề xuất tạm ứng)
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS invoices (                       -- hoá đơn VAT vào/ra
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  invoice_no TEXT, invoice_date DATE, direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  net_amount NUMERIC(15,2), vat_amount NUMERIC(15,2), vat_rate NUMERIC(5,2),
  counterparty TEXT, contract_id INTEGER REFERENCES contracts(id),
  payment_bill_id INTEGER REFERENCES payment_bills(id),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS payroll (                        -- kỳ lương
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  period TEXT NOT NULL,                                      -- 'YYYY-MM'
  crew_id INTEGER REFERENCES crews(id), personnel_id INTEGER REFERENCES personnel(id),
  workdays NUMERIC(6,1), rate NUMERIC(12,2), gross NUMERIC(15,2), deductions NUMERIC(15,2),
  net NUMERIC(15,2), status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','paid')),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_project ON cash_transactions(project_id, tx_date);
CREATE INDEX IF NOT EXISTS idx_advances_project ON advances(project_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_payroll_project ON payroll(project_id, period);
