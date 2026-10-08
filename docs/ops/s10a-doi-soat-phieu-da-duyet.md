# S10a — Đối soát phiếu thanh toán của đợt IPC đã duyệt (ipc-sum-v1)

> QUALITY-FINAL-1 S10a (audit M3). Truy vấn **CHỈ ĐỌC** — không UPDATE/backfill. Chạy trên
> staging/bản sao trước, production chỉ khi người vận hành đồng ý (A3 §6: không tự đọc production
> từ agent, không tự sửa tiền).

## Vì sao cần

Trước S10a, `certTotals` nhân tỷ lệ tạm ứng/giữ lại bằng float (`mulRate`) và đổi tổng ra JSON
number (`moneyToNumber`). Khi duyệt đợt, `POST /api/payment-certs/:id/decide` ghi
`payment_bills.amount = approvedValue` theo cách tính cũ, nên phiếu của đợt đã duyệt **trước khi
S10a deploy** có thể lệch 0,01 đ so với ipc-sum-v1 (ca thật: tạm ứng 10,25% × 94,00 = 9,635 ra
9,63 thay vì 9,64 → phiếu 79,67 thay vì 79,66), hoặc mất xu khi tổng vượt 2^53 đồng×100.

S10a **không** sửa phiếu cũ (A3-FR05: không tính lại chứng từ lịch sử để khớp bản mới). Truy vấn
dưới đây chỉ liệt kê chênh lệch để kế toán đối soát với chứng từ gốc và quyết định thủ công.

## Truy vấn (nguyên văn từ báo cáo audit S10a)

```sql
WITH p AS (
  SELECT c.id, ROUND(COALESCE(SUM(i.qty_period * i.unit_price), 0), 2) AS period,
         ct.advance_pct AS a, ct.retention_pct AS r
    FROM payment_certs c JOIN contracts ct ON ct.id = c.contract_id
    LEFT JOIN payment_cert_items i ON i.cert_id = c.id
   WHERE c.status = 'approved'
   GROUP BY c.id, ct.advance_pct, ct.retention_pct)
SELECT p.id, b.id AS bill_id, b.amount,
       p.period - ROUND(p.period * p.a / 100, 2) - ROUND(p.period * p.r / 100, 2) AS approved_v1
  FROM p JOIN payment_bills b ON b.payment_cert_id = p.id
 WHERE b.amount <> p.period - ROUND(p.period * p.a / 100, 2) - ROUND(p.period * p.r / 100, 2);
```

Kết quả rỗng = mọi phiếu khớp ipc-sum-v1. Mỗi dòng trả về là một phiếu cần đối soát
(`amount` đã ghi vs `approved_v1` theo quy tắc mới).

## Lưu ý khi diễn giải

- `ROUND` của PostgreSQL numeric làm tròn nửa **xa 0** — cùng quy tắc `mulRatio` trong
  `lib/nen/money.ts`.
- **Bẫy làm tròn kép (ghi ở S09):** `period * a / 100` là phép CHIA numeric; với tổng cỡ 10^13,
  PostgreSQL có thể cắt kết quả chia xuống ít chữ số lẻ hơn trước khi `ROUND(…, 2)`. Khi có tổng
  lớn, chạy lại với biến thể nhân `* 0.01` (exact) để chắc chắn dòng lệch là lệch thật:
  thay `ROUND(p.period * p.a / 100, 2)` bằng `ROUND(p.period * p.a * 0.01, 2)` (và tương tự cho
  `p.r`) ở cả SELECT lẫn WHERE.
- Truy vấn dùng tỷ lệ **hiện tại** của hợp đồng và `unit_price` snapshot trên dòng KL. Nếu hợp
  đồng đã đổi `advance_pct`/`retention_pct` sau khi duyệt, chênh lệch có thể do đổi tỷ lệ chứ
  không phải do làm tròn — chưa có snapshot tỷ lệ tại thời điểm duyệt (DATA-CONTRACTS §6).
- Không sửa `payment_bills` dựa trên kết quả này khi chưa có quyết định nghiệp vụ + provenance
  (A3 §3: không "backfill" bằng dữ liệu hôm nay rồi coi là gốc).
