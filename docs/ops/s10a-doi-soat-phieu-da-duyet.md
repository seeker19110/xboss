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

## Bổ sung 2026-10-08 — đợt IPC có thể đã lách bước duyệt theo ngưỡng

`approval_requests.amount` từng chốt lúc lập nháp và không cập nhật khi sửa khối lượng. Truy vấn
chỉ-đọc dưới liệt kê đợt đã trình/duyệt có giá trị hiện tại vượt `min_amount` của bước mà amount cũ
không kéo vào (`buoc_co_the_bi_lach` khác NULL → cần đối soát; ngưỡng có thể đã đổi sau đó nên chỉ
là xấp xỉ):

```sql
SELECT c.id, c.code, c.status, r.id AS req_id, r.status AS req_status, r.amount AS amount_luc_lap,
       pv.period_value,
       (SELECT string_agg(s.seq || ':' || s.role || '>=' || s.min_amount, ', ' ORDER BY s.seq)
          FROM approval_steps s
         WHERE s.flow_id = r.flow_id AND s.min_amount IS NOT NULL
           AND s.min_amount >  COALESCE(r.amount, 0)
           AND s.min_amount <= pv.period_value) AS buoc_co_the_bi_lach
  FROM payment_certs c
  JOIN approval_requests r ON r.entity_type = 'payment_cert' AND r.entity_id = c.id
  CROSS JOIN LATERAL (SELECT ROUND(COALESCE(SUM(i.qty_period * i.unit_price), 0), 2) AS period_value
                        FROM payment_cert_items i WHERE i.cert_id = c.id) pv
 WHERE c.status IN ('submitted', 'approved')
   AND pv.period_value > COALESCE(r.amount, 0)
 ORDER BY c.id;
```
