# /auto-complete 2026-10-12-hoan-thien-no-code — Hoàn thiện phần nợ làm được bằng code

- Trạng thái: Active
- Bắt đầu: 2026-10-12 · base `origin/main` `74bdce6` (+ PR #634 đang chờ CI — chứa chính lệnh này)
- Phạm vi: các khoản nợ **code** trong `docs/ops/lo-trinh-hoan-thien-2026-10-07.md` §0.3 ("Code nhỏ đã ghi
  nhận") + phát hiện mới trong lúc rà, đối chiếu lại với code thật trên main trước khi sửa · **KHÔNG làm:**
  N05/N09/N12 (VPS, PITR, deploy production), staging migration 0165–0169, bật `XBOSS_STRICT_MEMBERSHIP`,
  Safari/iOS thật, UAT/review độc lập (N03/N11), plugin AutoCAD, M60 major deps, `.env.example` (agent bị chặn
  đọc `.env.*` bởi `settings.json`), nợ `braces` (chờ upstream), DROP bảng `cost_settings` cũ (xoá dữ liệu
  thật — không tự quyết).
- Definition of Complete:
  1. Mọi mục §0.3 có kết cục: đã sửa (PR + test hồi quy) · đã xong từ trước (bằng chứng file:dòng) · chấp
     nhận/hoãn có lý do ghi `PROGRESS.md`.
  2. 0 phát hiện mức Cao còn mở trong phạm vi chạm; CI xanh trên `main` sau PR cuối.
  3. `npm audit --omit=dev` = 0; `npm run gate -- --test --build` xanh trên clone sạch.
  4. Lộ trình §0 + `PROGRESS.md` khớp code (không còn liệt kê nợ đã đóng).

## Kết quả đối chiếu §0.3 (W-001, HEAD `dc4c434`)

| §0.3                                  | Kết cục                    | Bằng chứng                                                                                       |
| ------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| 1 `POST /api/proposals` `Number`      | Đã xong trước (#601, #607) | `lib/tai-chinh/proposals.ts:50` `parseOptionalMoneyInput`; `route.ts:82-108` 1 transaction       |
| 2 `/decide` transaction               | Đã xong trước (#606)       | `app/api/proposals/[id]/decide/route.ts:48-108` `withTransaction` + FOR UPDATE                   |
| 3 Xoá user từng duyệt IPC             | Một phần → **F-003**       | 409 `dependency_conflict` (`app/api/users/[id]/route.ts:150-168`); chưa có vô hiệu hoá tài khoản |
| 4 `?baseline=` không kiểm dự án       | Đã xong trước (#604)       | `lib/tien-do/baseline-scope.ts:20-39`                                                            |
| 5 `mv_cost_by_month.committed` float8 | Đã xong trước (#603, #617) | `migrations/0159`, `0167` NUMERIC                                                                |
| 6 `cost_settings` toàn hệ             | Đã xong trước (#604)       | `0161` `org_cost_settings`; bảng cũ chờ DROP (không tự quyết)                                    |
| 7 Báo cáo cron tên dự án đầu          | Đã xong trước              | `app/api/cron/daily-report/route.ts:47-64` mỗi dự án 1 báo cáo; phụ: **F-007**                   |
| 8 Link `/tracking/<slug>` thiếu dự án | **Mở → F-008**             | `NotificationBell.tsx:166-170`, `notifications/all/page.tsx:27-30`, `assignments.ts:110,173,228` |
| 9 SoD đánh dấu chi chỉ so bước cuối   | **Mở → F-009**             | `lib/tai-chinh/payment-bills.ts:172-194`                                                         |
| 10 Job dọn staging mồ côi             | **Mở → F-010**             | `lib/tien-do/anh-staging.ts:87-121` chỉ dọn của chính actor khi upload                           |
| 11 mepf-process `fixme` a11y          | Đã xong trước (#556)       | `e2e/authed/luoi-quet-axe.spec.ts:101` OK_ROUTES; còn đúng 1 fixme `/schedule` → **F-011**       |

Phát hiện mới: **F-012** `app/api/suppliers/[id]/ratings/route.ts` dùng `canRate` cục bộ ngoài `CAN`
(`lib/bao-mat/auth.ts:315-319`); **F-013** `attendance` thiếu UNIQUE chấm gộp/từng người (`lib/vat-tu/resources.ts:88-91`).

## Kế hoạch

| ID    | Việc (F-xxx gốc)                                                    | Mức | route   | Phụ thuộc | PR · merge SHA   | Trạng thái · bằng chứng                                   |
| ----- | ------------------------------------------------------------------- | --- | ------- | --------- | ---------------- | --------------------------------------------------------- |
| W-000 | PR #634 (lệnh `/auto-complete`) xanh + merge                        | S   | tự làm  | —         | #634 · `82829ff` | Xong — mọi check xanh, merge squash                       |
| W-001 | Đối chiếu 11 mục §0.3 với code main                                 | —   | Explore | —         | —                | Xong — bảng trên                                          |
| W-002 | F-008 link thông báo/push mang dự án, đổi dự án trước khi mở (M132) | M   | tự làm  | W-000     |                  | Đã code + test (5/5 cục bộ trên Postgres 16); đang review |
| W-003 | F-009 SoD đánh dấu chi: chặn mọi người đã duyệt + người lập (M133)  | M   | tự làm  | W-002     |                  |                                                           |
| W-004 | F-003 vô hiệu hoá tài khoản thay xoá (M134, migration + auth §8)    | M   | tự làm  | W-003     |                  |                                                           |
| W-005 | F-012 ratings qua `CAN` + F-011 gỡ fixme `/schedule`                | S   | tự làm  | W-004     |                  |                                                           |
| W-006 | F-010 job dọn staging ảnh mồ côi theo lịch                          | M   | tự làm  | W-005     |                  |                                                           |
| W-007 | Đồng bộ lộ trình §0.3 + `PROGRESS.md` + nợ chấp nhận (F-007, F-013) | S   | tự làm  | W-006     |                  |                                                           |

## Quyết định và bằng chứng

- Mục tiêu trống → lấy "hoàn thiện phần nợ code" của lộ trình §0.3 · loại "toàn bộ sổ nợ N01–N12" (phần lớn
  là vận hành/môi trường, nằm trong danh sách không tự quyết) · bậc 1 · lộ trình §0.2–§0.3.
- PR #634 đổi tiêu đề `feat` → `chore` · loại "viết đặc tả docs/nang-cap giả để qua cổng" · bậc 2 (ít hơn; thay
  đổi chỉ chạm công cụ agent, cùng loại #632 `chore`) · log job `metadata`: "PR feat phải liên kết spec".
- Làm tuần tự từng PR trên nhánh chỉ định của phiên · loại song song worker (nhánh riêng + xung đột
  `PROGRESS.md`) · bậc 2 · phiên cloud chỉ được push nhánh `claude/wonderful-newton-0bwd2e`.
- Thứ tự W-002 → W-003 → W-004 trước việc Thấp · bậc 1 (sai dự án khi tick, SoD tiền, tài khoản không khoá được
  là rủi ro đúng/bảo mật; staging mồ côi chỉ tốn đĩa).
- F-007 (`REPORT_EMAIL_TO`/`TELEGRAM_CHAT_ID` nhận báo cáo mọi org) → chấp nhận rủi ro, ghi nợ · loại "tách người
  nhận theo org" (cần biến môi trường/cấu hình mới trên production = không tự quyết) · bậc 1 · triển khai hiện
  một org.
- M132: link mang `?project=` + cổng trên trang tracking đổi dự án · loại "chặn link khác dự án, chỉ báo lỗi"
  (người dùng phải tự đổi dự án rồi tìm lại) và "slug toàn cục" (đảo migration 0161) · bậc 2 · đặc tả M132.
- M132: tách thủ tục đổi dự án thành `app/lib/chuyenDuAn.ts` dùng chung với `ProjectSwitcher` · loại chép lại
  thủ tục trong cổng (lệch S05/S08 khi một bên đổi) · bậc 2.
- M132: không viết e2e riêng cho cổng · loại spec Playwright 2 dự án (fixture e2e chỉ có 1 dự án, dựng thêm tốn
  hơn giá trị) · bậc 3 · logic quyết định thuần đã test đơn vị, server trả `projectId` đã test DB.
- Review W-002 (`reviewer` + `audit-ui`): chặn — cổng chỉ chạy lúc mount nên `router.push` cùng slug sang dự án
  khác giữ lưới cũ → cổng theo `useSearchParams` (bọc Suspense) · sửa trong PR. Kèm: 401 → `redirectToLogin`,
  403 `2fa_required` → trang bật 2FA; màn lỗi thêm "Về trang chủ"; push bình luận
  (`app/api/tasks/[id]/comments`) cũng mang dự án; đọc cookie dự án dùng chung `duAnDangChon` (bỏ
  `decodeURIComponent` có thể ném). Để lại (Thấp): nhãn riêng "đang chuyển dự án", `role="alert"`/icon của
  `ErrorState` dùng chung, một nhịp skeleton khi mở trang tracking — giữ để không đổi component dùng chung.
- Link chia sẻ trong `/my-tasks`, `GlobalSearch`… không thêm dự án · bậc 2 · các API đó đã lọc theo dự án đang
  chọn nên link luôn cùng dự án hiện tại.
- Gate cục bộ: 3 file test DR/restore/migration-boundary đỏ do thiếu biến `RESTORE_TEST_*` chỉ CI đặt · không
  liên quan diff · CI quyết định.
- F-013 (UNIQUE `attendance`) → hoãn, ghi nợ · loại "thêm UNIQUE ngay" (dữ liệu production có thể đã trùng →
  migration hỏng hoặc phải xoá/gộp dữ liệu thật = không tự quyết) · bậc 1.

## Bàn giao / bước tiếp theo

- Nhận kết quả `reviewer` + `audit-ui` cho diff W-002, sửa mục chặn, `npm run gate -- --test --build`, commit, push
  (force-with-lease: nhánh chỉ còn lịch sử đã merge), mở PR M132 và theo tới merge.
