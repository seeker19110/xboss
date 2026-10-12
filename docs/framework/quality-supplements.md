# Bổ sung chất lượng & năng lực

> **Trang mục lục** của 4 phần bổ sung. Đọc đúng phần cần — không nạp cả bốn mỗi phiên. Tên file này và cách
> đánh số mục được giữ nguyên nên tham chiếu kiểu "Nhóm 1/Nhóm 2 mục X" vẫn trỏ đúng chỗ.

| Phần | File | Nội dung |
| --- | --- | --- |
| 1 — Nhóm 1 | `docs/framework/quality-supplements-group1.md` | env validation, migration, PR template, ADR, npm audit, Vercel staging, DoR, sổ tay thuật ngữ `CONTEXT.md`, changelog tách khỏi PROGRESS.md, đồng bộ trạng thái duyệt |
| 2 — Nhóm 2 | `docs/framework/quality-supplements-group2.md` | mobile-first, hiệu năng/Lighthouse, E2E + a11y + coverage, UI/UX, chống lỗi logic, observability, tối ưu mã nguồn |
| 3 — Theme | `docs/framework/quality-supplements-theme.md` | Dark blue mặc định + Light, design tokens, WCAG AA cả hai chế độ |
| 4 — Nâng cao | `docs/framework/quality-supplements-advanced.md` | i18n · PWA · Sentry · SEO · Analytics |

> **Theo ADR-0004: repo khung KHÔNG còn kèm sẵn scaffold Web (Next.js/Supabase).**
> Mọi đường dẫn file trong các phần này (`lib/env.ts`, `app/*.tsx`, `styles/theme.css`, `i18n/*`,
> `e2e/*`, `lighthouserc.json`, `.github/workflows/lighthouse-ci.yml`...) là **ví dụ minh hoạ cho
> hồ sơ Web** (C-nào đó trong KHUNG-3 PHẦN C) — bạn tự tạo các file này ở dự án đích khi hồ sơ áp
> dụng là Web, không phải file có sẵn trong repo khung để copy thẳng. Hồ sơ khác thay bằng công cụ
> tương đương của hồ sơ đó.
