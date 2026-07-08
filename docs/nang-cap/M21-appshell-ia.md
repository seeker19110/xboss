# M21 — AppShell IA đầy đủ (cây dashboard + trang hub + quản trị hiển thị)

**Đợt N1 (`docs/ke-hoach-appshell-full-ia-2026-07.md`) · Phụ thuộc: M0 (AppShell) · Phức tạp: Trung bình (3 PR) · Rủi ro: Thấp (thuần UI/nav, không đổi URL, không scoping)**

## Mục tiêu

Nâng điều hướng từ danh sách phẳng (`app/lib/nav.ts` — 11 cụm sau PR M21-N1 đầu) thành **cây IA sống 2 tầng** phản chiếu toàn bộ 24 dashboard của mockup `xBossmockup.xlsx`: cụm nghiệp vụ → dashboard (gập/mở), node chưa build hiện badge **"Sắp có"**. Thêm **trang hub khuôn chung** cho từng dashboard (render cây con cấp 4 dạng thẻ/section, tái dùng khuôn `/he/[code]`), và **khu quản trị hiển thị** ở `/admin` cho phép Admin/PM bật/tắt từng node (kèm notification `nav_enabled` khi admin bật để PM biết dashboard mới đã mở).

> **Đã làm ở PR trước (M21-N1 phần 1, commit `b5bbc8a`):** gom `nav.ts` thành 11 cụm nghiệp vụ + 9 mục "Sắp có" (`href` optional → `AppHeader` render `<span aria-disabled>` + badge). Tài liệu này đặc tả **phần còn lại** của M21: cây `dashboardTree.ts` đầy đủ cấp con, gập/mở nhớ `localStorage`, trang hub, `nav_settings`.

## Hiện trạng & điểm chạm

- `app/lib/nav.ts`: `NAV_GROUPS` (11 cụm) + `NavItem` (`href?`, `label`, `icon`, `roles?`) + `findActiveNav`/`isNavItemActive`/`canSeeNavItem`. Cây mới **mở rộng** file này (thêm `children` + `status`), không thay thế — mọi trang gọi `AppHeader` không phải sửa.
- `app/components/AppHeader.tsx`: sidebar render `NAV_GROUPS` + nhóm động "Hệ thi công" (`/api/disciplines`); mục "Sắp có" đã render `<span aria-disabled>` + badge amber. Cần thêm: render đệ quy `children`, nút gập/mở dashboard, lọc theo `nav_settings`.
- `/admin` (`app/admin/page.tsx`, role admin/pm): đã có tab Phân công/Lịch sử — thêm tab/khu "Hiển thị AppShell" (không tạo trang mới).
- `/he/[code]` (`app/he/[code]/page.tsx`): khuôn hub theo hệ có sẵn (header + KPI strip + tab card sheet) — **tái dùng cấu trúc** cho trang hub dashboard.
- Notification: cơ chế on-fetch `/api/notifications`. `nav_enabled` KHÁC 4 loại tự-dọn hiện có — là **sự kiện một lần** (tạo lúc bật, không auto-clean, dedup theo `node_key`).
- Quyền: thêm `CAN.manageNav` (admin/pm) vào map `CAN` (`lib/auth.ts`).

## Cây dữ liệu nav (`app/lib/dashboardTree.ts`)

```ts
export type NavStatus = "available" | "partial" | "coming-soon";
export type DashNode = {
  id: string; // khoá ổn định, dùng cho nav_settings (vd "dash.moi-truong")
  label: string;
  href?: string; // có = link thật; không = header/placeholder ("coming-soon")
  icon?: LucideIcon;
  status?: NavStatus; // mặc định suy: có href → "available"; không href → "coming-soon"
  roles?: Role[]; // ẩn/hiện theo vai trò (UX — bảo mật thật ở API)
  children?: DashNode[]; // cấp 4 (mục/section trong trang hub)
};
export type DashCluster = { id: string; label: string; icon: LucideIcon; dashboards: DashNode[] };
export const DASHBOARD_TREE: DashCluster[] = [/* 11–12 cụm × 24 dashboard × cấp con */];
```

- **`id` là hợp đồng ổn định**: đặt theo kiểu `cluster.<slug>` / `dash.<slug>` / `sect.<slug>`. Đổi label không đổi `id` (nav_settings tham chiếu `id`, không tham chiếu label).
- **Nguồn duy nhất**: `DASHBOARD_TREE` thay `NAV_GROUPS` — giữ `NAV_GROUPS` như **view suy ra** (map cụm→dashboard cấp có href) trong giai đoạn chuyển tiếp để không phải sửa mọi chỗ import cùng lúc; hoặc chuyển hẳn `AppHeader` sang đọc `DASHBOARD_TREE` và bỏ `NAV_GROUPS` (khuyến nghị — 1 nguồn).
- **Cây append-only**: module M<x> hoàn thành chỉ đổi `status: "coming-soon" → "available"` + thêm `href` node tương ứng. Không xoá node.
- Map đầy đủ 24 dashboard + cấp con theo `docs/ke-hoach-ia-chi-tiet-2026-07.md` (bảng từng cụm A–L). Node cấp 4 chỉ khai khi trang hub cần render — không nhồi hết vào sidebar.

## Schema (`migrations/0026_nav_settings.sql`)

```sql
CREATE TABLE IF NOT EXISTS nav_settings (
  id SERIAL PRIMARY KEY,
  node_key TEXT NOT NULL,               -- DashNode.id trong dashboardTree (vd 'dash.moi-truong')
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, -- NULL = áp toàn hệ thống
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(node_key, project_id)          -- 1 override / node / dự án (NULL = mặc định chung)
);
-- Notification nav_enabled: sự kiện một lần, dedup theo node_key.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS nav_node_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_nav ON notifications(user_id, type, nav_node_key)
  WHERE nav_node_key IS NOT NULL;
```

> `project_id` để sẵn cho M22 (override hiển thị theo dự án); trước M22 mọi bản ghi `project_id IS NULL`. `UNIQUE(node_key, project_id)` — Postgres coi mỗi `NULL` là khác nhau nên chỉ 1 dòng NULL/node là đúng ý (kiểm bằng test).

## `lib/nav-settings.ts`

- `getNavSettings(projectId?)`: đọc bảng → `Map<node_key, boolean>`; override dự án (nếu có) đè lên mặc định chung. **Mặc định khi chưa có bản ghi**: node `available`/`partial` → bật; node `coming-soon` → tắt (suy từ `DASHBOARD_TREE`, không seed).
- `resolveVisibleTree(tree, role, navSettings)`: lọc cây theo (a) `canSeeNavItem` vai trò, (b) `enabled` từ settings — trả cây đã tỉa để `AppHeader` render. Cụm rỗng sau lọc thì ẩn.
- `setNavEnabled(nodeKey, enabled, projectId, actor)`: upsert `ON CONFLICT (node_key, project_id)`; trả `{ changed: boolean, wasEnabled: boolean }` để route quyết định có phát `nav_enabled` không.
- Validate thuần `isKnownNodeKey(key)`: chặn ghi `node_key` không có trong `DASHBOARD_TREE` (tránh rác) — unit test bằng danh sách id phẳng hoá từ cây.

## API

| Route                     | Quyền                      | Ghi chú                                                                                                                                                                                            |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/nav-settings`   | mọi user đăng nhập         | Trả `Map` bật/tắt (merge mặc định + override); AppShell gọi lọc sidebar. `export const dynamic = "force-dynamic"`                                                                                  |
| `PATCH /api/nav-settings` | `CAN.manageNav` (admin/pm) | Body `{ nodeKey, enabled, projectId? }`; 422 nếu `nodeKey` không thuộc cây; upsert + ghi `updated_by`. Khi **actor=admin** và `false→true` → tạo `nav_enabled` cho mọi user role `pm` (+ Web Push) |

- **Notification `nav_enabled`** (trong route PATCH, không phải on-fetch — vì là sự kiện push một lần): chỉ phát khi actor là **admin** và node chuyển `false→true`; dedup `ON CONFLICT (user_id, type, nav_node_key)` (bật-tắt-bật không spam, chỉ 1 bản chưa đọc/node/người); **không auto-clean**. PM tự bật → không phát (chỉ chiều admin→PM). Nội dung: _"Admin đã bật mục «\<label\>» trong menu"_ + link tới `href` node (nếu có).
- `/api/notifications` (on-fetch) **không** đụng `nav_enabled` (khác material_over) — chỉ đọc/đếm bình thường, không sinh/dọn.

## UI/UX

**Sidebar (`AppHeader.tsx`) — PR 1:**

- Render cụm (header không bấm) → dashboard (bấm mở hub HOẶC gập/mở khi có `children` có href). Nút chevron gập/mở dashboard; trạng thái gập lưu `localStorage('xboss_nav_open')` (map `node_key → bool`). Cụm chứa trang đang xem tự mở.
- Node `coming-soon`: `<span aria-disabled>` + badge "Sắp có" (nền `zinc-800`/chữ `amber-300`) — đã có từ M21-N1. Node `partial`: link thật + chấm nhỏ "đang hoàn thiện" (title tooltip).
- Thu gọn sidebar (icon-only) giữ nguyên cơ chế `sidebar-collapsed` (M0); cây con ẩn khi thu gọn (chỉ hiện icon dashboard cấp cao).

**Trang hub khuôn chung (`app/components/DashboardHub.tsx`) — PR 2:**

- Nhận `clusterId`/`dashId` → render header (tên dashboard + mô tả) + các section cấp 4 dạng thẻ nhóm, mỗi lá = link (available) / chip mờ (coming-soon) / progress khi có số liệu. Tái dùng bố cục `/he/[code]` (KPI strip + card grid).
- Áp cho **≥2 dashboard mẫu** để chứng minh khuôn (đề xuất: hub **Vật tư** `/materials` bọc thêm section BOQ/định mức/kho, và hub **Chất lượng** `/quality` bọc section ITP/NCR/thí nghiệm — cả hai đã có nhiều node con).

**Khu "Hiển thị AppShell" ở `/admin` — PR 3:**

- Danh sách render đúng `DASHBOARD_TREE`: gập theo cụm, mỗi dòng = tên + badge trạng thái (available/partial/coming-soon) + **công tắc** (toggle). Bật cụm cha kéo hiện cả cụm; tắt cụm ẩn cả nhóm.
- `bch`/khác chỉ xem (không có `manageNav`); Admin/PM đổi được. Node `coming-soon` bật = "cho hiện badge Sắp có" (vẫn `aria-disabled`, không thành link).
- Mobile: danh sách 1 cột, công tắc ≥40px.

## Test

- `tests/nav-settings.test.ts`: thuần — `resolveVisibleTree` lọc đúng theo vai trò + settings (cụm rỗng ẩn), mặc định suy đúng (coming-soon tắt/available bật khi chưa có bản ghi), `isKnownNodeKey` chặn key lạ; tích hợp — upsert `ON CONFLICT (node_key, project_id)` chỉ 1 dòng NULL/node, `setNavEnabled` trả `changed` đúng, `nav_enabled` sinh cho mọi PM khi admin bật + dedup (bật-tắt-bật chỉ 1 bản), PM tự bật không sinh.
- `e2e/authed/appshell.spec.ts`: cập nhật — cây gập/mở (bấm dashboard mở children, reload nhớ trạng thái), mục "Sắp có" `aria-disabled` (đã có), axe desktop+mobile. `e2e/authed/admin.spec.ts`: khu "Hiển thị AppShell" render + toggle 1 node → sidebar phản ánh (hoặc kiểm qua API).

## Chia PR

1. **Cây `dashboardTree.ts` đầy đủ + sidebar render đệ quy + gập/mở nhớ `localStorage`** (thuần UI, không API mới). Cập nhật `findActiveNav` tìm theo href sâu.
2. **Trang hub khuôn chung `DashboardHub.tsx`** áp cho ≥2 dashboard mẫu; topbar title/breadcrumb suy theo cây mới.
3. **`nav_settings` + `GET/PATCH /api/nav-settings` + khu "Hiển thị AppShell" ở `/admin` + notification `nav_enabled`** + test.

## Điểm cần quyết & mặc định đã chọn

- **`DASHBOARD_TREE` thay hẳn `NAV_GROUPS`** (1 nguồn) — mặc định chọn phương án này; giữ `NAV_GROUPS` như alias suy ra chỉ nếu phát hiện >5 chỗ import ngoài `AppHeader` (giảm rủi ro diff).
- **`nav_enabled` không auto-clean** (khác 4 loại tự-dọn) — đúng bản chất sự kiện một lần; nếu về sau muốn dọn khi tắt lại, thêm nhánh xoá bản chưa đọc khi `true→false` (ghi chú tại chỗ).
- **Chưa scoping theo dự án**: `nav_settings.project_id` để sẵn nhưng M21 chỉ ghi/đọc `NULL` (toàn hệ thống). Override theo dự án bật cùng M22.
- **Không auto-áp badge "partial"**: mặc định node có href = `available`; đánh `partial` thủ công trong cây cho dashboard "đã có nhưng còn thiếu node con" (vd Đấu thầu thiếu bid tab) — quyết theo từng node khi mã hoá cây.
