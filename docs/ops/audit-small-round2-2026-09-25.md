# Bàn giao bốn bản vá nhỏ — 2026-09-25

Bản vá so với main `381b06899b3eb5d9e1b2c99b167d51cc24419732`, được đối chiếu lại trước
commit theo yêu cầu chủ dự án ngày 2026-09-25. Nhánh `fix/audit-small-round2-20260925`,
đích PR là `main`; chưa merge/deploy. Bốn file code khác nhau, bốn file test khác nhau;
PROGRESS do một đầu mối cập nhật sau khi ghép đủ bốn, không giao nhiều worker sửa chung.

## Kết quả đã có

Project-ID 32 test, login JSON 18, auth/me no-store 5, offline flush 14: tổng 69 pass,
0 fail/skip qua bốn process đồng thời. Baseline trước sửa có 20 ca fail ở bốn nhóm;
sau sửa không còn fail. Sáu biến thể cố ý khôi phục lỗi đều bị test phát hiện.
Typecheck strict test mới/fixtures bằng TS5.8.3 đạt; code ứng dụng được transpile và thực
thi trong VM. Đã chạy lại cả bốn nhóm trước commit: 69 pass, 0 fail/skip.
Không có full typecheck TS của repo, formatter/lint/build, DB/browser hay kết luận CI.
Không tải được formatter do DNS của container; không coi chỉnh định dạng thủ công là
Prettier đã đạt. Các cổng của repo phải kiểm đúng HEAD trong PR.

## Tích hợp

Đối chiếu main và PR đang mở trước khi áp. Không tạo lại các việc money/store/token/cache/
cost/DR đã có ở nhánh khác. Kiểm blob/hash và `git apply --check` trước apply; không ghi đè
file mới của người dùng. Tạo commit riêng mỗi nhóm, PROGRESS do coordinator ghép cuối.
Chạy formatter theo lockfile, lint, typecheck, targeted tests và full CI đúng HEAD; không
skip/hạ ngưỡng hoặc sửa whitelist để đạt. Production cần cổng/approval riêng.

## Các giới hạn còn nguyên

Cờ flush chỉ bảo vệ cùng tab, không thay lease nhiều tab/receipt/backend idempotency.
Queue cũ còn retry/logout/ownership chưa theo toàn A2; patch không đánh dấu 54 AC đã đạt.
No-store HTTP không sửa cache cũ hoặc bảo đảm revocation khi offline. Project validation
chỉ là boundary route, không thay quyền người dùng hoặc tổ chức. Không sửa tiền, schema,
backup, secret hay dữ liệu thật. Các test mô phỏng không thay DB/browser verification.
