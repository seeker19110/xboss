# M29 — Bàn giao & Kết thúc (T&C, as-built, demob)

**Cụm K · Phụ thuộc: M03 (QA/QC), M20 (hồ sơ) · Phức tạp: Lớn (3 PR)**

## Mục tiêu

Dashboard giai đoạn kết thúc: **chạy thử & nghiệm thu hệ thống T&C** (commissioning MEP, nghiệm thu PCCC cơ quan), **nghiệm thu hoàn thành** (hạng mục + tổng thể), **hồ sơ pháp lý kết thúc**, **bàn giao CĐT** (biên bản + as-built), **giải thể công trường** (demob: tháo lán, hoàn trả mặt bằng, thanh lý vật tư dư), **quyết toán & bài học kinh nghiệm**. Điểm nhấn: **punch list** (tồn tại khi bàn giao).

## Hiện trạng & điểm chạm

- `qc_inspections`/`ncrs` (M03), nghiệm thu 2 bước (`/approvals` + `task_documents`) — T&C tái dùng luồng duyệt kiểu inspection theo hệ thống.
- As-built = liên kết `document_register` (nếu M20 đã có Document Register) hoặc `project_documents`/`drawing_revisions` (bản vẽ hoàn công).
- Upload biên bản: pattern `task_documents`.
- Quyền: xem mọi vai trò; ghi `CAN.manageHandover` (admin/pm/engineer); đóng/duyệt bàn giao `CAN.approve`.

## Schema (`migrations/0034_handover.sql`)

```sql
CREATE TABLE IF NOT EXISTS commissioning (                  -- chạy thử & nghiệm thu hệ thống
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  code TEXT, system_name TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  checklist JSONB,                                           -- các bước T&C (pattern qc_checklists)
  result TEXT NOT NULL DEFAULT 'draft'
    CHECK (result IN ('draft','testing','passed','failed')),
  tested_at DATE, note TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS handover_items (                 -- hạng mục bàn giao
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, discipline_id INTEGER REFERENCES disciplines(id),
  work_package_id INTEGER REFERENCES work_packages(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','handed_over','accepted')),
  handover_date DATE, minutes_file TEXT,                     -- biên bản (1 file gọn)
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS punch_list (                     -- tồn tại khi bàn giao
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  handover_item_id INTEGER REFERENCES handover_items(id),
  description TEXT NOT NULL, severity TEXT CHECK (severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixing','closed')),
  due_date DATE, assignee INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS demob_items (                    -- giải thể công trường
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, category TEXT,                        -- lán trại/mặt bằng/vật tư dư
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  note TEXT, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS lessons_learned (
  id SERIAL PRIMARY KEY, project_id INTEGER REFERENCES projects(id),
  title TEXT NOT NULL, category TEXT, content TEXT,
  created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS punch_item_id INTEGER REFERENCES punch_list(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_punch ON notifications(user_id, type, punch_item_id)
  WHERE punch_item_id IS NOT NULL;
```

## `lib/handover.ts`

- `listCommissioning`/`listHandoverItems`/`listPunch(projectId, filters)`/`listDemob`/`listLessons`.
- `handoverProgress(projectId)`: % hạng mục accepted, số punch open theo severity, % T&C passed — KPI hub.
- `overduePunch(projectId)`: punch `status != closed AND due_date < todayISO()` → notification `punch_overdue`.
- `validateCommissioningItems` (thuần, JSONB như `validateChecklistItems` M03).

## API

| Route                                       | Quyền                                       | Ghi chú                     |
| ------------------------------------------- | ------------------------------------------- | --------------------------- |
| `GET/POST /api/commissioning` + `.../:id`   | ghi: manageHandover; passed/failed: approve | JSONB checklist T&C         |
| `GET/POST /api/handover-items` + `.../:id`  | ghi: manageHandover; accepted: approve      | biên bản file               |
| `GET/POST /api/punch-list` + `.../:id`      | ghi: manageHandover                         | vòng đời open→fixing→closed |
| `GET/POST /api/demob` + `.../:id`           | ghi: manageHandover                         |                             |
| `GET/POST /api/lessons-learned` + `.../:id` | ghi: manageHandover                         |                             |

Notification `punch_overdue`: on-fetch, assignee + Admin/PM, dedup theo `punch_item_id`, tự dọn khi closed.

## UI/UX (`app/handover/page.tsx`)

Hub tab: **T&C** (danh sách hệ thống + checklist chạy thử, gửi duyệt passed/failed), **Nghiệm thu bàn giao** (hạng mục + biên bản), **Punch list** (bảng tồn tại + severity màu + vòng đời, quá hạn nổi đầu), **Demob** (checklist giải thể), **Bài học** (ghi chú). KPI strip: % bàn giao, punch open theo severity, % T&C passed. Sidebar cụm **Bàn giao & Vận hành**.

## Test (`tests/handover.test.ts`)

Thuần: `validateCommissioningItems`. Tích hợp: `handoverProgress` tính đúng, `overduePunch` xuất hiện/tự dọn, vòng đời punch/handover status. `e2e/authed/handover.spec.ts` desktop+mobile+axe.

## Chia PR

1. Migration + `lib/handover.ts` + API commissioning/handover-items/punch + test.
2. Trang `/handover` (T&C + nghiệm thu + punch) + notification + sidebar.
3. Demob + lessons learned + as-built (link `document_register`/bản vẽ hoàn công).

## Điểm cần quyết & mặc định đã chọn

- **T&C dùng JSONB checklist** (pattern M03 `qc_checklists`) — cùng cơ chế đã có, không phát minh mới.
- **Punch list gắn `handover_item_id` nullable** — có punch phát sinh không thuộc hạng mục cụ thể.
- **As-built không lưu file mới ở M29** — liên kết bản vẽ hoàn công (`drawing_revisions` kind asbuilt, M08) / `document_register` (M20); tránh trùng kho file.
- **Quyết toán cuối kỳ** — dùng chung với M27/M02 (tab quyết toán ở `/costs`), M29 chỉ tổng hợp link.
