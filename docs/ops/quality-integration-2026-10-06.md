# QUALITY-FINAL-1 — Ứng viên tích hợp 2026-10-06

Baseline main: `a891d5aebdbda82ab268d3e86c35065e54eb1db4`. Dependency từ PR #573.

Tích hợp thử các bản vá hiện hữu, không ghi COMPLETE hoặc RELEASE_VERIFIED.
Nguồn được ghim SHA và đối chiếu refs/pull trước khi merge local trên runner:

- PR #571: `a1e2b8ab5d0156e10bea628434bc6db9bf500306`.
- PR #562: `567f0d4aa5f2031622e5d84807064445306f51d6`.
- PR #565: `a04e6873858e6eb23dbdae58b8054d915bef28f5`.
- PR #567: `7cdfdf8caa93f09260de295aed272f432366ad09`.
- PR #568: `59be1207eace6c69331b151ba0217a2439cbbc12`.
- PR #566: `4f07bf3f5fcfa8af099998179c961ee5bf8ed0c5`.
- PR #569: `ace034485e8c9b8f587d3f2463c8c756d1923f3e`.

Giữ thứ tự #566 trước #569. Xung đột code phải dừng, không chọn ours/theirs.
Chỉ vùng PROGRESS xung đột có hai phía thêm nội dung được union; kiểm không mất
dòng trong mỗi vùng. Thay đổi ngoài xung đột được git merge ba chiều giữ nguyên.
Run đầu dừng vì guard áp sai cả file vào cập nhật lịch sử không xung đột ở #562;
bản sửa thu hẹp đúng hunk, không bỏ kiểm xung đột hoặc xóa lịch sử.
Run kế phát hiện TS2741 ở fixture #571: ProcessEnv thiếu NODE_ENV. Đã thêm
NODE_ENV=test trên chính PR nguồn, không kế thừa env/secret của tiến trình cha.
Workflow tạm bị loại khỏi tree ứng viên, không sửa main/ref hoặc production.

Kiểm formatter/lint/typecheck và regression deploy/restore trước xuất candidate.
Full CI PostgreSQL/coverage/build/E2E phải chạy lại trên commit tích hợp cuối.
Review độc lập, credential migrator VPS và các AC còn lại trong #572 vẫn mở.
Ghi nhận chuẩn bị credential trong checkpoint cũ của #562 là lịch sử báo cáo,
không thay bằng chứng preflight/deploy thành công; N05 vẫn BLOCKED_ENV.
Không bật offline, đổi global money parser hoặc tuyên bố full PITR đã đạt.
