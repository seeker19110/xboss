# G00 — Nền tảng (AppShell, IA, đa dự án)

> Gộp từ M00 (khung UI sidebar) + M21 (AppShell IA đầy đủ) + M22 (đa dự án). Cả 3 đã triển khai xong — file này là tóm tắt tra cứu, không còn là đặc tả trước-khi-code. Lịch sử PR/quyết định chi tiết xem `PROGRESS.md`.

## M00 — AppShell (sidebar + topbar)

Chuyển điều hướng từ top-nav sang **AppShell**: sidebar trái cố định thu gọn được (`app/components/AppShell.tsx`, trạng thái lưu `localStorage('xboss_sidebar')`) + topbar mỏng suy title/breadcrumb theo pathname; mobile = drawer off-canvas. Nền tảng UX dùng chung: `Toast.tsx` (thay `alert()`, tự ẩn 4s), `EmptyState.tsx`, focus ring chuẩn hoá trong `globals.css`. Nguồn menu 1 chỗ (`app/lib/nav.ts` → sau đó `dashboardTree.ts`, xem M21).

## M21 — AppShell IA đầy đủ (cây dashboard + hub + quản trị hiển thị)

Nâng điều hướng thành **cây IA 2 tầng**: `app/lib/dashboardTree.ts` (`DASHBOARD_TREE`) thay `nav.ts` — cụm nghiệp vụ → dashboard (gập/mở, nhớ `localStorage('xboss_nav_open')`) → cấp con (`children`, render trong trang hub). Node chưa build: `status: "coming-soon"` → hiện badge, `aria-disabled`, không phải link.

- **Trang hub khuôn chung** (`app/components/DashboardHub.tsx`, route `/hub/[dashId]`): render header + section cấp con dạng thẻ, tái dùng bố cục `/he/[code]`.
- **Quản trị hiển thị** (`/admin`, tab "Hiển thị AppShell"): Admin/PM bật/tắt từng node qua bảng `nav_settings` (`migrations/0026_nav_settings.sql`: `node_key`, `project_id` nullable = toàn hệ thống, `enabled`, `UNIQUE(node_key, project_id)`). `lib/nav-settings.ts`: `getNavSettings`/`resolveVisibleTree` (lọc theo vai trò + settings)/`setNavEnabled`. `GET /api/nav-settings` (mọi user) + `PATCH /api/nav-settings` (`CAN.manageNav`, admin/pm).
- Notification `nav_enabled`: sự kiện **một lần** (không auto-dọn như 4 loại kia) khi **admin** bật node từ `false→true` cho mọi `pm` — dedup `UNIQUE(user_id, type, nav_node_key)`.
- Quyết định: `DASHBOARD_TREE` là nguồn duy nhất (không giữ `NAV_GROUPS` song song); cây append-only (module xong chỉ đổi `status`, không xoá node).

## M22 — Đa dự án (Portfolio, project switcher, scoping `project_id`)

Biến "1 dự án ngầm" thành **đa dự án thật** — xem ADR-0004 cho quyết định kiến trúc gốc (cookie thay path prefix).

- **Schema** (`migrations/0027_multi_project.sql`): `user_projects(user_id, project_id)` (ai thấy dự án nào) + `projects.status`/`color`; cột `project_id` thêm vào các bảng "gốc cụm" (contracts/materials/boq_items/variations/proposals/meetings/risks/correspondences/drawings/hse_records/project_documents/...), backfill về dự án đầu tiên; bảng suy được `project_id` qua cha (vd `tasks`→...→`towers`) thì bỏ qua, không thêm cột thừa.
- **`lib/projects.ts`**: `getCurrentProjectId(req, user)` (cookie `xboss_project`, đối chiếu `user_projects`, fallback dự án mặc định — không tin body/query); `visibleProjectIds(user)` (admin = mọi dự án; `user_projects` rỗng toàn hệ thống = tương thích ngược, thấy hết); `listProjects`/`portfolioKpi`.
- **API**: `GET/POST /api/projects` + `PATCH/DELETE /api/projects/:id` (`CAN.manageProjects`, admin) · `GET /api/portfolio/kpi` · `PUT /api/user-projects` (gán user↔dự án) · `POST /api/project/select` (đặt cookie, 403 nếu không được thấy).
- **UI**: `ProjectSwitcher.tsx` (đỉnh sidebar, chấm màu + tên + dropdown, nhóm ghim/đang thi công/đã đóng, mobile = bottom sheet) + `/portfolio` (thẻ dự án + KPI gộp).
- **Rà scoping** (rủi ro cao nhất, làm theo từng cụm không big-bang): mọi route list nghiệp vụ thêm `WHERE project_id = getCurrentProjectId(...)`; POST gán `project_id` từ server. Đã đóng xong toàn bộ cụm gốc + `/api/notifications` (trừ `cost_over`, xem `PROGRESS.md` mục Nợ kỹ thuật).

## Test

`tests/nav-settings.test.ts`, `tests/projects.test.ts` (tích hợp — 2 dự án, dữ liệu không lẫn nhau); `e2e/authed/appshell.spec.ts`, `admin.spec.ts`, `portfolio.spec.ts`, `project-switcher.spec.ts` (desktop+mobile+axe).
