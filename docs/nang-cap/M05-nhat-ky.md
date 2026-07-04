# M5 — Nhật ký thi công + nhân lực hiện trường

**Đợt 2 · Phụ thuộc: — (độc lập hoàn toàn, kéo sớm được) · Phức tạp: Trung bình**

## Mục tiêu

Nhật ký thi công điện tử theo NĐ 06/2021 (hồ sơ pháp lý bắt buộc khi nghiệm thu/hoàn công), **sinh gần tự động** từ dữ liệu sẵn có; theo dõi nhân lực theo tổ đội/ngày.

## Hiện trạng & điểm chạm

- Nguồn prefill: `task_history` (task nào tăng % trong ngày, ai ghi — cột `changed_at` đã có timezone fix UTC+7), `task_photos` (ảnh trong ngày), `assignment_log`.
- PDF: `@react-pdf/renderer` đã dùng (xem trang in payments); `todayISO()`/`daysFromTodayISO()` (`lib/db`) cho mọi phép ngày.

## Schema (`migrations/000N_diary.sql`)

```sql
CREATE TABLE IF NOT EXISTS site_diaries (
  id SERIAL PRIMARY KEY,
  diary_date DATE NOT NULL UNIQUE,
  weather_am TEXT, weather_pm TEXT,
  work_done TEXT,          -- prefill từ task_history, người lập sửa được
  obstacles TEXT,          -- vướng mắc / chỉ đạo
  safety_note TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked')),
  created_by INTEGER REFERENCES users(id),
  locked_by INTEGER REFERENCES users(id), locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS diary_manpower (
  id SERIAL PRIMARY KEY,
  diary_id INTEGER NOT NULL REFERENCES site_diaries(id) ON DELETE CASCADE,
  crew TEXT NOT NULL,                 -- tổ đội / thầu phụ
  headcount SMALLINT NOT NULL CHECK (headcount >= 0),
  note TEXT,
  UNIQUE (diary_id, crew)
);
```

Khoá sổ (`locked`): chỉ Admin/PM; sau khoá không sửa (PATCH trả 409) — giá trị pháp lý. Mở khoá: chỉ Admin, ghi audit.

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| GET `/api/diaries?month=` | mọi user đăng nhập | danh sách tháng, trạng thái từng ngày |
| GET `/api/diaries/:date` | như trên | kèm `prefill` (tự tổng hợp nếu chưa có bản ghi): task tăng % + ảnh + người thao tác trong ngày |
| PUT `/api/diaries/:date` | Admin/PM/engineer | upsert draft; manpower ghi cùng payload (transaction) |
| POST `/api/diaries/:date/lock` · DELETE | lock: Admin/PM; unlock: Admin | audit |
| GET `/api/diaries/:date/pdf` | mọi user đăng nhập | PDF theo mẫu in ký |

Prefill viết ở `lib/diary.ts` (`buildDiaryPrefill(date)`) — query `task_history` nhóm theo work package: "Hệ ống gió T5: lắp đặt 12 căn (A1,01 → A1,12)".

## UI/UX (`app/diary/page.tsx`)

- **View lịch tháng**: ô ngày có chấm trạng thái (chưa lập/draft/đã khoá — icon kèm màu); bấm ngày mở editor.
- **Editor 1 ngày** (mobile-first — người lập đứng công trường): thời tiết sáng/chiều (chip chọn nhanh: Nắng/Mưa/Âm u thay vì gõ), khối "Công việc thực hiện" prefill sẵn (textarea, nút "Lấy lại từ hệ thống"), gallery ảnh trong ngày (tick chọn ảnh đưa vào nhật ký), bảng nhân lực (dòng: tổ đội + số người, datalist tổ đội từ dữ liệu cũ, nút + thêm dòng), vướng mắc.
- Tổng nhân lực ngày hiển thị to trên đầu; nút **Khoá sổ** riêng biệt có confirm dialog (nêu rõ sau khoá không sửa).
- Ngày đã khoá: form read-only + banner "Đã khoá bởi X lúc Y" + nút xuất PDF.
- Biểu đồ phụ: tab "Nhân lực" — bar chart (recharts) headcount theo ngày × tổ đội trong tháng, nguồn KPI năng suất sau này.
- Nhắc lập nhật ký: notification `diary_missing` cuối ngày nếu hôm đó có `task_history` mà chưa có diary (đồng bộ on-fetch).

## Test

- Unit: `buildDiaryPrefill` gộp task_history đúng nhóm (integration `TEST_DATABASE_URL`).
- Integration: PUT sau lock → 409; unlock chỉ admin; manpower unique upsert.

## Chia PR

1. Schema + `lib/diary.ts` prefill + API + test.
2. Trang `/diary` (lịch + editor + khoá sổ) + menu + e2e/axe.
3. PDF + notification `diary_missing` + tab nhân lực.

## Điểm cần quyết

- Mẫu PDF nhật ký công ty/CĐT yêu cầu (cần file mẫu — mỗi CĐT một format).
- Nhật ký theo dự án hay theo sheet/tháp? (hiện 1 tháp — để `diary_date UNIQUE` toàn cục, thêm cột tower sau nếu đa tháp).
