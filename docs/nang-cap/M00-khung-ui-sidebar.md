# M0 — Khung UI: sidebar trái thu gọn + title AppHeader + nền tảng UX

**Đợt 1 · Phụ thuộc: — · Phức tạp: Trung bình · Làm ĐẦU TIÊN** (mọi module sau thêm menu vào đây)

## Mục tiêu

Chuyển điều hướng từ top-nav (`app/components/AppHeader.tsx`, 178 dòng) sang **AppShell**: sidebar trái cố định thu gọn được + topbar mỏng hiển thị title trang; đồng thời chuẩn hoá nền tảng UX dùng chung (toast, empty state, breadcrumb) để các module sau không tự chế.

## Hiện trạng & điểm chạm

- `app/layout.tsx` render `AppHeader` per-page (mỗi page tự nhúng) — cần kiểm tra lại cách nhúng thực tế trước khi refactor; `BottomBarSpacer` chừa chỗ thanh đáy ở trang chủ.
- Trang không dùng header (login, print `/payments/print`, `/report` khi in) phải giữ nguyên sạch.
- Theme class `html.light` + `localStorage('xboss_theme')`, chuyển bằng `ThemeToggle`; `NotificationBell`, `GlobalSearch`, `OnlineUsers` đang nằm trong AppHeader.

## Thiết kế

### AppShell (`app/components/AppShell.tsx`)

- **Desktop (≥1024px)**: sidebar trái `w-60`, thu gọn còn dải icon `w-14` (nút toggle ở đầu sidebar, icon `PanelLeftClose`/`PanelLeftOpen`); trạng thái lưu `localStorage('xboss_sidebar')`; ở chế độ icon hiện tooltip tên mục (title attr hoặc popover nhẹ).
- **Topbar mỏng (h-12)**: trái = **title mục menu đang chọn** (+ breadcrumb trang con, vd "Vật tư / Đơn đặt hàng"); phải = `GlobalSearch`, `OnlineUsers`, `NotificationBell`, `ThemeToggle`, avatar/menu tài khoản. Title suy từ pathname qua map cấu hình menu (single source: mảng `NAV_ITEMS` — icon, label, href, nhóm, quyền xem).
- **Mobile (<1024px)**: sidebar thành drawer off-canvas (nút hamburger trên topbar), overlay đóng khi chạm ngoài; giữ thanh đáy hiện có nếu đang là pattern chính của trang chủ.
- **Nhóm menu** (theo nghiệp vụ, mục chỉ hiện khi vai trò có quyền xem):
  1. Tổng quan: Dashboard, Báo cáo, Timeline/Gantt, Lookahead
  2. Thi công: Tracking (submenu sheet động từ `/api/sheets`), My-tasks, Nghiệm thu, (sau: Mặt bằng M14, Nhật ký M5, QA&QC M3)
  3. Vật tư & mua sắm: Vật tư, PR, PO, (sau: Xe ra vào M4)
  4. Tiền: Thanh toán, (sau: BOQ M1, Chi phí M2, VO M6, Đấu thầu M7)
  5. Hồ sơ: (sau: Bản vẽ M8, Công văn M10...)
  6. Quản trị: Users, Admin, Import
- RSC không dùng — AppShell là client component như toàn bộ app.

### Nền tảng UX bổ sung (làm cùng PR 3)

- **Toast** (`app/components/Toast.tsx` + hook `useToast`): thay `alert()`/im lặng — 3 loại thành công/lỗi/cảnh báo, tự ẩn 4s, vị trí đáy giữa (mobile-friendly). Các module sau bắt buộc dùng.
- **EmptyState** (`app/components/EmptyState.tsx`): icon + thông điệp + nút hành động — chuẩn hoá trạng thái rỗng.
- Chuẩn hoá focus ring toàn cục trong `globals.css` (`:focus-visible`).

## UI/UX chi tiết

- Sidebar nền `zinc-900` (light tự đảo), mục active nền `zinc-800` + accent trái 2px `emerald-400` + chữ `zinc-100`; hover `zinc-800/60`; icon `size=18 strokeWidth=1.75` đồng bộ.
- Vùng chạm mục menu ≥40px; toggle thu gọn có `aria-label="Thu gọn menu"`/`"Mở rộng menu"`; drawer mobile bẫy focus + đóng bằng Esc.
- Nội dung chính `min-w-0` (tránh vỡ lưới khi sidebar mở); trang tracking/Gantt hưởng toàn bộ chiều rộng khi thu gọn.
- Không đổi URL/route nào — thuần bố cục.

## Test & kiểm chứng

- `e2e/authed/appshell.spec.ts`: sidebar render đủ mục theo role admin; toggle thu gọn giữ trạng thái sau reload; title topbar đổi đúng khi điều hướng; axe desktop + mobile xanh.
- Kiểm tay: `/login` và trang in không có sidebar; lưới tracking cuộn ngang bình thường ở cả 2 trạng thái sidebar.

## Chia PR

1. `AppShell` + `NAV_ITEMS` + topbar title/breadcrumb, áp vào layout, giữ nguyên chức năng cũ (di chuyển `NotificationBell` v.v. sang topbar).
2. Mobile drawer + tinh chỉnh responsive các trang bị ảnh hưởng + e2e/axe.
3. Toast + EmptyState + focus ring; thay `alert()` hiện có ở 2–3 trang làm mẫu.

## Đã quyết (người dùng chốt 2026-07-04)

- **Thanh đáy mobile: GIỮ song song** với drawer; chỉ bỏ ở đợt sau khi người dùng đã quen drawer.
- Submenu sheet động trong sidebar: collapse group, mặc định mở (đề xuất được giữ).
