# SPEC.MD — XBoss Web App
## Hệ thống quản lý thi công MEP (ACMV) — Dự án AVIO Tháp A

**Phiên bản:** 1.0  
**Ngày:** 2026-06-10  
**Dự án:** TT AVIO — Tracking Tiến Độ Thi Công ACMV  
**Tech Stack:** Next.js 14 + TypeScript + Tailwind + Supabase/PostgreSQL  

---

## 1. Tổng quan dự án

XBoss thay thế bộ file Excel "GIA THÀNH – TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx" bằng một web app realtime, đa người dùng, mobile-friendly. Hệ thống tập trung quản lý tiến độ thi công MEP (ACMV) theo WBS, theo dõi vật tư, cảnh báo trễ hạn, và xuất báo cáo tự động.

**Phạm vi MVP:** Tháp A (AVIO) — 5 sheet: DashBoard, TRACKING OGTĐ, OGHL, OGCH, ODNN Zone 1, ODNN Zone 2.

---

## 2. Phân tích dữ liệu nguồn (Excel)

### 2.1 Cấu trúc file Excel gốc

| Sheet | Mô tả | Số dòng | Số work package |
|---|---|---|---|
| DashBoard | Danh sách công việc trễ tổng hợp | 224 (221 item trễ) | — |
| TRACKING OGTĐ | Ống gió trục đứng | 346 | 31 |
| TRACKING OGHL | Ống gió hành lang | 448 | 31 |
| TRACKING OGCH | Ống gió căn hộ | 324 | 29 |
| TRACKING ODNN Zone 1 | Ống đồng nước ngưng Zone 1 | 876 | 29 |
| TRACKING ODNN Zone 2 | Ống đồng nước ngưng Zone 2 | 876 | 29 |

**Tổng ước tính:** ~2.800+ dòng dữ liệu thô, ~150 work packages, ước 1.500–2.000 tasks sau normalize.

### 2.2 Mapping cột Excel → Entity

| Cột Excel | Tên hiển thị | Entity field | Kiểu dữ liệu | Ghi chú |
|---|---|---|---|---|
| `CODE` | Mã công việc | `task.code` | TEXT | VD: A1, A1,01, H1,02, OGCH1 |
| `STT` | Số thứ tự | `task.seq_no` | TEXT | VD: 1, 1.01, 2.03 |
| `CHI TIẾT CÔNG VIỆC` | Mô tả | `task.name` | TEXT | |
| `GHI CHÚ` | Trạng thái | `task.status` | ENUM | Xem §2.3 |
| `NGÀY BẮT ĐẦU` | Ngày bắt đầu | `task.start_date` | DATE | Serial Excel → ISO Date |
| `SỐ NGÀY HOÀN THÀNH` | Số ngày | `task.duration_days` | INTEGER | |
| `NGÀY KẾT THÚC` | Deadline | `task.end_date` | DATE | |
| `% Tiến độ` | % hoàn thành | `task.progress_percent` | FLOAT 0–1 | Có thể là text "Chuẩn bị" |
| `Lắp đặt` | Tổng lắp đặt | `task.install_count` | INTEGER | |
| Cột dimension (OGTĐ) | Kích thước ống | `progress_dimensions` | BOOLEAN/FLOAT | VD: 1300x700 X3-X4 |
| Cột căn hộ (OGCH) | CH 01–CH 38 | `progress_dimensions` | BOOLEAN | 38 căn hộ/tầng |
| Cột căn hộ (ODNN) | CH 01–CH 22 / CH 23–CH 38 | `progress_dimensions` | BOOLEAN | Zone 1 & 2 |
| `Link Bản vẽ BBNT` | Link nghiệm thu | `task.drawing_url` | TEXT | URL |

### 2.3 Trạng thái task (enum)

```
Chuẩn bị | Đang thi công | Đã Hoàn Thành | Đã Nghiệm Thu | Đang Trễ
```

### 2.4 Cấu trúc phân cấp WBS

```
Project (AVIO Tháp A)
└── Tower (Tháp A)
    └── SheetType (OGTĐ / OGHL / OGCH / ODNN Zone 1 / ODNN Zone 2)
        └── WorkPackage (A1→A31, H1→H31, OGCH1→OGCH29, ...)
            ├── FloorTask (row level: A1, H1, OGCH1) — tổng hợp per floor
            └── SubTask (A1,01 → A1,09) — chi tiết công đoạn
                └── ProgressDimension (per kích thước ống / per căn hộ)
```

### 2.5 Pattern code

| SheetType | Pattern WorkPackage | Pattern SubTask | Ví dụ |
|---|---|---|---|
| OGTĐ | `A{n}` | `A{n},{mm}` | A1, A1,01 |
| OGHL | `H{n}` | `H{n},{mm}` | H1, H1,01 |
| OGCH | `OGCH{n}` | `OGCH{n},{mm}` | OGCH1, OGCH1,01 |
| ODNN Zone 1 | `A{n}` | `A{n},{mm}` | A1, A1,01 |
| ODNN Zone 2 | `A{n}` | `A{n},{mm}` | A1, A1,01 |

> **Lưu ý:** ODNN Zone 1 và Zone 2 dùng chung code `A{n}` nhưng dimensions khác nhau (Zone 1: CH01–CH22, Zone 2: CH23–CH38). Cần field `sheet_type` để phân biệt.

---

## 3. Database Schema (PostgreSQL)

### 3.1 Core Tables

```sql
-- Người dùng
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','pm','engineer','subcon')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Dự án
CREATE TABLE projects (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,         -- "AVIO Tháp A"
  contractor   TEXT,
  client       TEXT,
  start_date   DATE,
  end_date     DATE,
  status       TEXT DEFAULT 'In Progress',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Tháp / Khu vực
CREATE TABLE towers (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL            -- "Tháp A"
);

-- Sheet type (loại tracking)
CREATE TABLE sheet_types (
  id        SERIAL PRIMARY KEY,
  tower_id  INTEGER REFERENCES towers(id) ON DELETE CASCADE,
  code      TEXT NOT NULL,            -- "OGTĐ", "OGHL", "OGCH", "ODNN Zone 1", "ODNN Zone 2"
  label     TEXT,                     -- "Ống gió trục đứng"
  foreman   TEXT                      -- "Mr. Thừa", "Mr. Hải"
);

-- Work package (tương ứng 1 floor-task group)
CREATE TABLE work_packages (
  id             SERIAL PRIMARY KEY,
  sheet_type_id  INTEGER REFERENCES sheet_types(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,       -- "A1", "H1", "OGCH1"
  seq_no         TEXT,               -- "1", "2"
  floor_label    TEXT,               -- "1F", "2F" (parse từ tên task)
  description    TEXT,
  start_date     DATE,
  end_date       DATE,
  drawing_url    TEXT,
  UNIQUE (sheet_type_id, code)
);

-- Task (sub-task: A1,01 → A1,09)
CREATE TABLE tasks (
  id                  SERIAL PRIMARY KEY,
  package_id          INTEGER REFERENCES work_packages(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,        -- "A1,01"
  seq_no              TEXT,                -- "1.01"
  name                TEXT NOT NULL,
  status              TEXT DEFAULT 'Chuẩn bị'
                        CHECK (status IN ('Chuẩn bị','Đang thi công','Đã Hoàn Thành','Đã Nghiệm Thu','Đang Trễ')),
  start_date          DATE,
  end_date            DATE,
  duration_days       INTEGER,
  progress_percent    FLOAT DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 1),
  install_count       INTEGER DEFAULT 0,
  drawing_url         TEXT,
  assigned_to         INTEGER REFERENCES users(id),
  remarks             TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (package_id, code)
);

-- Progress theo dimension (kích thước ống hoặc căn hộ)
CREATE TABLE progress_dimensions (
  id               SERIAL PRIMARY KEY,
  task_id          INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  dimension_label  TEXT NOT NULL,    -- "1300x700 X3-X4 Y5-Y6" hoặc "CH 01"
  dimension_index  INTEGER,          -- thứ tự cột (1..13 cho OGTĐ, 1..38 cho OGCH)
  completed        BOOLEAN DEFAULT FALSE,
  progress_value   FLOAT DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Lịch sử thay đổi tiến độ
CREATE TABLE task_history (
  id               SERIAL PRIMARY KEY,
  task_id          INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  progress_percent FLOAT,
  status           TEXT,
  updated_by       INTEGER REFERENCES users(id),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  note             TEXT
);

-- Vật tư (Material Management - MVP)
CREATE TABLE materials (
  id               SERIAL PRIMARY KEY,
  task_id          INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  unit             TEXT,
  qty_planned      FLOAT DEFAULT 0,
  qty_used         FLOAT DEFAULT 0,
  status           TEXT DEFAULT 'Ordered'
                     CHECK (status IN ('In Stock','Ordered','Delivered','Used')),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Thông báo / Alert
CREATE TABLE notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  task_id     INTEGER REFERENCES tasks(id),
  type        TEXT,    -- "delayed", "material_low", "progress_update"
  message     TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Indexes

```sql
CREATE INDEX idx_tasks_end_date        ON tasks(end_date);
CREATE INDEX idx_tasks_status          ON tasks(status);
CREATE INDEX idx_tasks_package_id      ON tasks(package_id);
CREATE INDEX idx_tasks_progress        ON tasks(progress_percent);
CREATE INDEX idx_work_packages_sheet   ON work_packages(sheet_type_id);
CREATE INDEX idx_task_history_task     ON task_history(task_id, updated_at DESC);
CREATE INDEX idx_notifications_user    ON notifications(user_id, is_read);
```

### 3.3 View hữu ích

```sql
-- View task trễ hạn
CREATE VIEW v_delayed_tasks AS
SELECT
  t.id, t.code, t.name, t.status, t.end_date, t.progress_percent,
  wp.code AS package_code, wp.floor_label,
  st.code AS sheet_type, st.tower_id,
  p.name  AS project_name
FROM tasks t
JOIN work_packages wp ON t.package_id = wp.id
JOIN sheet_types st   ON wp.sheet_type_id = st.id
JOIN towers tw        ON st.tower_id = tw.id
JOIN projects p       ON tw.project_id = p.id
WHERE t.end_date < CURRENT_DATE
  AND t.progress_percent < 1
  AND t.status NOT IN ('Đã Hoàn Thành','Đã Nghiệm Thu');

-- View KPI per sheet_type
CREATE VIEW v_kpi_sheet AS
SELECT
  st.id AS sheet_type_id, st.code AS sheet_type,
  COUNT(t.id)                              AS total_tasks,
  COUNT(t.id) FILTER (WHERE t.progress_percent = 1) AS completed_tasks,
  AVG(t.progress_percent)                  AS avg_progress,
  COUNT(t.id) FILTER (WHERE t.end_date < CURRENT_DATE AND t.progress_percent < 1) AS delayed_count
FROM tasks t
JOIN work_packages wp ON t.package_id = wp.id
JOIN sheet_types st   ON wp.sheet_type_id = st.id
GROUP BY st.id, st.code;
```

---

## 4. API Endpoints

### 4.1 Auth
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | Đăng nhập (Supabase Auth / NextAuth) |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Thông tin user hiện tại |

### 4.2 Projects / Tower / Sheet
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/projects` | Danh sách dự án |
| GET | `/api/projects/:id` | Chi tiết dự án |
| GET | `/api/projects/:id/towers` | Danh sách tháp |
| GET | `/api/towers/:id/sheets` | Danh sách sheet type |

### 4.3 Work Packages
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/workpackages?sheetTypeId=` | Danh sách (filter theo sheet) |
| GET | `/api/workpackages/:id` | Chi tiết + tasks con |
| POST | `/api/workpackages` | Tạo mới (Admin/PM) |
| PATCH | `/api/workpackages/:id` | Cập nhật |

### 4.4 Tasks
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/tasks?packageId=&status=&floor=` | Danh sách (filter) |
| GET | `/api/tasks/:id` | Chi tiết task + dimensions + history |
| POST | `/api/tasks` | Tạo mới |
| PATCH | `/api/tasks/:id` | Cập nhật task |
| PATCH | `/api/tasks/:id/progress` | Cập nhật tiến độ → tự ghi history |
| GET | `/api/tasks/delayed` | DS task trễ (`end_date < NOW AND progress < 1`) |
| GET | `/api/tasks/:id/history` | Lịch sử tiến độ |

### 4.5 Progress Dimensions
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/tasks/:id/dimensions` | Danh sách dimensions |
| PATCH | `/api/dimensions/:id` | Toggle completed / update value |
| POST | `/api/tasks/:id/dimensions/bulk` | Bulk update dimensions |

### 4.6 Dashboard & KPI
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/dashboard?projectId=` | KPI tổng hợp (delayed count, avg progress, per sheet) |
| GET | `/api/dashboard/delayed` | DS trễ dùng cho Dashboard sheet |
| GET | `/api/dashboard/charts?groupBy=floor\|sheet\|week` | Data cho charts |

### 4.7 Import / Export
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/import/excel` | Upload + parse Excel → preview |
| POST | `/api/import/excel/confirm` | Xác nhận import sau preview |
| GET | `/api/export/excel?projectId=` | Xuất Excel theo template gốc |
| GET | `/api/export/pdf?projectId=` | Xuất báo cáo PDF |

### 4.8 Materials & Notifications
| Method | Path | Mô tả |
|---|---|---|
| GET/POST | `/api/materials?taskId=` | Vật tư |
| PATCH | `/api/materials/:id` | Cập nhật |
| GET | `/api/notifications` | Thông báo của user hiện tại |
| PATCH | `/api/notifications/:id/read` | Đánh dấu đã đọc |

---

## 5. User Stories & Acceptance Criteria

### US-01 — Import Excel
**As** PM, **I want** to upload file Excel AVIO **so that** dữ liệu được import vào DB tự động.

**Acceptance Criteria:**
- Upload file `.xlsx` tối đa 20MB
- Hiển thị preview: số record hợp lệ / lỗi trước khi confirm
- Convert serial Excel date → ISO Date thành công
- `% Tiến độ` dạng text ("Chuẩn bị") → `0`, dạng số → float 0–1
- Upsert theo `(sheet_type_id, code)` — không duplicate
- Báo lỗi rõ ràng: dòng số bao nhiêu, trường nào sai
- Sau import, dashboard refresh ngay

### US-02 — Dashboard trễ hạn
**As** PM, **I want** to xem danh sách công việc trễ **so that** tôi ưu tiên xử lý.

**Acceptance Criteria:**
- Bảng hiển thị: STT, CHI TIẾT, GHI CHÚ, TẦNG, NGÀY BẮT ĐẦU, NGÀY KẾT THÚC, % TIẾN ĐỘ, SHEET
- Filter theo Sheet Type, Tầng, Trạng thái
- Badge đỏ "Đang Trễ" khi `end_date < today AND progress < 1`
- Export bảng ra Excel / PDF

### US-03 — Cập nhật tiến độ
**As** Engineer/Sub-con, **I want** to cập nhật % tiến độ trên mobile **so that** PM thấy realtime.

**Acceptance Criteria:**
- Inline edit progress trên bảng tracking
- Modal chi tiết: toggle từng dimension (kích thước ống / căn hộ)
- Tự tính lại `progress_percent = completed_dimensions / total_dimensions`
- Ghi vào `task_history` với user + timestamp
- Realtime sync cho user khác đang mở cùng trang (Supabase Realtime)

### US-04 — Drill-down WBS
**As** PM, **I want** to drill-down từ Project → Sheet → WorkPackage → Task **so that** tôi thấy chi tiết từng công đoạn.

**Acceptance Criteria:**
- Breadcrumb navigation rõ ràng
- Click vào WorkPackage → expand danh sách SubTask
- Click vào SubTask → modal chi tiết + dimensions grid
- URL thay đổi theo drill-down (shareable link)

### US-05 — Cảnh báo trễ
**As** PM, **I want** to nhận cảnh báo khi task trễ **so that** tôi không bỏ sót.

**Acceptance Criteria:**
- In-app notification badge trong vòng 5 giây khi task quá deadline
- Email alert hàng ngày 8:00 sáng tổng hợp DS trễ mới
- Sub-con chỉ nhận alert cho task được assign

### US-06 — Export báo cáo
**As** PM, **I want** to export Excel/PDF giống format gốc **so that** báo cáo cho chủ đầu tư.

**Acceptance Criteria:**
- Excel export: giữ style/format gần giống template gốc
- PDF: Header dự án, KPI cards, bảng trễ, charts progress per sheet
- Tải xuống < 10 giây với dataset ~2.000 records

---

## 6. Màn hình chính (UI Wireframe Description)

### 6.1 Dashboard (/)
```
┌─────────────────────────────────────────────────────────┐
│  [XBoss] AVIO Tháp A   [Bell 🔔 12]   [Avatar] Admin   │
├───────────┬─────────────────────────────────────────────┤
│  Sidebar  │  KPI Cards Row                              │
│           │  [Tổng trễ: 221] [OGTĐ: 70%] [OGHL: 44%]  │
│  ▸ Dashboard        │  [OGCH: 41%]   [ODNN: ...]       │
│  ▸ TRACKING OGTĐ    ├─────────────────────────────────────┤
│  ▸ TRACKING OGHL    │  Bar Chart: % Progress per Sheet   │
│  ▸ TRACKING OGCH    ├─────────────────────────────────────┤
│  ▸ TRACKING ODNN    │  Bảng: Danh sách công việc TRỄ     │
│  ▸ Import           │  [Filter: Sheet | Tầng | Status]   │
│  ▸ Export           │  STT | CHI TIẾT | TẦNG | KẾT THÚC  │
│                     │  % | SHEET          [Export Excel] │
└───────────┴─────────────────────────────────────────────┘
```

### 6.2 Tracking Sheet (e.g. /tracking/ogtd)
```
┌────────────────────────────────────────────────────────────────┐
│  Filter: [Tầng ▼] [Trạng thái ▼] [Tìm kiếm...]  [+ Thêm]    │
├────────┬──────────────────────┬──────────┬─────┬──────────────┤
│ CODE   │ CHI TIẾT             │ GHI CHÚ  │  %  │ 1300x700 ... │
├────────┼──────────────────────┼──────────┼─────┼──────────────┤
│ A1     │ Trục đứng ống gió 1F │ Chuẩn bị │  0% │              │
│ ▼ A1,01│ Lắp đặt support...   │ Chuẩn bị │  0% │ ☐ ☐ ☐ ...   │
│   A1,02│ Nẹp TDC cái ngược... │ Chuẩn bị │  0% │ ☐ ☐ ☐ ...   │
│   ...  │ ...                  │ ...      │ ... │ ...          │
└────────┴──────────────────────┴──────────┴─────┴──────────────┘
```
- Inline edit: click vào `%` → số input
- Dimension toggle: click ☐ → ☑ → auto recalculate progress
- Row màu đỏ nhạt nếu status = "Đang Trễ"

### 6.3 Import Page (/import)
```
Step 1: Upload file Excel  →  Step 2: Preview & Validate  →  Step 3: Confirm Import
```
- Drag & drop zone
- Preview table: màu xanh = hợp lệ, màu đỏ = lỗi, màu vàng = cảnh báo
- Summary: `✓ 1.423 records | ✗ 12 lỗi | ⚠ 5 cảnh báo`

---

## 7. Logic nghiệp vụ quan trọng

### 7.1 Tính % tiến độ task

**Cho sub-task có dimensions:**
```
progress_percent = COUNT(dimensions WHERE completed = TRUE) / COUNT(all dimensions)
```

**Cho work-package (floor task):**
```
progress_percent = AVG(sub-tasks.progress_percent)
```

**Cho sheet-type:**
```
progress_percent = AVG(work_packages.progress_percent)
```

### 7.2 Logic xác định trễ hạn
```
is_delayed = (end_date < CURRENT_DATE) 
             AND (progress_percent < 1)
             AND (status NOT IN ['Đã Hoàn Thành', 'Đã Nghiệm Thu'])
```

### 7.3 Convert % tiến độ từ Excel
```python
def parse_progress(value):
    if isinstance(value, float) and 0 <= value <= 1:
        return value
    if isinstance(value, str):
        return 0.0   # "Chuẩn bị" hoặc text khác → 0
    return 0.0
```

### 7.4 Parse dimensions từ header Excel
Header ống gió dạng: `"1\n1300x700\nX3-X4\nY5-Y6"` → parse thành:
```json
{
  "index": 1,
  "size": "1300x700",
  "grid_x": "X3-X4",
  "grid_y": "Y5-Y6",
  "label": "1300x700 X3-X4 Y5-Y6"
}
```

Header căn hộ dạng: `"CH 01"` → `{ "index": 1, "label": "CH 01" }`

---

## 8. Bảo mật & Phân quyền (RBAC)

| Role | Dashboard | Xem Tracking | Cập nhật Progress | Import Excel | Export | Quản lý Users |
|---|---|---|---|---|---|---|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PM | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Engineer | ✓ | ✓ | ✓ (assigned tasks) | — | — | — |
| Sub-con | — | ✓ (assigned only) | ✓ (assigned only) | — | — | — |

---

## 9. Kế hoạch triển khai

| Pha | Thời gian | Deliverables | Owner |
|---|---|---|---|
| **Pha 0: Khởi tạo** | 3–5 ngày | Repo Next.js, ERD, mapping Excel, wireframe | PM + Data Eng |
| **Pha 1: DB & Import** | 7–10 ngày | Schema + migrations, API import Excel, seed data | Backend |
| **Pha 2: Core Backend & Auth** | 7–10 ngày | Auth RBAC, CRUD APIs, delayed logic, API docs | Backend |
| **Pha 3: Frontend MVP** | 10–14 ngày | Dashboard, tracking table, inline edit, PWA | Frontend |
| **Pha 4: Visualization & Realtime** | 5–7 ngày | Charts, Gantt đơn giản, Realtime, alerts | Fullstack |
| **Pha 5: Export & UX Polish** | 4–6 ngày | Export Excel/PDF, bulk update, mobile UX | Fullstack |
| **Pha 6: QA & Deploy** | 5–7 ngày | E2E test, CI/CD, Vercel + Supabase production | QA + DevOps |

**Tổng MVP: 6–8 tuần**

---

## 10. Tech Stack chi tiết

| Layer | Technology | Lý do chọn |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | Fullstack, SSR, DX tốt |
| Styling | Tailwind CSS + shadcn/ui | Nhanh, đẹp, accessible |
| Table | TanStack Table v8 | Dynamic columns, inline edit |
| Charts | Recharts | Nhẹ, đủ dùng cho MVP |
| Database | PostgreSQL (Supabase) | Free tier, Realtime built-in |
| ORM | Drizzle ORM | TypeScript-first, nhẹ hơn Prisma |
| Auth | Supabase Auth | Tích hợp sẵn với DB, RBAC đơn giản |
| Realtime | Supabase Realtime | Sync progress update multi-user |
| Import | SheetJS (xlsx) | Parse multi-sheet Excel |
| Export | SheetJS + @react-pdf/renderer | Excel + PDF |
| Validation | Zod | Schema validation client + server |
| State | React Query (TanStack Query) | Cache, refetch, optimistic update |
| Deploy | Vercel + Supabase | Free tier, 1-click deploy |
| CI/CD | GitHub Actions | Tự động test + deploy |

---

## 11. Rủi ro & Giảm thiểu

| Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|
| Dữ liệu Excel không sạch (serial date, % text) | Cao | Validation Zod + preview import trước confirm |
| Dynamic dimensions columns phức tạp | Trung | JSONB trong PG + TanStack Table dynamic columns |
| Nhiều user đồng thời cập nhật cùng task | Trung | Optimistic UI + Supabase Realtime + row-level locking |
| ODNN Zone 1 & 2 trùng code A{n} | Cao | `sheet_type_id` là phần của composite unique key |
| % tiến độ dạng text "Chuẩn bị" trong Excel | Cao | `parse_progress()` function chuẩn hóa khi import |
| File Excel nặng (~2.800 dòng, nhiều cột) | Trung | Stream parse SheetJS + batch upsert theo 100 records |
| User không quen web, quen Excel | Trung | UI table giống Excel (inline edit, keyboard nav) |

---

## 12. Định nghĩa Done (DoD)

- Code review approved bởi ít nhất 1 người
- Unit test coverage ≥ 70% cho business logic (delayed, progress calc, import)
- E2E test pass cho flow: Import → Dashboard → Update Progress → Export
- Responsive trên mobile (375px+) và desktop (1280px+)
- P95 response time < 500ms cho các API chính
- Không có lỗi console trên production build
- Documentation cập nhật (API docs + User guide)

---

*Spec này dựa trên phân tích trực tiếp file Excel "GIA THÀNH – TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx" và các tài liệu kế hoạch dự án XBoss.*
