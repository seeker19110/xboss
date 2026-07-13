# Kế hoạch cải tiến UX 2026-07 — Filter/sort, sticky, thông báo, màu a11y, responsive

> Tổng quan đợt cải tiến UX gồm 5 hạng mục, triển khai qua 4 module đặc tả chi tiết (`docs/nang-cap/M38-M41.md`). Đọc file này để biết thứ tự phụ thuộc + cách tích hợp khi chạy song song nhiều agent; chi tiết kỹ thuật từng phần nằm trong file M-tương ứng.

## Danh mục module

| Module | Hạng mục gốc | Nội dung |
| --- | --- | --- |
| `M38-mau-token-tuong-phan.md` | 5 — Màu mù màu + tương phản | Icon/nhãn thứ 2 ngoài màu (ProgressMap, NotificationBell), audit `text-zinc-500/600` còn sót |
| `M39-bang-filter-sort-sticky.md` | 1 + 2 — Filter/search/sort + sticky | `TableToolbar` dùng chung, áp cho `/approvals`; sticky header hàng cho `ProgressMap` (cột đã sticky sẵn) |
| `M40-trung-tam-thong-bao.md` | 3 — Trung tâm thông báo | Tab/nhóm/click-through cho `NotificationBell` + trang `/notifications` mới |
| `M41-responsive-mobile.md` | 6 — Responsive mobile | Card view mobile cho `/approvals`, kích thước chạm ≥44px, rà tràn ngang |

Hạng mục 4 (không có trong đề bài gốc — số thứ tự nhảy 1,2,3,5,6) không thuộc phạm vi đợt này.

## Thứ tự phụ thuộc & rủi ro trùng file

- **M38 nên merge trước M40** — cả hai cùng sửa `NotificationBell.tsx`; M38 chỉ đổi màu/icon item (không đổi cấu trúc), M40 thêm tab/nhóm/click-through lên trên. Rebase M40 sau khi M38 vào `main`/nhánh tích hợp.
- **M39 nên merge trước M41** — cả hai cùng sửa `app/approvals/page.tsx`; M39 thêm toolbar filter/sort, M41 thêm card view mobile dùng data đã lọc. Rebase M41 sau M39.
- M38 (token màu) và M39 (bảng/sticky) **không đụng file nhau** — chạy song song an toàn.
- M40 (thông báo) và M41 (responsive) **không đụng file nhau** — chạy song song an toàn.

=> Thực tế triển khai: 4 agent chạy song song trong 4 worktree riêng biệt ngay từ đầu (không chờ nhau, đúng tinh thần "song song" của đề bài); vì rủi ro trùng file chỉ giữa (M38,M40) và (M39,M41), Opus (phiên chính) tích hợp thủ công theo đúng thứ tự trên sau khi cả 4 xong, xử lý conflict tay nếu có thay vì để agent tự merge chồng lên nhau.

## Quy trình mỗi module (nhắc lại, xem chi tiết trong `docs/nang-cap/README.md`)

lint + typecheck + test (+ build khi cần) xanh → tự review diff đúng phạm vi → verify tay tính năng thật (không chỉ dựa test) → commit tiếng Việt conventional → báo cáo lại để Opus tích hợp (KHÔNG tự mở PR riêng từ mỗi worktree — tích hợp về 1 nhánh `claude/table-filter-sort-search-nnng51` rồi mới push + mở PR draft duy nhất).

## Đợt 3 (sau khi tích hợp cả 4 module) — không giao agent, Opus tự làm

- Kiểm thử hồi quy toàn bộ (`npm test`, `npm run build`, Playwright nếu có).
- Đo lại tương phản/mù màu trên cả light lẫn dark cho các trang đã đổi.
- Kiểm thử responsive trên DevTools mobile emulation (thiết bị thật ngoài phạm vi môi trường CI).
- Đo hiệu năng bảng dài (approvals) sau khi thêm toolbar filter.
