# Offline: khóa vòng gửi trong tab và đánh thức batch

Trạng thái: bản vá đã kiểm thử cục bộ, được đưa lên nhánh riêng để CI/review; chưa merge/deploy.
Baseline: `381b06899b3eb5d9e1b2c99b167d51cc24419732`.
Căn cứ: chủ dự án yêu cầu tiếp tục các việc nhỏ song song, trong QUALITY-FINAL-1.
Liên hệ đặc tả: A2: vòng flush có khóa; bổ sung hẹp trước lease/receipt đầy đủ. Không thay lựa chọn D01–D09.

## Phạm vi và file lock

Sửa `app/components/offlineQueue/index.ts`, thêm `tests/audit-small-offline-flush.test.ts` và tài liệu này.
Đặt khóa trước lần await đầu tiên và giữ qua refreshStats; finally giải phóng khóa/tắt sending kể cả storage lỗi. Batch sau lưu kích hoạt afterEnqueue như tick đơn.

## Kiểm chứng

14 test source/VM đạt, không skip. Đã chạy trước bản vá để tái hiện failure và chạy lại
sau sửa. Test không import Next, DB hoặc React thật; các biên đó được stub để kiểm hành vi.
Kiểm thử song song là bốn process Node, không tuyên bố có subagent.
Full formatter/lint/typecheck/build/DB/E2E của repo phải chạy trên commit tích hợp.

## Giới hạn và rollback

Không chống gửi trùng giữa tab/process/server; không đổi queue schema, ownership, vault, retry4xx hoặc hành vi clear/logout. Không khẳng định exactly-once.
Không thay CI/lockfile/schema hoặc dữ liệu production. Nếu bản vá hồi quy, revert đúng commit
trên nhánh qua review; không khôi phục lỗi đã biết bằng cách tắt cổng kiểm chứng. Bản vá không
chạy backfill hoặc reset dữ liệu nên không có dữ liệu runtime do nó tạo cần đảo ngược.

Nguồn mã đã đọc: https://github.com/seeker19110/xboss/blob/381b06899b3eb5d9e1b2c99b167d51cc24419732/app/components/offlineQueue/index.ts
