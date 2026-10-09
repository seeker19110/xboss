# M128 — Chứng từ điều chỉnh (adjustment/reversal) cho IPC đã duyệt

| Thuộc tính       | Giá trị                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Issue / Goal     | Đóng mục 6(c) `AUDIT-S15-RELEASE-CANDIDATE.md` (A5-AC07, D07 "hủy upstream phải qua adjustment") |
| Spec owner       | Phiên chính (opusplan)                                                                           |
| State            | **Đã triển khai** (migration `0168`, sau M129) — xem §6 cho quyết định thay §2.2                 |
| Người/ngày duyệt | Người dùng · 2026-10-09 ("Chứng từ điều chỉnh riêng")                                            |
| Cập nhật         | 2026-10-09                                                                                       |

> Spec cha: [A5 Business chain](AUDIT-2026-09-25/A5-BUSINESS-CHAIN.md) (A5-FR06..FR09, A5-AC07),
> [APPROVAL D07](AUDIT-2026-09-25/APPROVAL.md). Tuân `.claude/rules/xboss/tai-chinh.md`. Phụ thuộc M129.

## 1. Hiện trạng

- Duyệt ngược thứ tự khi kỳ sau đã duyệt → 409 `reconciliation_required` (`kySauDaDuyet`, S13c); huỷ
  upstream (VO/hợp đồng/phụ lục) có IPC đã duyệt → bị chặn/409. **Không có đường sửa sai** cho IPC đã
  duyệt (sai KL, sai đơn giá sau VO, chi nhầm) ngoài sửa DB tay — vi phạm D07 ("không xóa history").

## 2. Thiết kế

### 2.1 Schema — `migrations/0168_payment_cert_adjustments.sql` (số thực tế; tạo mới thuần, đi thẳng production)

```sql
CREATE TABLE IF NOT EXISTS payment_cert_adjustments (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,                 -- ADJ-<năm>-<số>, sinh server
  cert_id       INT NOT NULL REFERENCES payment_certs(id),
  contract_id   INT NOT NULL REFERENCES contracts(id),
  project_id    INT NOT NULL REFERENCES projects(id),
  kind          TEXT NOT NULL CHECK (kind IN ('adjustment','reversal')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  reason        TEXT NOT NULL,                        -- bắt buộc, ≥10 ký tự
  amount        NUMERIC(15,2) NOT NULL,               -- ± ; reversal = −(giá trị phiếu gốc) cố định
  bill_id       INT REFERENCES payment_bills(id),     -- phiếu sinh ra khi approved (type 'adjustment')
  created_by    INT NOT NULL REFERENCES users(id),
  submitted_at  DATE, decided_at DATE, decided_by INT REFERENCES users(id), reject_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_cert_adjustment_items (
  id            SERIAL PRIMARY KEY,
  adjustment_id INT NOT NULL REFERENCES payment_cert_adjustments(id) ON DELETE CASCADE,
  boq_item_id   INT NOT NULL REFERENCES boq_items(id),
  qty_delta     NUMERIC(15,3) NOT NULL,               -- ±; unit_price lấy từ cert_items gốc lúc duyệt
  unit_price    NUMERIC(15,2) NOT NULL,
  note          TEXT,
  UNIQUE (adjustment_id, boq_item_id)
);
ALTER TABLE payment_bills DROP CONSTRAINT IF EXISTS payment_bills_type_chk;
ALTER TABLE payment_bills ADD CONSTRAINT payment_bills_type_chk
  CHECK (type IN ('bill','advance','item','adjustment'));
CREATE INDEX IF NOT EXISTS idx_pca_cert ON payment_cert_adjustments (cert_id, status);
-- RLS theo dự án: cùng khuôn policy project_id của 0069/0165 (KHÔNG có nhánh GUC rỗng), FORCE RLS,
-- thêm 2 bảng vào danh sách bảng tài chính mà verifier DR `app-role-rls` kiểm (scripts/lib/dr-readonly.ts).
-- Trigger audit_row_change trên payment_cert_adjustments.
```

### 2.2 Quy tắc nghiệp vụ (D07)

- Chỉ tạo adjustment cho IPC `approved`. `reversal` = huỷ toàn bộ hiệu lực của đợt (amount = −giá trị
  hiệu lực **gộp** của đợt — xem §6 mục 2, items = −KL hiệu lực từng dòng; không nhập tay). `adjustment` = sửa một phần (items ± ; amount =
  Σ qty_delta × unit_price gốc, **tính trong SQL** lúc duyệt, làm tròn 2 số lẻ sau khi cộng).
- Luồng nháp → trình (`submit`, người lập) → duyệt/từ chối (`decide`, `CAN.approve` Admin/PM, SoD: người
  duyệt ≠ người lập, dùng helper `lib/bao-mat/sod.ts`; qua `approval_flows` nếu IPC gốc đi qua engine —
  tái dùng `advanceApproval` như route decide IPC). Khoá hợp đồng (`khoaHopDongVaDot`) khi duyệt.
- Khi duyệt: (1) sinh `payment_bills` `type='adjustment'`, `amount` ±, `pay_status='committed'` (M129),
  `payment_cert_id` = cert gốc; nếu phiếu gốc còn `committed` và kind=`reversal` → phiếu gốc chuyển `void`
  thay vì sinh phiếu âm (không chi thì không cần hoàn); (2) luỹ kế hợp đồng (`dongLuyKeHieuLuc`,
  `contractCumulativeValue`, `overContractCerts`, cảnh báo vượt HĐ) phải tính **cả adjustment approved**
  — sửa các câu SQL luỹ kế để cộng `qty_delta` của adjustment approved cùng dòng BOQ (không đếm lặp);
  (3) kỳ sau không bị sửa âm thầm: adjustment là chứng từ riêng, kỳ sau giữ nguyên; (4) ghi snapshot
  quyết định (tái dùng `ghiSnapshotQuyetDinh` nếu khớp cấu trúc, hoặc bảng snapshot riêng theo cùng khuôn).
- Một đợt chỉ có **1 adjustment đang mở** (draft/submitted) tại một thời điểm (409). `reversal` approved →
  không cho thêm adjustment nữa cho đợt đó (409).
- Huỷ upstream (VO/phụ lục) khi có IPC approved: vẫn chặn như hiện tại nhưng thông điệp chỉ sang "lập
  chứng từ điều chỉnh" kèm link. Không xoá history.

### 2.3 API (route chỉ bọc HTTP, logic ở `lib/tai-chinh/ipc-dieu-chinh.ts`; ≥2 miền → `lib/dich-vu/`)

- `GET /api/payment-certs/:id/adjustments` (PAYMENT_VIEW_ROLES, scope dự án) — danh sách + wire tiền v1.
- `POST /api/payment-certs/:id/adjustments` `{ kind, reason, items?: [{boqItemId, qtyDelta}] }` (Admin/PM).
- `PATCH /api/adjustments/:id` (chỉ draft, người lập hoặc Admin) · `POST /api/adjustments/:id/submit` ·
  `POST /api/adjustments/:id/decide` `{ decision, rejectReason? }` + `Idempotency-Key` như IPC ·
  `DELETE /api/adjustments/:id` (chỉ draft).
- Mọi route: 401/403/404 theo khuôn, `export const dynamic`, tiền `::text`, lỗi tiếng Việt, mask
  `stripSensitive` trước wire.

### 2.4 UI

- `CertDocument.tsx`: với đợt approved, nút "Điều chỉnh" / "Huỷ hiệu lực (reversal)" (Admin/PM) → form
  (lý do bắt buộc; adjustment: bảng dòng BOQ của đợt với cột "KL điều chỉnh ±"), danh sách adjustment
  của đợt với badge trạng thái, giá trị ±, người lập/duyệt; nút duyệt/từ chối cho người có quyền (ẩn với
  người lập — SoD). Tái dùng `Modal`, `Button`, `Chip`, pattern dialog xác nhận cảnh báo hiện có.
- `/approvals` liệt kê adjustment `submitted` cùng chỗ IPC chờ duyệt (nếu trang này đã gom IPC).

## 3. Điểm chạm code

`migrations/0167_*.sql` · `lib/tai-chinh/ipc-dieu-chinh.ts` (mới) · `lib/tai-chinh/paymentcerts.ts`
(luỹ kế/vượt HĐ cộng adjustment) · `lib/tai-chinh/cost.ts`/`finance.ts` (phiếu `adjustment`) ·
`app/api/payment-certs/[id]/adjustments/route.ts`, `app/api/adjustments/[id]/{route,submit,decide}` ·
`app/payment-certs/_components/CertDocument.tsx` (+ component mới `DieuChinhDot.tsx`) · `app/approvals` ·
`scripts/lib/dr-readonly.ts` (danh sách bảng FORCE RLS) · `docs/ERD.md` · kiểm kê route S00.

## 4. Test (route handler thật, setup đầu tiên) — `tests/m128-dieu-chinh-ipc.test.ts`

(1) tạo adjustment cho đợt draft → 409; (2) reversal: amount = −approvedValue exact, duyệt → luỹ kế HĐ
giảm đúng, cảnh báo vượt HĐ biến mất, phiếu gốc committed → void (không phiếu âm) / phiếu gốc paid →
phiếu âm committed; (3) adjustment một phần: Σ qty_delta×giá trong SQL, luỹ kế dòng BOQ đổi đúng, kỳ
sau không đổi; (4) SoD người duyệt = người lập → 403; viewer → 403; dự án khác → 404; (5) 2 adjustment
mở cùng đợt → 409; (6) Idempotency-Key lặp → replayed, không sinh phiếu thứ 2; (7) sau reversal approved
không tạo thêm → 409; (8) RLS: role `xboss_app` GUC khác dự án không thấy adjustment. Mutation: thêm bất
biến "adjustment approved làm luỹ kế đổi" vào `scripts/mutation-check.mjs` nếu khuôn cho phép (phiên
chính chạy, worker không chạy).

## 5. Tiêu chí chấp nhận

- [ ] Không có đường sửa/xoá IPC approved ngoài adjustment; history không xoá; audit đủ.
- [ ] Luỹ kế/cảnh báo vượt HĐ/cost report nhất quán sau adjustment (test oracle SQL độc lập).
- [ ] Tiền exact; SoD; RLS FORCE; route kiểm quyền đối xứng (`check:route-perms`).
- [ ] Migration thêm thuần; `docs/ERD.md`, `PROGRESS.md`, `docs/nang-cap/README.md` cập nhật; gate xanh.

## 6. Quyết định bổ sung 2026-10-09

Chủ dự án chốt 3 điểm nghiệp vụ còn mở sau audit M128 (truyền qua coordinator, thi hành ở nhánh
`m128-fix`). Các quyết định này **thay** phần tương ứng ở §2.2 khi mâu thuẫn.

1. **Luỹ kế hiệu lực của đợt.** Luỹ kế của đợt kỳ N = luỹ kế IPC kỳ N + Σ `qty_delta` của chứng từ
   điều chỉnh **đã duyệt** gắn đợt có `period_no ≤ N` (cùng hợp đồng, cùng dòng BOQ). Áp cho MỌI đường
   đọc: `certTotals().cumulativeValue`, `dongLuyKeHieuLuc` (kể cả đợt đã duyệt — cảnh báo vượt HĐ),
   `certLinesExact`/`certItemsExact`/`certItemsExactByContract`/`fetchCerts` (chi tiết, danh sách,
   export Excel/PDF, `CertDocument`, `/payment-certs`). Một biểu thức SQL dùng chung
   (`LUY_KE_HIEU_LUC_SQL`, `lib/tai-chinh/paymentcerts.ts`), tiền cộng NUMERIC trong SQL, làm tròn
   2 số lẻ sau khi cộng. `qty_cumulative` **lưu** của đợt vẫn là chuỗi IPC thuần (không ghi đè snapshot
   đã duyệt) — chỉ cách đọc cộng sổ điều chỉnh, nên không đếm lặp.
2. **Phiếu ròng.** Số tiền phiếu `payment_bills.type='adjustment'` sinh từ chứng từ điều chỉnh tính
   **ròng** cùng công thức `ipcSumV1` với phiếu gốc: round(Σ `qty_delta` × đơn giá gốc, 2) −
   round(tạm ứng) − round(giữ lại) theo tỷ lệ HĐ — để −toàn bộ KL của đợt = −đúng giá trị phiếu gốc.
   Giá trị **chứng từ** `adjustment` (`payment_cert_adjustments.amount`) và luỹ kế KL vẫn **gộp**
   (KL × giá). **Sửa 2026-10-09 (hậu audit vòng 2): `amount` GỘP cho cả hai loại.** Reversal:
   `amount` = −(giá trị đợt gộp `ROUND(Σ qty_period × unit_price, 2)` + Σ `amount` chứng từ điều chỉnh
   đã duyệt của đợt) — tức −giá trị hiệu lực hiện tại (tính trong SQL), nên tổng chứng từ của đợt sau
   huỷ = 0; ngưỡng engine duyệt so |amount| gộp. Tiền **phiếu** vẫn RÒNG: khi duyệt reversal, phiếu
   `committed` của đợt → `void`, phần đã chi (`paid`) bù bằng một phiếu âm = −Σ phiếu `paid`. Tóm tắt
   điều chỉnh ở `GET /api/payment-certs/:id` tách `grossAmount` (Σ amount gộp đã duyệt — UI "Chênh lệch
   giá trị (gộp)") và `netBillAmount` (Σ phiếu `adjustment` chưa void — UI "Tiền phiếu điều chỉnh
   (ròng)"); bỏ `netAmount`. Snapshot quyết định chứng từ ghi `moneyRule: "adj-sum-v2"` (+ `billAmount`).
3. **Đợt legacy không có phiếu gốc.** Đợt đã duyệt không có phiếu `type='bill'` → lập chứng từ điều
   chỉnh/huỷ hiệu lực trả **409 `ipc_no_bill`** ("cần nhập phiếu gốc trước"); kiểm lại lúc **duyệt**
   (mọi bước duyệt, dưới khoá HĐ → đợt). Từ chối vẫn được (không sinh tiền).

### Quyết định hậu audit vòng 2 (2026-10-09)

4. **Đơn giá khi luỹ kế hợp đồng (H1).** Luỹ kế HĐ (`contractCumulativeValue`, cảnh báo vượt HĐ) tính
   **theo từng dòng BOQ**: (luỹ kế `qty_cumulative` ở đợt đã duyệt mới nhất có dòng + Σ `qty_delta` điều
   chỉnh đã duyệt gắn đợt `period_no ≤` đợt đó) × **đơn giá snapshot của đợt mới nhất** đó; cộng NUMERIC
   rồi làm tròn 2 số lẻ trong SQL. Đơn giá đổi giữa các đợt → luỹ kế định giá lại theo giá mới nhất (như
   chuỗi IPC thuần), không cộng lẫn giá cũ/giá mới; reversal đợt cũ sau khi đổi giá vẫn trừ đúng KL.
5. **Tỷ lệ tạm ứng/giữ lại của phiếu ròng (L2).** Lấy từ snapshot quyết định **duyệt** của IPC gốc
   (`payment_cert_decision_snapshots.snapshot->'contract'->{advancePct,retentionPct}`, bản mới nhất). Đợt
   không có snapshot (legacy trước khi có snapshot) → dùng tỷ lệ HĐ **hiện tại** và ghi log cảnh báo;
   snapshot sai dạng → lỗi (fail-fast, không đoán). Không thêm khoá sửa tỷ lệ HĐ.
6. **Hồ sơ chốt ở tầng DB (trigger 0168).** INSERT chứng từ chỉ nhận nháp sạch (`draft`, không
   `submitted_at`/`decided_*`/`bill_id`/`reject_reason`); nháp/đã trình không mang thông tin quyết định;
   đã trình chỉ đổi được `amount` (đặt lúc duyệt), không đổi lý do/ngày trình; `rejected` không có phiếu.
   Hàm trigger `SET search_path = pg_catalog, public, pg_temp` và gọi hàm/bảng có schema.
7. **Phiếu điều chỉnh chỉ đọc.** Phiếu `payment_bills.type='adjustment'` không sửa được số tiền/KL/đơn
   vị qua PATCH (409 `bill_adjustment_locked`), không xoá (409 `bill_ipc_locked`); sửa ghi chú vẫn được.
   `/payments` hiện chip "Điều chỉnh IPC", số âm có dấu −, dòng void gạch ngang; trang in liệt kê phiếu
   điều chỉnh trong mục A.

Test: `tests/m128-dieu-chinh-ipc.test.ts` ca "M128 §6 (10)/(11)/(12)" + ca tạm ứng/giữ lại ≠ 0 + ca hậu
audit vòng 2 (đổi giá giữa đợt, tỷ lệ snapshot, trigger dưới `xboss_app`, SoD hai tổ chức, khoá phiếu).
