# S09 nhỏ — Utility tiền exact, 2026-09-25

Chủ dự án đã yêu cầu thi hành các việc nhỏ song song. Contract tham chiếu QUALITY-FINAL-1
ở PR #531, HEAD 30de3cd2f7eae0894aaec2566318c16e56803ca6; baseline code main 8336918.
Đây là slice nền độc lập, không đổi API/DB hoặc tự tính lại chứng từ.

## File ownership và kiểm kê hẹp

Chỉ sửa lib/nen/money.ts, thêm hai test audit-money và tài liệu này.
Đã đọc toàn bộ money.ts và tests/money.test.ts ở baseline. Phần legacy của money.ts được giữ
nguyên byte; bản nguồn đối chiếu có blob 53caceb4e12cffeebaaa212f104d353865f3518e.
Không đổi parseMoney(number), mulRate, moneyToNumber, formatVnd hoặc global DB parser.
Vì chưa chuyển caller, không coi S00 monetary inventory toàn hệ hoặc S10 đã hoàn tất.

## Thay đổi

Thêm parseMoneyExact, moneyToDecimal, mulRatio, formatVndExact và adapter opt-in
moneyToNumberSafe. Tỷ lệ dùng bigint/rational, mẫu 0 báo lỗi; chuỗi hiển thị không double-round;
JSON number legacy ngoài biên round-trip bị từ chối. Không log dữ liệu đầu vào lỗi.
Hàm parse hỗ trợ quantize, không thay validator canonical wire/biên NUMERIC của từng route.
Quy tắc IPC SUM trước rồi round giữ nguyên; fixture phân biệt với round từng dòng.

## Kiểm chứng và giới hạn

10 unit tests đã chạy trên source bằng Node 22/TypeScript loader cục bộ, không mock arithmetic;
có 2.000 mẫu xác định trước, số lớn và 10.000 dòng. Bộ này chạy đồng thời với hai suite cache/IDB
trong ba process độc lập. Mutation thay làm tròn bằng chia cắt cụt bị test phát hiện; đã khôi phục.
Test PostgreSQL đã thêm, chỉ chạy với TEST_DATABASE_URL; chưa chạy DB cục bộ vì không có PostgreSQL.
CI Node 24 phải kiểm parity SQL, legacy tests, format/lint/typecheck và toàn bộ gate đúng HEAD.
Nguồn quy tắc numeric: https://www.postgresql.org/docs/16/datatype-numeric.html

Không đánh dấu A3 SQL/API/export đã đạt từ utility. Chưa merge/deploy, không đổi dữ liệu thật.
Rollback slice là bỏ các export mới khi chưa có caller sản phẩm dùng chúng; không chuyển tiền
exact của các slice về sau ngược thành float. Kết quả CI sau commit ghi ở PR, không suy từ baseline.
