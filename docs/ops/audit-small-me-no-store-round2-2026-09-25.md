# Phiên hiện tại: no-store trên mọi nhánh response

Trạng thái: bản vá đã kiểm thử cục bộ, được đưa lên nhánh riêng để CI/review; chưa merge/deploy.
Baseline: `381b06899b3eb5d9e1b2c99b167d51cc24419732`.
Căn cứ: chủ dự án yêu cầu tiếp tục các việc nhỏ song song, trong QUALITY-FINAL-1.
Liên hệ đặc tả: A2-FR01: không cache danh tính. Không thay lựa chọn D01–D09.

## Phạm vi và file lock

Sửa `app/api/auth/me/route.ts`, thêm `tests/audit-small-me-no-store.test.ts` và tài liệu này.
Thêm Cache-Control private, no-store cho anonymous401, user200 và mustSetup2fa200; giữ nguyên payload và không seed user.

## Kiểm chứng

5 test source/VM đạt, không skip. Đã chạy trước bản vá để tái hiện failure và chạy lại
sau sửa. Test không import Next, DB hoặc React thật; các biên đó được stub để kiểm hành vi.
Kiểm thử song song là bốn process Node, không tuyên bố có subagent.
Full formatter/lint/typecheck/build/DB/E2E của repo phải chạy trên commit tích hợp.

## Giới hạn và rollback

Chỉ chỉ thị HTTP; không thay Service Worker, không xóa cache cũ và không chứng minh toàn A2.
Không thay CI/lockfile/schema hoặc dữ liệu production. Nếu bản vá hồi quy, revert đúng commit
trên nhánh qua review; không khôi phục lỗi đã biết bằng cách tắt cổng kiểm chứng. Bản vá không
chạy backfill hoặc reset dữ liệu nên không có dữ liệu runtime do nó tạo cần đảo ngược.

Nguồn mã đã đọc: https://github.com/seeker19110/xboss/blob/381b06899b3eb5d9e1b2c99b167d51cc24419732/app/api/auth/me/route.ts
