---
description: "Quy chuẩn UI/UX XBoss — tự động áp dụng cho mọi thay đổi frontend trong app/**/*.tsx và component giao diện."
---

# UI/UX frontend rule — XBoss

Mọi thay đổi UI phải theo workflow sau:

1. **Context trước style:** xác định role, device/context, primary task, information shape và failure
   risk. Tái sử dụng pattern hiện có trước khi tạo pattern mới.
2. **Đọc source of truth:** `design-system/xboss/MASTER.md` và
   `.agents/skills/ui-ux-craftsman/SKILL.md`. XBoss rules có precedence hơn external guidance.
3. **Dùng token/theme hiện hữu:** không `dark:`, không raw hex trong component, không thêm icon
   library. Giữ semantic accent/status và Lucide.
4. **Xét states theo capability:** loading, empty, data, error/retry, validation/conflict,
   offline/queued và forbidden; state không áp dụng thì N/A, không tạo giả.
5. **A11y/ergonomics:** semantic HTML, focus-visible, accessible name cho icon action, visible form
   label, error cụ thể, không color-only, reduced-motion; field/mobile action chính >=44px.
6. **Data-heavy UI:** numeric = `font-mono tabular-nums text-right`; table giữ khả năng so sánh;
   chart chọn theo câu hỏi nghiệp vụ và không gây hiểu sai.
7. **Motion/performance:** subtle + functional + interruptible; tránh decorative choreography,
   layout animation và dependency mới không cần thiết.
8. **Verify:** chạy `npm run check:ui-ux`, `npm run lint`, `npm run typecheck`; flow quan trọng
   chạy thêm Playwright desktop/mobile + axe.

Review theo **một outcome/risk cụ thể mỗi lượt**, không thay phân tích bằng checklist chung chung.
