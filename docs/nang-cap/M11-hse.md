# M11 — HSE / an toàn lao động

**Đợt 4 · Phụ thuộc: M3 (tái dùng checklist engine) · Phức tạp: Trung bình**

## Mục tiêu

Ghi nhận công tác an toàn của nhà thầu MEP: kiểm tra định kỳ (checklist), toolbox talk, sự cố/cận nguy, giấy phép làm việc đặc biệt (hàn/trên cao); xuất báo cáo nộp tổng thầu.

## Hiện trạng & điểm chạm

- Checklist engine M3 (`qc_checklists.category='hse'` đã chừa sẵn); ảnh pattern `task_photos`; PDF `@react-pdf/renderer`.

## Schema (`migrations/000N_hse.sql`)

```sql
CREATE TABLE IF NOT EXISTS hse_records (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('inspection','toolbox','incident','near_miss','permit')),
  record_date DATE NOT NULL,
  floor_label TEXT, area TEXT,
  description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low','medium','high')),   -- cho incident/near_miss
  permit_type TEXT CHECK (permit_type IN ('hot_work','height','confined','electrical')), -- cho permit
  permit_from TIMESTAMPTZ, permit_to TIMESTAMPTZ,
  inspection_id INTEGER REFERENCES qc_inspections(id),          -- khi kind=inspection dùng checklist M3
  action_required TEXT, action_assignee INTEGER REFERENCES users(id), action_due DATE,
  action_status TEXT NOT NULL DEFAULT 'none' CHECK (action_status IN ('none','open','closed')),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hse_photos (
  id SERIAL PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES hse_records(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, mime TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `/api/hse` GET/POST, PATCH `/:id` | tạo: mọi vai trò thao tác (subcon báo được near-miss — muốn nhiều báo cáo, không chặn); sửa/đóng action: Admin/PM/engineer | filter `?kind=&month=` |
| Photos POST/DELETE | như trên | |
| GET `/api/hse/report?month=` | Admin/PM | PDF tháng nộp tổng thầu |

Notification `hse_action_due`: action quá hạn → assignee + Admin/PM (pattern `delayed`).

## UI/UX (`app/hse/page.tsx`)

- Tab theo `kind`; form ghi nhanh mobile (sự cố/cận nguy: 3 field + ảnh — càng ít ma sát càng nhiều báo cáo).
- Permit: card theo ngày có khung giờ hiệu lực, đang hiệu lực badge emerald, hết giờ tự chuyển zinc; in permit lẻ.
- Thẻ thống kê đầu trang: ngày không sự cố (đếm từ incident cuối — con số treo công trường), action mở/quá hạn, giấy phép đang hiệu lực.
- Severity dùng badge màu + icon + chữ (không chỉ màu).

## Test

- Integration: CHECK constraint kind/permit hợp lệ; action đóng ghi nhận; notification quá hạn; quyền subcon tạo được nhưng không đóng action.

## Chia PR

1. Schema + API + test.
2. Trang + form nhanh + permit + thống kê + menu + e2e/axe.
3. Báo cáo PDF tháng + notification.
