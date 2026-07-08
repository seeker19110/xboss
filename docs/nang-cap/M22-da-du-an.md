# M22 — Đa dự án (Portfolio, project switcher, scoping `project_id`)

**Đợt N3 (`docs/ke-hoach-appshell-full-ia-2026-07.md`) · Phụ thuộc: ADR-0004, M21 · Phức tạp: Lớn (3+ PR) · Rủi ro: Cao (chạm hầu hết route)**

## Mục tiêu

Biến XBoss từ "1 dự án ngầm" thành **đa dự án thật**: tầng cao nhất của IA là Portfolio → Dự án; mọi nội dung nghiệp vụ scoped theo dự án đang chọn. Gồm 3 phần: (a) **nền scoping** — cột `project_id` + `user_projects` + `getCurrentProjectId`; (b) **project switcher** trên đỉnh sidebar + **trang Portfolio**; (c) **rà scoping** từng cụm API để không rò dữ liệu chéo dự án.

> Đọc **ADR-0004** trước — quyết định kiến trúc (cookie thay path prefix, cột ở bảng gốc suy ở bảng con, `user_projects` gate) là bắt buộc để làm đúng module này.

## Hiện trạng & điểm chạm

- `projects` table đã có; `/api/project` (số ít) trả tên 1 dự án (fallback DB trống) — giữ cho tương thích, thêm `/api/projects` (số nhiều) mới.
- `getCurrentUser()` (`lib/auth.ts`): thêm cạnh nó `getCurrentProjectId(req)` (đọc cookie `xboss_project`, đối chiếu `user_projects`, fallback dự án mặc định).
- `AppHeader.tsx`: đỉnh sidebar hiện đang là logo "XBoss" — thay bằng **project switcher** (tên dự án đang chọn + dropdown), theo `docs/ke-hoach-appshell-full-ia-2026-07.md` §4.1b.
- `nav_settings.project_id` (M21) — bật override hiển thị theo dự án khi M22 xong.
- Mọi route list nghiệp vụ (`/api/tasks`, `/api/materials`, `/api/contracts`, …) — thêm `WHERE project_id = $current`.

## Schema (`migrations/0027_multi_project.sql`)

```sql
CREATE TABLE IF NOT EXISTS user_projects (   -- ai thấy dự án nào (song song user_disciplines)
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','handover','closed'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS color TEXT;   -- chấm nhận diện dự án ở switcher
-- Cột project_id cho bảng gốc CHƯA có (rà từng bảng — ví dụ, không exhaustive):
ALTER TABLE contracts        ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE materials        ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE boq_items        ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE variations       ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE proposals        ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE meetings         ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE risks            ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE correspondences  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE drawings         ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE hse_records      ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
-- … rà đủ danh sách trong ADR-0004; bảng suy được project_id qua cha (tasks→…→towers) thì BỎ QUA.
-- Backfill: mọi dòng hiện có về dự án mặc định (id nhỏ nhất / dự án duy nhất).
UPDATE contracts SET project_id = (SELECT MIN(id) FROM projects) WHERE project_id IS NULL;
-- … lặp cho từng bảng vừa thêm cột.
-- Index scoping (một phần — thêm cho bảng truy vấn nhiều):
CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id);
```

## `lib/projects.ts`

- `getCurrentProjectId(req, user)`: cookie `xboss_project` → nếu user có quyền thấy (qua `visibleProjectIds`) trả về; else dự án mặc định (dự án đầu trong `visibleProjectIds`). **Không tin body/query.**
- `visibleProjectIds(user)`: `admin` → mọi dự án; khác → `user_projects` của user; nếu bảng `user_projects` rỗng toàn hệ thống → mọi dự án (tương thích ngược, không khoá ai).
- `listProjects(user)`: dự án user thấy + `% tiến độ` (trung bình task) + `số việc trễ` + `status` + `color` — dùng chung switcher lẫn Portfolio.
- `portfolioKpi(user)`: KPI gộp cross-project (tổng dự án theo status, tổng việc trễ, % trung bình có trọng số) — endpoint riêng, không đụng cache 1 dự án.

## API

| Route                                                   | Quyền                                                     | Ghi chú                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/projects`                                     | mọi user đăng nhập                                        | Danh sách dự án user thấy + %/trễ/status/color (switcher + Portfolio)                      |
| `GET /api/portfolio/kpi`                                | mọi user đăng nhập                                        | KPI gộp cross-project                                                                      |
| `POST /api/projects` + `PATCH/DELETE /api/projects/:id` | `CAN.manageUsers`? → **`CAN.manageProjects`** mới (admin) | Tạo/sửa/đóng dự án; DELETE chỉ khi rỗng dữ liệu                                            |
| `PUT /api/user-projects`                                | `CAN.assign` (admin/pm)                                   | Gán user ↔ dự án (giống gán user_disciplines)                                              |
| (cookie) `POST /api/project/select`                     | mọi user đăng nhập                                        | Đặt cookie `xboss_project` sau khi đối chiếu `visibleProjectIds` → 403 nếu không được thấy |

- **Rà scoping (PR 3+):** mọi route list nghiệp vụ nhận `projectId = getCurrentProjectId(...)` và thêm `WHERE project_id = ?` (hoặc JOIN tới bảng gốc mang cột). POST tạo mới **gán `project_id = current`** từ server (không lấy client).
- `CAN.manageProjects` (admin) thêm vào map `CAN`.

## UI/UX

**Project switcher (`app/components/ProjectSwitcher.tsx`) — PR 2:** theo §4.1b của kế hoạch —

- Trigger đỉnh sidebar: chấm màu dự án + tên (truncate) + chevron; `aria-haspopup="listbox"`. Thu gọn sidebar → chỉ chấm màu, bấm mở popover.
- Panel: ô lọc (khi >7 dự án), nhóm **★ Đã ghim** (`localStorage('xboss_pinned')`) → **Đang thi công** → **Đã bàn giao/Đóng** (mờ, dưới); mỗi dòng chấm màu + tên + % tiến độ (tabular-nums) + badge cảnh báo trễ; dự án hiện tại `✓` + nền `zinc-800`; nút sao ghim/bỏ. Chân: "Xem tất cả dự án (Portfolio)".
- Chọn dự án = `POST /api/project/select` (cookie) + set `localStorage` → refetch, **giữ nguyên route đang xem nếu áp dụng cho dự án mới**; else lùi về dashboard. Đóng khi bấm ngoài/`Esc`; ↑/↓/Enter điều hướng (role listbox/option). Mobile: **bottom sheet** full-width. 1 dự án: panel 1 mục + lối Portfolio (không phải trạng thái đặc biệt).

**Trang Portfolio (`app/portfolio/page.tsx`) — PR 2:** thẻ dự án (tên, % tiến độ, số việc trễ, status) + KPI gộp; bấm 1 dự án = chọn + vào dashboard dự án đó. 1 dự án → vẫn vào thẳng dashboard (switcher vẫn hiện, sẵn sàng mở rộng).

**Quản lý dự án + gán user:** khu trong `/admin` (admin) — tạo/sửa/đóng dự án, gán user ↔ dự án (như gán hệ).

## Test

- `tests/projects.test.ts`: thuần — `visibleProjectIds` (admin thấy hết, user theo `user_projects`, bảng rỗng = thấy hết), `getCurrentProjectId` bỏ cookie lạ. Tích hợp (**điểm cốt lõi**): tạo 2 dự án + dữ liệu mỗi bên → route list chỉ trả dữ liệu dự án current, đổi cookie → đổi kết quả, POST tạo mới gán đúng `project_id`, user không thuộc dự án B gọi API scoped B → không thấy dòng nào.
- `e2e/authed/portfolio.spec.ts` + `e2e/authed/project-switcher.spec.ts`: render, đổi dự án giữ route, Esc/bàn phím, axe desktop+mobile.

## Chia PR

1. **ADR-0004 + migration (`user_projects` + cột `project_id` + backfill) + `lib/projects.ts` + `getCurrentProjectId`/`visibleProjectIds` gate + `CAN.manageProjects`** (chưa đổi UI — dự án mặc định giữ hành vi cũ).
2. **Project switcher + trang Portfolio + `/api/projects`/`/api/portfolio/kpi`/select** + quản lý dự án/gán user ở `/admin` + e2e.
3. **Rà scoping từng cụm** (mỗi cụm 1 sub-PR nếu lớn): thêm `WHERE project_id` + test 2-dự-án; bật `nav_settings.project_id` override (M21). Cập nhật `docs/ERD.md`.

## Điểm cần quyết & mặc định đã chọn

- **Cookie `xboss_project` (không path prefix)** — chốt ở ADR-0004, giữ nguyên URL.
- **`user_projects` rỗng = mọi user thấy mọi dự án** (tương thích ngược 1 dự án) — chỉ khoá khi bắt đầu cấu hình. Khác `user_disciplines` (rỗng = mặc định hệ của mình) vì dự án là trục quyền thô hơn.
- **Backfill về dự án id nhỏ nhất** — giả định dự án hiện tại là dự án đầu; nếu DB đã có nhiều dự án rác cần xác nhận thủ công trước khi chạy.
- **Rà scoping không big-bang**: làm theo cụm, mỗi cụm có test 2-dự-án trước khi merge — sót chỗ nào là rò dữ liệu chéo (nghiêm trọng), nên ưu tiên độ phủ test hơn tốc độ.
