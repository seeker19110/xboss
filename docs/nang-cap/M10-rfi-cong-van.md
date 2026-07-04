# M10 — RFI / quản lý công văn CĐT-TVGS

**Đợt 4 · Phụ thuộc: (M8 nếu nối bản vẽ — không bắt buộc) · Phức tạp: Thấp-Trung bình**

## Mục tiêu

Sổ theo dõi công văn/RFI hai chiều với CĐT/TVGS/tổng thầu: số văn bản, hạn phản hồi, trạng thái, file scan — hết cảnh "công văn nằm trong Zalo nhóm".

## Schema (`migrations/000N_correspondence.sql`)

```sql
CREATE TABLE IF NOT EXISTS correspondences (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,                    -- số văn bản (bên gửi đánh) — không UNIQUE (2 bên có thể trùng số)
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  kind TEXT NOT NULL DEFAULT 'letter' CHECK (kind IN ('rfi','letter','site_instruction')),
  counterparty TEXT NOT NULL,            -- CĐT / TVGS / Tổng thầu / khác
  subject TEXT NOT NULL,
  sent_date DATE NOT NULL,
  due_date DATE,                         -- hạn phản hồi
  status TEXT NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting','replied','closed')),
  reply_id INTEGER REFERENCES correspondences(id),  -- văn bản trả lời nối văn bản hỏi
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL,
  drawing_id INTEGER,                    -- FK mềm tới drawings (M8) — thêm constraint khi M8 đã áp
  note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS correspondence_files (
  id SERIAL PRIMARY KEY,
  correspondence_id INTEGER NOT NULL REFERENCES correspondences(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `/api/correspondences` GET/POST, PATCH `/:id` | tạo/sửa: Admin/PM/engineer; xem: mọi user trừ subcon (nhạy cảm hợp đồng) | filter `?status=&kind=&counterparty=&q=` (ILIKE subject/code) |
| POST `.../:id/reply` | như trên | tạo văn bản `out` nối `reply_id`, tự set văn bản gốc `replied` |
| Files POST/DELETE | như trên | pattern chuẩn |

Notification `correspondence_due`: quá `due_date` chưa replied → Admin/PM (on-fetch, dedup theo id).

## UI/UX (`app/correspondences/page.tsx`)

- Bảng sổ công văn: chiều (icon mũi tên vào/ra), số VB, trích yếu, đối tác, ngày gửi, hạn (đếm ngược, quá hạn rose), trạng thái; hàng hỏi-đáp nối nhau (indent nhẹ dòng reply).
- Filter chip trạng thái + đối tác; search số VB/trích yếu.
- Form tạo nhanh: mobile chụp scan văn bản giấy ngay tại công trường.
- Liên kết chéo: mở từ task/bản vẽ thấy công văn liên quan (tab nhỏ trong panel task — làm tối giản, chỉ list + link).

## Test

- Integration: reply nối đúng + đổi trạng thái gốc; notification quá hạn tạo/dọn; quyền subcon bị chặn GET.

## Chia PR

1. Schema + API + test.
2. Trang + form + files + notification + menu + e2e/axe.
