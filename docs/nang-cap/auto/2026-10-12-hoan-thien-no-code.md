# /auto-complete 2026-10-12-hoan-thien-no-code — Hoàn thiện phần nợ làm được bằng code

- Trạng thái: Waiting — CI PR #634 (test Postgres/e2e/build đang chạy) + agent Explore đối chiếu §0.3; cả hai tự đánh thức phiên
- Bắt đầu: 2026-10-12 · base `origin/main` `74bdce6` (+ PR #634 đang chờ CI — chứa chính lệnh này)
- Phạm vi: các khoản nợ **code** trong `docs/ops/lo-trinh-hoan-thien-2026-10-07.md` §0.3 ("Code nhỏ đã ghi
  nhận") + phát hiện mới trong lúc rà, đối chiếu lại với code thật trên main trước khi sửa · **KHÔNG làm:**
  N05/N09/N12 (VPS, PITR, deploy production), staging migration 0165–0169, bật `XBOSS_STRICT_MEMBERSHIP`,
  Safari/iOS thật, UAT/review độc lập (N03/N11), plugin AutoCAD, M60 major deps, `.env.example` (agent bị chặn
  đọc `.env.*` bởi `settings.json`), nợ `braces` (chờ upstream).
- Definition of Complete:
  1. Mọi mục §0.3 có kết cục: đã sửa (PR + test hồi quy) · đã xong từ trước (bằng chứng file:dòng) · chấp
     nhận/hoãn có lý do ghi `PROGRESS.md`.
  2. 0 phát hiện mức Cao còn mở trong phạm vi chạm; CI xanh trên `main` sau PR cuối.
  3. `npm audit --omit=dev` = 0; `npm run gate -- --test --build` xanh trên clone sạch.
  4. Lộ trình §0 + `PROGRESS.md` khớp code (không còn liệt kê nợ đã đóng).

## Kế hoạch

| ID    | Việc (F-xxx gốc)                             | Mức | route   | Phụ thuộc | PR · merge SHA | Trạng thái · bằng chứng                                                  |
| ----- | -------------------------------------------- | --- | ------- | --------- | -------------- | ------------------------------------------------------------------------ |
| W-000 | PR #634 (lệnh `/auto-complete`) xanh + merge | S   | tự làm  | —         | #634           | Đang chờ CI; `metadata` đỏ vì tiêu đề `feat` không có spec → đổi `chore` |
| W-001 | Đối chiếu 11 mục §0.3 với code main          | —   | Explore | —         | —              | Đang chạy                                                                |

## Quyết định và bằng chứng

- Mục tiêu trống → lấy "hoàn thiện phần nợ code" của lộ trình §0.3 · loại "toàn bộ sổ nợ N01–N12" (phần lớn
  là vận hành/môi trường, nằm trong danh sách không tự quyết) · bậc 1 · lộ trình §0.2–§0.3.
- PR #634 đổi tiêu đề `feat` → `chore` · loại "viết đặc tả docs/nang-cap giả để qua cổng" · bậc 2 (ít hơn; thay
  đổi chỉ chạm công cụ agent, cùng loại #632 `chore`) · log job `metadata`: "PR feat phải liên kết spec".

## Bàn giao / bước tiếp theo

- Chờ kết quả đối chiếu §0.3 (agent Explore) + CI PR #634; rồi lập bảng W-xxx cho các mục còn OPEN.
