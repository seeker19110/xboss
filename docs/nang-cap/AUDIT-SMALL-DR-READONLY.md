# Việc nhỏ độc lập — verifier sau restore chỉ-đọc

State: **Approved for implementation**, 2026-09-25.
Căn cứ: QUALITY-FINAL-1/S14 và lệnh triển khai việc nhỏ song song của chủ dự án.
Baseline: 381b06899b3eb5d9e1b2c99b167d51cc24419732.

## Phạm vi và bằng chứng

Đã đọc verify-dr-restore.ts, facade audit-chain.ts và toàn bộ merkle-audit-ledger.ts.
Verifier cũ dùng pool ứng dụng và verifyAuditChain() gọi lib/db.query có auto-migration;
đối chiếu tên migration chỉ kiểm thiếu, bỏ migration thừa; audit 0/0 có thể báo thành công
và kết luận toàn bộ DR đạt dù chưa kiểm manifest/files/RPO/RTO.

Chọn sửa primitive hiện hữu, không thêm pipeline backup/PITR hoặc sửa thuật toán hash.
Khóa file: scripts/verify-dr-restore.ts, scripts/lib/dr-readonly.ts,
lib/bao-mat/merkle-audit-ledger.ts, tests/audit-dr-readonly.test.ts và tài liệu này.
Không chồng auth/session, costs, SW hoặc IndexedDB; không sửa lib/db hay schema.

## Contract

CLI chỉ đọc DR_VERIFY_DATABASE_URL, yêu cầu DR_VERIFY_EXPECTED_DATABASE và
DR_VERIFY_EXPECTED_USER. Không fallback DATABASE_URL. So URL nguồn DATABASE_URL/
MIGRATE_DATABASE_URL để chặn đích cùng host/port/database đã biết dù khác credential;
kiểm lại current_database/current_user trên server trước đọc bảng. So URL không phát hiện
được mọi DNS alias hoặc chứng minh topology cách ly: người vận hành vẫn phải kiểm môi trường.

Client riêng với default_transaction_read_only, timeout; tất cả phép kiểm trong cùng
REPEATABLE READ READ ONLY transaction, finally ROLLBACK. SET LOCAL row_security=off không
bypass RLS: nếu role sẽ bị lọc thì báo lỗi thay vì đếm rỗng rồi PASS. Đây là verifier bản sao,
không phải test chứng minh RLS của app; phần RLS role app phải kiểm riêng.

verifyAuditChain nhận optional reader injection có cùng contract query; DR dùng client
chỉ-đọc của mình, không gọi default query hoặc migration. Caller cũ không truyền reader
và thuật toán hash giữ nguyên. Savepoint giúp một kiểm tra lỗi không che kết quả phần sau.

Phân biệt PASS/FAIL/NOT_RUN; audit rỗng hoặc thiếu coverage là NOT_RUN, exit khác 0.
Đối chiếu migration thiếu/thừa/trùng tên; checksum còn ngoài scope. Đọc COUNT dạng text để
tránh tràn int; engineering relation dùng LEFT JOIN/IS DISTINCT FROM bắt orphan/null.
Output kind=dr-smoke, completeDrVerified=false, không tuyên bố toàn DR đã đạt.
Lỗi không in raw URI/secret; không tự sửa dữ liệu.

## Kiểm chứng

10 unit tests chạy source helper và ledger thật, native crypto, DB client giả kiểm toàn bộ
thứ tự SQL và cấm lệnh ghi. Reader lib/db bị assert.fail để bắt auto-migration ngoài ý muốn.
Hai mutation (READ WRITE; bỏ injected reader) bị phát hiện. Chạy đồng thời auth/cost/DR:
30 ca đạt; chưa có PostgreSQL/restore hoặc full app dependencies cục bộ vì DNS.
Full CI Node 24 phải kiểm typecheck và tests audit-chain hiện hữu trên đúng HEAD.

## Vận hành và rollback

Lệnh hiện hữu npm run audit:verify-dr vẫn là entry, nhưng phải cấp ba biến DR riêng qua
cơ chế quản lý cấu hình an toàn. Chỉ trỏ bản sao được phép, không production hoặc DB đang
phục vụ ứng dụng. Role verifier có quyền đọc toàn phần cần kiểm trên bản sao; không dùng
row count của role bị che làm bằng chứng toàn vẹn. Không cấp credential trong mã hoặc log.

Không chạy CLI trên dữ liệu thật trong PR này. Rollback không được đưa auto-migration hoặc
câu kết luận DR đầy đủ trở lại verifier. Hash persistence/history/DB không thay đổi.

Còn lại của S14/A6: manifest/checksum/files/keys, kiểm tất cả FK/org, target marker/topology,
PITR 35 ngày, số đo RPO/RTO, restore và UAT thật. Bản sửa primitive không đóng toàn A6;
code/test CI xanh không đồng nghĩa đã diễn tập khôi phục production.
