# PROGRESS — XBoss

## 2026-10-08 — QUALITY-FINAL-1 S10 đầu vào tiền (phần 2): claims, đề xuất, bảo lãnh, VO, thầu, BOQ, báo giá kỹ thuật

Nối phần 1 (parser chung `parseMoneyInput`/`parseOptionalMoneyInput` trong `lib/nen/money.ts`) sang
các route ghi tiền còn lại. Không migration, không đổi kiểu cột, không đổi format phản hồi GET.

- **Route/lib đã chuyển** (lib giữ tiền dạng chuỗi canonical, ghi thẳng NUMERIC, không `Number()`):
  `POST/PATCH /api/claims` (`amountRequested`) + `POST /api/claims/:id/settle` (`amountSettled`);
  `POST/PATCH /api/proposals` (`amount`; chỉ chỗ so ngưỡng bước duyệt `openApproval` còn `Number`);
  `POST/PATCH /api/insurance-bonds` (`value`, cả multipart); `POST /api/variations` (`unitPrice` từng
  dòng, nhãn "Đơn giá dòng N"); `POST/PATCH /api/tenders/:id/bids` (`unitPrice` từng dòng qua
  `parseBidPrices` + `lumpSum`); `POST /api/boq` + `PATCH /api/boq/:id` (`unitPrice`/`subUnitPrice`,
  trước đây `Number(..) || 0` nuốt chữ rác và "1.500"; số âm vẫn 422); `POST
/api/engineering/bidding/quotes` (`totalAmountVnd` là BIGINT đồng → parser `precision 18, scale 0`,
  số lẻ → 400 `amount_scale`, `createVendorQuote` nhận `number | string`).
- **Hợp đồng lỗi**: "1.500"/"1234,5" → 400 `amount_locale_format`; sai dạng → 400 `amount_invalid`;
  quá scale → 400 `amount_scale`; vượt cột → 422 `amount_overflow` (trước đây PG "numeric field
  overflow" → 500). Đổi mã lỗi có chủ đích: giá trị tiền sai dạng ở các route trên 422 → 400.
- **UI**: không đổi — các form này dùng `<input type="number">` nên đã gửi số thuần.
- **Test**: `tests/s10-tien-dau-vao-route-2.test.ts` (8 ca route thật, mỗi nhóm có ca "1.500" → 400
  và ca tràn → 422 — **8/8 đỏ trên code cũ**). Cập nhật theo kiểu mới (chuỗi canonical): `claims`,
  `proposals`, `insurance`, `vo`, `tender`; `route-tai-chinh` ca "lỗi DB không phải trùng mã" đổi từ
  đơn giá tràn (nay 422 ở parser) sang khối lượng tràn NUMERIC(15,3) để vẫn canh nhánh `throw err`.
  Bộ liên quan 736 ca chạy tuần tự: 736 pass / 0 fail.

## 2026-10-08 — QUALITY-FINAL-1 S10: ĐẦU VÀO tiền exact (parser chung, tràn → 422, % tầng khoá dòng)

Phần "đầu vào" của S10 (A3-FR01/FR02, A3 §4) — đóng điểm mở của S10c về parse ô nhập tiền.
Không migration, không đổi kiểu cột, không reprice lịch sử.

- **Parser chung** `parseMoneyInput`/`parseOptionalMoneyInput` (`lib/nen/money.ts`): nhận JSON
  number hữu hạn hoặc chuỗi thập phân thuần ("1234567.5"); chuỗi có dấu phẩy/nhiều dấu chấm/nhóm
  nghìn vi-VN ("1.234.567", "1.500" — mơ hồ 1.500 đ hay 1,5 đ, không đoán) → **400
  `amount_locale_format`**; sai dạng/NaN/Infinity/số mũ → 400 `amount_invalid`; quá 2 số lẻ khác 0 →
  400 `amount_scale`; vượt NUMERIC(15,2) (`fitsNumeric`) → **422 `amount_overflow`**. Chuỗi không qua
  float; number dùng `String(n)` (exact với ≤ 15 chữ số có nghĩa — mọi giá trị vừa cột). Lỗi là
  `MoneyInputError`, route đổi qua `moneyInputErrorBody` → `{ error, code }`; thông điệp tiếng Việt
  không chứa giá trị nhập.
- **Route đã chuyển** (ghi chuỗi canonical, không `Number()`/`parseFloat`): `POST /api/payments/bills`
  (amount, labor), `PATCH /api/payments/bills/:id` (labor — tràn trước đây 500, số âm trước đây lặng
  lẽ thành null nay 400), `PATCH /api/payments` (contractValue nhận cả chuỗi), `POST/PATCH
/api/contracts` (value; PATCH đọc giá trị cũ `::text`), `POST /api/contracts/:id/addenda`
  (valueDelta, được âm), `POST/PATCH /api/advances` (amount) + hoàn ứng `settleAmount`, `POST/PATCH
/api/cash-transactions` (amount), `POST/PATCH /api/invoices` (netAmount/vatAmount), `POST
/api/purchase-orders` (unitPrice từng dòng). Input type `AdvanceInput`/`CashTransactionInput`/
  `InvoiceInput`/`ContractInput` giữ tiền dạng chuỗi canonical. Đổi mã lỗi có chủ đích: valueDelta/
  value sai dạng 422 → 400; contractValue tràn ở `PATCH /api/payments` 400 → 422.
- **Bill theo tầng** (`POST /api/payments/bills`): sheet phải thuộc dự án đang chọn (404, trước đây
  đọc được HĐ tầng của dự án khác); chạy trong `withProjectScope` (dự án `getCurrentProjectIdStrict`,
  không ghi bill project_id NULL); khoá dòng `floor_contracts` `FOR UPDATE` rồi mới cộng Σ % kỳ bằng
  NUMERIC (`Σ + ROUND(pct,4) > 1`, chỉ bill cùng dự án — khớp `pctPaid` của `/floors`). Trước đây so
  float có dung sai 0,0001 (cho 100,01%) và 2 lượt đồng thời 60% + 60% cùng được ghi.
- **Client** `/payments`: `chuanHoaTienNhap` (`lib/nen/money-dto.ts`, có test) đọc ô nhập vi-VN
  ("1.234.567" = 1.234.567 đ, "1.234,5", hoặc số thuần điền sẵn) → chuỗi canonical gửi server;
  `tienNhapSangMinor` dùng cùng quy tắc (bản cũ đọc "1.234.567" thành 1,23 đ). Ô nhân công/giá trị
  HĐ tầng/phát sinh/tạm ứng sai dạng → báo lỗi, không gửi; PATCH bill thất bại → trả giá trị cũ + báo.
  Các form khác (hợp đồng, quỹ, hoá đơn, PO, phụ lục) dùng `<input type="number">` nên đã gửi số thuần.
- **Test**: `tests/s10-tien-dau-vao.test.ts` (thuần: parser + chuẩn hoá vi-VN),
  `tests/s10-tien-dau-vao-route.test.ts` (10 ca route thật — **10/10 đỏ trên code cũ**: "1.500" ghi
  1,5 đ; tràn → `numeric field overflow` 500; 100,01% lọt; đồng thời ghi 120%; sheet dự án khác 200).
  Gỡ `FOR UPDATE` → ca đồng thời đỏ 2/3 lần; có khoá xanh 5/5. Cập nhật test theo hợp đồng mới:
  `s10c-thanh-toan-money`, `finance`, `contracts`, `route-tai-chinh` (ca "lỗi DB khác 23505" đổi sang
  ngày 2026-02-30), `route-tai-chinh-3a`/`3b`. Bộ liên quan 34 file chạy tuần tự: 759 pass / 0 fail.
- **Còn mở (chưa chuyển parser):** claims (`lib/tai-chinh/claims.ts` amountRequested,
  `app/api/claims/[id]/settle` amountSettled), proposals (`lib/tai-chinh/proposals.ts` amount),
  bảo lãnh (`lib/tai-chinh/insurance.ts` value), VO (`lib/tai-chinh/vo.ts` dòng unitPrice), gói thầu
  (`app/api/tenders/[id]/bids/**` unitPrice), BOQ (`app/api/boq/route.ts` unitPrice/subUnitPrice — còn
  `|| 0`), engineering bidding quotes (`totalAmountVnd`); `quantity` bill (NUMERIC(15,3)) vẫn
  `Number()` — tràn ≥ 10^12 vẫn 500; `pctThisPeriod` vẫn kẹp 0..1 bằng number (không phải tiền).

## 2026-10-08 — QUALITY-FINAL-1 S02d: nhà thầu phụ (công nợ) + EVM fail-closed

Cùng lớp S02 (A1-AC01/AC02), gọi route thật — 8/8 ca đỏ trên code cũ, xanh sau vá
(`tests/s02d-subcon-evm-scope.test.ts`).

- **`GET /api/subcontractors`:** trước trả `outstanding` (tiền công nợ) cho MỌI vai trò, cộng HĐ
  của mọi dự án (`subcontractorDebt` gọi `listContracts()` không lọc) và liệt kê NCC mọi tổ chức
  (`listSubcontractors` không lọc `org_id`). Nay `listSubcontractors(orgId, projectId)` +
  `subcontractorDebt(supplierId, projectId)` bắt buộc tham số; không dự án khả kiến → `{items: []}`;
  `outstanding` che (null) qua `stripSensitive("subcontractor")` khi thiếu `CAN.viewPayments`.
  Gộp với S10c: che TRƯỚC rồi mới đổi wire (`moneyOrNullToWire`/`subcontractorDebtToWire`) — giá
  trị bị che giữ null ở cả legacy lẫn `decimal-string-v1`.
- **`GET /api/subcontractors/:id`:** không dự án → 404 trước query nghiệp vụ; công nợ chỉ HĐ dự án
  đang chọn; hồ sơ gắn riêng dự án khác → 404 (cùng luật hiển thị với danh sách); cả khối `debt`
  che thành null khi thiếu `viewPayments` (mảng HĐ lồng 2 cấp, và danh sách HĐ vốn chỉ
  viewPayments xem được). Entity mới `subcontractor` khai trong `lib/bao-mat/sensitive-fields.ts`.
- **`GET /api/dashboard/evm`:** `projectId` null → `{series: [], summary: null}` thay vì tính EVM
  gộp toàn hệ; `getEvmSeries` nhận `projectId: number` bắt buộc, lọc dự án vô điều kiện (cả AC
  nguồn bills/cash).
- UI `/subcontractors`: ô công nợ + KPI "Tổng công nợ còn lại" hiện `MaskedValue` khi bị che, tab
  "Công nợ & Hợp đồng" báo không có quyền. Test cũ cập nhật theo luật mới
  (`subcontractors`, `route-to-chuc-thau-phu`: subcon không còn thấy `debt`; `route-task-cach-ly`:
  user được gán dự án cùng org để 404 đến từ lớp org).
- **Còn mở:** `?baseline=` của EVM/S-curve không kiểm `baselines.project_id` (không rò số liệu —
  chỉ áp ngày cho task của dự án đang chọn); subcon không còn thấy công nợ của chính mình (đúng
  luật `viewPayments`, cần chủ dự án xác nhận nếu muốn mở riêng); `subcontractorDebt` vẫn N+1
  (mỗi NTP 1 lần `listContracts` của dự án).

## 2026-10-08 — S03/A4-FR06: READ ONLY đặt tại BEGIN

- `withTransaction` nhận thêm `opts.readOnly`; `withProjectScope` không còn `SET TRANSACTION READ ONLY` sau BEGIN mà mở thẳng `BEGIN [ISOLATION LEVEL REPEATABLE READ] [READ ONLY]` (đúng chữ spec A4-FR06: snapshot/đọc-chỉ có hiệu lực trước mọi SELECT/set_config). Giữ nguyên: lồng trong transaction có sẵn không ép READ ONLY, từ chối repeatable_read lồng, GUC `app.project_id`, ROLLBACK khi lỗi. Test: `tests/db-begin-read-only.test.ts` (thứ tự câu BEGIN đỏ trên code cũ).

## 2026-10-08 — QUALITY-FINAL-1 S11 (đuôi): thông báo `cost_over` + dashboard theo hệ dùng mức cảnh báo exact

`lib/dich-vu/thong-bao.ts` (cost_over) và `bySystemBlock` (`lib/tien-do/dashboardext.ts`) chuyển từ
adapter legacy `costSummary` (so tỷ lệ trên number) sang `getCostReport` — MỘT báo cáo cho một dự án
(không N+1), mức `warn/over/no_budget` do `costAlertLevel` (nhân chéo bigint, không chia 0/float);
`budgetUsedPct` lấy từ `usageBasisPoints/100` (ngân sách ≤ 0 → 0). Thiếu dự án → không cảnh báo/số
liệu chi phí toàn hệ (fail-closed như S11). **Quyết định:** hệ `no_budget` (cam kết dương, ngân sách 0) NAY ĐƯỢC cảnh báo `cost_over` với nội dung "đã có cam kết nhưng chưa có ngân sách" (trước đây bị
`budget > 0` loại im lặng). `systemBudget` còn caller (`lib/tien-do/systems.ts`) nên giữ; `costSummary`
không còn caller production, chỉ còn test legacy (`cost.test`/`vo.test`/`audit-cost-query-reuse`) nên
giữ làm adapter. Test: 2 ca `cost_over` (số lớn sát ngưỡng, no_budget) trong `tests/thong-bao.test.ts`,
1 ca `bySystemBlock` khớp `getCostReport` trong `tests/dashboardext.test.ts`.
**Vá CI #598:** `getCostReport` tự mở REPEATABLE READ nên không gọi lồng được trong
`withProjectScope` của `GET /api/notifications` (500 — `tests/s02b-files-scope` bắt được): route
đọc báo cáo TRƯỚC khi mở scope qua `loadCostAlertReport` rồi truyền `opts.costReport` vào
`syncAndListNotifications`. `route-tai-chinh-3a` (PATCH settings 85/105) không trả lại ngưỡng →
test `cost_over` file sau trên cùng DB worker đỏ; nay trả lại bằng `t.after`, 2 ca mới tự chốt 90/100.

## 2026-10-08 — QUALITY-FINAL-1 S10c: tiền exact hợp đồng/thanh toán/mua sắm/EVM…

Phần "monetary inventory còn lại, ngoài costs/IPC" của S10 (A3-FR03/FR04/FR06, A3-AC01/AC03/
AC05, Q-AC04), cùng mẫu S10a (`paymentcerts.ts`): lib trả `MoneyMinor` (bigint đồng×100) tới
biên DTO; route opt-in `X-XBoss-Money-Format: decimal-string-v1` → chuỗi canonical +
`moneyFormat`, legacy number qua `moneyToNumberSafe`, ngoài biên → **422
`money_precision_unsupported`**; `private, no-store` + `Vary`. Adapter dùng chung
`lib/nen/money-dto.ts` (thuần, client import được). Không migration, không đổi parser DB.

- **Tài chính/quỹ/VAT** (`lib/tai-chinh/finance.ts`, `/api/finance/summary`, `/finance`): dòng tiền,
  công nợ phải thu/trả, tạm ứng, VAT là bigint; KPI trang cộng trừ bigint (biểu đồ dùng số xấp xỉ,
  tooltip exact).
- **NCC/thầu/NTP**: `supplierSummary`, `comparisonTable`/`awardTender` (giá trị HĐ ghi chuỗi exact;
  vượt NUMERIC(15,2) → 422 `amount_overflow`), `subcontractorDebt` + route/UI tương ứng.
- **EVM + báo cáo lưu**: `evmSummary` tính bằng bigint (tỷ lệ kế hoạch hữu tỉ, % đọc
  `progress_percent::numeric::text`, EAC = AC + (BAC−EV)×AC/EV exact, SPI/CPI chia bigint);
  `cost_by_month` giữ chuỗi canonical, sort `compareMoneyExact`, Excel chọn kiểu ô theo cột.
- **Hợp đồng**: `/api/contracts`, `/api/contracts/:id` (kể cả phụ lục/phiếu TT/giao thầu tầng);
  `poCommittedText` mới (khai trong `SENSITIVE.contract`); UI `/contracts`, tab HĐ `/commercial`
  cộng bằng bigint (`mSumTien`/`mSubTien`).
- **Thanh toán tiến độ** (`/api/payments`, `/bills`, `/floors`, `/payments`, `/payments/print`):
  `earned` (HĐ × tiến độ) tính trong SQL theo từng ô tầng × hệ, làm tròn tới xu RỒI mới cộng →
  tổng server = Σ dòng ở mọi cách lọc phía client; POST bill theo tầng tính
  `ROUND(contract_value × ROUND(pct,4), 2)` trong SQL thay cho nhân float JS (lệch 1 xu ở
  1.234.567.890.123,45 × 70%); ô nhập điền sẵn số thuần (bản `toLocaleString` cũ "1.234.567" bị
  đọc lại thành 1,234 đ khi sửa ô); bản in cộng/trừ bigint, lỗi tải → báo lỗi thay vì in số rỗng.
- **float8 × tiền**: `po_items.qty_ordered`, `tasks.progress_percent` ép `::numeric` TRƯỚC khi
  nhân — SUM float8 cũ mất xu và tổng lớn in dạng mũ (`1.999999999999998e+16`) làm `parseMoney`
  throw → 500.
- **Test** (route thật, đỏ trên code cũ → xanh): `tests/s10c-finance-money.test.ts` (2/2),
  `s10c-mua-sam-thau-money.test.ts` (4/6; 2 ca canh), `s10c-evm-bao-cao-money.test.ts` (3/3),
  `s10c-hop-dong-money.test.ts` (4/5 ca DB), `s10c-thanh-toan-money.test.ts` (4/4 ca route),
  `s10c-money-dto.test.ts` (thuần). Bộ liên quan 912 pass / 0 fail.
- **Còn mở:** `mv_cost_by_month.committed` là float8 (cần migration riêng); `/api/subcontractors`
  lộ `outstanding`/`debt` cho mọi vai trò + `subcontractorDebt`/`listSubcontractors` không lọc
  dự án/org (phát hiện, ngoài phạm vi S10c); `/api/dashboard/evm` projectId null = toàn hệ;
  parse ô nhập tiền (`Number(body.amount)`, `parseFloat` bỏ dấu chấm) chưa đổi; `mMul`/`mSumBy`
  float còn ở claims/variations/payment-certs page; `IpcPaymentsTab` gọi nhầm `/api/payments`
  (không có `bills`); nút "Excel" ở `/payments` gọi `export/excel?type=payments` nhưng route bỏ
  qua `type`; `payrollTotals` không còn caller.

## 2026-10-08 — QUALITY-FINAL-1 S14: verifier PITR (base backup + WAL) và diễn tập disposable

`scripts/verify-pitr.ts` (+ `scripts/lib/pitr-archive.ts`/`pitr-checks.ts` thuần, `pitr-io.ts`, `pitr-drill.ts`):
quét kho archive WAL + base backup (pg_basebackup -Fp/-Ft) → `wal-segments` (đoạn cụt), `wal-continuity`
(gap theo đường timeline `.history`), `pitr-window` (≥ 35 ngày, mép = STOP TIME tệp `.backup`),
`archive-lag` (≤120s PASS, 120–300s cảnh báo, >300s FAIL), `base-backup-manifests` (Manifest-Checksum),
`base-backup-integrity` (`pg_verifybackup -w <archive>`), `pitr-target` (đích tương lai/trước base/sau
WAL cuối → FAIL trước khi ghi), `recovery-set-*` (manifest v1 gắn base backup còn dùng được, WAL phủ
LSN snapshot, có key ref). `--drill-dir`: preflight marker `XBOSS_DISPOSABLE`/0700/không chồng lấn
kho/không root → chép base, kiểm bản chép, khởi động `postgres` cách ly qua argv (không TCP,
archive off, `archive_cleanup_command=''`, `primary_conninfo=''`, không preload; đích thời điểm pause,
`latest` standby — không promote), đo RPO qua `pg_last_xact_replay_timestamp`, RTO chỉ phần DB (không
bao giờ PASS). Mã thoát 0/1/2 (PASS/có FAIL/còn NOT_RUN). `recovery-manifest-cli` thêm
`--wal-archive-dir`/`--base-backups-dir`: khối `wal` + `baseBackupId` đo từ archive thật.
Test: `tests/pitr-archive.test.ts` (15 ca fixture tổng hợp: gap, đoạn cụt, archive lag, đích sai,
manifest bị sửa, timeline, RPO/RTO, mã thoát) + `tests/pitr-drill.test.ts` (9 ca trên cluster
PostgreSQL 16 tự dựng: khôi phục tới thời điểm/latest PASS, base hỏng/thiếu tệp FAIL, WAL gap FAIL có
lý do, marker sai/chồng lấn chặn trước ghi, kho không đổi byte nào; thiếu binary → ca NOT_RUN, không
skip). E2E tay trên schema XBoss đủ 158 migration: `drill-migrations` PASS, RPO 2s. Runbook mục PITR
trong `docs/ops/backup.md`. **[Người vận hành]:** bật `archive_mode`/base backup hằng ngày/canary trên
VPS rồi diễn tập theo runbook — tới lúc đó `pitr-window`/RTO đầy đủ chưa có bằng chứng.

## 2026-10-08 — QUALITY-FINAL-1 S10b/S11: báo cáo chi phí chuẩn `getCostReport` + tiền exact

`lib/tai-chinh/cost.ts` viết lại quanh service `getCostReport(scope, {groupBy, includeVo})`
(cost-report-v1, A4 §2–§3, A3); `GET /api/costs` gọi đúng service này (bỏ việc gọi lặp
`costSummary`/`costTotals` — `costTotals` đã xoá).

- **Tiền exact (S10b):** mọi tổng/tích trong SQL rồi `ROUND(…, 2)::text`, JS chỉ cộng bigint
  (`parseFixedDecimalExact`). BOQ qty(15,3)×đơn giá(15,2) cộng rồi mới làm tròn theo nhóm hệ.
  PO `qty_ordered` float8 nhân bằng `qty_ordered::text::numeric` (biểu diễn legacy_float_text) —
  bản cũ để Postgres ép đơn giá sang float8 rồi SUM float (0.1×3.00 ×3 = 0.9000000000000001);
  NaN/±Infinity loại khỏi tổng và đếm vào coverage. DTO opt-in header
  `X-XBoss-Money-Format: decimal-string-v1` (mẫu S10a), legacy number ngoài biên → 422
  `money_precision_unsupported`; `private, no-store` + `Vary`.
- **Nguồn/phạm vi (A4-FR01..FR04, Q-AC05):** pre-aggregate từng nguồn theo khoá thật (không JOIN
  chéo nguồn, không SUM DISTINCT), ghép theo system ID / (sheet_type_id, floor_label). Thanh toán
  dùng `payment_bills.project_id` trực tiếp + mọi cha (hợp đồng, đợt IPC→hợp đồng, sheet→tháp)
  cùng dự án; BOQ (hợp đồng, VO), PO (hợp đồng, vật tư, sheet), HĐ tầng (sheet, hợp đồng) cùng
  luật. Lệch lineage = invalid-scope: KHÔNG vào tổng nào, chỉ đếm `metadata.coverage`
  (`reconciled=false`, UI hiện "Báo cáo cần đối soát"). Đúng dự án nhưng chưa gán hệ/tầng =
  dòng "Chưa gán hệ"/"Chưa gán tầng", vẫn trong `projectTotals`. Thanh toán ở tầng chưa có HĐ
  tầng nay thành dòng riêng (bản cũ rơi mất).
- **API:** `rows`, `selectedTotals` (= Σ rows), `projectTotals` (cơ sở BOQ, gồm chưa gán hệ),
  `totals` legacy = `projectTotals`, `settings`, `alerts`, `metadata` (projectId, groupBy,
  includeVo, reportVersion, computedAt, currency, moneyFormat, budgetBasis `boq` |
  `floor-contract-proxy`, coverage). Một snapshot `withProjectScope` REPEATABLE READ READ ONLY,
  6 query (5 khi nhóm tầng) cố định, không N+1.
- **Cảnh báo (A4-FR07):** mức `warn/over` so bằng nhân chéo exact với `cost_settings` (vẫn cấu hình
  toàn hệ id 1, không đổi schema); ngân sách ≤ 0 + cam kết dương = `no_budget` (`pct: null`, không
  Infinity/100% giả). Legacy giữ hợp đồng cũ: không trả `no_budget` trong `alerts`.
- **Caller cũ:** `costSummary`/`systemBudget` (thông báo `cost_over`, dashboard theo hệ, tóm tắt
  hệ) dùng chung nguồn exact; thiếu dự án → `[]`/`null` (fail-closed, bỏ chế độ "toàn hệ" cộng
  chéo dự án/tổ chức). UI `/costs` + tab hạn mức `ContractsTab` opt-in v1, số đầy đủ/% bằng
  bigint (`app/costs/_components/dinhDangChiPhi.ts`), nhãn tổng "dự án" + dòng "Tổng các dòng
  đang hiển thị".
- **Bằng chứng đỏ trên code cũ** (`tests/cost-report.test.ts`, route thật): AC02 budget 1000 ≠
  1500 (BOQ chưa gán hệ rơi mất); Q-AC05 actual 1066 ≠ 1000 (cộng thanh toán lệch lineage);
  AC03 committed 0.9000000000000001 ≠ 0.9; AC04 actual 7010 ≠ 10 (hai snapshot — cũng đỏ khi chỉ
  gỡ `isolation` khỏi service mới); FR07/§3/A3-AC01 đỏ vì thiếu trường/định dạng. Xanh sau vá;
  `cost.test.ts`/`vo.test.ts`/`audit-cost-query-reuse.test.ts`/`audit-auth-project-regression`
  cập nhật theo shape mới (fixture thanh toán có `project_id` như writer thật).
- **Còn mở:** số coverage invalid-scope phụ thuộc RLS (role app không thấy dòng project khác —
  tổng giống hệt, chỉ số đếm ít hơn); chưa benchmark p95 (A4-AC08 = NOT_RUN); PO vẫn đọc float
  legacy (chờ cột exact/provenance của DATA-MIGRATIONS §6); `cost_over` (`thong-bao.ts`) và
  `bySystemBlock` vẫn so tỷ lệ trên number của adapter legacy; `reports.ts cost_by_month` thuộc S10c.

## 2026-10-08 — QUALITY-FINAL-1 S12: portfolio trọng số theo task

A4-FR08/AC05–AC07: `portfolioKpi` (`lib/ha-tang/projects.ts`) tính `avgProgress` = tổng
`tasks.progress_percent` / số task hợp lệ trong 1 câu SQL (không còn TB theo dự án); dự án
không task không thêm mẫu số; không task → `avgProgress: null`, `progressAvailable: false`,
`taskCount: 0`; progress NULL/ngoài [0,1] bị loại và báo `coverage {validTasks, excludedTasks}`.
List và KPI dùng chung nguồn/phạm vi org + visibility; `GET /api/portfolio/kpi` nhận `?org=` như
`/api/projects`. Trễ theo ngày VN, kế thừa ngày KT nhóm. UI: nhãn "Tiến độ theo công việc",
"Chưa có dữ liệu", làm tròn xuống, tách loading/lỗi. Test `tests/portfolio-kpi.test.ts` (4 ca đỏ
trên code cũ, ca trễ VN đã xanh từ trước).

## 2026-10-08 — QUALITY-FINAL-1 S02b/S02c: tracking, file/QC/HSE, dashboard/export fail-closed

Cùng mẫu S02a (#591): `getCurrentProjectId` null → **404** cho chi tiết/ghi/tải file/export,
**200 rỗng đúng shape** cho danh sách/tổng hợp màn hình chính (UI không vỡ); bỏ `?? "*"`, bỏ
`if (projectId)`/bỏ-lọc-khi-rỗng; lọc dự án vô điều kiện. Ca âm đỏ trên code cũ, xanh sau.

- **S02b tracking/BOQ** (10/12 ca đỏ trên code cũ): `boq-norms/[id]` PATCH/DELETE (sửa được định mức
  dự án khác), `boq/[id]/norms` GET/POST, `boq/[id]/norm-usage`, `lookahead`, `my-tasks`, `timeline`,
  `search` (+ `searchSources` FTS), `tasks` GET (null → 404 vì shape bắt buộc có `sheet`),
  `systems/[code]/uploads`; `floor-stage-fronts` PUT chặn transition stage riêng của dự án khác và NCC của org khác.
  Helper fail-closed: `getNorm`, `pendingStageFloors`, `searchSources`. Định mức chỉ nhận vật tư
  cùng dự án (`checkNormMaterial`).
- **S02b file/QC/HSE/thông báo** (9/10 ca đỏ): `correspondence-files/[id]` + `hse-photos/[id]`
  GET/DELETE (xem/xoá file dự án khác), `inspection-requests` GET/POST, `qc/documents` (+ zip),
  `qc/inspections`, `notifications/feed`; `notifications` GET khi null KHÔNG chạy đồng bộ cảnh báo
  toàn hệ, chỉ trả thông báo riêng của user (`listNotifications`).
- **S02c dashboard/export** (7/8 ca đỏ): `dashboard`, `dashboard/forecast|spi|scurve` (scurve bỏ
  dòng sentinel `project_id=0` toàn hệ của matview), `export/excel` (slug sheet theo dự án đang
  chọn; slug lạ 400 → 404 không lộ tồn tại), `export/pdf` (bỏ fallback `projects LIMIT 1`),
  `admin/integrations` (null chỉ còn tích hợp cấp org). `saved-reports` GET là dương tính giả.
- Test: `tests/s02b-tracking-scope.test.ts`, `tests/s02b-files-scope.test.ts`,
  `tests/s02c-dashboard-scope.test.ts`. Inventory S00 sinh lại + khối tay ghi trạng thái.
- **P1-2 đóng:** `invoices` POST/PATCH kiểm `contract_id`/`payment_bill_id` cùng dự án (và bill
  thuộc đúng hợp đồng) bằng `checkInvoiceParents` — kiểm + ghi cùng transaction, khoá cha `FOR SHARE`.
- **P1-5 đóng:** `runReport` nhận `projectId: number`, lọc dự án vô điều kiện (bỏ sentinel `?? 0`
  toàn hệ ở `cost_by_month`); `saved-reports/[id]/data` không dự án → rỗng đúng shape, báo cáo gắn
  dự án khác → 404. Hệ quả: phiếu thanh toán không có `sheet_type_id` không còn được tính.
- **P1-6 đóng:** `sheets` PUT kiểm mọi id thuộc dự án đang chọn + org trong 1 câu UPDATE atomic
  (sai → 404, không đổi dòng nào; validate ≤ 200 id, không trùng); `sheets` GET chỉ liệt kê sheet dự
  án đang chọn; `sheets/[id]` PATCH/DELETE theo dự án đang chọn (trước: mọi dự án khả kiến).
- **Cùng lớp P1-2 (id cha từ body) — đã vá (4/4 ca đỏ trên code cũ):** `cash-transactions` POST/PATCH
  (hợp đồng cùng dự án, NCC cùng org — `checkCashTransactionParents`), `purchase-orders` POST
  (`checkPurchaseOrderParents`: NCC cùng org, hợp đồng/vật tư/PR từng dòng cùng dự án — trước đó còn
  đổi được trạng thái PR dự án khác sang `ordered`), `claims` POST/PATCH (`checkClaimRefs(input,
projectId)`: hợp đồng + VO cùng dự án, VO đúng hợp đồng). `getSystemSummary(code, projectId)`:
  sheet/task/NCR/ngân sách theo dự án đang chọn, danh sách nhà thầu chỉ NCC cùng org.
- **Rà NOT_MAPPED cụm 1 (org/dự án/user):** vá `comments/[id]` DELETE (admin org khác xoá được bình
  luận), `systems` GET (tổng hợp gộp mọi org — `listSystems(projectId)`), `ui-texts` (đọc/ghi "dự án
  đầu" toàn hệ → nay theo dự án đang chọn + org; nhãn đã sửa trước đây chỉ còn ở dự án id nhỏ nhất).
  Các route suppliers/subcontractors/notifications/push/users đã đúng.
- **Rà NOT_MAPPED cụm 2 (quản trị/API/cron) — 14 chỗ rò chéo org đã vá (14/14 ca đỏ trên code cũ):**
  `admin/alert-rules` POST + `[id]` DELETE (`upsertAlertRule` ghi đè ngưỡng org khác), `admin/approval-flows`
  POST/PATCH/DELETE, `admin/audit` (trả `assignment_log` mọi org → nay theo dự án khả kiến),
  `admin/code-lists` GET/PATCH/DELETE (`getListOfOrg`, `getById(id, orgId)`), `admin/custom-fields` POST,
  `admin/feature-flags` PATCH (bật/tắt module dự án org khác), `admin/integrations` POST (upsert ghi đè
  config org khác), `admin/sod-report` (`buildSodReport(days, orgId)`), `saved-reports/[id]` PATCH/DELETE,
  `user-projects` GET, `import/excel` (trước ghi vào dự án tìm theo TÊN thuộc org 1 → nay dự án đang
  chọn, `getCurrentProjectIdStrict`), `cron/sync-integrations` nhánh phiên lọc org. API `v1/*`, api-keys,
  webhooks, projects, portfolio đã đúng (test sẵn có).
- **Còn mở, cần đặc tả schema:** `cost_settings` (bảng 1 dòng toàn hệ — admin org B đổi ngưỡng của
  org A) và `code_lists` (`UNIQUE(domain, code)` toàn hệ, `getList` không lọc org) — cần migration
  khoá theo org + backfill, đi qua staging. Cùng loại: `alert_rules` (index unique
  `(metric, COALESCE(project_id,0))` toàn hệ → org B tạo rule toàn cục khi org A đã có thì 500;
  `getAlertThreshold`/`listAlertRules` đọc rule toàn cục org khác), `admin/traffic/events` (nhật ký
  traffic in-memory không gắn org, admin org nào cũng xem), `sheet_types.slug` unique toàn hệ (import
  sang dự án thứ 2 lỗi trùng slug); chính sách nhánh phiên của `cron/retention`/`deliver-webhooks`
  (admin một org kích hoạt tác vụ toàn hệ, chỉ trả số đếm).

## 2026-10-08 — QUALITY-FINAL-1 S02a: fail-closed khi không có dự án khả kiến (miền tài chính)

Mẫu chung: `getCurrentProjectId` trả null (user không có dự án khả kiến) → route trả **404 trước
mọi query nghiệp vụ**, bỏ `withProjectScope(projectId ?? "*")` (GUC RLS toàn hệ) — A1-AC02/AC03.

- **Lỗ hổng thật (test đỏ trên code cũ):** `claims` GET danh sách, `claims/[id]` GET/PATCH/DELETE,
  `claims/[id]/documents` GET/POST, `claim-documents/[id]` GET/DELETE, `contract-documents/[id]`
  GET/DELETE (trước đây `if (projectId)` mới lọc — DELETE xoá được tài liệu dự án khác),
  `claims/[id]/settle|reject` (ghi được claim dự án khác). Gốc: `getClaim(id, null)` bỏ lọc dự án →
  nay fail-closed khi null.
- **Làm chặt (đã fail-closed qua helper, test là chốt hồi quy):** GET chi tiết `advances`,
  `cash-transactions`, `invoices`, `payroll`, `purchase-orders`, `tenders`, `payment-certs` (+ Excel/PDF).
- Test: `tests/s02a-cum1-detail-scope.test.ts`, `tests/s02a-cum2-claims-scope.test.ts`,
  `tests/s02a-payment-certs-null-scope.test.ts` (route thật; ca không dự án/dự án khác/đúng dự án).
- **Payment (lỗ hổng thật, 6/9 ca đỏ trên code cũ):** `GET /api/payments`, `GET /api/payments/floors`
  (trước bỏ lọc dự án khi rỗng + `OR project_id IS NULL`), `PATCH/DELETE /api/payments/bills/:id`
  (bỏ `billBelongsToProject` — cho qua khi null và dòng legacy NULL, P1-1; nay MỘT câu
  `UPDATE/DELETE … WHERE <scope dự án + cha cùng org> RETURNING id`, không kiểm-rồi-ghi). Dòng legacy
  `project_id IS NULL` không hiện/không sửa/xoá qua dự án nào. `getCurrentProjectIdStrict` (lib/ha-tang)
  tách từ tiền lệ GET bills: cookie sai → null (404), không fallback dự án đầu. Thêm `private, no-store`.
  Test `tests/s02a-cum3-payments-scope.test.ts`; cập nhật `S00-PAYMENT-SCOPE-INVENTORY.md` (mục 2, 3 ĐÓNG).
- Sinh lại `S00-SCOPE-INVENTORY.md`. Còn mở S02a: các route tài chính khác chưa có trong danh sách
  nghi vấn của inventory; S02b/S02c.

## 2026-10-08 — S10a đóng nợ M4/L5/L6 + dòng KL exact trong DTO v1

- **M4:** `withTransaction`/`withProjectScope` nhận `isolation: "repeatable_read"` (`BEGIN ISOLATION
LEVEL REPEATABLE READ`; lồng trong transaction có sẵn → throw, không lặng lẽ mất đảm bảo). Excel,
  PDF và `GET /api/payment-certs/:id` đọc đợt/tổng/dòng exact trong MỘT snapshot → PATCH KL chen
  giữa không còn gây 500 hay tổng lệch dòng.
- **L5:** `lib/tai-chinh/excel-exact.ts` chọn kiểu ô Excel THEO CỘT (một giá trị vượt 15 chữ số có
  nghĩa → cả cột text canonical; khối 4 dòng tổng là một nhóm) + dòng ghi chú "không dùng SUM".
- **L6:** `POST /payment-certs/:id/submit` chặn vô điều kiện giá trị đợt/đề nghị vượt NUMERIC(15,2)
  (422 `amount_overflow`, kể cả khi không có luồng duyệt); `decide` giữ kiểm phòng thủ, người không
  có `viewPayments` nhận 422 `cert_invalid` chung (không lộ độ lớn giá trị), `log.warn` phía server.
- **DTO:** header `decimal-string-v1` → `cert.items[].unitPrice/qtyPeriod/qtyCumulative/boqQtyContract`
  là chuỗi canonical đọc `::text` (`certItemsExact` + `certItemsToWire`); legacy giữ number, không
  round-trip được → 422 `money_precision_unsupported` như totals; che đơn giá trước khi đổi wire.
  Client hiện không đọc `items` từ response v1 (chứng từ lấy từ GET danh sách) nên chưa đổi UI.
- Test: `tests/payment-certs-excel-exact.test.ts`, `tests/payment-certs-amount-overflow.test.ts`
  (ca L6 đỏ trên code cũ, đã kiểm), mở rộng `tests/payment-certs-money-dto.test.ts`. Chạy thật trên
  Postgres 16 cục bộ: toàn bộ test xanh trừ 2 file phụ thuộc môi trường CI (cũng đỏ trên main sạch).
- Sinh lại `S00-SCOPE-INVENTORY.md`.

## 2026-10-08 — S10a đóng nợ: ngưỡng duyệt IPC + PATCH atomic + lỗi 500 không lộ message

- **[HIGH, đã đóng] Lách ngưỡng duyệt IPC:** `approval_requests.amount` chốt lúc lập đợt nháp và
  PATCH sửa KL không cập nhật → `advanceApproval` so `min_amount` theo giá trị cũ. Nay
  `POST /payment-certs/:id/submit` (đã khoá đợt `FOR UPDATE`) tính lại `periodValue` và gọi
  `resyncApprovalAmount` (`lib/tien-do/approvals.ts`): cập nhật amount + chọn lại bước hiệu lực
  đầu tiên cho request CHƯA có `approval_actions` (kể cả mở lại request đã tự `approved` khi amount
  mới kéo bước vào); giá trị không round-trip exact → 422 `money_precision_unsupported` chỉ khi
  thật sự có request; không có luồng duyệt → no-op như cũ.
- **PATCH `/api/payment-certs/:id`:** khoá đợt `FOR UPDATE OF c` + kiểm `draft` + `saveCertItems`
  (DELETE + INSERT) cùng một `withTransaction` → trình/duyệt đồng thời không chen được, lỗi giữa
  chừng rollback (đợt không mất dòng KL).
- **L7:** nhánh catch của `submit`/`decide`/PATCH chỉ trả thông điệp khi lỗi có chủ đích (`status`);
  lỗi bất ngờ → `log.error` + thông báo chung tiếng Việt (không lộ message pg/mã nội bộ).
- **Vá theo audit (cùng nhánh):** `resyncApprovalAmount` lọc theo `project_id`, lấy request MỚI NHẤT
  trước rồi mới xét trạng thái, đặt lại `created_at` (SLA tính từ lúc trình), giá trị tràn
  NUMERIC(15,2) → 422 `amount_overflow` (không 500); **đợt lập TRƯỚC khi Admin bật flow** nay được
  mở request lúc trình (`openAs`) nên không còn rơi về đường `CAN.approve` không SoD; khối lượng
  đợt ≥ 1e11 → 422 (trước đây tràn INSERT sau khi đã DELETE → 500); log 500 ghi message + `pgCode`.
- **[Người vận hành] Rà đợt đã trình/duyệt trước bản vá** (có thể đã lách ngưỡng): truy vấn chỉ-đọc
  `period_value` vs `approval_requests.amount` vs `approval_steps.min_amount` — xem
  `docs/ops/s10a-doi-soat-phieu-da-duyet.md` (đã bổ sung truy vấn).
- Test: `tests/approvals-resync-amount.test.ts` (7 ca, lib) + `tests/payment-certs-submit-resync.test.ts`
  (5 ca qua route thật; ca lách ngưỡng đỏ trên code cũ).
- **Còn mở (S10a):** M3 đối soát phiếu đã duyệt (cần người vận hành); M4/L5/L6 đã đóng ở mục trên.

## 2026-10-07 — QUALITY-FINAL-1 S10a: IPC exact (ipc-sum-v1) + DTO tiền decimal-string-v1

`certTotals` đọc `qty_period`/`unit_price`/`advance_pct`/`retention_pct` bằng `::text` và tính
bằng `ipcSumV1`, trả MoneyMinor (bigint) — sửa 2 lệch S09 phát hiện (tạm ứng nửa xu 9,63 → 9,64;
tổng vượt 2^53 mất xu); 2 ca golden route hết `todo`. `GET /api/payment-certs/:id`: header
`X-XBoss-Money-Format: decimal-string-v1` → `totals` chuỗi canonical + `moneyFormat`; không
header → number legacy qua `moneyToNumberSafe`, ngoài biên **422 `money_precision_unsupported`**;
mọi response `private, no-store` + `Vary`. Caller: POST lập đợt (amount phê duyệt round-trip
exact), duyệt đợt ghi `payment_bills.amount` chuỗi exact (vượt NUMERIC(15,2) → 422), Excel ô text
khi > 15 chữ số có nghĩa + thành tiền dòng exact, PDF định dạng tổng + thành tiền dòng bằng bigint
(1,005 × 100,00 → 101 đ, float cũ ra 100 đ). Test `tests/payment-certs-money-dto.test.ts` (A3-AC05).

Vá theo audit S10a (cùng nhánh): **M1** PDF thành tiền dòng từ `certLinesExact` (bigint, làm tròn
đồng ties xa 0); **M2** chứng từ IPC (`CertDocument`) gửi header decimal-string-v1, hiển thị tổng
exact, lỗi tải hiện thông báo tiếng Việt (không còn lẫn với "•••" bị che), 422 vẫn kèm
`vuotHopDong` (`app/payment-certs/_components/chiTietDot.ts`, test `payment-certs-money-ui`);
**L3** `certTotals` không đọc được dòng hợp đồng (vd RLS che) → `log.error` + throw (500), không
lặng lẽ coi tạm ứng/giữ lại 0%; **L4** `private, no-store` cho PDF, GET danh sách, PATCH;
**L1** `scripts/mutation-check.mjs` thêm 2 mutation tiền IPC (`mulRatio` chặt cụt, ipc-sum-v1
round từng dòng) đòi CẢ 3 file golden/route/DTO đỏ, tiến trình con nay bật cờ mock.module;
**L2** test POST 422 (amount phê duyệt vượt biên), luỹ kế nửa xu 0,015 → 0,02, hợp đồng 0%.

**Nợ kỹ thuật S10a (chưa làm trong PR này):**

- **M3 — đối soát phiếu đã duyệt trước S10a:** phiếu `payment_bills` của đợt duyệt bằng cách
  tính float cũ có thể lệch 0,01 đ so với ipc-sum-v1. Không tự sửa; truy vấn chỉ-đọc + hướng dẫn
  ở `docs/ops/s10a-doi-soat-phieu-da-duyet.md` — cần người vận hành chạy trên staging/prod.
- **M4, L5, L6, L7** — các phát hiện còn lại của audit S10a, để đợt sau:
  M4 = Excel đọc dòng KL bằng 3 câu READ COMMITTED riêng, PATCH chen giữa → 500 (cần REPEATABLE READ
  hoặc lấy `::text` ngay trong `fetchCerts`); L5 = cột "Thành tiền" Excel trộn ô số/ô text khi vượt
  15 chữ số có nghĩa nên `=SUM()` bỏ qua ô text không báo; L6 = người duyệt bước cuối không có
  `viewPayments` nhận 422 "vượt giới hạn lưu trữ" nên suy ra được giá trị ≥ 10^13 đ; L7 = nhánh catch
  của `decide` trả `e.message` ở lỗi 500 (có thể lộ message pg/mã nội bộ). Đã biết thêm: `items.unitPrice`/`qty*` trong `json_agg` của
  `fetchCerts` vẫn JSON number (kể cả khi gửi header v1); `contractCumulativeValue`/
  `overContractCerts` vẫn qua `moneyToNumber`; `approval_requests.amount` NUMERIC(15,2) tràn
  (500) khi periodValue > 10^13; Excel/PDF trả 500 nếu dòng KL bị PATCH chen giữa 2 câu SELECT.
- **[Có thể HIGH, ngoài phạm vi S10a] Ngưỡng phê duyệt IPC cũ:** `approval_requests.amount` chốt
  lúc POST lập đợt (`app/api/payment-certs/route.ts:134-153`) và PATCH sửa KL KHÔNG cập nhật nó;
  `advanceApproval` so ngưỡng bước theo `req.amount` cũ (`lib/tien-do/approvals.ts:241`) → lập
  nháp giá trị nhỏ, sửa KL tăng rồi trình là lách được bước duyệt theo `min_amount`.
- **PATCH `/api/payment-certs/:id`:** kiểm `status = 'draft'` không `FOR UPDATE` (trình/duyệt
  đồng thời vẫn sửa được KL); `saveCertItems` DELETE + INSERT ngoài transaction (lỗi giữa chừng để
  đợt mất dòng KL).

## 2026-10-07 — QUALITY-FINAL-1 S14: recovery manifest v1 + verifier PASS/FAIL/NOT_RUN

Manifest khôi phục v1 (`scripts/lib/recovery-manifest*.ts`, CLI sinh cùng `pg_dump --snapshot` để
manifest khớp đúng dump; tệp `*.recovery-v1.json`, không ghi đè) + verifier `npm run audit:verify-dr
-- --manifest` mở rộng: migration name+SHA256, digest bảng trọng yếu, tổng tiền exact (so chuỗi),
24 luật FK/mồ côi/lệch org-project, audit chain + watermark, tệp critical (size/hash), tham chiếu
key, schema objects; RLS che/thiếu quyền → NOT_RUN (không PASS số 0 giả). Marker disposable
`DR_VERIFY_EXPECTED_MARKER` nay **bắt buộc**. Test PostgreSQL thật: A6-AC02/AC03/AC04 PASS, A6-AC01
PASS lớp fixture (chưa PITR thật); WAL/RPO/RTO (A6-AC05/Q-AC08) và khả dụng key NOT_RUN → chưa thể
`completeDrVerified=true` khi chưa có hạ tầng archive/kho key. Sửa kèm: verifier cũ truy vấn bảng
không tồn tại `engineering_relations` nên `table-counts`/`engineering-relations` luôn FAIL trên
schema thật. Runbook `docs/ops/backup.md`. Không sửa `backup.sh`/`restore-check.sh`.

## 2026-10-07 — QUALITY-FINAL-1 S09: tiền exact + golden tests

`lib/nen/money.ts` thêm (không đổi nghĩa helper cũ): `isCanonicalDecimal` (validator wire tách
khỏi parser), `fitsNumeric` (luật tràn numeric(p,s) như PostgreSQL 22003), `ipcSumV1` (SUM exact
rồi round tổng; tạm ứng/giữ lại tính trên periodValue rồi round từng khoản — A3-FR05).
Golden/property test A3-AC01..AC04 (3000 mẫu seed cố định, parity PostgreSQL numeric) + golden
route IPC thật. **Phát hiện lệch trên đường IPC hiện tại (chưa sửa, giao S10)**: `certTotals`
dùng `mulRate` float → tạm ứng 10,25% × 94,00 ra 9,63 thay vì 9,64; tổng vượt 2^53 mất xu qua
`moneyToNumber`. Hai ca đánh `todo` trong `tests/money-ipc-golden-route.test.ts` — S10 bỏ `todo`.
Bẫy SQL ghi cho S10: `round(v*rate/100,2)` làm tròn kép khi v ~10^13 — dùng `*0.01`.

## 2026-10-07 — QUALITY-FINAL-1 S00: inventory scope toàn bộ route API

`scripts/audit-route-inventory.ts` (AST) sinh `docs/nang-cap/AUDIT-2026-09-25/S00-SCOPE-INVENTORY.md`
(`npm run audit:route-scope`): 392 file route, 622 (file, method) — mỗi dòng có dữ kiện auth/quyền/
resolver dự án/projectId từ client/NULL-as-wide và verdict cú pháp (SCOPED_SYNTACTIC 469,
NOT_MAPPED 98, NULL_AS_WIDE_SUSPECT 52, NO_AUTH 3) — **không dòng nào là "đã an toàn"**. Kiểm định
tay 15 dòng mẫu: heuristic NULL-as-wide chính xác ~20%, SCOPED_SYNTACTIC có âm tính giả qua lib.
Phát hiện P1 đọc tay (chưa sửa, giao S01/S02): bills/[id] null-as-wide; invoices nhận contract/bill
từ body không kiểm cùng dự án; boq/[id]/norms, hse-photos/[id], tasks GET bỏ lọc khi projectId null;
`lib/tien-do/reports.ts` saved-reports; `sheets` PUT sắp xếp theo id client không kiểm scope.
Test canh lệch 19 ca. Không sửa route, không migration.

## 2026-10-07 — Deploy bắt buộc host key VPS đã ghim (QUALITY-FINAL-1 S03/N05)

`deploy.yml` bỏ fallback `ssh-keyscan` (tin lần đầu, hở MITM): thiếu secret `VPS_SSH_KNOWN_HOSTS`
hoặc secret không có dòng khớp `VPS_HOST` → job dừng trước mọi kết nối SSH; mọi lệnh `ssh`/`rsync`
thêm `StrictHostKeyChecking=yes`. `DEPLOY.md` đổi secret thành bắt buộc + cách lấy fingerprint qua
console nhà cung cấp. Test `tests/deploy-known-hosts.test.ts` 4 ca (1 pass/3 fail trên bản cũ).
**[Người vận hành]:** khai `VPS_SSH_KNOWN_HOSTS` cùng lúc xử lý `/etc/xboss/migrate.env` (#570).

## 2026-10-07 — Rà nợ & lộ trình hoàn thiện (chưa code)

Tổng hợp sổ nợ #572 (N01–N12), PLAN S00–S16 và trạng thái main `49283cf` thành lộ trình 5 đợt
tại `docs/ops/lo-trinh-hoan-thien-2026-10-07.md`. Không còn PR mở; N04 thực chất đã xong qua
#574. Đường găng: N05 (credential migrator VPS, cần người vận hành) — production chưa nhận bản
nào sau #560. Còn lại code: S02 caller scope, S05–S08 offline vault, S10–S13 tiền/báo cáo,
S14 PITR. Chỉ tài liệu, không đổi code/schema, không đóng khoản nợ nào.

## 2026-10-07 — Nâng @sentry/nextjs lên 11.4.0 (PR #580)

- v11 bỏ export `withSentryConfig` khỏi entry gốc (điều kiện `node` trỏ CJS) nên `next build`
  đỏ "Failed to load next.config.mjs". Đổi sang `import { withSentryConfig } from "@sentry/nextjs/config"`
  trong `next.config.mjs`. Local: build + typecheck + lint xanh; CI trên PR vẫn là cổng quyết định.

## 2026-10-06 — Xác nhận main đã nhận PR #574

GitHub xác nhận PR #574 đã merge tại `c838a1279359ad41e670cd33db22489858264061`
ngày 06/10/2026 lúc 16:20:12 UTC; tree khớp bản tích hợp đã kiểm. Nhánh nguồn đã bị xóa.
Bản bổ sung credential runtime tiếp tục từ main này, không cố ghi vào nhánh đã đóng.
Chưa xác nhận deploy/production đạt chỉ từ sự kiện merge; các ghi nhận chờ nhập ở dưới là lịch sử.

## 2026-10-06 — QUALITY-FINAL-1: CI tích hợp đạt, khóa thêm credential runtime

- Đã tích hợp #571/#562/#565/#567/#568/#566/#569 với dependency #573 trên nhánh riêng.
  Commit `a81bbb3509f3292a3f4cdffe28e0cc44b1937f2d`: full PR CI run `37492679580` đạt;
  không cộng kết quả các PR khác nhau. Các cổng chỉ-main vẫn chưa chạy trên bản này.
- Rà tiếp S03 phát hiện guard bỏ sót `.env.production[.local]` và cú pháp export/colon;
  đã thêm chặn trước mutation deploy và trước nạp PM2, giữ credential chỉ cho migrator.
  Kiểm local Node 24.21.0: 64 test deploy/PM2/restore đạt, 0 skip; bộ ca mới làm code cũ đỏ.
  Full CI/review trên commit bổ sung vẫn bắt buộc, không dùng run cũ để đóng bước này.
- Đã đồng bộ README Node24/migration riêng và trạng thái offline tạm khóa, bổ sung DEPLOY/staging.
- #575 đã chạy nhưng dừng trước SSH: `VPS_SSH_KNOWN_HOSTS` không khả dụng. Không đọc/sửa VPS,
  không tự xác nhận credential đã hợp lệ. Workflow chỉ đọc tạm đã dọn. N05/N12 vẫn BLOCKED_ENV.
- OCR review của `a81bbb3` có job xanh nhưng bước LLM bị skip do cấu hình, không tính review đạt.
  Đã gửi yêu cầu Copilot reviewer cho #573; phải có review thực trước ghi nhận, không gán nhãn agent chạy giả.
- Có snapshot toàn mã+toolchain từ Actions được kiểm SHA-256 và tree `78a10708e31209f9c4b811f3a9c00dad161e34c6`
  để kiểm tại chỗ. Vẫn chưa có PostgreSQL local hoặc access production; DB/E2E dựa vào CI thật.
- Chi tiết tại `docs/ops/quality-runtime-guard-2026-10-06.md`. N06–N09/N11 chưa hoàn tất toàn bộ AC;
  không bật queue offline, đổi parser tiền, cutover membership hoặc công bố RELEASE_VERIFIED.

## 2026-10-06 — QUALITY-FINAL-1: dựng ứng viên tích hợp riêng

Ứng viên ghép #571/#562/#565/#567/#568/#566/#569 cùng dependency #573.
Chi tiết SHA tại docs/ops/quality-integration-2026-10-06.md; giữ #566 trước #569.
Đã sửa fixture #571 thiếu NODE_ENV gây TS2741, không nới kiểm tra TypeScript.
Chưa nhập main hoặc phát hành. Full CI và review trên commit kết hợp vẫn bắt buộc.
N05 vẫn BLOCKED_ENV: ghi nhận chuẩn bị credential ở lịch sử #562 không phải
bằng chứng file đọc được, preflight hoặc deploy production thành công.
Không đóng toàn bộ 54 AC, bật offline hoặc thay quy tắc tiền/IPC.

## 2026-10-06 — QUALITY-FINAL-1: vá dependency chặn CI

Cập nhật source-map-js lên 1.2.2 (GHSA-68fv-2mgg-jv7q) và sharp lên 0.35.5
(GHSA-wq5f-xc86-pv6w), gồm các binary sharp/libvips đi kèm; không nâng package khác.
Lockfile được npm dựng trên Node 24; kiểm phạm vi, npm ci với ignore-scripts,
audit production và nạp sharp đạt trên ứng viên. Full CI/review trên commit
tích hợp vẫn bắt buộc; không coi đây là nghiệm thu production hoặc toàn bộ 54 AC.
Tiếp tục QUALITY-FINAL-1 và sổ nợ #572. #571 cùng credential migrator trên VPS
còn là điều kiện riêng. Không hạ cổng, đổi schema hoặc bật offline queue.

## 2026-10-05 — QUALITY-FINAL-1 S02a: khóa PATCH giá trị hợp đồng tầng theo dự án

`PATCH /api/payments` nay yêu cầu dự án đang chọn và org hợp lệ, kiểm toàn bộ sheet theo
`sheet → tower → project → org`, từ chối ID/dữ liệu sai và batch trùng, đồng thời giới hạn
kích thước batch. Hợp đồng liên kết hiện hữu phải cùng dự án; ghi một lần trong transaction
với điều kiện scope ở SQL và trả số dòng thực ghi. Test route bổ sung batch hai dòng,
chéo dự án, không có dự án, input sai, rollback và hợp đồng liên kết. Đây là bản vá P1
hẹp từ kiểm kê S00 payment, chưa đóng S02a/S01/S03 toàn miền. PostgreSQL disposable trong
CI là bằng chứng SQL; không dùng production DB. Các GET/POST/DELETE payment khác và
money decimal-string vẫn còn trong kế hoạch.

## 2026-10-05 — QUALITY-FINAL-1 S02a: khóa GET danh sách phiếu thanh toán

`GET /api/payments/bills` yêu cầu dự án khả kiến cùng tổ chức; cookie dự án sai
trả 404, cookie vắng chọn dự án khả kiến đầu như các trang hiện hữu. Query chỉ trả phiếu
có `project_id` đúng, kiểm mọi liên kết contract/certificate/sheet còn đủ scope và sự
nhất quán giữa contract trực tiếp với certificate; tên người tạo chỉ join trong org.
Phiếu chưa phân loại nhưng đã có dự án hợp lệ vẫn hiển thị. Mọi response đặt
`Cache-Control: private, no-store`. Test route thật bao phủ parent lệch, phiếu legacy
`project_id NULL`, cookie sai/vắng và cache header. Đây là slice đọc hẹp, chưa đóng S02a;
POST/PATCH/DELETE bill và các GET payment khác còn trong inventory S00. Chưa tuyên bố
S01 membership cutover hoặc exact-money DTO hoàn thành.

## 2026-10-05 — QUALITY-FINAL-1 S14: kiểm restore bằng PostgreSQL disposable

Thêm integration smoke tạo dump custom và recovery set tổng hợp từ PostgreSQL disposable,
gọi `restore-check.sh` với role đích `CREATEDB` không phải superuser, kiểm bảng lõi có dữ liệu
và database tạm được dọn. CI cấp trước marker trên đúng container PostgreSQL service;
test đối chiếu marker, IP server và URL worker trước mọi lệnh ghi, chỉ dọn DB đích có
marker khớp. Hai ca âm xác nhận marker sai hoặc nguồn/đích cùng server bị chặn trước
khi tạo database phục hồi. Test dùng credentials giả của CI, không đọc production.
Đây là bằng chứng restore đường cơ bản khi CI PostgreSQL và client đạt; chưa phải PITR,
attachment restore đầy đủ, kiểm khóa, RPO/RTO hoặc diễn tập trên workload thực.

## 2026-10-05 — QUALITY-FINAL-1 S14: kiểm tra cấu trúc archive trước restore

`restore-check.sh` đọc/liệt kê archive uploads bằng `tar -tzf` sau khi đối chiếu manifest,
trước mọi kết nối PostgreSQL; archive hỏng làm bước restore-check thất bại. Test dùng tar
fixture hợp lệ và bản hỏng có checksum đúng để xác nhận không gọi DB khi cấu trúc sai.
Targeted test 17/17 và kiểm cú pháp/định dạng đạt; CI release gate còn chờ PR này.
Đây chỉ là kiểm tra archive có thể đọc, chưa chứng minh giải nén đầy đủ, khôi phục file,
PITR hoặc RPO/RTO.

## 2026-10-05 — QUALITY-FINAL-1 S14: manifest cho bộ backup

Backup tạo manifest gắn dump và kho tệp đính kèm bằng kích thước/SHA-256; bộ thiếu tệp trả lỗi,
không đẩy ra nơi lưu ngoài máy. Dọn lưu trữ theo từng bộ, giữ ít nhất một bộ đầy đủ ở local;
mặc định local 35 ngày. Restore-check từ chối manifest mới nhất thiếu/hỏng trước khi kết nối DB.
Targeted test 21/21, format, lint, typecheck, kiểm migration/SW và build local đạt.
Release gate cần PostgreSQL disposable trong CI; chưa diễn tập PITR, WAL, khóa mã hóa, RPO/RTO
hoặc kiểm chứng backup production. Đây là bước integrity hẹp của S14, chưa hoàn tất A6.

## 2026-10-05 — Sửa tương phản nhãn chờ duyệt MEPF

Nhãn `pending` trên trang MEPF dùng nền/chữ amber đủ rõ ở cả hai giao diện và bỏ
hiệu ứng nhấp nháy làm độ tương phản thay đổi. Sửa lỗi axe thấy trong E2E của PR #560;
kiểm tra UI, định dạng, lint và typecheck tại worktree đạt. E2E toàn bộ chờ CI trên PR này.
Không thay đổi trạng thái duyệt hay dữ liệu nghiệp vụ.

## 2026-10-05 — QUALITY-FINAL-1 S04: ACK purge và cách ly queue cũ

`clearServiceWorkerCache` dùng controller hiện tại hoặc worker active của registration và chỉ
tiếp tục sau ACK tương quan trong 3 giây. Đăng nhập, TOTP và nút SSO chỉ tiếp tục sau purge cache
riêng tư; first visit chưa có registration dọn riêng namespace XBoss, lỗi worker vẫn fail-closed.
Khi gặp 401, khóa nội dung ngay và chỉ về login sau ACK. Queue v1 chưa có owner được giữ nguyên
trong IndexedDB/localStorage, không tự đọc, xóa, nhận thêm thao tác hoặc flush dưới phiên mới,
kể cả luồng SSO. Tracking/nhật ký báo rõ khi không thể lưu offline; badge báo trạng thái cách ly.
Banner tracking không còn báo thao tác đã lưu khi queue đang khóa; badge dùng màu tương phản
ổn định. Nút phục hồi ở trang lỗi chỉ purge cache XBoss theo ACK, không xóa queue, cache hoặc
service worker khác cùng origin; thất bại giữ trang và cho thử lại.
Các regression flush cũ vẫn được giữ trong suite riêng. Lưu offline chỉ mở lại sau S07 có
ownership/vault và chuyển queue an toàn; browser thật + axe trên PR #560 đã đạt CI.
Gọi trực tiếp endpoint OIDC không đi qua client preflight; S05 cần ràng buộc context toàn cục
trước khi hiển thị dữ liệu, không coi nút SSO là bằng chứng bảo vệ mọi đường vào.

## 2026-10-05 — S03: tách migration khỏi runtime

App runtime chỉ đọc `schema_migrations` để xác nhận schema khớp với
checkout; không tạo bảng tracking hoặc tự chạy SQL migration. Thiếu/lỗi thời schema làm DB
request fail-closed với `XBOSS_SCHEMA_NOT_READY`; `/api/health` báo `degraded` để deploy có thể
dừng trước khi chuyển traffic. `npm run db:migrate` là bước độc lập, bắt buộc có
`MIGRATE_DATABASE_URL` và không dùng `DATABASE_URL` làm fallback; dry-run chỉ liệt kê file còn
thiếu. Mỗi migration giữ transaction riêng và advisory lock trong migrator.
Credential migration phải nằm trong file riêng mode `0600` ngoài checkout hoặc env deploy tạm;
`deploy.sh` từ chối khi thiếu/sai quyền/còn trong env file runtime, chỉ truyền cho bước migrate
và xóa trước khi reload PM2. Người vận hành đã xác nhận file riêng được chuẩn bị và
credential đã được gỡ khỏi `.env.local`; không đọc secret trong PR.
Workflow deploy lấy đúng SHA đã qua CI trên VPS trước khi chạy script mới; staging bootstrap
từ chối credential cũ trong env file. E2E chạy migrator trên DB disposable trước khi seed, vì
runtime không còn tự tạo schema. Script ghim SHA CI và dừng trước migration nếu `main` đã tiến
sang commit khác, tránh áp schema mới vào ứng dụng cũ. Targeted test và CI của PR #563 đạt;
deploy trên VPS vẫn cần xác nhận riêng.

Đã cập nhật quy trình rollout/recovery tại [ADR-0003](docs/adr/0003-migrations.md), cùng hướng
dẫn Metabase để chạy migration `0073` bằng migrator riêng. Không chạy database hoặc production
trong slice tài liệu này. A1-AC04/06 và Q-AC07 vẫn cần evidence PostgreSQL bằng app role phù hợp;
đây không phải xác nhận RLS/production đã đạt.

## 2026-10-05 — QUALITY-FINAL-1 S01: API quản trị dự án cùng tổ chức

`POST /api/projects` lấy `org_id` từ Admin đã xác thực; `PATCH`/`DELETE` và nguồn
`clone-config` chỉ xử lý dự án cùng tổ chức. ID không dương/không an toàn bị từ chối.
`PATCH` kiểm hết payload trước một lệnh ghi để lỗi mã trùng/trạng thái không gây cập nhật
một phần. `DELETE` trả 409 kể cả dự án chưa có tower vì nhiều bảng workflow/audit có FK
xoá dây chuyền; Admin chuyển trạng thái “Đã đóng” trên UI để giữ nguyên hồ sơ. Bổ sung
kiểm thử HTTP âm về giả mạo org, sửa lỗi một phần và bảo toàn workflow. Lint, typecheck,
UI guard và định dạng đạt; test PostgreSQL disposable còn chờ CI. Đây là ranh giới
project-admin hẹp; resolver membership/fallback và các caller S02 vẫn chưa cutover.

## 2026-10-05 — QUALITY-FINAL-1 S14: cô lập restore-check

`restore-check.sh` chỉ dùng PostgreSQL disposable có marker xác thực và credentials riêng,
kiểm tra danh tính server/DB trước khi ghi, không xóa DB tồn tại từ trước. URL có mật khẩu
không đi qua argv của công cụ PostgreSQL; file tạm mode 0600 được dọn sau chạy. Bổ sung
kiểm thử giả lập các nhánh từ chối và hướng dẫn cron báo lỗi không lộ token trong argv.
Kiểm tra cú pháp và targeted test đạt; kiểm thử PostgreSQL release gate còn chờ CI.
Không có migration hoặc thao tác production.

## 2026-10-05 — QUALITY-FINAL-1 A5: khóa đưa VO vào phụ lục hợp đồng

`POST /api/variations/:id/contract-add` nay khóa VO và hợp đồng đích, kiểm lại trạng thái và
phụ lục đã tạo, tính giá trị BOQ rồi ghi phụ lục/chuyển trạng thái VO trong một transaction.
Hai request đồng thời không thể đưa cùng một VO vào hai hợp đồng. Test route bổ sung trường
hợp hai hợp đồng đích và yêu cầu đúng một kết quả thành công. Targeted lint/typecheck đạt;
test PostgreSQL disposable còn chờ CI trên đúng HEAD. Không migration hoặc thao tác production.
Đây là lát cắt A5-FR08/10; snapshot quyết định IPC/VO và các AC còn lại vẫn mở.

## 2026-10-03 — PR #557: đóng nợ logic N1–N3 của audit 2026-10-01

Theo [audit logic](docs/ops/audit-logic-2026-10-01.md) mục nợ:

- **N1 — báo cáo ngày/tuần đa dự án:** chủ dự án chốt 2026-10-03 "mỗi dự án một báo cáo".
  `buildDailyReport`/`buildWeeklyReport` nhận `projectId` (lọc qua `towers.project_id`, tên dự án
  đúng dự án); cron `daily-report`/`weekly-report` lặp các dự án đang hoạt động, Admin/PM gọi tay
  chỉ gồm dự án mình thấy. Người nhận mặc định = Admin cùng tổ chức + PM thấy dự án (cùng luật
  `visibleProjectIds`); Web Push chỉ tới họ — bỏ `sendPushToAll` (trước phát tới thiết bị mọi tổ
  chức); EVM + ngưỡng cảnh báo theo dự án; chuỗi audit xác minh một lần mỗi lượt. Phản hồi route
  đổi thành `{ projects: [...] }` (không có UI nào đọc).
- **N2 — tick lô:** `PATCH /api/dimensions/batch` khoá task `ORDER BY id` + recompute cùng thứ tự.
  Gia cố: không tái hiện được deadlock trên code cũ; test đồng thời 2 lô thứ tự ngược canh hồi quy.
- **N3 — nhập kho PO:** đọc lại trạng thái PO dưới `FOR UPDATE` (sau kiểm idempotency), huỷ/đã
  nhận đủ → 409; nhật ký đổi trạng thái không còn ghi trùng khi 2 phiếu nhập đồng thời (test đỏ
  trên code cũ: 2 dòng).
- Kèm: ca khoá cron trong `route-cron.test.ts` chuyển sang tất định (bản cũ đua 2 request, đỏ ngẫu
  nhiên khi vùng giữ khoá ngắn).
- Kèm: `tests/recompute.test.ts` tính ngày kỳ vọng theo giờ Việt Nam như code (`todayISO`) —
  bản cũ dùng `toISOString()` (UTC) nên đỏ mỗi ngày 17:00–24:00 UTC trên mọi nhánh (gốc của
  lần CI #548 đỏ hôm 29/09).

Không migration. Còn để S10 (QUALITY-FINAL-1): `app/payments/page.tsx` cộng/nhân tiền bằng float JS.

## 2026-10-03 — PR #556: a11y — Modal có tên truy cập + gỡ fixme axe 5 trang

- `Modal` (`app/components/dialogs.tsx`): `role="dialog" aria-modal` chuyển từ overlay xuống panel; có
  `aria-labelledby` tự gắn vào tiêu đề h1/h2/h3/`[data-modal-title]` đầu tiên, hoặc prop `ariaLabel`
  tường minh (drawer sidebar mobile ở `AppHeader.tsx` dùng "Menu điều hướng"). Rà mọi nơi gọi `<Modal>`:
  chỉ drawer này thiếu tiêu đề, còn lại đều đã có heading. Không đổi focus/Escape/Tab-trap/khoá scroll.
- Gỡ `test.fixme` axe bằng cách sửa trang: `/engineering/{bidding-matrix,cashflow,esign}`,
  `/mepf-process`, `/work-fronts/[floor]` (label/aria-label cho input/select, badge theo công thức Chip,
  nút `bg-*-700 text-on-accent`, chữ phụ `text-zinc-400`). `/schedule` vẫn fixme (flaky chưa rõ gốc).
- Test: `e2e/authed/modal-a11y.spec.ts` (2 modal thật), `luoi-quet-axe.spec.ts` (+4 trang assert thật,
  chi tiết tầng hết fixme). Chạy desktop + mobile: 43 passed.

## 2026-10-03 — PR #544 (thu hẹp): vá bảo mật xác thực và cách ly tổ chức

Đưa PR #544 (nháp từ 27/09, chưa từng chạy CI) lên `main` mới. Chạy thật trên PostgreSQL thì
23 ca test đỏ, review `audit-bao-mat` + `audit-logic` tìm thêm lỗi chặn merge (chi tiết:
[báo cáo audit bảo mật](docs/ops/security-audit-2026-09-27.md) mục "Review tích hợp 2026-10-03").
Theo quyết định chủ dự án 2026-10-03, **thu hẹp** PR thay vì đưa cutover membership D01 lên
ngay (merge vào main là tự deploy production).

**Giữ trong PR:** 2FA setup/confirm/disable trong transaction + `FOR UPDATE`, setup 409 khi đã bật
(gộp với trần dò mã theo tài khoản của #545, bộ đếm ngoài transaction); API key ràng buộc org lúc
cấp và lúc dùng; token traffic nội bộ HMAC tách mục đích, đích cấu hình tin cậy, cấm redirect;
`role_permissions` theo org (`migrations/0158_role_permissions_org_scope.sql`, chỉ DDL) + snapshot
quyền theo request, `CAN` từ chối khi chưa nạp snapshot; admin chỉ thấy dự án cùng tổ chức; bỏ
fallback "dự án 1" ở đường ghi (`chotProjectIdChoGhi` → 404 thống nhất ở 9 route); webhook/push
đúng tenant + chặn SSRF; tên file an toàn trong zip QC.

**Sửa thêm lúc tích hợp:** (1) chọn dự án giữ mặc định "dự án đầu trong quyền" khi cookie
thiếu/sai — bản gốc trả null mà ~86 route coi null là "không lọc" ⇒ lộ dữ liệu xuyên tổ chức;
`user_projects` rỗng toàn hệ = thấy mọi dự án **cùng tổ chức**; (2) override quyền cũ trỏ dự án
org khác bị bỏ qua + log thay vì throw (bản gốc làm mọi user của org lỗi 500); (3) ghi traffic
ở `proxy.ts` lỗi mềm — cấu hình sai không còn làm hỏng mọi `/api`; (4) báo giá thầu kiểm gói
thầu thuộc đúng dự án (trước gắn được vào gói của dự án khác nếu biết UUID); (5) log cho các
nhánh bỏ im lặng ở webhook/push. Test hồi quy mới đỏ trên code cũ: override lệch org
(`permissions-org`), gói thầu chéo dự án (`route-eng-du-bao`). Helper test
`tests/helpers/ngu-canh-quyen.ts` dựng ngữ cảnh quyền như `getCurrentUser` cho test gọi service.

**Nợ / để đợt sau (S01/S02 QUALITY-FINAL-1):** cutover "membership rỗng không mở quyền" (cần
membership dry-run production + chuyển ~86 route coi dự án null là "không lọc" — mẫu này có
từ trước PR, vẫn lộ dữ liệu cho non-admin chưa được gán khi hệ đã cấu hình gán và cho admin
của tổ chức chưa có dự án nào — cả hai có sẵn trên main); `getCurrentUser`
thêm ~5 lượt DB mỗi request (đo trước khi lên tải lớn); `cron/sync-sheets` còn `org_id ?? 1`;
`sendPushToAll` gửi mọi org. **[Người dùng]** trước deploy chạy 2 truy vấn chỉ-đọc trong báo cáo
(override lệch org, webhook delivery cũ đang chờ).

## 2026-10-03 — verifier DR chỉ-đọc, không tự migration (PR #537)

Đưa PR #537 (mở từ 25/09, CI đỏ) lên `main` mới và làm xanh. `npm run audit:verify-dr` nay
dùng connection riêng tới bản sao (`DR_VERIFY_DATABASE_URL` + `DR_VERIFY_EXPECTED_DATABASE` +
`DR_VERIFY_EXPECTED_USER`, chặn đích trùng `DATABASE_URL`/`MIGRATE_DATABASE_URL`), mọi phép
kiểm trong một transaction `REPEATABLE READ READ ONLY` rồi `ROLLBACK`, không đi qua `lib/db`
nên không bao giờ kích auto-migration; kết quả PASS/FAIL/NOT_RUN (audit rỗng là NOT_RUN, exit
≠ 0), đối chiếu migration cả thiếu lẫn thừa, output ghi rõ `completeDrVerified=false`.
`verifyAuditChain` nhận reader tuỳ chọn, caller cũ giữ nguyên. Chi tiết:
[đặc tả](docs/nang-cap/AUDIT-SMALL-DR-READONLY.md). Lúc tích hợp: format lại
`scripts/lib/dr-readonly.ts` (nguyên nhân CI static đỏ), gỡ test tạm `audit-dr-format.test.ts`
(trùng `format:check`). Không migration. **[Người dùng]:** chạy verifier cần cấp 3 biến
`DR_VERIFY_*` trỏ bản sao đã restore; phần còn lại của S14/A6 (manifest, PITR, RPO/RTO) chưa làm.

## 2026-10-01 — tích hợp ECC (Everything Claude Code) vào cấu hình agent (PR #555)

Nghiên cứu [ECC](https://github.com/affaan-m/ECC) v2.2.2 (harness phổ biến nhất cho Claude Code)
và tích hợp tối đa theo yêu cầu người dùng — quyết định + lý do + đánh đổi ở
[ADR-0013](docs/adr/0013-tich-hop-ecc.md). Điểm then chốt: phiên cloud **không nạp plugin** bật qua
`.claude/settings.json` của repo → chọn **vendor có ghim commit** thay vì cài plugin `ecc@ecc`.

- **Lớp ECC vendor** (`.claude/ecc/manifest.json` → `npm run ecc:vendor`): 24 agent, 56 skill,
  19 command, 22 rule (`common` + `typescript`/`web`/`react` theo `paths`), tiền tố `ecc-`, khoá
  sha256 (`.claude/ecc/lock.json`, `tests/ecc-vendor.test.ts`). Không vendor mã thực thi của ECC.
- **Lớp thích nghi XBoss**: `.claude/rules/00-uu-tien-ecc.md` (15 điểm ECC bị ghi đè: node:test,
  ratchet coverage, raw SQL, format API, UI token, commit tiếng Việt, cấm `npx` gói ngoài…); rules path-scoped
  `.claude/rules/xboss/` (migrations, API, UI, test, tiến độ-nghiệm thu, tài chính).
- **Hook mới (bash, có test `tests/claude-hooks.test.ts`)**: `protect-config` (deny sửa migration đã
  có trên origin/main + sửa tay vendor; ask khi sửa cấu hình cổng), `risk-zone-gate` (GateGuard cho
  vùng `docs/audit.md` §8, bản máy đọc `.claude/hooks/risk-zones.txt`), `pre-push-gate` (PROGRESS.md
  - trùng số migration — `check-progress-freshness.ts` thêm chế độ `--base`), `stop-static-checks`
    (prettier/eslint/cổng `check:*` theo file đổi trước khi dừng lượt).
- **Agent/skill XBoss**: `audit-bao-mat`/`audit-logic`/`audit-ui` (3 trụ `docs/audit.md`); `/gate`
  (`npm run gate` đọc thẳng job `static` của `ci.yml` — trước đây `/review` nhắc `/gate` nhưng chưa
  có), `/hoc`, `/ecc`. Coordinator thêm hợp đồng hoàn tất khi uỷ thác, truy hồi lặp ≤3 vòng, review
  đa góc nhìn song song; `/review` gọi audit theo file đổi; CLAUDE.md thêm "Định tuyến ECC & audit".
- Gộp với PR #554 (OpenCodeReview, ra main trong lúc PR này mở): ADR đánh số **0013** vì #554 đã
  dùng 0012; giữ cách `.gitignore`/`.prettierignore` của #554 (prettier bỏ qua `.claude/`, lớp vendor
  khoá bằng sha256); `/review` chạy lượt OCR → `code-review` → audit đa góc nhìn. Rules
  `.claude/rules/xboss/*` (nạp khi VIẾT code) bổ sung cho `.opencodereview/rules/*` (dùng khi REVIEW).

Nợ/đề xuất: CLAUDE.md 262 dòng (Claude Code khuyến nghị < 200) — có thể chuyển các mục chỉ đúng
cho một vùng file sang `.claude/rules/xboss/*`, cần người dùng duyệt. Theo dõi chi phí ngữ cảnh của
lớp ECC bằng `/ecc-context-budget`; gỡ bớt qua manifest nếu cần.

## 2026-10-01 — tích hợp OpenCodeReview: luật review AI theo đường dẫn (PR #554)

Nghiên cứu [alibaba/open-code-review](https://github.com/alibaba/open-code-review) (CLI `ocr`, ghim
`1.12.11`): OCR làm phần tất định (chọn file, gắn luật theo glob đường dẫn), LLM làm phần đọc
hiểu. Người dùng chốt: chạy cả trong Claude Code (delegation, không API key) lẫn CI (mỗi PR, chỉ
góp ý). Quyết định + ngữ nghĩa OCR đã kiểm từ mã nguồn (khớp-đầu-tiên-thắng, chữ thường, brace
không lồng; mặc định bỏ qua `*.test.ts`/`*.spec.ts` và mọi file trong `.gitignore`, không review Markdown;
trên `pull_request` action đọc luật từ merge ref của chính PR): ADR-0012.

- `docs/audit.md` §3–§8 + `TRAPS.md` đúc thành 20 mảnh checklist `.opencodereview/rules/*.md` +
  `manifest.json` 26 mục có thứ tự; `npm run gen:ocr-rules` ghép ra `.opencodereview/rule.json`
  (một mục ghép nhiều mảnh — route tài chính nhận cả checklist tài chính lẫn route API).
- `tests/ocr-rules.test.ts`: rule.json khớp bản sinh, 41 đường dẫn vùng rủi ro cao giải đúng
  mục luật (giả lập ngữ nghĩa OCR; đối chiếu `ocr rules check` thật: 41/41 khớp), đường dẫn trong
  luật còn tồn tại, phiên bản ghim khớp giữa `package.json` và workflow.
- Claude Code: lệnh `/ocr-review`; `/review` + agent `reviewer` thêm lượt luật XBoss trước
  `code-review`; `CLAUDE.md`/`docs/audit.md` trỏ tới `.opencodereview/`.
- CI `ocr-review.yml`: review mỗi PR, comment tiếng Việt, luôn xanh, tự bỏ qua khi thiếu secret.
- Review (agent `reviewer` — lần chạy thật đầu tiên của lượt luật OCR): giả lập glob khớp
  `ocr rules check` trên toàn bộ 1590 file tracked (0 lệch). Đã sửa: tài liệu ghi nhầm "action đọc
  luật từ nhánh base" (thật ra merge ref của PR); `timeout-minutes: 25` ở bước OCR để quá giờ không làm đỏ
  job; `background` chỉ còn tiêu đề (body nằm trong dấu vân tay checkpoint → mỗi lần sửa body review
  lại cả PR); `app/api/v1/payment-certs` thiếu luật tài chính + test canh mọi route import
  `@/lib/tai-chinh/` phải nhận luật đó; chuẩn hoá CRLF khi ghép mảnh; `.gitignore` thu hẹp từ cả `.claude/`
  còn `.claude/worktrees/` + `settings.local.json` (dòng cũ làm hook/`settings.json` vô hình với OCR
  và lint-staged không stage lại được file đã track trong `.claude/`; `.prettierignore` thêm
  `.claude/` để giữ hành vi định dạng cũ); `/ocr-review` + `reviewer`
  ghi rõ OCR không review Markdown nên lệnh/agent `.claude/**/*.md` phải tự soát.

**[Người dùng]** Bật CI: thêm secret `OCR_LLM_URL` (vd `https://api.anthropic.com`),
`OCR_LLM_AUTH_TOKEN`, biến `OCR_LLM_MODEL` (Settings → Secrets and variables → Actions). Không
migration, không đổi code ứng dụng.

## 2026-10-01 — audit lỗi logic & toàn vẹn dữ liệu

Baseline `3d087ae`. Rà theo `docs/audit.md` §4 + vùng rủi ro §8 (nghiệm thu, engine phê duyệt
M46, IPC, kho, import). Bộ test đầy đủ trên PostgreSQL thật xanh ở baseline (239 file, 3842 ca),
nên mọi lỗi dưới đây nằm ngoài vùng test phủ; từng lỗi được tái hiện qua route handler thật
trước khi sửa. Chi tiết, số đo và truy vấn rà dữ liệu cũ:
[audit logic](docs/ops/audit-logic-2026-10-01.md).

**Lỗi thật đã sửa:** (F1) bật flow duyệt nghiệm thu task M46 là không ai nghiệm thu được — route
mở request với người bấm là người tạo rồi tự duyệt luôn → SoD 403 + rollback mọi lượt; vai trò
bước kỹ sư/CĐT cũng bị `CAN.approve` chặn. Theo quyết định chủ dự án: `task_acceptance` miễn
SoD, có request đang chờ thì engine quyết quyền. (F2) duyệt tầng ghi đè `approval_source` của
task đã duyệt riêng → huỷ tầng hạ luôn task đó. (F5) lập được đợt IPC mới khi đợt trước còn
nháp/trình → gợi ý KL bỏ qua đợt đó, **trả trùng tiền** (60 KL ra bill 80); nay 409, khoá hợp
đồng. (F6) thêm/copy cột lưới vào task đã nghiệm thu → `nghiem_thu` với % < 1; nay 409. (F8)
import Excel đè % thấp lên task đã nghiệm thu; nay giữ nguyên + cảnh báo. Kèm mức thấp: sổ kho
`nhap_kho` ghi `qty_after` sai cột (F7), hạn bảo hành tràn cuối tháng 31/01+1 → 03/03 (F3),
`progress: null` âm thầm thành 0% (F4).

Test hồi quy mới `tests/route-nghiem-thu-flow.test.ts`, `tests/import-nghiem-thu.test.ts` + ca
thêm ở `route-nghiem-thu-bat-bien`, `route-tai-chinh`, `route-mua-sam`, `warranty`; đã gỡ tạm
bản vá để xác nhận các ca mới đỏ trên code cũ. Sau sửa: 241 file · 3858 ca pass · 0 fail
(`--release-gate`, PostgreSQL sạch); lint/typecheck/build + cổng tĩnh xanh. Không migration. **[Người dùng]:** chạy 4 truy
vấn chỉ-đọc trong tài liệu chi tiết trên production để rà dữ liệu đã hỏng trước bản vá.

Nợ ghi nhận (chưa sửa): báo cáo ngày/tuần cron cộng mọi dự án nhưng mang tên dự án đầu (cần
chốt nghiệp vụ đa dự án); deadlock hiếm ở tick lô chồng nhau; nhật ký trạng thái PO có thể ghi
trùng khi nhập kho đồng thời.

## 2026-10-01 — đóng nợ ô nhập < 16px trên điện thoại (iOS tự phóng to)

Tiếp đợt audit layout bên dưới (PR #551 đã merge). Quét tĩnh còn 444 ô `<input>/<select>/
<textarea>` < 16px ở 76 file — phần lớn trong modal/form ẩn nên lượt quét trình duyệt trước không
thấy. Thay mẫu `text-base sm:text-*` sửa từng ô bằng một quy tắc toàn cục trong `app/globals.css`:
dưới breakpoint `sm`, ô gõ/ô chọn tối thiểu 16px (ngoài `@layer` nên thắng class Tailwind; bỏ qua
ô text-lg trở lên; desktop giữ nguyên cỡ gọn). Đo bản production: mobile 85 trang, 568 ô hiện sẵn +
188 ô trong 34 modal → 0 ô < 16px; desktop `/users` vẫn 14px. `e2e/authed/input-zoom-mobile.spec.ts`
thêm 9 trang nhiều form + ca đo ô trong modal (29/29 qua cục bộ). Không migration.

## 2026-10-01 — audit layout & UI/UX khung dùng chung

Baseline `987d73e`. Rà theo `docs/audit.md` §5 (UI/UX & a11y) + phần layout §7 bằng
ground-truth: build production + PostgreSQL tạm, Playwright + axe quét 85 route tĩnh × light/
darkblue × desktop/mobile (thêm thẻ `wcag22aa`), đo riêng tràn ngang ở 360/393px. Chi tiết,
bảng phát hiện L1–L16 và báo cáo mẫu §12: [audit layout & UI/UX](docs/ops/audit-layout-uiux-2026-10-01.md).

**Lỗi thật đã sửa (khung dùng chung):** thanh hành động cố định dưới đáy che 45–61px nội dung
cuối ở 27 trang `bottomActions` (chừa chỗ bằng `body:has(.app-bottombar)`, bỏ `BottomBarSpacer`);
cả trang cuộn ngang trên điện thoại ở 13 trang (tới 842px trên màn 393px — topbar bị nút trang
đẩy tràn, chuông/tài khoản ra ngoài màn hình; `SystemFilter`/select không co; bảng báo cáo tràn
khỏi tờ giấy làm chữ 1,01:1 ở darkblue); tiêu đề hub xén cụt ở 360px; viền focus 1,8:1 ở theme
sáng (token `--focus-ring`); ô nhập dưới 16px ở component dùng chung kể cả trang đăng nhập (iOS tự
phóng to); nút "đang online" 20px; `target-size` nút sắp xếp `SpreadsheetGrid`; `aria-label` trên
`<div>` của `PageSkeleton`. Kèm: `prefers-reduced-motion` toàn cục, `Modal` trả focus khi đóng,
tab `HubShell` đi bằng phím mũi tên (bỏ tooltip hứa phím tắt Alt+N không tồn tại), tiêu đề topbar
là `<h1>` (70/85 trang trước đó không có h1).

**Cổng:** `check:ui-ux` đỏ trên `main` (27 `transition-all`) → xanh, thêm `check:ui-ux-guard`
vào CI. Spec hồi quy mới `e2e/authed/khung-layout.spec.ts`; `input-zoom-mobile` đo thêm `<select>`
và 5 trang; `/engineering` chuyển từ fixme sang assert thật trong `luoi-quet-axe`.

**Kèm vá phụ thuộc:** CI `npm audit` đỏ do advisory critical mới GHSA-vcvr-r3jv-pc5j (RCE trong
`next/og` ImageResponse, `next` 16.2.0–16.3.5 — không do đợt này, `main` cũng dính) → nâng `next` +
`eslint-config-next` lên 16.3.8 (`npm audit` 0 lỗ hổng; lint/typecheck/build + E2E khói xanh).

Nợ còn lại (các trang engineering/mepf-process đã fixme, `Modal` chưa
có `aria-labelledby`, PWA safe-area cần kiểm trên iPhone thật): xem tài liệu chi tiết. Không
migration, không thao tác production.

## 2026-09-27 — audit tấn công toàn diện + vá brute-force 2FA phân tán

Baseline `f38a10e` trên nhánh `claude/security-audit-patch-uyogfj`. Rà theo `docs/audit.md`
§3 (Bảo mật) và §8 (Vùng rủi ro cao) trên toàn bộ bề mặt: lõi auth/session token
(`lib/bao-mat/auth.ts`, `session-token.ts` — HMAC 7 phần, timing-safe, thu hồi phiên qua
`session_version`), CSRF same-origin ở `proxy.ts` phủ mọi request mutating, SQLi (100% qua
placeholder `?`, cổng `check:db-params`), cách ly tenant (RLS project đã "khoá cửa" 0077, RLS
org 0080 còn nhánh chuyển tiếp có chủ đích do auth đọc `users` trước khi có org context),
đối xứng phân quyền per-handler (cổng `check:route-perms` — 383 route, xanh), API key
`/api/v1/*` (sha256 + scope + rate-limit), OIDC (openid-client verify state/nonce/PKCE,
redirect cố định), path traversal (`lib/nen/storage.ts`), SSRF webhook (chặn IP nội bộ
IPv4/IPv6/IPv4-mapped, pin IP tầng connect chống DNS rebinding, `redirect: "manual"`),
security headers/CSP (`frame-ancestors 'none'`), money math (bigint exact), `recompute.ts`
(cap 0.99, AVG trong SQL, `FOR UPDATE`). `npm audit` 0 lỗ hổng; không có `.env` bị track.
Kết luận: không có lỗ hổng Cao/Nghiêm trọng — codebase đã qua nhiều đợt audit, invariant
được cổng CI canh tự động.

**Phát hiện Trung bình đã vá:** `POST /api/auth/login/2fa` chỉ giới hạn dò mã TOTP THEO IP
(`totp|<ip>`, 10/15 phút). Vì bước 1 (mật khẩu đúng) trả pending token mà KHÔNG tính là
"đăng nhập sai", kẻ tấn công đã có mật khẩu có thể xin pending token không giới hạn rồi rải
mã đoán qua nhiều IP để né trần theo IP (TOTP window ±1 step ⇒ ~3/10^6 mỗi lần) — làm suy
yếu chính lớp 2FA khi mật khẩu đã lộ. Vá theo khuyến nghị OWASP: thêm trần THEO TÀI KHOẢN
(`totp-acct|<uid>`, 20/15 phút; uid lấy từ pending token đã ký HMAC nên không giả mạo/đặt lại
bộ đếm tài khoản khác) — chặn tổng số lần thử xuyên mọi IP. Bổ sung, tối thiểu, tái dùng
`hitRateLimit` sẵn có; đến bước này đã cần mật khẩu đúng nên không mở thêm bề mặt DoS. Có
test hồi quy trong `tests/totp.test.ts` chứng minh 429 xuyên IP (mỗi lần thử 1 IP riêng, trần
IP không bao giờ chạm).

Kiểm cục bộ: lint + typecheck (toàn dự án) xanh; `check:route-perms`/`check:project-scope`/
`check:db-params` xanh; `npm audit` sạch. Test `tests/totp.test.ts`: 13 ca unit pass, các ca
integration (gồm ca mới) skip cục bộ do thiếu `TEST_DATABASE_URL` — cần CI PostgreSQL chạy
thật trên HEAD (đã thử dựng Postgres 16 cục bộ nhưng không cấp được quyền đăng nhập DB mà
không nới lỏng `pg_hba`, nên để CI xác nhận). Không migration, không thao tác production.

## 2026-09-27 — ghi giao dịch vật tư nhất quán khi cập nhật đồng thời

Baseline `e7f4c6f7` trên `origin/main` sau PR #542. `POST /api/materials/:id/transactions`
nay khóa dòng vật tư trong transaction, lấy số dư ngay trước lần cập nhật, rồi ghi
`materials.qty_used` và `material_transactions` cùng commit/rollback. Có test hồi quy
8 request đồng thời, kiểm số dư cuối, delta mỗi giao dịch và chuỗi `qty_after`.

Kiểm cục bộ: format, lint, typecheck, check:sw-exclude, check:migrations,
check:project-scope, check:db-params và build đạt. Máy không có PostgreSQL disposable;
73 ca của file test liên quan bị skip cục bộ, cần CI PostgreSQL chạy thật trên đúng HEAD.
PR #543. Không migration hoặc thao tác production. Chưa đóng Goal DoD.

## 2026-09-27 — chặn BOQ map liên kết task khác dự án

Baseline `0cd54980` trên `origin/main`; slice hẹp theo A1-FR06 của QUALITY-FINAL-1.
`PUT /api/boq/:id/map` nay chỉ nhận task có lineage task → package → sheet → tower
cùng `project_id` với dòng BOQ đang sửa. Trường hợp task ngoài dự án trả 422 như
task không tồn tại và giữ nguyên map hợp lệ trước đó. Có test hồi quy trên DB disposable.

Kiểm cục bộ: format, lint, typecheck, check:sw-exclude, check:migrations và build đạt.
CI commit `e2e43a59` đã qua test PostgreSQL, coverage, build, static và 4/4 E2E;
PR #542 auto-merge squash vào `main` tại `e7f4c6f7`. Không migration, không thao tác production.
Slice này không đóng toàn bộ A1–A6 hay Goal DoD; các thay đổi audit cũ chưa đối chiếu với
`main` mới vẫn được giữ riêng để xử lý theo vòng tiếp theo.

## 2026-09-25 — đưa bốn bản vá nhỏ độc lập lên PR

Baseline: `381b06899b3eb5d9e1b2c99b167d51cc24419732`. Theo yêu cầu triển khai các việc
nhỏ song song và QUALITY-FINAL-1, đã chuẩn bị bốn bản vá độc lập: kiểm ID chọn dự án trước
ép kiểu; kiểm cấu trúc JSON login; no-store cho auth/me; khóa flush trước await và đánh thức
batch offline. Không thay schema, money.ts, session-token.ts, sw.js hoặc store.ts.

Bốn nhóm test chạy đồng thời bằng bốn process Node: 69 pass, 0 fail, 0 skip. Sáu mutation
đều bị test phát hiện; code sau đó đã khôi phục và chạy lại. Typecheck chỉ các test mới
với TypeScript 5.8.3 đạt; không thay cho full typecheck TypeScript của repo.
Test chạy source thật trong VM với biên Next/React/storage được giả lập. Không có test
PostgreSQL, browser, full formatter/lint/build/E2E hoặc CI của bản vá mới tại checkpoint này.
Chủ dự án yêu cầu commit và tạo PR ngày 2026-09-25. Bốn nhóm được commit riêng,
checkpoint tích hợp sau cùng trên nhánh `fix/audit-small-round2-20260925`, đích `main`.
Đã đối chiếu lại baseline, checksum của 14 file và chạy lại đủ 69 test trước commit.
Chưa merge/deploy; CI/review phải xác nhận đúng HEAD. Không sửa gate để lấy xanh.

Không đóng toàn bộ S00/A1/A2 hoặc 54 AC. Khóa flush chỉ trong cùng tab; ownership, vault,
receipt server, retry 4xx và xử lý logout/legacy còn thuộc các slice được đặc tả riêng.
HTTP no-store không xóa private cache/SW cũ. Không có thay đổi dữ liệu production.

Chi tiết và điều kiện tích hợp: [bàn giao bản vá nhỏ](docs/ops/audit-small-round2-2026-09-25.md).

## 2026-09-25 — chốt đặc tả chất lượng cao, thi hành sau

Chủ dự án yêu cầu “chốt theo phương án chất lượng cao nhất”. Bộ đặc tả
[QUALITY-FINAL-1](docs/nang-cap/AUDIT-2026-09-25/README.md) ghi quyết định D01–D09,
API/DDL, đối chiếu tĩnh nguồn trọng yếu, kế hoạch S00–S16 và 54 tiêu chí nghiệm thu.
State đặc tả: Approved for implementation; đợt này chỉ sửa tài liệu, chưa code A1–A6.
Không tự merge, deploy, chạy DB production, đổi dữ liệu/quyền người dùng hoặc mua dịch vụ.

Baseline đã xác minh: main 833691815fdc7e96bb72975d86bd6902a412b259.
PR529 đã merge b29bb9de4b8d723b273ba790065c06cc6e3719f0;
PR530 đã merge833691815fdc7e96bb72975d86bd6902a412b259.
Các ghi chú chờ merge ở các mục lịch sử bên dưới không còn là trạng thái hiện tại.

Chốt scope/index/cache quyền theo org; không cold-start allow. Vault draft mã hóa theo
resource manifest, logout giữ ciphertext; shared-safe15 phút và field-personal8 giờ chỉ
qua device approval. Money exact, quantity float có đường chuyển đổi/provenance;
IPC giữ SUM rồi round tổng và chính sách cảnh báo vượt khối lượng, không hard-cap tự đặt.
Snapshot/acknowledgement/concurrency theo đúng flow. Reporting dùng project_id thật của
payment_bills và kiểm tất cả parent, không mất khoản chưa phân loại.

Phục hồi thiết kế: PITR35 ngày, RPO5 phút/RTO60 phút; runtime production không DDL qua HTTP.
Các ngưỡng mới là target cần chứng minh, không SLA đã đo. Chưa tạo lịch backup/automation.
54 AC còn NOT_RUN cho phần chưa implementation; S00 còn inventory đầy đủ từng miền,
catalog disposable và benchmark thật. Không gọi source mapping tĩnh là audit toàn repo xong.

Chi tiết: [Approval](docs/nang-cap/AUDIT-2026-09-25/APPROVAL.md),
[Source map](docs/nang-cap/AUDIT-2026-09-25/SOURCE-MAP.md),
[Data contracts](docs/nang-cap/AUDIT-2026-09-25/DATA-CONTRACTS.md),
[Goal](docs/goals/audit-2026-09-25.md).
Kiểm CI của bản tài liệu ghi ở PR đúng HEAD; không lấy CI đợt trước thay bằng chứng bản mới.

## 2026-09-25 — audit, đợt 1: tài khoản và phạm vi dự án

Trạng thái: đã triển khai code trên nhánh sửa lỗi; chưa xác nhận phát hành production.
Nền: `a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3`.

- Bỏ seed người dùng trong HTTP login/me; helper demo chặn production.
- Thêm bootstrap admin tường minh và reset admin không in mật khẩu/không nâng quyền.
- E2E seed tài khoản riêng trước login, không trông chờ production tự tạo người dùng.
- Chi phí bắt buộc có dự án hợp lệ và transaction có project scope.
- Chọn dự án dùng chính sách đọc kiểm cả tổ chức trước khi đặt cookie.
- Bổ sung test hồi quy route/helper và test PostgreSQL bootstrap/cách ly tổ chức.

Kiểm cục bộ: 27 test route/helper pass, 0 fail, 0 skip; kiểm cú pháp TypeScript.
Năm thay đổi cố ý gây lỗi đều bị test phát hiện, sau đó đã khôi phục code.
CI tại `af7bbc8`: build, PostgreSQL, coverage và cả 4 nhóm E2E đã thành công.
Các bản sau chỉ sửa hạ tầng test: tên biến VM theo lint và kiểu ProcessEnv trong E2E setup.
Toàn bộ cổng phải qua trên HEAD mới trước merge; không lấy kết quả SHA cũ thay nghiệm thu HEAD.
Giao thức login/2FA giữ nguyên như nền, chỉ bỏ seed. Reset giữ mọi bộ đếm chống brute-force.
Không thay đổi hoặc bỏ qua cấu hình CI; không sửa dữ liệu, tài khoản hay cấu hình production.

Chi tiết, giới hạn kiểm chứng và chuyển đổi vận hành:
[Audit 2026-09-25](docs/ops/audit-2026-09-25.md).

## Lịch sử trước đợt này

Toàn bộ PROGRESS cũ (1.472.932 byte) được giữ nguyên nội dung tại
[PROGRESS-before-2026-09-25](docs/archive/PROGRESS-before-2026-09-25.md).
Git blob lưu trữ: `c5516b4dfa6e23e44f2fee3229934aa394310509`.
Đây là lưu trữ lịch sử, không đánh dấu lại các hạng mục cũ thành chưa hoàn thành.
Các liên kết tương đối trong bản lịch sử được viết theo vị trí gốc; có thể xem bản tại commit
`a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3` để giữ ngữ cảnh liên kết ban đầu.

## Những rủi ro audit vẫn mở

Cache/offline đa tài khoản và dự án; thống nhất toàn bộ helper đọc/ghi; số học tiền xuyên
SQL/JS/API; KPI portfolio và truy vấn tổng hợp; kiểm chứng restore và chuỗi nghiệm thu–thanh toán.
Không coi đợt 1 là hoàn thành toàn bộ kế hoạch cải tiến.
