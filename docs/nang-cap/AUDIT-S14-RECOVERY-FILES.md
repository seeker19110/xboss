# S14 nhỏ — kiểm file recovery theo manifest

State: **Approved for implementation**.
Chủ dự án duyệt QUALITY-FINAL-1 và yêu cầu triển khai việc nhỏ ngày 2026-09-25.
Spec cha: [A6 Operations](AUDIT-2026-09-25/A6-OPERATIONS.md), D08 và S14.
Đây là phạm vi con, không thay target hoặc dependency của đặc tả cha.

## Phạm vi và contract

Chỉ thêm scripts/verify-recovery-files.ts, test fixture, spec và tài liệu ops.
Không import app/env/DB, không chạy restore/migration hoặc truy cập production.
Không chồng file verifier DB/read-only của PR537; tích hợp hai công cụ là bước riêng.

Input: manifest JSON strict gồm specVersion, recoverySetId, appSHA, files, keyReferences
và staging root immutable. File có kind/path relative/sizeBytes/sha256. Không nhận raw key,
trường tự do, path absolute/traversal/control/backslash, symlink hoặc path trùng.
Output: JSON từng check PASS/FAIL/NOT_RUN; không in path, URI, exception hoặc secret.

## Tiêu chí chấp nhận

Kiểm SHA-256 bằng stream và size cho mọi file, không chỉ file đầu; thiếu/hỏng là FAIL.
Manifest không hợp lệ phải FAIL, không coi thiếu file là inventory rỗng hợp lệ.
Target, DB, audit, finance, key availability, WAL replay, RPO5m/RTO60m/PITR35days vẫn
NOT_RUN đến khi có bằng chứng diễn tập tương ứng. File đúng không chứng minh full DR.
Exit 1 nếu FAIL; 2 nếu còn NOT_RUN hoặc rỗng; 0 chỉ khi đủ checks đều PASS.

Manifest phải trusted/tamper-resistant và staging không được process khác thay cây thư
mục khi kiểm. Kiểm symlink không phải sandbox chống mọi parent rename race ở OS.
Key reference không đồng nghĩa key lấy được hoặc giải mã được ciphertext.

## Kiểm thử và vận hành

14 test native fs/crypto fixture, mutation bỏ checksum phải bị phát hiện.
Full CI/review trước merge; không dùng fixture thay backup/restore thật. Rollback bỏ tool
mới, không xóa backup/key/draft. Chưa đóng S14/A6 hoặc cấp quyền deploy/restore production.
