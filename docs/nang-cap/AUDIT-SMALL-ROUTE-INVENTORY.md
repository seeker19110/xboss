# S00 nhỏ — inventory API theo AST

State: **Approved for implementation**.
Người duyệt: chủ dự án, theo lệnh triển khai QUALITY-FINAL-1 và các việc nhỏ ngày 2026-09-25.
Đặc tả cha: [PLAN S00](AUDIT-2026-09-25/PLAN.md).
Tài liệu này ghi phạm vi con đã triển khai, không thay quyết định hoặc dependency của kế hoạch cha.

## Phạm vi và interface

Công cụ chỉ đọc scripts/audit-route-inventory.ts, unit test và tài liệu phạm vi tương ứng.
Không sửa handler, quyền, DB, migration, lockfile hoặc CI. Input là repo local và file route
tracked. Output JSON có sourceSha, workingTreeDirty, sourceBlob, file, line, method,
exportKind, calls và reviewStatus=NOT_MAPPED. Không chạy hoặc import source route.

## Tiêu chí chấp nhận

Nhận function/variable/wrapper/local alias và ghi rõ re-export/wildcard/destructuring
chưa giải quyết; source lỗi không im lặng biến mất. Không nhận comment/string/type-only
thành handler. Vòng tham chiếu không treo. Không xuất argument, SQL hoặc secret.
Git repo fixture kiểm tracked/dirty/blob thay đổi và từ chối symlink.

Tên helper trong AST không chứng minh authorization; mọi entry còn cần map actor, scope,
parent join, DTO và negative test. Inventory DB/catalog và review toàn repo thuộc S00 đầy đủ.

## Kiểm chứng, rollout và rollback

7 unit test fixture; mutation bỏ export alias phải bị phát hiện. Full CI đúng HEAD và
review trước merge. Không dùng fixture thay kết quả scan toàn main. Tool chỉ đọc, rollback
bỏ công cụ mới; không thay dữ liệu/production và không đóng 54 AC audit.
