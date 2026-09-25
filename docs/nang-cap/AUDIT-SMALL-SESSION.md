# Việc nhỏ độc lập — khóa ký phiên production

State: **Approved for implementation**, 2026-09-25.
Căn cứ: chủ dự án đã chốt QUALITY-FINAL-1 và yêu cầu triển khai các việc nhỏ song song.
Baseline đọc và đối chiếu blob: 381b06899b3eb5d9e1b2c99b167d51cc24419732.

## Phạm vi và bằng chứng

lib/bao-mat/session-token.ts còn trả khóa ký dự phòng cố định khi production thiếu
XBOSS_SECRET, trái hợp đồng fail-closed. parseToken chưa kiểm số nguyên an toàn của
uid/exp/orgId/sv; Buffer.from(hex) có thể bỏ hậu tố MAC không hợp lệ.
Đã đọc source và tests/auth.test.ts; không sửa makeToken signature, login hoặc 2FA payload.

Khóa file: session-token.ts, tests/audit-session-secret.test.ts và tài liệu này.
Không chồng nhánh cost, DR, IndexedDB hoặc cache. Không thay env/schema/token version.

## Contract và nghiệm thu

Production thiếu/rỗng/trắng khóa phải throw khi ký/xác minh; import/build vẫn lazy.
Dev/test giữ fallback. Token hợp lệ giữ bảy trường và chữ ký như trước. Token số sai,
vượt safe integer, hết hạn tại exp, MAC dư byte/ký tự bị từ chối trước khi trả identity.
Không log token/secret hoặc tự đặt/đổi khóa production.

11 ca unit dùng source thật với crypto Node thật và env/clock VM riêng. Cả hai mutation:
khôi phục khóa dự phòng và bỏ kiểm toàn MAC đều bị test phát hiện. Chạy đồng thời suite
cost và DR trong ba process riêng; không tuyên bố có subagent hay browser/DB thực ở local.
Local Node 22 + TypeScript loader; CI Node 24/full gates phải kiểm đúng HEAD trước merge.

## Rollout và giới hạn

Người vận hành kiểm XBOSS_SECRET đã được cấp an toàn trước deploy. Môi trường trước đây
thiếu khóa sẽ không đăng nhập được cho tới khi sửa cấu hình: đây là fail-closed có chủ đích.
Khi cấu hình khóa mới, cookie ký bởi khóa dự phòng cũ không còn hợp lệ. Không rollback về
khóa dự phòng công khai. Không tự thu hồi tài khoản hoặc triển khai production trong PR.

Chưa đóng S01 về membership/org-session/cache quyền; không thay việc kiểm org từ DB.
Chưa xác nhận có khai thác trên production. CI xanh không chứng minh cấu hình production.
