# M41 — Tối ưu responsive cho mobile

> **Trạng thái: KẾ HOẠCH — chưa triển khai.** 1 trong 4 module chạy song song — xem `docs/ke-hoach-ux-cai-tien-2026-07.md`.

## Bối cảnh hiện trạng (đã có, không làm lại)

- Sidebar mobile **đã là drawer** (`AppHeader.tsx`, xem `PROGRESS.md` mục PR 2.4): dùng `Modal` mount có điều kiện (`id="app-sidebar-mobile"`), mở bằng hamburger, đóng bằng Escape/backdrop/chọn mục — **đã xong, không làm lại phần này.**
- `ProgressMap.tsx` **đã responsive khá tốt**: cuộn ngang có gợi ý "← Vuốt ngang để xem đủ cột →" (dòng 127, chỉ hiện `sm:hidden`), cột Tầng sticky, width co theo `sm:w-20`/`w-16`. Chỉ còn thiếu sticky **header hàng** (đang làm ở M39 — module này không đụng lại `ProgressMap.tsx` để tránh trùng, chỉ nương theo kết quả M39 khi tích hợp).
- `:focus-visible` toàn cục đã chuẩn hoá (`app/globals.css` dòng 244-248).
- Breakpoints Tailwind mặc định (`sm:640px`, `md:768px`, `lg:1024px`) đã dùng nhất quán khắp app — **dùng đúng `sm`/`lg` sẵn có**, không định nghĩa breakpoint tuỳ biến mới (đề bài đề xuất mobile<640/tablet 640-1024/desktop>1024 khớp đúng `sm`/`lg` mặc định của Tailwind, không cần config thêm).

## Vấn đề còn thiếu (phạm vi module này)

### 1. `app/approvals/page.tsx` — bảng "Chờ nghiệm thu"/"Đã nghiệm thu" chưa có card view mobile

Hiện là `<table>` cuộn ngang thô (`overflow-x-auto`, `min-w-[560px]` dòng 392/430) — trên màn 375px phải cuộn ngang toàn bảng, khó dùng 1 tay.

**Yêu cầu**: thêm biến thể card cho `< 640px` (Tailwind: ẩn `<table>` bằng `hidden sm:block`, thêm `<div className="sm:hidden space-y-2">` render list card):
- Mỗi card: hàng đầu Hệ + Tầng nổi bật (`font-semibold`), thanh tiến độ full-width, số biên bản (badge), nút hành động ("Duyệt nghiệm thu"/"Huỷ NT") **full-width, tối thiểu 44px cao** (đổi từ `px-2.5 py-1.5` hiện tại thành `w-full py-3` trong biến thể mobile — có thể dùng cùng button nhưng className khác theo breakpoint, hoặc tách hàm `cardMobile(g, isPending)` riêng dùng chung logic `approveFloor`/`unapproveFloor`/`openDocsForGroup` đã có, chỉ đổi phần JSX).
- Toolbar filter/search (nếu M39 đã merge xong lúc module này tích hợp) phải hoạt động tốt trên mobile: input full-width, dropdown filter dùng `<details>` full-width thay vì popover hẹp. Nếu M39 CHƯA merge lúc module này code xong, tạm bỏ qua phần toolbar responsive, chỉ làm card view cho bảng — ghi rõ trong PR để làm nốt lúc tích hợp 2 nhánh.

### 2. `AppHeader.tsx` — kiểm tra kích thước chạm

- Rà mọi icon-button trong header (chuông, avatar, hamburger, theme toggle) — đảm bảo vùng chạm thực tế (kể cả padding) ≥ 44×44px trên mobile. Đọc file, đo `p-2`/`w-5 h-5` hiện tại (`NotificationBell.tsx` dòng 133 `p-2` quanh icon `w-5 h-5` = tổng ~36px — **dưới ngưỡng 44px**, cần tăng padding trên mobile, vd `p-2.5` hoặc thêm min-width/min-height qua class `min-w-[44px] min-h-[44px] flex items-center justify-center`).
- Áp dụng cùng chuẩn cho mọi icon-button tương tự trong `AppHeader.tsx` (theme toggle, project switcher trigger).

### 3. Bảng rộng cố định khác — rà soát tổng thể

```bash
grep -rln "min-w-\[" app --include="*.tsx"
```
Với mỗi kết quả: xác nhận đã bọc trong container `overflow-x-auto` riêng (không phải để tràn cả trang) — hầu hết đã đúng theo quy ước README ("Bảng dữ liệu dày: … cuộn ngang trong container riêng"), chỉ sửa những chỗ thực sự thiếu (nếu có) thay vì sửa hàng loạt không cần thiết.

### 4. Kiểm thử tràn ngang toàn trang ở 375px

- Test tay bằng DevTools responsive mode, width 375px, qua các trang chính: `/`, `/approvals`, `/tracking/[sheet]`, `/timeline`. Xác nhận `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (không tràn) trừ vùng bảng cố ý cuộn ngang.
- Nếu phát hiện tràn ngang ở trang cụ thể ngoài approvals (không thuộc phạm vi đề bài nhưng phát hiện lúc test), sửa nếu nhỏ (1-2 dòng); nếu lớn, ghi vào `PROGRESS.md` mục nợ kỹ thuật thay vì mở rộng phạm vi PR.

### 5. Tooltip hover-only → chuyển tap

- Rà các chỗ dùng `title="..."` làm tooltip duy nhất cho hành động quan trọng trên mobile (vd nút upload/link trong `approvals/page.tsx` dòng 316, 324 chỉ có `title`, không có label hiển thị) — `title` HTML native đã hoạt động bằng long-press trên hầu hết mobile browser nên **chấp nhận giữ nguyên** nếu không phải hành động chính; chỉ đổi những nút mà `title` là CÁCH DUY NHẤT hiểu chức năng và không có icon đủ rõ nghĩa — ưu tiên thêm `aria-label` (a11y) đồng thời, không nhất thiết đổi UI hiển thị chữ nếu icon đã đủ rõ (Upload icon, Link2 icon là chuẩn phổ biến).

## Không làm (out of scope)

- Không đổi lại sidebar/drawer (đã xong ở PR 2.4).
- Không thêm chế độ "xem 1 hệ" riêng cho `ProgressMap` mobile trong đợt này nếu tốn nhiều thời gian hơn dự kiến — ưu tiên card view approvals (giá trị cao hơn theo đề bài, PM/subcon dùng approvals nhiều hơn trên mobile). Nếu còn thời gian, làm thêm — không bắt buộc cho DoD.
- Không sửa `ProgressMap.tsx` (tránh trùng M39).

## Test & Definition of Done

- Test tay trên Chrome DevTools mobile emulation (375px) + thật nếu có thiết bị Android/iOS sẵn trong môi trường: card view approvals đọc được, nút bấm thoải mái bằng ngón tay, không tràn ngang trang.
- `npm run lint` + `npm run typecheck` xanh; `e2e/authed/approvals.spec.ts` (nếu có test viewport mobile theo pattern `authed-mobile` project trong Playwright config) vẫn pass — kiểm tra `playwright.config.ts` có project mobile không, chạy lại đúng project đó.

## Rủi ro trùng file với module chạy song song

- `app/approvals/page.tsx` cũng bị M39 sửa (toolbar filter/sort). **Thứ tự tích hợp đề xuất: M39 merge trước** (thêm toolbar + state lọc/sort), **M41 rebase sau** (thêm nhánh render card mobile dùng data đã lọc/sort từ M39) — nếu 2 nhánh code song song trước khi cái kia xong, chấp nhận PR M41 tạm thời chỉ card-hoá bảng chưa có toolbar, tích hợp thủ công (Opus) sau khi cả 2 xong thay vì chờ nhau.
