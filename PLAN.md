# PLAN.md — M124: bố cục màn hình chứng từ (DocShell) + áp cho `/payment-certs`

**Cập nhật:** 2026-09-21 · **Đặc tả:** `docs/nang-cap/M124-bo-cuc-man-hinh-chung-tu.md` (Approved) ·
**Mockup:** https://claude.ai/artifact/2kcKEuoLSb1udqkGKgb79w
**Nhánh làm việc:** `claude/sleepy-planck-hvfnva` (= `origin/main` @ `b6d9b29c` + commit đặc tả `5d0da4a5`). Worker code
**thẳng trên nhánh này** (1 việc tuần tự, không worktree). **Trạng thái:** CHỜ THI HÀNH.

## Ràng buộc CỨNG

- Worker không thấy hội thoại. Bắt buộc đọc trước: `CLAUDE.md` (mục Thiết kế giao diện + Quy ước),
  `docs/adr/0009-bo-component-ui-nen.md`, `docs/adr/0010-*.md` (tương phản), toàn bộ
  `docs/nang-cap/M124-bo-cuc-man-hinh-chung-tu.md`, `app/components/ui/*.tsx`,
  `app/components/AppHeader.tsx:395–416` (thanh đáy `bottomActions`), `app/payment-certs/page.tsx`,
  `app/components/MaskedValue.tsx` + `app/lib/masked.ts`, `e2e/authed/payment-certs.spec.ts`.
- **Không** đổi API/lib/migration. Không đụng `AppHeader`. Không `dark:`, không hex, không class nút
  viết tay (mọi nút qua `Button`). Mọi số tiền qua `MaskedValue`.
- Tiếng Việt cho comment/commit/UI. Worker **commit** trên nhánh, **không push**.
- Cổng: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:contrast`,
  `npm run check:mau-accent`, `npm run check:lib-layers`, `npm test` xanh. e2e: nếu Playwright chạy
  được trong môi trường thì chạy `npx playwright test e2e/authed/payment-certs.spec.ts`; không chạy
  được thì ghi rõ trong báo cáo (không được sửa spec e2e).

## Việc A — DocShell + `/payment-certs` master–detail — `route: complex`

**Brief:** thi hành đúng §7 (FR1–FR8, NFR1–4) và §9 của đặc tả M124. Tách `CertDetailModal` thành
`app/payment-certs/_components/CertDocument.tsx`, giữ nguyên các hàm `saveItems/submitCert/decide`
và mọi chú thích tiếng Việt hiện có (chúng giải thích quyết định audit). Danh sách trái + chứng từ
phải theo §6.

**Ranh giới được phép quyết:** khoảng cách/padding cụ thể, thứ tự cột phụ trong lưới, cách tách
state URL (`useSearchParams` + `router.replace`, xem mẫu `HubShell.tsx`), có dùng `StatCard` của ui
cho 3 thẻ hợp đồng hay giữ markup cũ. **Không được quyết:** đổi API, thêm khối Đính kèm, đổi title
`<header>` "Thanh toán khối lượng", thêm thư viện.

**Tiêu chí chấp nhận:** AC1–AC6 của đặc tả. Kèm cập nhật `docs/adr/0009-bo-component-ui-nen.md`
(mục mới "Màn hình chứng từ — M124": 4 component + quy ước toolbar trên `hidden md:flex`, thanh
đáy mọi breakpoint), `PROGRESS.md` (mục "✅ M124 …" ở đầu phần đã làm, ghi file chạm),
`docs/nang-cap/README.md` (thêm dòng M124 ✅ vào bảng đặc tả).

**Commit:** `feat(ui): M124 — bố cục màn hình chứng từ (DocToolbar/DocField/DocTotals/Kbd) + /payment-certs master–detail`.

## Sau Việc A

Coordinator gọi `reviewer` soát diff theo `docs/audit.md` mục UI/UX & a11y + kiểm AC6 bằng grep.
Lỗi nhỏ (lint/typo/class lệch ADR) → giao lại worker sửa; lệch đặc tả → dừng, báo phiên chính.
Báo cáo cuối: danh sách file, kết quả từng cổng, ảnh chụp (nếu chạy được `npm run dev` +
Playwright screenshot 1280px và 390px), điểm còn nợ.

## Việc B — Trang chủ mạch lạc (M125) — `route: complex` — CHẠY SAU Việc A (dùng `DocToolbar`/`Kbd`, chung file docs)

**Đặc tả:** `docs/nang-cap/M125-bo-cuc-trang-chu.md` (Approved). Mockup:
https://claude.ai/artifact/8BR2JgohGtsPbcTZq5PvCX. Ràng buộc CỨNG như trên (đọc thêm
`app/page.tsx` toàn bộ, `app/components/ui/DocToolbar.tsx` do Việc A tạo, e2e trang chủ).

**Brief:** sắp xếp lại `app/page.tsx` theo §5 của M125, thêm `Tabs` (FR1), `ProgressRow` (FR2),
`HomeRail`; thay nút viết tay bằng `Button`/`ButtonLink` (FR3). **Không đổi** bất kỳ panel
component nào, không đổi API. Tiêu chí AC1–AC6.

**Ranh giới được phép quyết:** tab mặc định (phải giữ e2e xanh), thứ tự `SpiCards`/`ForecastCards`
trong rail, cách lưu tab (URL bắt buộc, localStorage tuỳ chọn), khoảng cách. **Không được quyết:**
thêm KPI cần API mới, sửa panel con, sửa spec e2e.

**Commit:** `feat(ui): M125 — trang chủ mạch lạc: toolbar + dải số liệu + thân 2 cột, thẻ tiến độ có tab`.
Cập nhật `PROGRESS.md`, `docs/nang-cap/README.md`, ADR-0009 (mục Tabs) cùng commit.
