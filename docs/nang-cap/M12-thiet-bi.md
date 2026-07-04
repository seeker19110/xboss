# M12 — Quản lý thiết bị/máy móc thi công

**Đợt 4 · Phụ thuộc: — (nối T&C M3 phần thiết bị đo) · Phức tạp: Thấp-Trung bình**

## Mục tiêu

Sổ thiết bị (máy hàn/khoan/giàn giáo/thiết bị đo...): tình trạng, vị trí, tổ đội đang giữ, hạn kiểm định/hiệu chuẩn + nhắc hạn — quan trọng nhất là thiết bị đo phục vụ T&C (hết hiệu chuẩn = biên bản đo vô hiệu).

## Schema (`migrations/000N_equipment.sql`)

```sql
CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- TB-0001
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- danh mục text + datalist (không CHECK cứng — chủng loại đa dạng)
  serial TEXT,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good','maintenance','broken','retired')),
  calibration_due DATE,                -- hạn kiểm định/hiệu chuẩn (null = không cần)
  cert_file_path TEXT, cert_file_name TEXT,
  current_location TEXT,               -- kho / tầng
  current_crew TEXT,                   -- tổ đội đang giữ
  note TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS equipment_logs (
  id SERIAL PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('issue','return','move','maintain','calibrate')),
  to_location TEXT, to_crew TEXT,
  note TEXT, logged_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Ghi log → cập nhật `current_location`/`current_crew`/`condition` trong cùng transaction (giống `material_transactions` cập nhật `qty_used`).

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `/api/equipment` GET/POST, PATCH `/:id` | tạo/sửa: Admin/PM/engineer; xem: mọi user | filter `?kind=&condition=&crew=` |
| POST `/api/equipment/:id/logs` | Admin/PM/engineer (subcon trả thiết bị mình giữ) | transaction |
| Cert upload | Admin/PM/engineer | pattern chuẩn |

Notification `calibration_due`: `calibration_due` ≤ 30 ngày → Admin/PM (on-fetch, dedup theo equipment).

## UI/UX (`app/equipment/page.tsx`)

- Bảng: mã, tên, loại, tình trạng (badge + icon), vị trí/tổ đội, hạn kiểm định (đếm ngược, ≤30 ngày amber, quá hạn rose + icon), giấy kiểm định (link).
- Hàng mở panel: lịch sử log dọc + form thao tác (cấp phát/thu hồi/chuyển/bảo trì/hiệu chuẩn — chọn action là form đổi field tương ứng).
- Filter chip tình trạng + tổ đội; search mã/tên/serial.
- Mobile: card view; thao tác trả/nhận thiết bị 2 chạm.

## Test

- Integration: log cập nhật trạng thái hiện hành đúng + transaction; notification hạn kiểm định tạo/dọn; subcon chỉ log được thiết bị `current_crew` của mình.

## Chia PR

1. Schema + API + test.
2. Trang + panel log + notification + menu + e2e/axe.
