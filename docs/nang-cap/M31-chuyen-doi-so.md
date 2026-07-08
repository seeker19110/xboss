# M31 — Chuyển đổi số & Công nghệ

**Cụm L · Phụ thuộc: M20 (CDE), PWA hiện có · Phức tạp: Trung bình (2 PR) · Ưu tiên: thấp (nền đã phục vụ phần lõi)**

## Mục tiêu

Dashboard tổng hợp công nghệ — phần lớn là **gom & nhúng** hơn dữ liệu mới: **CDE** (môi trường dữ liệu chung — quản lý tài liệu điện tử, phân quyền/luồng duyệt, đã có `/documents`), **giám sát bằng công nghệ** (camera/AI, flycam/drone theo dõi tiến độ = album ảnh theo mốc, IoT), **phần mềm QLDA** (link P6/MS Project, app công trường = PWA), **tích hợp BIM** (viewer nhúng iframe), **an toàn thông tin & sao lưu** (trạng thái hệ thống — admin).

## Hiện trạng & điểm chạm

- `/documents` (M20 — kho hồ sơ), `/proposals`/`/approvals` (luồng duyệt), PWA (`public/sw.js`) — CDE + app công trường cơ bản đã có; M31 gom link + bổ sung album drone.
- `task_photos` (ảnh hiện trường) — tái dùng cho **album ảnh drone theo mốc tiến độ** (thêm nhãn mốc, không bảng mới nếu gọn).
- `GET /api/admin/storage` (M08 — dung lượng uploads) — nguồn cho panel "trạng thái sao lưu/hệ thống".
- Quyền: xem mọi vai trò; cấu hình link/embed `CAN.manageTech` (admin/pm); panel hệ thống chỉ admin.

## Schema (`migrations/0036_tech.sql`)

```sql
CREATE TABLE IF NOT EXISTS tech_links (                     -- link công cụ ngoài (P6/BIM viewer/camera)
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  category TEXT NOT NULL CHECK (category IN ('bim','schedule','camera','drone','other')),
  title TEXT NOT NULL, url TEXT NOT NULL,
  embed BOOLEAN DEFAULT FALSE,                               -- true = nhúng iframe; false = link ra ngoài
  note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS progress_albums (                -- album ảnh mốc tiến độ (drone)
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  milestone_label TEXT NOT NULL, captured_date DATE, note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE task_photos ADD COLUMN IF NOT EXISTS album_id INTEGER REFERENCES progress_albums(id);
-- Ảnh drone tái dùng task_photos qua album_id (không bảng ảnh mới); ảnh không gắn task cho phép task_id NULL nếu chưa có.
```

> Nếu `task_photos` bắt buộc `task_id` NOT NULL, thêm bảng `album_photos` riêng (file pattern `lib/photos.ts`) thay vì nới `task_photos` — quyết khi vào code (xem hiện trạng cột).

## `lib/tech.ts`

- `listTechLinks(projectId, category?)`; `listAlbums(projectId)` + ảnh; `systemStatus()` (dung lượng uploads từ `/api/admin/storage`, số bản ghi, phiên bản cache SW — admin).
- `validateTechLink` (thuần): category hợp lệ, URL dạng https, `embed` chỉ cho host whitelist (chống nhúng bậy — chặn iframe tuỳ tiện).

## API

| Route                                             | Quyền           | Ghi chú                              |
| ------------------------------------------------- | --------------- | ------------------------------------ |
| `GET/POST /api/tech-links` + `.../:id`            | ghi: manageTech | validate URL https + whitelist embed |
| `GET/POST /api/progress-albums` + `.../:id` + ảnh | ghi: manageTech | tái dùng upload ảnh `lib/photos.ts`  |
| `GET /api/tech/system-status`                     | admin           | dung lượng/sao lưu/phiên bản         |

Không notification mới (module tổng hợp).

## UI/UX (`app/tech/page.tsx`)

Hub tab: **CDE** (link nhanh tới `/documents` + register), **BIM** (viewer iframe khi có link embed whitelist, else nút mở ngoài), **Giám sát** (camera link + album drone theo mốc — gallery ảnh), **Phần mềm** (link P6/MS Project/app), **Hệ thống** (admin: dung lượng uploads, trạng thái sao lưu, phiên bản SW). KPI/panel: dung lượng lưu trữ (cảnh báo khi gần ngưỡng, tái dùng `/api/admin/storage`). Sidebar cụm **Hệ thống**.

## Test (`tests/tech.test.ts`)

Thuần: `validateTechLink` (URL không https bị chặn, embed ngoài whitelist bị chặn). Tích hợp: `listTechLinks` lọc category, album gắn ảnh. `e2e/authed/tech.spec.ts` desktop+mobile+axe (iframe chỉ kiểm nút, không load host ngoài trong test).

## Chia PR

1. Migration + `lib/tech.ts` + API tech-links + system-status + trang `/tech` (CDE/BIM/phần mềm/hệ thống) + test.
2. Album drone theo mốc (gallery ảnh) + tích hợp `task_photos`.

## Điểm cần quyết & mặc định đã chọn

- **Chủ yếu gom & nhúng, không tự xây camera/IoT/BIM engine** — ngoài phạm vi (nặng, phụ thuộc hạ tầng ngoài); M31 cung cấp khung link/embed + album ảnh mốc.
- **`embed` chỉ cho host whitelist** — chống nhúng iframe tuỳ tiện (bảo mật CSP); danh sách host cấu hình hằng số trong `lib/tech.ts`.
- **Album drone tái dùng `task_photos`** nếu cột cho phép `task_id` NULL — else bảng `album_photos` riêng (quyết khi vào code).
- **Ưu tiên thấp** — nền tảng (CDE/PWA/luồng duyệt) đã phục vụ phần lõi; làm sau các dashboard nghiệp vụ.
