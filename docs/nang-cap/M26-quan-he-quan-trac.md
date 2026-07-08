# M26 — Quan hệ & Quan trắc (lún/chuyển vị, cộng đồng)

**Cụm H · Phụ thuộc: không · Phức tạp: Trung bình (2 PR) · Điểm nhấn: biểu đồ quan trắc theo thời gian**

## Mục tiêu

Dashboard quan trắc công trình + quan hệ cộng đồng: **quan trắc kết cấu/nền** (mốc lún, chuyển vị/nghiêng, công trình lân cận — kỳ đo, giá trị, ngưỡng cảnh báo, biểu đồ theo thời gian), **khảo sát hiện trạng lân cận**, **quan hệ chính quyền & cộng đồng** (khiếu nại: tiếp nhận → xử lý → đóng). Cảnh báo **vượt ngưỡng lún/chuyển vị**.

## Hiện trạng & điểm chạm

- Khác M25 (môi trường): M26 là quan trắc **kết cấu công trình** (lún/nghiêng) + cộng đồng, không phải chỉ tiêu môi trường. Bảng riêng.
- Cảnh báo vượt ngưỡng: on-fetch dedup (như `env_monitoring_over`).
- Quyền: xem mọi vai trò; ghi `CAN.manageMonitoring` (admin/pm/engineer).

## Schema (`migrations/0031_monitoring.sql`)

```sql
CREATE TABLE IF NOT EXISTS monitoring_points (              -- mốc quan trắc
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  code TEXT NOT NULL, kind TEXT NOT NULL
    CHECK (kind IN ('lun','chuyen_vi','nghieng','lan_can','khac')),
  location TEXT, warn_threshold NUMERIC(12,3), alarm_threshold NUMERIC(12,3), unit TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped')),
  UNIQUE(project_id, code)
);
CREATE TABLE IF NOT EXISTS monitoring_readings (
  id SERIAL PRIMARY KEY,
  point_id INTEGER NOT NULL REFERENCES monitoring_points(id) ON DELETE CASCADE,
  measured_at DATE NOT NULL, value NUMERIC(12,3) NOT NULL,
  cumulative NUMERIC(12,3),                                  -- luỹ kế (lún cộng dồn) — tính lúc ghi
  level TEXT CHECK (level IN ('normal','warn','alarm')),     -- so ngưỡng của point lúc ghi
  note TEXT, recorded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(point_id, measured_at)
);
CREATE TABLE IF NOT EXISTS community_cases (                -- khiếu nại/quan hệ cộng đồng
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  code TEXT, title TEXT NOT NULL, source TEXT,               -- dân cư/chính quyền/khác
  received_date DATE, status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','handling','closed')),
  resolution TEXT, closed_date DATE,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS monitoring_point_id INTEGER REFERENCES monitoring_points(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_mon_point ON notifications(user_id, type, monitoring_point_id)
  WHERE monitoring_point_id IS NOT NULL;
```

## `lib/monitoring.ts`

- `listPoints`/`readingsSeries(pointId)` (chuỗi theo thời gian cho biểu đồ + đường ngưỡng warn/alarm) / `listCommunityCases`.
- `alarmingPoints(projectId)`: mốc có reading `level='alarm'` gần nhất → notification `monitoring_alarm` (dedup theo `monitoring_point_id`).
- `computeLevel(value, cumulative, point)`: `alarm` nếu ≥ alarm_threshold, `warn` nếu ≥ warn_threshold, else `normal` — tính lúc ghi reading (thuần, unit test).
- `validateReadingInput` (thuần).

## API

| Route                                          | Quyền                 | Ghi chú                              |
| ---------------------------------------------- | --------------------- | ------------------------------------ |
| `GET/POST /api/monitoring-points` + `.../:id`  | ghi: manageMonitoring | UNIQUE code                          |
| `GET/POST /api/monitoring-points/:id/readings` | ghi: manageMonitoring | tự tính `level`; UNIQUE(point, date) |
| `GET/POST /api/community-cases` + `.../:id`    | ghi: manageMonitoring | vòng đời open→handling→closed        |

Notification `monitoring_alarm`: on-fetch, Admin/PM/engineer, dedup, tự dọn khi reading mới về normal.

## UI/UX (`app/monitoring/page.tsx`)

Hub 2 tab: **Quan trắc** (danh sách mốc + biểu đồ đường theo thời gian, đường warn amber/alarm rose, badge mức hiện tại; form nhập nhanh kỳ đo) và **Cộng đồng** (bảng khiếu nại + vòng đời). KPI strip: số mốc mức alarm/warn + số khiếu nại đang xử lý. Sidebar cụm **Chất lượng · An toàn · Môi trường**.

## Test (`tests/monitoring.test.ts`)

Thuần: `computeLevel` đủ ca (normal/warn/alarm biên). Tích hợp: `alarmingPoints` xuất hiện/tự dọn khi reading mới về normal, `readingsSeries` đúng thứ tự, UNIQUE(point, date). `e2e/authed/monitoring.spec.ts` desktop+mobile+axe.

## Chia PR

1. Migration + `lib/monitoring.ts` + API + test.
2. Trang `/monitoring` + biểu đồ + notification + sidebar + e2e.

## Điểm cần quyết & mặc định đã chọn

- **2 ngưỡng warn/alarm** (không chỉ 1) — quan trắc lún thực tế có mức cảnh báo và mức báo động khác nhau; notification chỉ bắn ở `alarm`.
- **`cumulative` nhập tay hoặc tính từ reading đầu** — mặc định lưu giá trị người đo cung cấp (máy trắc đạc đã cộng dồn); không tự cộng để tránh sai lệch khi bỏ kỳ.
- **Tách khỏi M25** — quan trắc kết cấu (lún/nghiêng) khác chỉ tiêu môi trường; gộp sẽ lẫn ngữ nghĩa ngưỡng.
