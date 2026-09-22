# ADR-0011: Hai lớp (nghiệp vụ ↔ engineering) được giữ, nhưng danh tính chỉ có MỘT nguồn

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-08-25
- **Nối tiếp:** ADR-0007 (lib theo miền), ADR-0008 (tầng dịch vụ)
- **Nguồn:** `docs/audit-2026-08-25-tinh-nang-theo-vong-doi.md` §3.3, đề xuất #6

## Bối cảnh

Audit tính năng theo vòng đời dự án (2026-08-25) đếm được: **119/269 bảng DB (44%)**,
**143/505 route API (28%)** và **57% dòng của `lib/`** thuộc lớp `engineering`. Bảy nghiệp
vụ tồn tại **hai lần** — một bản nghiệp vụ, một bản `engineering` — với bảng DB riêng, route
riêng, **không tham chiếu nhau**:

| Nghiệp vụ   | Bản nghiệp vụ                               | Bản `engineering`                                     |
| ----------- | ------------------------------------------- | ----------------------------------------------------- |
| Claim / EOT | `claims`, `claim_documents`                 | `engineering_fidic_claims`, `…_tia_claims`            |
| Thầu phụ    | `subcontractor_profiles` (PK `supplier_id`) | `engineering_subcon_profiles` (PK uuid riêng)         |
| Đấu thầu    | `tender_packages`, `tender_bids`            | `engineering_bidding_packages`, `…_vendor_quotes`     |
| Dòng tiền   | `invoices`, `payroll`                       | `engineering_cashflow_forecast_runs`, `…_projections` |
| HSE         | `hse_records`                               | `engineering_hse_vision_scans`, `…_detected_hazards`  |
| BIM/bản vẽ  | `drawings` (kind=`bim`)                     | `engineering_bim_models`, `…_elements`                |
| Rủi ro      | `risks`                                     | `engineering_prediction_*`                            |

Hậu quả đã xảy ra thật, không phải giả định: `engineering_subcon_profiles` tự giữ
`company_name`/`tax_code` với FK `supplier_id` chỉ **tuỳ chọn**, nên cùng một nhà thầu phụ
có thể tồn tại hai bản ghi lệch tên/lệch mã số thuế ở hai lớp mà không cơ chế nào bắt được.
Cùng đợt còn phát hiện `GET /api/engineering/subcon-ai/scores` **tự chèn 4 hồ sơ thầu phụ
bịa kèm mã số thuế giả** vào DB thật — chính vì module không có đường tạo hồ sơ hợp lệ nào.

## Ba hướng đã cân nhắc

1. **Gộp hai lớp về một** — đúng về mô hình dữ liệu, nhưng là migration nhiều tháng, đụng
   119 bảng, trong khi **chưa đo được** các bảng `engineering_*` có dữ liệu thật hay rỗng
   trên production. Gộp mù là rủi ro lớn nhất trong ba hướng.
2. **Giữ nguyên hiện trạng** — rẻ nhất, nhưng để nguyên đúng cái lỗi đã xảy ra: danh tính
   trôi giữa hai lớp, không nối được báo cáo, và mỗi module mới lại đẻ thêm một bảng tự giữ
   tên đối tác.
3. **Giữ hai lớp, siết danh tính** ← **đã chọn.**

## Quyết định

**Hai lớp được phép cùng tồn tại.** Lớp `engineering` là lớp phân tích/AI: nó được có bảng
riêng cho _kết quả tính toán_ của nó (điểm tín nhiệm, dự báo, kết quả quét, phiên bản mô
hình). Nhưng:

> **Lớp `engineering` KHÔNG được tự giữ danh tính của một đối tượng nghiệp vụ đã có bảng
> gốc.** Danh tính (nhà cung cấp/thầu phụ, hợp đồng, dự án) phải tham chiếu bảng gốc bằng
> khoá ngoại. Tên hiển thị lấy qua JOIN, hoặc chép từ bảng gốc lúc ghi — **không nhận từ
> client**.

Ba hệ quả bắt buộc:

1. **Đường ghi phải yêu cầu khoá gốc.** Ví dụ đã thi hành:
   `lib/hien-truong/subcon-metrics.ts → taoHoSoThauPhu()` bắt buộc `supplierId`, chép
   `company_name` từ `suppliers`, và `POST /api/engineering/subcon-ai/scores` là đường tạo
   hồ sơ duy nhất.
2. **DB phải chặn trùng, không chỉ tầng ứng dụng.** Unique index một phần
   `(project_id, supplier_id)` (migration 0137) — chèn thẳng bằng SQL cũng bị chặn.
3. **Endpoint GET không bao giờ được ghi dữ liệu nghiệp vụ.** Không "auto-seed dữ liệu mẫu"
   vào DB thật ở bất kỳ đâu; dự án rỗng thì trả rỗng và UI hiện trạng thái rỗng.

**Cổng CI canh:** `npm run check:engineering-danh-tinh`
(`scripts/check-engineering-danh-tinh.ts`) đọc toàn bộ `migrations/*.sql`, dựng tập cột của
từng bảng `engineering_*` (kể cả cột thêm bằng `ALTER TABLE` ở migration sau) và **đỏ** khi
một bảng mang cột danh tính (`company_name`, `tax_code`, `supplier_name`,
`subcontractor_name`, `vendor_name`, `contractor_name`, `contract_code`) mà không có
`REFERENCES` về bảng gốc tương ứng.

## Việc đã thi hành theo ADR này

- **0137** — `engineering_subcon_profiles`: backfill `supplier_id` theo tên chuẩn hoá (chỉ
  gắn khi khớp DUY NHẤT) + unique index một phần `(project_id, supplier_id)`.
- **0138** — thêm FK `supplier_id` + index + backfill cho ba bảng còn giữ tên tự do:
  `engineering_bidding_vendor_quotes.vendor_name`,
  `engineering_material_shipments.supplier_name`,
  `engineering_smart_ipc_records.contractor_name`.
- Gỡ auto-seed dữ liệu bịa ở `GET /api/engineering/subcon-ai/scores` và
  `GET /api/engineering/iot/devices`; thêm `scripts/don-du-lieu-seed-bia.ts` để dọn phần đã
  lỡ ghi (mặc định chỉ báo cáo).

## Cập nhật 2026-09-22 — 4/6 cặp đã tự giải quyết

Audit "6 cặp stack song song" (yêu cầu người dùng 2026-09-22) kiểm lại bảng 6 cặp ở trên,
đối chiếu với các đợt xoá module `thuNghiem` sau ADR này (0153 ngày 2026-09-21, đợt xoá
`engineering-predictions`/`engineering-nextgen-apex`/`combine` ngày 2026-09-22): **4 cặp đã
tự giải quyết**, không còn là "hai lớp song song" nữa ở tầng CODE — route/trang
`/engineering/*` phía đó đã bị xoá:

- **Claim/EOT**, **HSE**, **BIM/bản vẽ**, **Rủi ro** — lớp `engineering` không còn tồn tại ở
  code. Không cần quyết gộp/xoá gì thêm ở tầng ứng dụng.
- **Bảng DB mồ côi vẫn còn 15 bảng chưa dọn được** (nhóm Prediction 0096, BIM/BIM-viewer
  0114, CAD/BIM Professional Upgrade 0122, NextGen Apex 0127 trừ `engineering_fidic_tia_claims`
  vẫn sống). Đã thử viết migration DROP (PR #509, 2026-09-22) nhưng làm CI `test (Postgres)` +
  `coverage` fail ổn định không rõ nguyên nhân (nghi liên quan `UPDATE
engineering_smart_ipc_records` của migration 0138 chạy sau khi bảng bị DROP, nhưng chưa xác
  minh được cơ chế) — RÚT migration khỏi PR, xem `PROGRESS.md` mục tương ứng. Cần điều tra kỹ
  hơn trước khi mở lại.

**Chỉ còn 2 cặp thật sự song song, chưa quyết:**

- **Đấu thầu** — `tender.ts` (`tender_packages`/`tender_bids`) vs
  `engineering-bidding-matrix.ts` (`engineering_bidding_packages`/`…_vendor_quotes`).
- **Dòng tiền** — `finance.ts::cashflowActual()` (đọc `cash_transactions`/`invoices` thật) vs
  `engineering-cashflow.ts` (engine mô phỏng/dự báo, `engineering_cashflow_forecast_runs`/
  `…_projections`).

`scripts/dem-du-lieu-engineering.ts` đã cập nhật, chỉ còn đo 2 cặp này + cặp thầu phụ (đối
chiếu 0137).

## Việc CÒN LẠI — cần đo trước khi quyết

Hai cặp còn lại (đấu thầu, dòng tiền) **chưa gộp**, và ADR này cố ý không quyết thay. Điều
kiện để quyết:

1. Đếm số dòng thật của từng bảng `engineering_*` trên **production** (rỗng → "gộp" trở
   thành "xoá", rẻ hơn nhiều bậc).
2. Đối chiếu với 12 module đang `thuNghiem: true` trong `lib/nen/modules.ts` — toàn bộ nằm
   ở lớp này, tức đã tắt mặc định cho mọi dự án.

**Công cụ đo (điều kiện 1):** `npm run dem:engineering` — script CHỈ ĐỌC, an toàn chạy thẳng
trên production:

```bash
DATABASE_URL=<chuỗi kết nối production> npm run dem:engineering
DATABASE_URL=<...> npm run dem:engineering -- --tat-ca   # liệt kê cả 119 bảng
```

Script in ra, cho từng cặp, số dòng bảng gốc ↔ số dòng lớp engineering kèm **kết luận gợi ý**
theo đúng quy tắc của ADR này:

| Kết quả đo                    | Kết luận                                                     |
| ----------------------------- | ------------------------------------------------------------ |
| Lớp eng. = 0 dòng             | **Xoá** lớp engineering của cặp đó — rẻ hơn gộp nhiều bậc    |
| Lớp eng. < 1/10 bảng gốc      | Gần như không ai dùng → **nghiêng về xoá**, xác nhận với PM  |
| Cả hai đều có dữ liệu đáng kể | **Phải gộp thật** — cần kế hoạch di trú riêng, không làm vội |
| Chỉ lớp eng. có dữ liệu       | Xem lại: nghiệp vụ gốc chưa được dùng? Quyết cùng PM         |

Ghi số đo được vào chính mục này rồi mới quyết từng cặp — **không quyết bằng suy đoán**.

Trong lúc chờ, quy tắc danh tính ở trên **vẫn áp cho mọi bảng mới** — cổng CI không cho tập
vi phạm phình thêm.

## Cái giá chấp nhận

- Hai lớp vẫn còn, nên **một số báo cáo vẫn phải JOIN chéo** giữa hai họ bảng.
- Backfill theo **tên** là hữu hạn: trùng tên hoặc viết khác nhau thì để `NULL` cho người
  xử lý tay — cố ý không đoán. `suppliers` không có cột mã số thuế nên không khớp theo mã
  được; nếu sau này thêm cột đó, nên backfill lại theo mã trước, tên sau.
- Chưa siết `NOT NULL` cho các cột FK mới: dòng cũ không khớp được sẽ làm migration đổ.
  Siết ở migration sau, khi production đã dọn hết `NULL`.
