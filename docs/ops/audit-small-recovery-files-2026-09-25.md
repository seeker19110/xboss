# S14 nhỏ — verifier file recovery chỉ đọc

State: **Approved for implementation** theo QUALITY-FINAL-1, D08 và yêu cầu chủ dự án
ngày 2026-09-25. Spec: ../nang-cap/AUDIT-2026-09-25/A6-OPERATIONS.md.
Base đọc: 381b06899b3eb5d9e1b2c99b167d51cc24419732.

## Phạm vi

Chỉ scripts/verify-recovery-files.ts, tests/audit-recovery-files.test.ts và tài liệu này.
Đây là phần kiểm file dùng để ghép vào verifier DR hiện hữu, chưa thay thế toàn bộ
verify-dr-restore/verify-audit-chain. Không import lib/db, không env tự động, không mở
kết nối hoặc chạy restore/migration. Không đổi CI, dependency, backup thật hoặc production.

Manifest file gồm specVersion=QUALITY-FINAL-1, recoverySetId kỹ thuật, appSHA 40 hex,
files và keyReferences. Mỗi file có kind (base_backup/wal/attachment/migration), path
relative, sizeBytes integer an toàn và sha256 lowercase. Cấm trường ngoài contract,
path trùng, path traversal/absolute/control/backslash và symlink. Không chứa raw key.
Tham chiếu key chỉ có nghĩa là ID phiên bản; chưa chứng minh lấy được hoặc giải mã được key.

Cần staging immutable do operator chuẩn bị trong vùng được phép đọc. Kiểm từng file
bằng stream SHA256, không nạp toàn archive vào RAM; đối chiếu size trước/sau. Không cho
process khác thay cây thư mục khi kiểm; kiểm symlink không phải sandbox chống mọi cuộc
đua rename ở cấp hệ điều hành. Không in path/exception/secret trong báo cáo lỗi.

## Chạy và ý nghĩa kết quả

```bash
npx tsx scripts/verify-recovery-files.ts --manifest recovery-files.json --root staging
```

stdout là JSON PASS/FAIL/NOT_RUN theo check. Exit 1 khi lỗi/checksum sai/thiếu file;
exit 2 khi còn NOT_RUN; chỉ all-PASS mới có thể exit 0. Slice này luôn giữ các check
DB/target/audit/finance/key/WAL replay/RPO/RTO/35 ngày ở NOT_RUN, kể cả checksum file đúng.
Checksum đúng không chứng minh nguồn manifest đáng tin; manifest phải có xác thực,
lưu chống sửa và nằm trong recovery set được operator cho phép.

Full recovery manifest (LSN/timeline, migration checksum, counts, finance, identity và
mốc đo) phải tích hợp theo A6. Không dùng output này làm chứng nhận PITR5m/RTO60m hoặc
quyền restore. Không chạy script DR cũ rồi coi phần auto-migrate đã được loại bỏ ở đây.

## Kiểm chứng và rollback

14 test fixture đạt cục bộ: byte/hash/size, thiếu file, path traversal, symlink,
raw-key field, path trùng, size không an toàn, lỗi không lộ input và incomplete exit.
Local Node 22.16.0; CI Node 24 đúng lockfile và review vẫn bắt buộc trước merge.
Rollback bỏ công cụ file mới; không xóa backup/key/draft hoặc sửa nguồn/đích production.
