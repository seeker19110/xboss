---
description: "Quy chuẩn UI/UX & Triển khai giao diện XBoss — Áp dụng tự động cho mọi thay đổi Frontend (app/**/*.tsx, components, UI)"
---

# QUY CHUẨN THIẾT KẾ UI/UX & QUY TRÌNH TRIỂN KHAI FRONTEND XBOSS

Mỗi khi tạo mới hoặc sửa đổi trang/component giao diện trong `app/**` và `components/**`, AI Agent BẮT BUỘC tuân thủ:

1. **Quy trình 5 bước:**
   - **B1 (Bối cảnh):** Hiện trường (Mobile touch-first $\ge 44\text{px}$) | Dashboard (Bento Grid) | Bảng dữ liệu (Data-dense `font-mono tabular-nums`) | Phê duyệt (Stepper, Error prevention).
   - **B2 (Design Tokens):** Dùng thang `zinc` + biến CSS (`bg-background`, `bg-zinc-950`, `text-zinc-100`, `text-zinc-400`, `border-zinc-800`). **CẤM** dùng `dark:` và mã hex `#...`.
   - **B3 (5 Trạng thái):** Bắt buộc làm đủ Empty, Loading Skeleton (CLS < 0.1), Data Loaded, Error/Retry, Validation Feedback.
   - **B4 (A11y & Micro-Interactions):** Đủ trạng thái `hover`, `active`, `focus-visible`, `disabled`. Nút icon phải có `aria-label` và `title`.
   - **B5 (Verification):** Chạy `npm run lint` và `npm run typecheck`.

2. **Chi tiết tra cứu:** Đọc kỹ hướng dẫn tại [.agents/skills/ui-ux-craftsman/SKILL.md](file:///c:/Users/liend/xboss/.agents/skills/ui-ux-craftsman/SKILL.md).
