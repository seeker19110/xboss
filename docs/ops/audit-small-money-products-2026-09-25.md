# S09 nhỏ — scale, tổng tích và so sánh tiền exact

State: **Approved for implementation** theo QUALITY-FINAL-1, D05 và yêu cầu chủ dự án
ngày 2026-09-25. Spec: ../nang-cap/AUDIT-2026-09-25/A3-MONEY.md.
Base đọc: 381b06899b3eb5d9e1b2c99b167d51cc24419732; S09 primitive của PR532 đã merge.

## Phạm vi và contract

File ownership: lib/nen/money.ts, tests/audit-money-products.test.ts,
tests/audit-money-products-postgres.test.ts và tài liệu này. Không đổi caller, parser DB,
SQL production, JSON API, UI/export, schema, giá hoặc chứng từ lịch sử.

parseFixedDecimalExact kiểm wire canonical đúng scale, không quantize, không coerce
number/null, không locale/exponent, không leading zero hoặc negative zero. Scale 0–18,
input tối đa 1024 ký tự. Biên NUMERIC từng cột vẫn do API miền kiểm, không mở rộng schema.

sumMoneyProductsExact nhận quantity string scale 3 mặc định và unit price string scale 2,
cộng toàn bộ tích integer trước rồi mới round tổng. Không round từng line rồi cộng cho
IPC. Quantity scale khác phải truyền rõ. Utility cho số âm để đối soát/adjustment;
validation nghiệp vụ IPC không cho quantity âm vẫn thuộc caller, không bị thay ở đây.

compareMoneyExact trả -1/0/1 bằng bigint, không sort tiền theo chuỗi hoặc Number.
Rate phần trăm 10.25 dùng 1025/10000. Không gom quantity qua parseMoney gây mất số lẻ.

## Kiểm chứng

16 test unit đạt cục bộ, gồm golden phân biệt sum-round với per-line-round, 10.000 dòng,
aggregate vượt MAX_SAFE_INTEGER, tỷ lệ IPC, null/scale/input sai và comparator.
Thêm parity SELECT PostgreSQL numeric trên fixture, dùng tests/setup đầu tiên; không
INSERT aggregate vượt biên cột. Parity DB chưa chạy cục bộ vì không có Postgres/deps.

```bash
npx tsx --test tests/audit-money-products.test.ts
npx tsx --test tests/audit-money-products-postgres.test.ts
```

Local Node 22.16.0/TypeScript có sẵn chỉ kiểm slice; CI Node 24 theo lockfile phải kiểm
đúng HEAD trước merge. Không lấy unit helper làm bằng chứng S10/API/masking/export đã xong.
Rollback chỉ bỏ export mới khi chưa có caller; không chuyển exact về float hoặc reprice.
