# AUDIT S09 — Utility tiền exact độc lập

State: **Approved for implementation**. Ngày: 2026-09-25.
Chủ dự án đã yêu cầu chốt phương án chất lượng cao, sau đó cho triển khai các việc nhỏ song song.
Đây là slice utility nhỏ của QUALITY-FINAL-1, không phải quyền đổi dữ liệu hoặc phát hành production.

## Nguồn và phạm vi

Contract gốc: [A3-MONEY tại bản đã chốt](https://github.com/seeker19110/xboss/blob/30de3cd2f7eae0894aaec2566318c16e56803ca6/docs/nang-cap/AUDIT-2026-09-25/A3-MONEY.md).
Base code đã đọc: 833691815fdc7e96bb72975d86bd6902a412b259.
Đã đọc toàn bộ lib/nen/money.ts và tests/money.test.ts. Cần đường exact mới để caller chuyển
đổi từng miền sau này; sửa parser global hoặc thay helper legacy ngay có nguy cơ đổi hành vi.
Chọn bổ sung API opt-in trong file hiện có, không thêm thư viện, không viết lại miền tài chính.

## Contract và giới hạn

Giữ đơn vị bigint VND nhân 100. Bổ sung parseMoneyExact nhận chuỗi thập phân; moneyToDecimal
trả chuỗi canonical hai số lẻ; mulRatio nhận tỷ lệ bigint hữu tỉ, mẫu khác 0 và làm tròn ties
away from zero; formatVndExact hiển thị đồng nguyên không double-round chuỗi nhiều số lẻ.
moneyToNumberSafe là adapter có kiểm biên minor và round-trip, ngoài biên báo lỗi rõ.
Không đưa giá trị thương mại đầu vào vào error message. Không nhận locale/exponent/NaN/Infinity.

Không đổi chữ ký/hành vi parseMoney, mulRate, moneyToNumber hoặc formatVnd legacy. Không đổi
parser PostgreSQL, schema, JSON route, UI/export hoặc caller sản phẩm trong slice này.
Giữ IPC SUM trước rồi round tổng; không tính lại chứng từ đã duyệt. Các validator wire phải
áp precision/scale và giới hạn độ dài theo cột ở S10, không coi utility là API boundary đầy đủ.

## File ownership

Chỉ lib/nen/money.ts, tests/audit-money-exact.test.ts, tests/audit-money-postgres.test.ts,
docs/ops/audit-small-money-2026-09-25.md và tài liệu này. Không sửa các file cache/IndexedDB
của nhánh khác; không thay lockfile hoặc cấu hình CI. Không có migration cho slice utility.

## Tiêu chí nghiệm thu

Số rất lớn vẫn giữ từng đơn vị nhỏ; serialize/parse round-trip và canonical không âm không.
Ties dương/âm và mẫu số âm đúng, mẫu 0 trả lỗi. Hiển thị 1.499 thành 1 đồng, không 2 đồng.
Tổng 10.000 dòng 0.01 bằng 100.00; partition không đổi tổng. Tỷ lệ cùng tử/mẫu giữ giá trị.
Adapter number phải từ chối giá trị không round-trip. Helper khớp PostgreSQL numeric trên
TEST_DATABASE_URL; số lớn ở aggregate không được giả là insert được vào mọi cột numeric(15,2).

## Kiểm chứng, vận hành và DoD

10 unit tests chạy source thật, gồm 2.000 mẫu xác định trước. Test PostgreSQL chỉ SELECT
numeric và import tests/setup.ts đầu tiên. Không có TEST_DATABASE_URL thì chưa nghiệm thu parity.
CI đúng HEAD phải qua format/lint/typecheck, tests hiện hữu, DB, build, coverage và E2E.
Không đổi UI nên không có trạng thái màn hình mới; lỗi helper được caller xử lý khi chuyển S10.
Không thêm telemetry ghi tiền; kiểm kết quả test và lỗi RangeError/TypeError theo contract.

Rollback chỉ bỏ export mới khi chưa có caller sản phẩm sử dụng; không chuyển dữ liệu exact
về float trong các slice tiếp theo. Dừng khi regression legacy hoặc parity khác SQL.
Hoàn tất slice utility không đồng nghĩa toàn A3 hoặc 54 AC của chương trình audit đã đạt.
Merge/deploy và dữ liệu production cần thao tác riêng, chưa thực hiện trong PR utility này.
