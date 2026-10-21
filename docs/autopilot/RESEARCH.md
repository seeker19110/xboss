# Research và thiết kế — 22/10/2026

Base `a723c578`, package range Playwright `^1.61.1`, lock thực tế 1.63.0; Node 24, PostgreSQL 16 disposable.
Giữ stack/kiến trúc hiện hành: `docs/adr/0001-postgres-raw-sql.md`, `PROJECT.md`, `docs/ERD.md`; không thay schema hoặc API.

## Nguồn sống đã kiểm

- [Playwright isolation](https://playwright.dev/docs/browser-contexts): context tách cookie/storage; dùng fixture context riêng và storageState rỗng.
- [Evaluate](https://playwright.dev/docs/evaluating), [fetch credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials): browser fetch cùng origin gửi cookie và chờ Promise.
- [APIRequestContext](https://playwright.dev/docs/api/class-apirequestcontext): `page.request` chia sẻ cookie jar với context. Dùng evaluate để đo request từ browser, không khẳng định `page.request` luôn mất cookie.
- [Mock APIs](https://playwright.dev/docs/mock): route.fulfill có thể thay backend. Suy luận áp dụng: mocks #662 kiểm UI recovery, chưa thay được bằng chứng scope/auth/SQL.
- newContext/evaluate có trước 1.9, tương thích lock 1.63. Không dùng addCookies của APIRequestContext mới từ 1.64.

## Contract hiện hành và threat model của slice

Browser → session cookie → API auth/quyền/project-org scope → raw SQL PostgreSQL.
Cost API dùng `X-XBoss-Money-Format: decimal-string-v1`; lỗi 403 được kiểm cả body lẫn DOM.
Không tin query `org` hoặc project id từ client; grant user_projects sai org vẫn không cấp quyền org khác.
Fixture chỉ INSERT vào org/project/user mới bằng ID do DB cấp, password test scrypt; không đọc/chạm chứng từ thật.
Test không thay role policy, không tạo export; query export dùng để chứng minh không vượt cổng 403.

## Harness và phạm vi nghiệm thu

G1 sinh blueprint web-app + saas-multitenant L: 1152 MUST / 639 SHOULD. Chưa có audit toàn sản phẩm nên giữ mở.
D-002 chọn toàn bộ acceptance A4-AC06 làm điều kiện của loop test này; không xóa, tick khống hoặc miễn các MUST sản phẩm.
Doctor 2.0.0 regex `HOOK_SIBLING_RE` bắt `..` trong đường dẫn tương đối rồi kiểm như tên file; directory không phải file.
Các hook thực tế và test hồi quy được kiểm riêng; không sửa checker/hook hoặc đổi threshold trong slice.
Theo skill, muốn sửa cài đặt hook cần người chạy `python3 <bản clone X-Templates>/scripts/install.py <gốc dự án>`; trường hợp regex false positive cần bản vá checker được review.

Lịch sử PROGRESS giữ nguyên tại `PROGRESS-HISTORY-2026-10-22.md`, SHA256 `ce10b14403c8be6fdba16cb755e0b6c919d3552624a3f39b3862d4f95edc8009`.

## Tương tác fixture phát hiện qua CI (D-006)

`lib/ha-tang/projects.ts::visibleProjectIds` chỉ dùng fallback legacy khi toàn bảng `user_projects` rỗng. A4 cần membership thật để kiểm visibility nên làm các tài khoản demo/PM cũ không có grant mất dự án. Đây là điều kiện fixture; không sửa policy ứng dụng.

Đối chứng: home chạy riêng trên seed rỗng 5/5 pass. Cùng DB, một ca A4 Portfolio chạy trước hai ca home desktop: A4 pass, cả hai home fail; snapshot hiện đúng “Bạn chưa được gán dự án nào”. CI shard 1 và 3 cũng fail hai ca home desktop/mobile. Không tăng timeout hoặc xoá membership toàn cục.

D-006 chuẩn hoá global E2E seed và helper tổ chức cô lập với membership cùng org rõ ràng; fixture A4 opt-out để giữ subset/foreign-grant cố ý. T-010 chạy chung A4/home/IPC/offline để kiểm tương tác. Đây là thay đổi fixture test, không cutover production.

Sau sửa: T-010 có 43 pass, 2 skip đúng điều kiện desktop của hai ca chỉ dành mobile; typecheck xanh. Reviewer độc lập đã rà diff và caller của helper, không có finding actionable. `feedback collect` lần cuối không có tín hiệu framework mới.
