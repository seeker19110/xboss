# QUALITY-FINAL-1 — Kết quả kiểm điều kiện VPS ngày 2026-10-06

## Phạm vi và kết quả

Theo lệnh thực thi đầu-cuối của chủ dự án, PR #575 chạy một kiểm tra chỉ đọc bằng
workflow tạm, không checkout hoặc chạy code/dependency PR với SSH key.
Dùng đúng tên credential của workflow deploy hiện hữu và bắt buộc host key đã ghim.
Không tạo secret mới hoặc hạ mức xác thực máy chủ.

Run `37492119330`, job `112367248282`, HEAD `9d54a129300b074dba7da3cd0589e244486b8d05`:

- BLOCKED: `VPS_SSH_KNOWN_HOSTS` không có giá trị khả dụng cho job.
- Bước kiểm dừng với exit 78 trước khi tạo file SSH hoặc kết nối VPS.
- NOT_RUN: đọc metadata credential migrator, SHA checkout và Node trên VPS.
- NOT_RUN: kiểm role PostgreSQL, migration, restart, deploy, smoke và nghiệm thu production.
- Không đọc/in giá trị credential migration, không sửa dữ liệu/quyền/cấu hình production.

Đây không phải bằng chứng file /etc/xboss/migrate.env đã được sửa hoặc vẫn thiếu ở thời điểm mới.
Lỗi deploy cũ ở #570 vẫn là bằng chứng gần nhất; N05 giữ BLOCKED_ENV cho tới khi xác minh thực.

## Điều kiện mở khóa

Người vận hành cần xác minh host key qua nguồn tin cậy của máy chủ rồi cấu hình secret
VPS_SSH_KNOWN_HOSTS trong phạm vi triển khai phù hợp. Không dùng ssh-keyscan không kiểm chứng
hoặc tắt StrictHostKeyChecking để né blocker. Không gửi SSH key/DB password vào chat/issue.
Sau đó kiểm file migrator riêng ngoài runtime, mode 0600, ownership và role đúng theo DEPLOY.md.
Kết quả file preflight đạt vẫn không thay thế kiểm DB role hoặc phát hành đúng release SHA.

## Dọn dẹp

Workflow chỉ đọc tạm được loại khỏi tree của nhánh sau lần chạy này. PR #575 không dùng để
merge workflow SSH vào main. Giữ tài liệu kết quả làm bằng chứng, không tự đóng N05/N12.
