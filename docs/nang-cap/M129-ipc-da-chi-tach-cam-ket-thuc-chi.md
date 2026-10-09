# M129 — IPC "đã duyệt" ≠ "đã chi": trạng thái thanh toán của phiếu + tách cam kết / thực chi

| Thuộc tính       | Giá trị                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Issue / Goal     | Đóng mục 6(e) `AUDIT-S15-RELEASE-CANDIDATE.md` (A5-AC08, D07 "approved không đồng nghĩa paid") |
| Spec owner       | Phiên chính (opusplan)                                                                         |
| State            | **Approved for implementation**                                                                |
| Người/ngày duyệt | Người dùng · 2026-10-09 ("Thêm trạng thái 'đã chi' + ngày chi")                                |
| Cập nhật         | 2026-10-09                                                                                     |

> Spec cha: [A5 Business chain](AUDIT-2026-09-25/A5-BUSINESS-CHAIN.md), [APPROVAL D07](AUDIT-2026-09-25/APPROVAL.md),
> [DATA-CONTRACTS](AUDIT-2026-09-25/DATA-CONTRACTS.md) (tiền exact). Tuân `.claude/rules/xboss/tai-chinh.md`.

## 1. Hiện trạng (đọc code 2026-10-09)

- `POST /api/payment-certs/:id/decide` bước cuối `approved` → INSERT 1 dòng `payment_bills`
  (`type='bill'`, `amount` = approvedValue exact, `paid_date = todayISO()`, `payment_cert_id`) trong cùng
  transaction với đổi status + snapshot quyết định (`app/api/payment-certs/[id]/decide/route.ts`,
  hàm sinh phiếu ~dòng 292–330).
- `payment_bills.paid_date` là NOT NULL và mọi báo cáo coi phiếu = **thực chi** (`lib/tai-chinh/cost.ts`
  `actual`, `lib/tai-chinh/finance.ts` dòng tiền, `/finance/cash`, export). Vì vậy không biểu diễn được
  "đã duyệt nhưng chưa chi".

## 2. Thiết kế

### 2.1 Schema — `migrations/0166_payment_bills_paid_state.sql` (thêm thuần tuý, đi thẳng production)

```sql
ALTER TABLE payment_bills
  ADD COLUMN IF NOT EXISTS pay_status TEXT NOT NULL DEFAULT 'paid'
    CHECK (pay_status IN ('committed', 'paid', 'void')),
  ADD COLUMN IF NOT EXISTS paid_at    DATE,
  ADD COLUMN IF NOT EXISTS paid_by    INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS paid_ref   TEXT,            -- số UNC/chứng từ ngân hàng (tuỳ chọn)
  ADD COLUMN IF NOT EXISTS paid_note  TEXT;
-- Dữ liệu cũ: mọi phiếu hiện có coi là đã chi tại paid_date (giữ số liệu báo cáo không đổi lúc deploy).
UPDATE payment_bills SET paid_at = paid_date WHERE pay_status = 'paid' AND paid_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_bills_pay_status ON payment_bills (project_id, pay_status);
```

- `UPDATE` backfill chỉ chép `paid_date` → `paid_at` cho dòng cũ (idempotent, điều kiện IS NULL). Theo
  CLAUDE.md, migration có UPDATE **phải qua staging** trước production — ghi rõ ở header.
- Ngữ nghĩa: `committed` = đã duyệt, chưa chi (cam kết); `paid` = đã chi (có `paid_at`, `paid_by`);
  `void` = huỷ (chỉ qua M128 adjustment/reversal, không dùng trong M129 ngoài CHECK).
- `paid_date` giữ nguyên NOT NULL (ngày lập phiếu / ngày dự kiến) để không phá code cũ; **nguồn sự thật
  "đã chi" là `pay_status='paid'` + `paid_at`.**

### 2.2 Luồng

- Duyệt IPC (bước cuối) → phiếu sinh ra với `pay_status='committed'`, `paid_at NULL` (thay vì 'paid').
  Phiếu nhập tay/`advance`/`item` qua `POST /api/payments` vẫn mặc định `paid` (giữ hành vi cũ; cho
  phép body `payStatus: 'committed'`).
- Mới: `POST /api/payments/:id/pay` body `{ paidAt: 'YYYY-MM-DD', paidRef?, paidNote? }` —
  quyền `CAN.approve` (Admin/PM) **và** SoD: người đánh dấu chi ≠ `decided_by` của IPC gốc nếu phiếu
  có `payment_cert_id` (dùng helper SoD sẵn có trong `lib/bao-mat/sod.ts` nếu khớp, không tự chế). Chỉ
  chuyển `committed → paid`; đã `paid` → 409 `already_paid`; `void` → 409. `paidAt` không được trước
  `decided_at` của IPC và không sau hôm nay (422). Idempotent với `Idempotency-Key` như route decide
  (tái dùng `docIdempotencyKey`/`timQuyetDinhDaGhi` nếu phù hợp, hoặc đơn giản: UPDATE điều kiện
  `pay_status='committed'` trong transaction + trả 409 khi 0 dòng). Ghi audit (trigger `audit_row_change`
  trên `payment_bills` nếu có; nếu chưa có trigger → thêm vào migration như `audit_payment_certs`).
- `DELETE`/`PATCH /api/payments/:id` (nếu có): không cho sửa `amount` của phiếu `paid` có
  `payment_cert_id`; không cho xoá phiếu `paid` (409) — phải qua adjustment (M128).
- `POST /api/payments/:id/unpay`: KHÔNG làm (quay lại = adjustment M128).

### 2.3 Báo cáo (tách cam kết / thực chi) — làm trong SQL, exact

- `lib/tai-chinh/cost.ts`: `actual` chỉ tính phiếu `pay_status='paid'`; thêm trường `approvedUnpaid`
  (Σ phiếu `committed`) vào `CostAmounts` + wire (`moneyToWire`, header v1 như hiện có). `committed`
  (PO + giao thầu) giữ nguyên định nghĩa; KHÔNG cộng phiếu committed vào `committed` của PO để tránh
  đếm lặp — hiển thị là cột riêng.
- `lib/tai-chinh/finance.ts` / `/finance/cash`: dòng tiền thực tế dùng `paid_at` (thay `paid_date`)
  cho phiếu `paid`; thêm "cam kết chưa chi" theo tháng (dựa `paid_date` dự kiến).
- `GET /api/payment-certs` + `[id]`: thêm `bill: { id, payStatus, paidAt, paidRef } | null`.
- Mọi SUM mới có `::text`, qua `lib/nen/money.ts`.

### 2.4 UI

- `/payment-certs` (`CertDocument.tsx`): đợt `approved` hiện badge "Đã duyệt · chưa chi" (amber) hoặc
  "Đã chi dd/mm" (emerald); nút "Đánh dấu đã chi" (Admin/PM, không phải người duyệt) mở dialog
  (ngày chi mặc định hôm nay, số chứng từ, ghi chú) — tái dùng `Modal`/`Button`/`Chip`.
- `/finance` (tab thanh toán) và `/payments`: cột trạng thái chi + bộ lọc `Tất cả / Chưa chi / Đã chi`;
  KPI "Đã duyệt chưa chi" cạnh "Thực chi".
- Thông báo (`lib/dich-vu/thong-bao.ts`): loại mới `bill_unpaid` cho Admin/PM khi phiếu `committed`
  quá N ngày (N = `alert_rules`, mặc định 30; thêm cột rule theo khuôn hiện có nếu bảng alert_rules
  có cột cấu hình riêng từng loại — nếu không có khuôn thì hằng số 30 trong `lib/van-hanh/alerts.ts`).
  Dedup theo `payment_bill_id` (thêm cột + unique index một phần theo khuôn `payment_cert_id`).

## 3. Điểm chạm code

`migrations/0166_*.sql` · `app/api/payment-certs/[id]/decide/route.ts` (sinh phiếu committed) ·
`app/api/payments/route.ts` + `[id]/route.ts` + **mới** `[id]/pay/route.ts` · `lib/tai-chinh/finance.ts`,
`cost.ts`, `paymentcerts.ts` · `lib/dich-vu/thong-bao.ts`, `lib/van-hanh/alerts.ts` ·
`app/payment-certs/_components/CertDocument.tsx`, `app/finance/**`, `app/payments/**` · `docs/ERD.md` ·
`scripts/audit-route-scope` kiểm kê.

## 4. Test (tất cả qua route handler thật, `tests/setup.ts` đầu tiên)

- `tests/m129-ipc-da-chi.test.ts`: (1) duyệt IPC → phiếu `committed`, `actual` KHÔNG tăng,
  `approvedUnpaid` tăng đúng exact; (2) `/pay` bởi Admin khác người duyệt → `paid`, `actual` tăng, `approvedUnpaid`
  giảm; (3) `/pay` bởi chính người duyệt → 403 SoD; (4) lặp `/pay` → 409; (5) `paidAt` trước
  `decided_at`/sau hôm nay → 422; (6) viewer/engineer → 403; (7) phiếu cũ sau migration giữ `paid`
  - `paid_at = paid_date` (số liệu cost report trước/sau migration bằng nhau trên fixture); (8) xoá/sửa
    amount phiếu `paid` có IPC → 409. Ca (1) và (2) phải ĐỎ trên code cũ.
- Cập nhật `tests/s13a-chuoi-ipc-thanh-toan.test.ts`, `cost-report`, `portfolio-kpi` nếu kỳ vọng
  `actual` đổi (giải thích vì sao).
- e2e `e2e/authed/payment-certs-canh-bao.spec.ts` thêm 1 ca: badge + dialog đánh dấu chi + axe.

## 5. Tiêu chí chấp nhận

- [ ] Duyệt không còn làm "thực chi" tăng; đánh dấu chi mới làm tăng; SoD người chi ≠ người duyệt.
- [ ] Tiền exact (SQL/bigint), wire theo `decimal-string-v1`; không float.
- [ ] Migration idempotent; header ghi "đụng dữ liệu → staging"; `db:migrate -- --dry-run` sạch.
- [ ] `docs/ERD.md` + `PROGRESS.md` (phiên chính) cập nhật; `npm run gate` xanh.
