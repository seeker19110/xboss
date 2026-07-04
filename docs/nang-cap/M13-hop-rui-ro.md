# M13 — Biên bản họp + sổ rủi ro (risk register)

**Đợt 4 · Phụ thuộc: — · Phức tạp: Trung bình** (2 nghiệp vụ cùng mô hình "danh sách + action + hạn")

## Mục tiêu

Biên bản họp với **action item theo dõi tự động** (không chìm trong file Word); sổ rủi ro ma trận 5×5 + heatmap.

## Schema (`migrations/000N_meetings_risks.sql`)

```sql
CREATE TABLE IF NOT EXISTS meetings (
  id SERIAL PRIMARY KEY,
  meeting_date DATE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'weekly' CHECK (kind IN ('weekly','client','subcon','other')),
  title TEXT NOT NULL, attendees TEXT, content TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS meeting_actions (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  assignee INTEGER REFERENCES users(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,  -- liên kết mềm tới task nếu có
  done_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS risks (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- R-0001
  title TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL CHECK (category IN ('schedule','cost','quality','safety','material','other')),
  probability SMALLINT NOT NULL CHECK (probability BETWEEN 1 AND 5),
  impact SMALLINT NOT NULL CHECK (impact BETWEEN 1 AND 5),
  mitigation TEXT,
  owner INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigating','closed')),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ
);
```

Score = probability × impact (tính lúc query, không lưu).

## API

| Route | Quyền | Ghi chú |
|---|---|---|
| `/api/meetings` CRUD + `/api/meetings/:id/actions` CRUD | tạo: Admin/PM/engineer; action đánh done: assignee hoặc Admin/PM | |
| `/api/risks` CRUD | tạo/sửa: Admin/PM/engineer; xem: mọi user trừ subcon | |
| GET `/api/meetings/actions?open=1` | mọi user thao tác | action của tôi — cho my-tasks |

Notification `action_overdue`: action quá `due_date` → assignee (pattern `delayed`).

## UI/UX

- **`/meetings`**: danh sách theo ngày; chi tiết = nội dung + bảng action (nội dung, người, hạn, trạng thái toggle); action mở của mọi cuộc họp gom về **tab "Việc sau họp"** — sắp theo hạn, quá hạn nổi đầu; action của tôi hiện thêm ở `/my-tasks` (mục riêng cuối trang, tái dùng API trên).
- **`/risks`**: bảng + **heatmap 5×5** (recharts hoặc grid div — ô đếm số rủi ro, màu theo score: 1–6 emerald, 8–12 amber, 15–25 rose kèm số; click ô lọc bảng); form probability/impact chọn bằng 2 hàng nút 1–5 (không dropdown); score hiển thị to khi chọn.
- Cả 2 trang: filter trạng thái, EmptyState chuẩn, mobile card view.

## Test

- Integration: action done ghi `done_at` + chỉ assignee/Admin/PM; risk CHECK 1–5; notification quá hạn.

## Chia PR

1. Meetings + actions (schema + API + trang + my-tasks mục action) + test.
2. Risks + heatmap + notification.
