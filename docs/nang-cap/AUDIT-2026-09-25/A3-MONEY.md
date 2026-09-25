# A3 — Tiền exact và bảo toàn nghĩa chứng từ

State: **Approved for implementation**, QUALITY-FINAL-1, 2026-09-25; thi hành sau.
Decision D05. Nguồn số liệu/schema thật: SOURCE-MAP; cách nghiệm thu: TEST-MATRIX.

## 1. Vấn đề và lựa chọn

money.ts đã có bigint nhưng mulRate/moneyToNumber/formatVnd có đường qua Number;
DB NUMERIC parser dùng parseFloat; numeric trong JSON aggregate còn có thể thành JSON number.
Đầu vào quantity PO hiện có float8, nên chỉ cast kết quả SUM ra text chưa đảm bảo exact.
Chọn numeric/decimal-string/bigint theo miền, không mass thay global parser/ORM.
Không đổi chính sách thuế, đơn giá lịch sử hoặc cách round IPC chỉ để làm số trông đẹp hơn.

## 2. Kiểu dữ liệu và thuật toán

A3-FR01: MoneyMinor là bigint VND×100. Amount wire canonical có đúng2 số lẻ, không locale/
exponent/NaN/Infinity/+/-0.00. Quantity/rate/unit price theo scale nguồn của từng trường,
không đưa qty qua parseMoney làm mất số lẻ. Null/masked/unavailable không thành0.

Contract helper đích:

```ts
type MoneyMinor = bigint;
type ExactMoneyContract = {
  parseMoneyExact(decimal: string): MoneyMinor;
  moneyToDecimal(minor: MoneyMinor): string;
  mulRatio(minor: MoneyMinor, numerator: bigint, denominator: bigint): MoneyMinor;
  formatVndExact(value: MoneyMinor | string): string;
};
```

parseMoneyExact phân tích chuỗi bằng integer, quantize amount2 decimals ties-away-from-zero.
Validator wire kiểm canonical riêng trước helper; không chấp nhận input sai rồi lén làm tròn.
mulRatio dùng tích bigint và chia thương/dư; ties áp dấu đối xứng, mẫu0 là lỗi.
Không Number(bigint), rate float hoặc Math.round trong đường exact. Format đồng nguyên chỉ
hiển thị, không ghi giá trị format ngược DB hoặc dùng nó tính tiền kỳ sau.

A3-FR02: theo ERD, BOQ/IPC qty(15,3), unit_price(15,2); contract rates(5,2) phần trăm.
Rate10.25% =1025/10000 chính xác. Inventory giữ scale nguồn, không tự tăng/giảm toàn hệ.
Row amount(15,2) có13 chữ số phần nguyên; input ngoài biên báo422. Aggregate/utility hỗ trợ
lớn hơn mỗi dòng; test boundary không cố INSERT số vượt cột rồi gọi đó là regression app.

A3-FR03: SQL cast từng số tiền/quantity exact vào ::text ở boundary, kể cả bên trong
json_build_object/json_agg. ID/count/progress vẫn kiểu tương ứng, không string hóa cả JSON.
Không SUM(DISTINCT amount) để chữa join nhân đôi. Numeric đặc biệt bị từ chối.

A3-FR04: với quantity float8 tham gia nhân tiền, expand cột exact bằng numeric, không cast
sản phẩm float rồi tưởng phục hồi giá trị gốc. Đã biết purchase_requests.qty_requested,
po_items.qty_ordered/qty_received và receipt_items.qty_received; các trường materials liên
quan phải inventory cùng miền. Thiết kế hẹp và provenance ở DATA-CONTRACTS.
Không thể suy ngược chính xác input thập phân ban đầu từ float đã lưu; conversion giữ biểu
diễn legacy và đánh dấu nguồn, chênh với chứng từ gốc phải được đối soát, không tự chữa tiền.

## 3. Rule chứng từ đã chốt

A3-FR05: IPC dùng **ipc-sum-v1**: SUM(qty_period*unit_price) numeric → round tổng2 decimals;
advance/retention tính trên periodValue theo rate hợp đồng rồi round từng khoản;
approvedValue = periodValue - advanceDeduct - retentionDeduct exact.
Không round mỗi line trước SUM ở IPC chỉ vì v1 đã nêu default per-line.

Hóa đơn/hợp đồng có rule khác phải giữ rule và basis của nó, không auto áp ipc-sum-v1.
Snapshot chứng từ chốt lưu giá/rates/basis/rule/qty/amount tại quyết định. Đổi BOQ/contract sau
không sửa snapshot cũ. Legacy thiếu snapshot không được “backfill” bằng giá hôm nay rồi coi
đó là dữ liệu gốc; có provenance và reconciliation riêng.

Phân bổ chênh lệch rounding khi nghiệp vụ thực sự cần tổng phân bổ bằng tổng chứng từ dùng
largest remainder theo trị tuyệt đối, tie stable line ID, áp dấu cuối, có rule version.
Không âm thầm cộng sai số vào một dòng cuối hoặc tự chọn thuế suất/retention basis mới.

## 4. API, UI và export

A3-FR06: opt-in header X-XBoss-Money-Format:decimal-string-v1; response moneyFormat rõ.
Chuyển từng route/consumer, giữ adapter legacy number chỉ trong biên round-trip minor an toàn;
ngoài biên báo money_precision_unsupported, không clamp/approximate amount thật.
Financial APIs private,no-store và SW network-only, kể cả có Vary theo money format.

Sort/filter/totals bằng comparator exact; chart có thể dùng scaled approximate cho hình học
nhưng tooltip/tổng/export từ exact source. Excel lớn vượt precision an toàn lưu text canonical;
không ép thành Number để có ô số đẹp. PDF/UI đồng nguyên có cách hiển thị rõ, raw exact vẫn
được bảo toàn. User thiếu viewPayments/viewPayroll không nhận amount exact ở metadata mới.

Error/unavailable/0 khác nhau. Input tiếng Việt có thể được parse ở UI thành canonical theo
quy tắc được test, không để server đoán dấu chấm/phẩy. Mỗi API/export tự kiểm scope/quyền.

## 5. Điểm chạm, acceptance và test

File lõi: lib/nen/money.ts, lib/db/index.ts, lib/tai-chinh/cost.ts, paymentcerts.ts;
consumer theo S00. Utility không cần migration. Quantity legacy/snapshot dùng migration hẹp
với exact columns và provenance, không sửa history hoặc schema đã áp. ERD sinh theo catalog.

A3-AC01:90071992547409.91+0.01=90071992547409.92 qua utility/SUM/API/export;
per-row schema biên nhỏ hơn phải reject input đúng, không lén mở rộng cột.
A3-AC02:±0.005→±0.01; mulRatio(-1n,1n,2n)=-1n; zero canonical, mẫu0/input sai bị chặn.
A3-AC03:10.000 dòng0.01 tổng100.00, chia nhóm/gộp lại không đổi kết quả.
A3-AC04:seeded property tests round-trip/giao hoán/triệt tiêu/parity với PostgreSQL numeric.
A3-AC05:opt-in/legacy/export/masking đúng, ID/progress không bị đổi kiểu ngoài scope.
A3-AC06:qty giữ scale, IPC sum-round và chứng từ lịch sử giữ rule/snapshot.
Q-AC04/Q-AC06 bổ sung numeric bên trong JSON và quantity float/provenance/rounding IPC.

## 6. Vận hành và rollback

S09 utility/golden → S10 SQL/DTO/quantity migration theo miền → UI/export → đối soát cuối.
Shadow compare chỉ trên fixture/snapshot được phép, không tự đọc production. Metrics:
money_range_reject, legacy_adapter_used, reconciliation_mismatch, legacy_precision_source.
Không log amounts/PII. Một sai lệch exact ngoài conversion đã phê duyệt là no-go.

Rollback giữ dữ liệu exact/snapshot và adapter có biên; không convert về float hoặc tính
lại chứng từ lịch sử để khớp bản cũ. Legacy writer phải được chuyển/kiểm trước cutover, không
để exact shadow stale sau một lần update float. Full CI/DB/export/UAT còn phải thực hiện;
không đánh dấu đã đạt từ bản đặc tả.
