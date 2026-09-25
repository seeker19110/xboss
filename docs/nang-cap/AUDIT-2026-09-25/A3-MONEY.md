# A3 — Tiền chính xác xuyên SQL, JavaScript, API và export

State: In review. Phụ thuộc S00 và hợp đồng A1; đầu mối tiền/DB tích hợp tuần tự.
Hợp đồng chung và nguồn S05/S06/S07/E03: README.md. Không thay chính sách thuế/hợp đồng.

## 1. Vấn đề, phương án và outcome

Hiện parseMoney(string) đã phân tích sang bigint đơn vị đồng × 100. Tuy nhiên mulRate
chuyển bigint qua Number; moneyToNumber và formatVnd(string) cũng qua Number.
DB parser oid1700 dùng parseFloat, oid20 dùng Number. costTotals đưa tổng SQL dạng number
vào parseMoney sau khi có thể đã mất chính xác. Đọc code xác định rủi ro; phải thêm fixture
vượt biên/âm/làm tròn để chứng minh và khóa hồi quy, không suy rằng mọi số đang sai.

Không làm: tiếp tục mất chính xác ở biên. Đổi global parser ngay: làm vỡ nhiều module ngoài
phạm vi. Chọn đường tiền exact có DTO rõ, SQL ::text ở phép đọc tiền, migration caller từng
miền. Giữ parser global cho phần khác trong đợt đầu; không thêm decimal library khi bigint
và PostgreSQL numeric đủ yêu cầu. Không thay DB sang float/money hoặc đổi đơn vị hiện tại.

## 2. Hợp đồng kiểu và làm tròn

A3-FR01: internal MoneyMinor là bigint VND × 100; SQL dùng numeric/decimal. API v2 là chuỗi
thập phân canonical đúng hai chữ số, ví dụ "1234.50", "-0.01", "0.00"; không có dấu phẩy,
exponent, leading plus, NaN/Infinity, -0.00 hoặc dấu phân nhóm. Tiền thiếu/bị che là null,
không tự đổi thành0. Không JSON.stringify bigint trực tiếp.

A3-FR02: số lượng và tỷ lệ khác tiền. Qty giữ scale và giới hạn từ schema/contract S00;
rate đi bằng chuỗi thập phân hữu hạn hoặc cặp nguyên tử số/mẫu số. Không parse quantity
qua parseMoney làm mất số lẻ. Cần giới hạn độ dài chuỗi từ precision/scale catalog để chặn
input quá lớn; numeric đặc biệt NaN/Infinity bị từ chối tại API và migration kiểm chứng.

A3-FR03: cộng/trừ tiền bằng bigint; nhân chia có tỷ lệ exact. Rounding half-away-from-zero
ở ranh giới đã định: ±0.005 thành ±0.01 khi chuẩn hóa đến2 số lẻ. Phép tính trung gian giữ
precision, không làm tròn từng bước không cần thiết. Mẫu số0 là lỗi, không trả Infinity/0.

Contract helper đề xuất, không phải implementation đã tồn tại. Bổ sung các hàm tương ứng
trong lib/nen/money.ts sau inventory caller:

```ts
type MoneyMinor = bigint;
type ExactMoneyContract = {
  parseMoneyExact(decimal: string): MoneyMinor;
  moneyToDecimal(minor: MoneyMinor): string;
  mulRatio(minor: MoneyMinor, numerator: bigint, denominator: bigint): MoneyMinor;
  formatVndExact(value: MoneyMinor | string): string;
};
```

mulRatio tính trên abs(a*b) và abs(denominator), chia lấy thương/dư; nếu2*dư >= mẫu thì
cộng1 vào độ lớn rồi áp dấu. Không Number(bigint), Math.round hay rate float ở giữa.
formatVndExact làm tròn đồng nguyên chỉ để hiển thị, không ghi kết quả này ngược vào DB.
Với wire canonical2 decimals, round đồng đúng một lần. Chuỗi import nhiều số lẻ phải được
chuẩn hóa một lần ở boundary đã chốt, không đi qua chuỗi format rồi parse lại.

## 3. Quy tắc nghiệp vụ và tương thích

A3-FR04: hóa đơn/IPC đã phát hành giữ số tiền và quy tắc làm tròn tại lúc chốt. Không tính
lại lịch sử theo thuật toán mới và không cập nhật chứng từ đã duyệt chỉ để khớp dashboard.
S00 lập bảng theo từng loại: basis giá trước/sau thuế, round theo dòng hay tổng, thu hồi tạm
ứng, retention, VAT và dấu của credit/reversal. Nếu đặc tả nghiệp vụ đã duyệt có quy tắc khác,
giữ quy tắc đó có version; cần owner tài chính duyệt thay đổi trước code miền ấy.

Default đề xuất cho chứng từ mới chưa có quy tắc: lineNet = round(qty*unitPrice,2),
subtotal = sum(lineNet); VAT/retention/recovery tính riêng trên basis được hợp đồng quy định
rồi round2; payable lấy các thành phần đã làm tròn. Không tự giả định VAT/retention có cùng
basis hoặc tiền được phép âm. Golden fixture trong TEST-MATRIX là kỹ thuật, không là thuế suất
hay điều khoản mặc định của khách hàng. Phân bổ chênh lệch rounding chỉ khi bắt buộc tổng
phân bổ bằng tổng chứng từ: largest remainder trên trị tuyệt đối, tie theo stable line ID,
áp dấu cuối; lưu rule version. Không bí mật cộng chênh vào dòng cuối.

A3-FR05: SQL tính tiền exact và trả ::text tại boundary, ví dụ
COALESCE(SUM(amount),0)::text. Nếu nhân quantity/unitPrice thuộc float legacy, cast đầu vào
đúng numeric precision trước phép toán theo mapping đã duyệt; cast kết quả float sang text
không phục hồi số đã mất. Không dùng SUM rồi cast integer làm mất số lẻ.

A3-FR06: không đổi numeric JSON đang có thành string trên mọi route cùng lúc.
Route migrated hỗ trợ request header X-XBoss-Money-Format: decimal-string-v1 và response
moneyFormat: "decimal-string-v1"; các trường tiền được schema DTO khai thành chuỗi.
Giữ kiểu ID, count, progress; chỉ thay các trường tiền đã liệt kê. Thêm Vary tương ứng nếu
có tầng HTTP cache, nhưng response tài chính vẫn private/no-store và SW network-only.
Không gửi hai tổng khác nhau để client tùy chọn mà không có quy ước nguồn sự thật.

Adapter legacy number chỉ được dùng khi giá trị minor và chuyển đổi trong biên đã kiểm;
ngoài biên trả lỗi có mã money_precision_unsupported, không làm tròn âm thầm hoặc clamp.
Number đầu vào legacy phải hữu hạn, scale được hỗ trợ và round-trip minor đúng; từ chối
chuỗi exponent/locale và input đã mất khả năng biểu diễn. Không coi adapter là cam kết exact
cho số tùy ý. Mỗi route có thống kê caller legacy và kế hoạch xóa sau chuyển hết.

## 4. UI, export và dữ liệu

Sort/filter/total trên tiền canonical dùng comparator exact; không sort chuỗi từ điển.
Biểu đồ có thể nhận giá trị scaled approximate để vẽ nhưng tooltip/tổng/export lấy exact;
label phải chỉ rõ phép scale, không ghi giá trị approximate về nghiệp vụ.
Excel lưu tiền vượt precision bảo toàn của ô số dưới dạng text canonical có nhãn rõ;
không ép Number để có công thức đẹp. Tổng exact được tính trước ở server. PDF/UI hiển thị
nhất quán đồng nguyên nhưng API/chứng từ giữ cents nội bộ; locale không đổi raw value.
Export phải kiểm lại quyền/project tại server và không lấy dữ liệu cached trên client.

Không có DDL bắt buộc cho utility/DTO. S00 tạo inventory mỗi monetary column: type,
precision/scale, source, output và caller. Với cột float/precision không đủ, tạo migration
riêng expand → shadow/backfill → compare → switch; không ALTER toàn DB theo pattern.
Mọi DDL nâng precision phải có bảng/cột cụ thể và query xác minh từ catalog được duyệt trước
slice schema; không thực hiện placeholder SQL. Giữ cột cũ trong cửa sổ rollback đã duyệt.

## 5. Điểm chạm, test và acceptance

File đã đọc: lib/nen/money.ts, lib/db/index.ts, lib/tai-chinh/cost.ts.
S00 xác định mọi caller parseMoney/mulRate/moneyToNumber/formatVnd và route/export tài chính.
Test mới đề xuất: tests/audit-money-exact.test.ts; tests/audit-money-contract.test.ts;
fixture PostgreSQL đối chiếu numeric và snapshots API/Excel/PDF.
Không đổi formatter dùng cho quantity/ratio ngoài inventory.

A3-AC01: "90071992547409.91" + "0.01" = "90071992547409.92" xuyên SQL/API/export, không
qua Number. Kiểm thêm giá trị lớn hơn Number.MAX_SAFE_INTEGER ở cả đồng lẫn minor.
A3-AC02: parse "0.005" =>1n; "-0.005" =>-1n; mulRatio(-1n,1n,2n) =>-1n;
zero/-zero canonical =>"0.00"; mẫu0 và input đặc biệt đều báo lỗi.
A3-AC03: sum10.000 dòng "0.01" = "100.00", cùng kết quả khi chia nhiều nhóm cộng lại.
A3-AC04: property tests với seed ghi trong báo cáo: format/parse canonical round-trip,
cộng giao hoán, triệt tiêu a+(-a), SQL/JS rounding đối xứng và cùng precision.
A3-AC05: mỗi client/export migrated đọc schema mới đúng; legacy trong biên không đổi kiểu;
vượt biên lỗi rõ. Không lộ tiền của role bị che qua trường exact mới.
A3-AC06: chứng từ lịch sử không bị thay số; quantity >2 decimals không bị cắt theo money;
quy tắc dòng/tổng được gắn version và có fixture người phụ trách tài chính duyệt.

## 6. Quan sát, triển khai và rollback

Metric money_legacy_adapter, money_range_reject, money_reconciliation_mismatch theo miền,
không log amount hoặc nội dung hợp đồng. Bất kỳ mismatch exact = no-go cho miền đó.
Đưa utility/test trước, SQL DTO sau, UI/export sau; không mở v2 cho client chưa chuyển.
Dual-read đối soát trên staging/snapshot được phép; không tự shadow bằng DB production.
Rollback giữ dữ liệu exact và adapter an toàn, không chuyển qua float hoặc ghi lại chứng từ.
Cập nhật ADR cho contract wire/rounding, ERD nếu có DDL. Chỉ đóng sau full matrix + UAT
PM/BCH/role bị che. Người/ngày duyệt và rounding policy ở APPROVAL.md.
