# A4-AC08 — đối chiếu SQL/API, query count và benchmark p95 báo cáo

State: **Approved for implementation**.
Chủ dự án duyệt QUALITY-FINAL-1 (2026-09-25) và yêu cầu thi hành tiếp lộ trình ngày 2026-10-08.
Spec cha: [A4 Reporting](AUDIT-2026-09-25/A4-REPORTING.md) (A4-AC08), [APPROVAL](AUDIT-2026-09-25/APPROVAL.md) §D09
(ngưỡng hiệu năng), [TEST-MATRIX](AUDIT-2026-09-25/TEST-MATRIX.md) dòng A4-AC08.
Đây là phạm vi con, không đổi ngưỡng/công thức của đặc tả cha.

## Phạm vi

Chỉ thêm kiểm chứng, không đổi logic báo cáo, không migration (đo không phát hiện cần index mới):

- `tests/bao-cao-a4-ac08.test.ts` — số liệu lib == route handler thật == oracle SQL độc lập; số query
  không theo số nhóm. Cần `TEST_DATABASE_URL` (tự skip khi thiếu).
- `scripts/bench-reports.ts` + `npm run bench:reports` — seed cỡ đích và đo p50/p95/max.
- `scripts/lib/bao-cao-fixture.ts` — fixture dùng chung (INSERT … generate_series).

Ngưỡng D09 trích nguyên văn: "báo cáo chuẩn không quá 2 giây trên fixture 10.000 task, 20 phiên đồng
thời, sau warmup; không chậm hơn baseline quá 10% trên cùng cấu hình. Phải ghi số đo và mẫu thử; không có
số đo thì NOT_RUN."

## 1. SQL / API / export bằng nhau

| So sánh                                                                                                                      | Kết quả                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getCostReport` + `costReportToWire` == `GET /api/costs` (groupBy=system và floor, deepEqual trừ `computedAt`/`moneyFormat`) | PASS                                                                                                                                                                                                         |
| `selectedTotals` == Σ rows (bigint exact)                                                                                    | PASS                                                                                                                                                                                                         |
| `projectTotals.budget/actual` == oracle SQL (`SUM(qty_contract*unit_price)`, `SUM(amount)`)                                  | PASS                                                                                                                                                                                                         |
| Σ budget theo tầng == `SUM(floor_contracts.contract_value)`                                                                  | PASS                                                                                                                                                                                                         |
| `portfolioKpi` == `GET /api/portfolio/kpi` == oracle SQL (số task, TB task-weighted, trễ)                                    | PASS                                                                                                                                                                                                         |
| Export                                                                                                                       | **N/A** — `/api/export/excel` và `/api/export/pdf` không đọc nguồn chi phí (chỉ KPI/tracking), không có "export chi phí" để đối chiếu; nếu sau này export chi phí được thêm thì phải bổ sung ca vào test này |

## 2. Query count không theo số nhóm (đếm mọi câu gửi tới Postgres, gồm BEGIN/COMMIT/set_config)

| Báo cáo                        | N       | 4N                            | Số query                   |
| ------------------------------ | ------- | ----------------------------- | -------------------------- |
| `getCostReport` groupBy=floor  | 21 nhóm | 81 nhóm                       | 8 = 8                      |
| `getCostReport` groupBy=system | 7 nhóm  | 7 nhóm (BOQ/PO/thanh toán ×4) | 9 = 9                      |
| `portfolioKpi`                 | 1 dự án | 4 dự án                       | bằng nhau (ca assert `==`) |

PASS: O(1) theo số nhóm/dòng.

## 3. Benchmark p95 (D09)

Môi trường đo (đây là sandbox, **không phải production**): 4 vCPU Intel Xeon 2.10GHz, PostgreSQL 16.15
local (cùng máy với tiến trình đo, cache nóng), Node 22.22, pool app mặc định 10. Số đo là gọi **route
handler thật** (auth + phạm vi dự án + RLS + serialize + đọc hết thân), không qua mạng/HTTP server.

Fixture (giả định — D09 chỉ nêu "10.000 task", không nêu số dự án/dòng chi phí): 5 dự án × 2.000 task
(5 sheet × 20 nhóm × 20 task) = **10.000 task**, 30.000 dimension, 10.000 dòng BOQ (2.000/dự án),
1.015 thanh toán (100 nhóm tầng/dự án), 5.000 dòng PO, 500 PO. Mỗi báo cáo: warm-up 5 lần; đo 30 lần
tuần tự + **20 phiên đồng thời × 5 lượt = 100 mẫu**. Chạy bằng role `xboss_app` (RLS bật, như production):

| Báo cáo                     | Chế độ   | p50 ms | p95 ms | max ms | D09 (p95 ≤ 2000) |
| --------------------------- | -------- | -----: | -----: | -----: | ---------------- |
| `/api/costs?groupBy=system` | tuần tự  |   14.8 |   18.6 |   18.9 | PASS             |
|                             | 20 phiên |  124.3 |  167.1 |  198.2 | PASS             |
| `/api/costs?groupBy=floor`  | tuần tự  |   13.3 |   17.6 |   18.8 | PASS             |
|                             | 20 phiên |   94.4 |  112.7 |  120.4 | PASS             |
| `/api/portfolio/kpi`        | tuần tự  |    8.5 |    9.6 |   10.1 | PASS             |
|                             | 20 phiên |   49.6 |   64.4 |  100.5 | PASS             |
| `/api/dashboard`            | tuần tự  |   25.8 |   30.0 |   32.9 | PASS             |
|                             | 20 phiên |  228.7 |  272.7 |  315.5 | PASS             |

Lần chạy bằng role owner (superuser, bỏ qua RLS) cho cùng thứ tự độ lớn (p95 20 phiên: costs/system
160.1, costs/floor 106.2, portfolio 81.5, dashboard 272.4) — RLS không tạo chênh lệch đáng kể.

Không cần tối ưu/EXPLAIN/index: mọi p95 thấp hơn ngưỡng 2 s ≥ 7 lần.

### Kết quả theo tiêu chí D09

| Tiêu chí                                                              | Trạng thái                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| p95 ≤ 2 s, 10.000 task, 20 phiên, sau warm-up (fixture tổng hợp trên) | **PASS**                                                                                                                                                                                                                                                                                              |
| Không chậm hơn baseline > 10% trên cùng cấu hình                      | **NOT_RUN** — chưa có baseline trước thay đổi để so (hệ chưa từng đo). Cơ chế sẵn có: `--write-baseline`/`--baseline` (chạy lại cùng máy, kiểm cả `cpus`/`tasks`/`roleApp`/…); chạy so với baseline tự chốt cùng phiên cho PASS nhưng chỉ chứng minh tính ổn định, không phải "không chậm hơn bản cũ" |
| Production-size thật (dữ liệu/phần cứng/mạng thật)                    | **NOT_RUN** — cấm chạm production và chưa có snapshot được phép; chỉ có số đo fixture tổng hợp                                                                                                                                                                                                        |
| Read/write tương tác p95 ≤ 500 ms (ngoài phạm vi "báo cáo")           | Ngoài phạm vi A4-AC08 — chưa đo                                                                                                                                                                                                                                                                       |

## 4. Cách chạy lại

```bash
createdb bench_x            # DB disposable, tên bắt đầu bench_
export U=postgres://ci:ci@localhost:5432/bench_x
MIGRATE_DATABASE_URL=$U DATABASE_URL=$U npm run -s db:migrate
BENCH_DATABASE_URL=$U npm run bench:reports                 # thêm BENCH_APP_DATABASE_URL=… để đo bằng role xboss_app
TEST_DATABASE_URL=$U node --experimental-test-module-mocks --import tsx --test tests/bao-cao-a4-ac08.test.ts
```

Script fail-fast nếu thiếu `BENCH_DATABASE_URL`, trùng `DATABASE_URL`/`MIGRATE_DATABASE_URL`/
`TEST_DATABASE_URL`, host không local (trừ `BENCH_ALLOW_REMOTE_HOST=1`), tên DB không khớp
`^bench_[a-z0-9_]+$`, hoặc DB có dữ liệu mà thiếu bảng marker `xboss_bench_marker`. Không đưa vào CI
bắt buộc. Thoát 0 = PASS, 1 = FAIL/lỗi, 2 = tham số/an toàn sai.
