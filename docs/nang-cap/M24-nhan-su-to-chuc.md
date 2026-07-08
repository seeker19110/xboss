# M24 — Nhân sự & Tổ chức

**Cụm B · Phụ thuộc: M05 (nhân lực nhật ký) · Phức tạp: Lớn (chia PR theo nhóm con) · Ưu tiên: chấm công trước**

## Mục tiêu

Dashboard tổ chức công trường: **sơ đồ tổ chức + RACI**, **nhân sự công trường** (khác user hệ thống), **tổ đội** (crew), **chấm công** (dùng nhiều nhất → ưu tiên), **đào tạo & chứng chỉ** (+ cảnh báo hết hạn), **đánh giá năng lực**. Nối `diary_manpower` (M05) qua `crew_id`.

## Hiện trạng & điểm chạm

- `/users` (tài khoản hệ thống), `/admin` (phân công task) — **user ≠ nhân sự công trường** (công nhân không có tài khoản). M24 quản lý `personnel` riêng.
- `diary_manpower` (M05): tổ đội × số người/ngày (chuỗi `crew` tự do) — chuẩn hoá thành `crews` + FK, giữ tương thích (cột `crew` text vẫn đọc được).
- Upload chứng chỉ: pattern `task_documents`/`lib/photos.ts`.
- Cảnh báo chứng chỉ hết hạn: on-fetch dedup (như `contract_expiry`). Dùng lại cho HSE (M11 huấn luyện/thẻ an toàn).
- Quyền: `CAN.manageHr` (admin/pm); chấm công cho phép kỹ sư ghi (đội trưởng).

## Schema (`migrations/0029_hr.sql`)

```sql
CREATE TABLE IF NOT EXISTS personnel (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  code TEXT, full_name TEXT NOT NULL, role_title TEXT,      -- chức danh công trường
  supplier_id INTEGER REFERENCES suppliers(id),             -- thuộc nhà thầu phụ nào (nếu có)
  phone TEXT, id_number TEXT,                                -- CCCD (nhạy cảm — chỉ admin/pm xem)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS crews (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  name TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  supplier_id INTEGER REFERENCES suppliers(id), leader_id INTEGER REFERENCES personnel(id),
  UNIQUE(project_id, name)
);
CREATE TABLE IF NOT EXISTS crew_members (
  crew_id INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  PRIMARY KEY (crew_id, personnel_id)
);
CREATE TABLE IF NOT EXISTS attendance (                     -- chấm công ngày
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  work_date DATE NOT NULL, crew_id INTEGER REFERENCES crews(id),
  personnel_id INTEGER REFERENCES personnel(id),            -- NULL = chấm gộp theo tổ (headcount)
  headcount INTEGER, present BOOLEAN, hours NUMERIC(4,1),
  note TEXT, recorded_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS certifications (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  personnel_id INTEGER REFERENCES personnel(id),
  kind TEXT NOT NULL,                                        -- thẻ an toàn, chứng chỉ nghề, vận hành...
  code TEXT, issued_date DATE, expiry_date DATE,
  file_name TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS raci_matrix (                    -- vai trò × hạng mục
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  scope TEXT NOT NULL,                                       -- tên hạng mục/quy trình
  role_label TEXT NOT NULL, personnel_id INTEGER REFERENCES personnel(id),
  raci CHAR(1) NOT NULL CHECK (raci IN ('R','A','C','I'))
);
ALTER TABLE diary_manpower ADD COLUMN IF NOT EXISTS crew_id INTEGER REFERENCES crews(id);
ALTER TABLE notifications  ADD COLUMN IF NOT EXISTS certification_id INTEGER REFERENCES certifications(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_cert ON notifications(user_id, type, certification_id)
  WHERE certification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(project_id, work_date);
```

## `lib/hr.ts`

- `listPersonnel`/`listCrews`/`attendanceByDate(projectId, from, to)` (gộp headcount theo ngày × tổ, cho biểu đồ), `attendanceSummary` (công/người/tháng).
- `expiringCertifications(projectId, days=30)` → notification `cert_expiry` (tái dùng cho thẻ an toàn HSE).
- `validatePersonnelInput`/`validateAttendanceInput` (thuần).
- Ẩn CCCD (`id_number`) khỏi payload khi người gọi không phải admin/pm.

## API

| Route                                                           | Quyền                  | Ghi chú                            |
| --------------------------------------------------------------- | ---------------------- | ---------------------------------- |
| `GET/POST /api/personnel` + `PATCH/DELETE /api/personnel/:id`   | ghi: manageHr          | CCCD chỉ admin/pm                  |
| `GET/POST /api/crews` + `PATCH/DELETE /api/crews/:id` + members | ghi: manageHr          | UNIQUE(project, name)              |
| `GET/POST /api/attendance` + `PATCH/DELETE /api/attendance/:id` | ghi: admin/pm/engineer | chấm theo người hoặc gộp headcount |
| `GET/POST /api/certifications` + `.../:id`                      | ghi: manageHr          | upload file chứng chỉ              |
| `GET/PUT /api/raci`                                             | ghi: manageHr          | ma trận theo scope                 |

Notification `cert_expiry`: on-fetch, Admin/PM, dedup `certification_id`.

## UI/UX (`app/personnel/page.tsx` + `/attendance` + `/org`)

- `/attendance` (ưu tiên, mobile-first): lịch/bảng chấm công nhanh theo tổ đội (nút +/− headcount hoặc tick từng người), gợi ý tổ đội (datalist), tổng công theo tháng — biểu đồ cột (recharts).
- `/personnel`: danh sách nhân sự + lọc tổ/nhà thầu; modal chi tiết + chứng chỉ (upload/badge hạn).
- `/org`: sơ đồ tổ chức (cây đơn giản) + bảng RACI. Sidebar cụm **Khởi động & Tổ chức**.

## Test (`tests/hr.test.ts`)

Thuần: validate. Tích hợp: `attendanceByDate` gộp đúng, `expiringCertifications` dedup/tự dọn, CCCD ẩn theo vai trò, UNIQUE crew. `e2e/authed/attendance.spec.ts` (+ personnel, org) desktop+mobile+axe.

## Chia PR

1. Migration + `lib/hr.ts` + API personnel/crews + test.
2. Chấm công (`/attendance`) + attendance API + biểu đồ.
3. Chứng chỉ + cảnh báo `cert_expiry` + org/RACI.

## Điểm cần quyết & mặc định đã chọn

- **`personnel` tách khỏi `users`** — công nhân không cần tài khoản đăng nhập; user hệ thống liên kết qua `assigned_to` như cũ, không gộp.
- **Chấm công cho phép cả gộp headcount lẫn theo người** (`personnel_id` NULL = gộp) — công trường thực tế hay chấm theo tổ; theo người là tuỳ chọn.
- **CCCD lưu nhưng ẩn theo vai trò** — nhạy cảm; nếu công ty không muốn lưu thì bỏ cột (không bắt buộc).
- **Lương/payroll KHÔNG thuộc M24** — để M27 (Tài chính) vì gắn dòng tiền; M24 chỉ tới chấm công (đầu vào của lương).
