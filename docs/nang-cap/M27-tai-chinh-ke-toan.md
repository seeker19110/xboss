# M27 — Tài chính – Kế toán công trường

**Cụm I · Phụ thuộc: M02 (chi phí), M16/M17 (HĐ/IPC), M24 (chấm công → lương) · Phức tạp: Lớn (3+ PR)**

## Mục tiêu

Dashboard tài chính công trường: **dòng tiền** (kế hoạch vs thực tế), **tạm ứng & hoàn ứng**, **quỹ tiền mặt** (petty cash), **hoá đơn & thuế** (VAT vào/ra), **công nợ** (phải thu CĐT, phải trả NCC/NTP — view từ HĐ/IPC/PO), **lương** (kỳ lương gắn `personnel`/`attendance` M24), báo cáo tài chính. Bổ sung **cashflow** thật (M09 hiện tái dựng gần đúng) + **quyết toán**.

## Hiện trạng & điểm chạm

- `lib/cost.ts` (M2): ngân sách/cam kết/thực chi theo hệ — M27 mở rộng sang dòng tiền + kế toán, KHÔNG thay công thức chi phí.
- `lib/dashboardext.ts` (M9): `cashflowSeries` đã có (12 tháng, in/out từ bill gắn HĐ) — M27 thay bằng nguồn thật (`cash_transactions`) khi có, giữ tương thích khi rỗng.
- `payment_bills` (M17), `contracts`/`payment_certs` (M16/M17), `purchase_orders` (M04) — công nợ suy từ đây (view), không lặp dữ liệu.
- `attendance` (M24) → đầu vào tính lương.
- Quyền: `CAN.viewPayments` (admin/pm/bch) xem; ghi kế toán `CAN.manageFinance` (admin/pm — nhạy cảm tiền).

## Schema (`migrations/0032_finance.sql`)

```sql
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
```

## `lib/finance.ts`

- `cashflowActual(projectId, months)`: từ `cash_transactions` (thay `cashflowSeries` M9 khi có dữ liệu).
- `receivables(projectId)` = Σ giá trị HĐ nhận thầu − Σ bill nhận; `payables(projectId)` = Σ cam kết giao thầu/PO − Σ bill trả (view từ M16/M17/M04 — không lặp).
- `advanceOutstanding` (tạm ứng chưa hoàn); `vatSummary(period)` (VAT vào/ra ròng); `payrollTotals(period)`.
- `validateInvoiceInput`/`validatePayrollInput` (thuần).

## API

| Route                                         | Quyền                                 | Ghi chú                  |
| --------------------------------------------- | ------------------------------------- | ------------------------ |
| `GET/POST /api/cash-transactions` + `.../:id` | ghi: manageFinance; xem: viewPayments | dòng tiền + petty cash   |
| `GET/POST /api/advances` + `.../:id` (settle) | manageFinance                         | nối proposal M19         |
| `GET/POST /api/invoices` + `.../:id`          | manageFinance                         | VAT vào/ra               |
| `GET/POST /api/payroll` + `.../:id` (approve) | manageFinance                         | tính từ attendance M24   |
| `GET /api/finance/summary`                    | viewPayments                          | cashflow/công nợ/VAT gộp |

## UI/UX (`app/finance/page.tsx`)

Hub tab: **Dòng tiền** (biểu đồ thu/chi + kế hoạch vs thực tế), **Tạm ứng** (bảng + settle), **Quỹ tiền mặt** (sổ petty cash), **Hoá đơn & thuế** (VAT vào/ra + ròng), **Công nợ** (phải thu/phải trả theo đối tác — link chéo HĐ/PO), **Lương** (kỳ lương từ chấm công). KPI strip: tồn quỹ, công nợ ròng, tạm ứng chưa hoàn. Sidebar cụm **Chi phí · Hợp đồng · Tài chính** (`viewPayments`).

## Test (`tests/finance.test.ts`)

Thuần: validate + tính VAT ròng/net lương. Tích hợp: `cashflowActual` gộp đúng thu/chi, `receivables`/`payables` khớp HĐ/bill 2 dự án không lẫn (scoping), advance settle chuyển status đúng. `e2e/authed/finance.spec.ts` desktop+mobile+axe.

## Chia PR

1. Migration + `lib/finance.ts` + API cash/advances + test.
2. Invoices + VAT + công nợ (view) + trang `/finance` phần dòng tiền/công nợ.
3. Payroll (gắn M24 attendance) + báo cáo tài chính + notification tạm ứng quá hạn hoàn.

## Điểm cần quyết & mặc định đã chọn

- **Không thay công thức `lib/cost.ts`** — M27 là lớp kế toán/dòng tiền song song, chi phí ngân sách/cam kết vẫn của M2. Cashflow M9 chuyển sang `cash_transactions` khi có, fallback logic cũ khi rỗng (không phá dashboard).
- **Công nợ là view, không lưu** — suy từ HĐ/IPC/PO/bill để không lệch nguồn.
- **Lương phụ thuộc M24** — làm PR 3, sau khi có `attendance`/`personnel`; nếu M24 chưa xong thì nhập tay `workdays`.
- **Nhạy cảm tiền**: mọi ghi = admin/pm (`manageFinance`); cdt/viewer không xem (nhất quán quyết định 2026-07-04).
