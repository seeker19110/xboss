---
paths:
  - "app/**/*.tsx"
  - "app/globals.css"
---

# Checklist khi chạm giao diện (XBoss)

- **Dark-first**: viết class cho nền tối; light tự đảo qua biến CSS `html.light`. **Không**
  `dark:`, **không** `transition-all`, **không** mã hex trong component (cổng
  `check:ui-ux-guard`, `check:hex-hardcode`). Ngoại lệ có chủ đích: style PDF trong `app/api/**`.
- Thang `zinc` cho nền/chữ/viền, accent mức `-300/-400`; màu trạng thái theo `lib/tien-do/status.ts`.
- Dùng `app/components/ui/` (`Button`, `Card`, `Chip`, `Section`, `StatCard`) trước khi tự viết;
  emerald = đang chọn/hành động chính; nút ≥ 40px; nút màu đặc **đậm dần** khi hover
  (`bg-{c}-700 hover:bg-{c}-800`). Lỗi tương phản ở mức token → sửa `globals.css`
  (`check:mau-accent`, `check:contrast`).
- 4 trạng thái màn hình dữ liệu: `Skeleton` khi tải, rỗng có gợi ý, lỗi thân thiện + thử lại,
  có dữ liệu. `fetch` ghi dữ liệu có `try/catch`, nút submit disable + loading, thất bại giữ
  nguyên dữ liệu đã nhập; optimistic UI phải rollback + báo lý do.
- Mobile công trường: ô nhập ≥ 16px dưới `sm`, safe-area, bảng dày sticky header + cuộn ngang.
- Nút icon-only có `aria-label` tiếng Việt; không truyền thông tin chỉ bằng màu.
- Trang/luồng mới cần spec axe `e2e/authed/*.spec.ts` (desktop + mobile, không `serious`/`critical`).
- Nguồn chuẩn: `design-system/xboss/MASTER.md`, ADR-0009/0010, `docs/audit.md` §5 + Phụ lục A.
  Review: `audit-ui`; `ecc-a11y-architect`/`ecc-react-reviewer` cho góc nhìn chung.
