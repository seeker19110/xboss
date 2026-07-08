# M25 — Môi trường & Giấy phép

**Cụm H · Phụ thuộc: không · Phức tạp: Trung bình (2 PR)**

## Mục tiêu

Dashboard môi trường: **hồ sơ môi trường** (ĐTM, giấy phép MT, giấy phép xả thải + hạn), **quan trắc môi trường** (nước thải/khí thải-bụi/tiếng ồn-rung theo kỳ, ngưỡng, đạt/không), **quản lý chất thải** (rắn XD/nguy hại/nước thải — khối lượng, xử lý), báo cáo định kỳ. Cảnh báo **vượt ngưỡng quan trắc** + **giấy phép sắp hết hạn**.

## Hiện trạng & điểm chạm

- Giấy phép MT trùng khuôn `legal_documents` (M23) nhưng phạm vi khác → bảng riêng `env_permits` (hoặc dùng `legal_documents.kind='giay_phep_mt'` — xem Điểm cần quyết, chọn bảng riêng vì có kỳ quan trắc gắn kèm).
- Cảnh báo hạn + vượt ngưỡng: on-fetch dedup `/api/notifications`.
- Quyền: xem mọi vai trò; ghi `CAN.manageEnv` (admin/pm/engineer — kỹ sư môi trường ghi kết quả quan trắc).

## Schema (`migrations/0030_environment.sql`)

```sql
CREATE TABLE IF NOT EXISTS env_permits (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('dtm','giay_phep_mt','giay_phep_xa_thai','khac')),
  code TEXT, title TEXT NOT NULL, issued_by TEXT, issued_date DATE, expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expired','superseded')),
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS env_monitoring (                 -- kỳ quan trắc
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  measured_at DATE NOT NULL, category TEXT NOT NULL
    CHECK (category IN ('nuoc_thai','khi_bui','on_rung','khac')),
  indicator TEXT NOT NULL,                                   -- vd 'pH', 'TSS', 'độ ồn dBA'
  value NUMERIC(12,3), unit TEXT, threshold NUMERIC(12,3),   -- ngưỡng cho phép
  passed BOOLEAN,                                            -- value <= threshold (tính lúc ghi)
  location TEXT, note TEXT,
  recorded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS waste_logs (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  log_date DATE NOT NULL, waste_type TEXT NOT NULL
    CHECK (waste_type IN ('ran_xd','nguy_hai','nuoc_thai','khac')),
  quantity NUMERIC(12,2), unit TEXT, disposal_method TEXT, handler TEXT, note TEXT,
  recorded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS env_permit_id INTEGER REFERENCES env_permits(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS env_monitoring_id INTEGER REFERENCES env_monitoring(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_env_permit ON notifications(user_id, type, env_permit_id)
  WHERE env_permit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_env_mon ON notifications(user_id, type, env_monitoring_id)
  WHERE env_monitoring_id IS NOT NULL;
```

## `lib/environment.ts`

- `listPermits`/`listMonitoring(projectId, filters)`/`listWaste`.
- `expiringEnvPermits(days=30)` → notification `env_permit_expiry`.
- `exceededMonitoring(projectId)`: kỳ quan trắc `passed=FALSE` gần nhất mỗi (category, indicator, location) → notification `env_monitoring_over` (dedup theo `env_monitoring_id`).
- `validateMonitoringInput` (thuần): category/indicator hợp lệ, tính `passed = value <= threshold` khi có cả hai (else NULL).

## API

| Route                                      | Quyền          | Ghi chú                |
| ------------------------------------------ | -------------- | ---------------------- |
| `GET/POST /api/env-permits` + `.../:id`    | ghi: manageEnv | upload file, badge hạn |
| `GET/POST /api/env-monitoring` + `.../:id` | ghi: manageEnv | tự tính `passed`       |
| `GET/POST /api/waste-logs` + `.../:id`     | ghi: manageEnv |                        |

Notification `env_permit_expiry` + `env_monitoring_over`: on-fetch, Admin/PM (+ engineer môi trường?), dedup, tự dọn.

## UI/UX (`app/environment/page.tsx`)

Hub 4 tab: **Giấy phép** (bảng + badge hạn + file), **Quan trắc** (bảng theo kỳ + biểu đồ đường theo thời gian với đường ngưỡng, ô vượt tô rose + icon), **Chất thải** (bảng khối lượng theo loại + tổng), **Báo cáo** (tổng hợp kỳ). KPI strip: số giấy phép sắp hết hạn + số chỉ tiêu vượt ngưỡng kỳ gần nhất. Sidebar cụm **Chất lượng · An toàn · Môi trường**.

## Test (`tests/environment.test.ts`)

Thuần: `validateMonitoringInput` tính `passed` đúng (kể cả thiếu threshold → NULL). Tích hợp: `exceededMonitoring`/`expiringEnvPermits` xuất hiện/tự dọn đúng, dedup. `e2e/authed/environment.spec.ts` desktop+mobile+axe (biểu đồ quan trắc).

## Chia PR

1. Migration + `lib/environment.ts` + API + test.
2. Trang `/environment` + biểu đồ quan trắc + 2 notification + sidebar + e2e.

## Điểm cần quyết & mặc định đã chọn

- **Bảng `env_permits` riêng, không dùng `legal_documents`** — có kỳ quan trắc gắn theo giấy phép; nếu công ty coi giấy phép MT là một loại hồ sơ pháp lý chung thì gộp và thêm liên kết.
- **`passed` tính lúc ghi** (snapshot) — ngưỡng có thể đổi theo quy định; lưu kết quả đánh giá tại thời điểm đo.
- **ESG/carbon** (mockup có nhắc) — **để sau**, ngoài phạm vi PR này (cần khung tính phát thải riêng); node để "coming-soon" con.
