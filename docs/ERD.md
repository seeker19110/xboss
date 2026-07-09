# XBoss — Database ERD

**Phiên bản thực tế** (tự sinh schema từ `lib/db/index.ts` — không cần migrate).

---

## Phân cấp WBS

```
Project
└── Tower
    └── SheetType  (slug URL, động — tạo/đổi tên/xóa được)
        └── WorkPackage  (nhóm tầng: A1, H1, OGCH1...)
            └── Task  (công đoạn: A1,01...)
                ├── ProgressDimension  (ô checkbox: kích thước ống / căn hộ)
                ├── TaskHistory        (audit % tiến độ)
                ├── TaskPhoto          (ảnh hiện trường)
                ├── TaskComment        (bình luận)
                └── TaskDocument       (biên bản nghiệm thu PDF/ảnh)
```

---

## Bảng chính

### `users`

| Cột           | Kiểu        | Ghi chú                             |
| ------------- | ----------- | ----------------------------------- |
| id            | SERIAL PK   |                                     |
| name          | TEXT        |                                     |
| email         | TEXT UNIQUE |                                     |
| password_hash | TEXT        | bcrypt                              |
| role          | TEXT        | `admin \| pm \| engineer \| subcon` |
| created_at    | TIMESTAMPTZ |                                     |

### `projects`

| Cột                   | Kiểu        | Ghi chú                                     |
| --------------------- | ----------- | ------------------------------------------- |
| id                    | SERIAL PK   |                                             |
| name                  | TEXT        | Tên dự án                                   |
| code                  | TEXT UNIQUE | Mã dự án                                    |
| investor              | TEXT        | Chủ đầu tư                                  |
| contractor            | TEXT        | Nhà thầu                                    |
| start_date / end_date | DATE        |                                             |
| heatmap_title         | TEXT        | Tiêu đề heatmap tuỳ chỉnh                   |
| material_col_labels   | TEXT        | JSON — nhãn cột tùy biến vật tư             |
| status                | TEXT        | `active\|handover\|closed` (M22)            |
| color                 | TEXT        | Chấm màu nhận diện switcher/Portfolio (M22) |

## Đa dự án (M22, `migrations/0027_multi_project.sql`)

Cookie `xboss_project` (không path prefix) chọn dự án đang xem — `lib/projects.ts:getCurrentProjectId(user)`. `visibleProjectIds(user)`: `admin` thấy mọi dự án; vai trò khác theo `user_projects`; bảng rỗng toàn hệ thống = mọi user thấy mọi dự án (tương thích ngược 1 dự án).

### `user_projects`

| Cột        | Kiểu          | Ghi chú                       |
| ---------- | ------------- | ----------------------------- |
| user_id    | FK → users    | PK ghép (user_id, project_id) |
| project_id | FK → projects |                               |

### Bảng "gốc cụm" có cột `project_id` (thêm ở migration 0027, backfill về dự án id nhỏ nhất)

**M16-M22:** `contracts`, `variation_orders`, `materials`, `boq_items`, `purchase_orders`, `purchase_requests`, `meetings`, `risks`, `proposals`, `correspondences`, `drawings`, `qc_checklists`, `ncrs`, `hse_records`, `site_diaries`, `equipment`, `vehicle_logs`, `tender_packages`, `project_documents`.

**M23-M31 (khởi động, nhân sự, môi trường, quan trắc, bảo hiểm, bàn giao, công nghệ):** `legal_documents`, `mobilization_items`, `personnel`, `crews`, `attendance`, `certifications`, `raci_matrix`, `env_permits`, `env_monitoring`, `waste_logs`, `monitoring_points`, `community_cases`, `insurance_bonds`, `commissioning`, `handover_items`, `punch_list`, `demob_items`, `lessons_learned`, `tech_links`, `progress_albums`.

Mọi route GET/PATCH/DELETE theo ID của các bảng trên đều lọc thêm `project_id = <dự án đang chọn>` — sai dự án trả **404** (không lộ tồn tại của bản ghi). POST tạo mới gán `project_id` từ server (`getCurrentProjectId`), không tin client.

`site_diaries` (`migrations/0028_diary_project_unique.sql`): UNIQUE gốc chỉ theo `diary_date` (một nhật ký/ngày cho cả hệ thống) đổi thành `UNIQUE(diary_date, project_id)` — mỗi dự án có nhật ký riêng theo ngày.

### Bảng suy `project_id` qua bảng cha (KHÔNG thêm cột riêng)

`towers.project_id` (có sẵn từ baseline, gốc của toàn bộ WBS) → `tasks`/`work_packages`/`sheet_types` suy qua chuỗi `sheet_types.tower_id → towers.project_id`. `payment_certs` suy qua `contract_id → contracts.project_id`. `qc_inspections` suy qua `task_id`/`work_package_id` (`lib/qaqc.ts:taskInProject`/`workPackageInProject`). `work_fronts` suy qua `sheet_type_id → towers.project_id`. `boq_norms` suy qua `boq_item_id → boq_items.project_id`.

**Nợ kỹ thuật đã biết:** `/api/notifications` (cảnh báo trễ/PO trễ/NCR quá hạn...) **chưa** scoped theo dự án đang chọn — vẫn quét mọi dự án user thấy được, như trước M22. Nhiều hàm nguồn đã nhận sẵn tham số `projectId?` tuỳ chọn nhưng chưa wire vào route vì logic "tạo mới" và "dọn thông báo cũ" dùng chung 1 danh sách — cần thiết kế lại tách riêng 2 phía trước khi scope, tránh xoá nhầm thông báo hợp lệ của dự án khác. `costSummary`/`/api/costs` (M2) cũng chưa scoped — ngân sách/cam kết/thực chi hiện gộp mọi dự án theo hệ (`disciplines` là danh mục toàn hệ thống, không theo dự án).

### `towers`

| Cột         | Kiểu          |
| ----------- | ------------- |
| id          | SERIAL PK     |
| project_id  | FK → projects |
| name        | TEXT          |
| description | TEXT          |

### `sheet_types`

| Cột         | Kiểu        | Ghi chú                                              |
| ----------- | ----------- | ---------------------------------------------------- |
| id          | SERIAL PK   |                                                      |
| tower_id    | FK → towers |                                                      |
| code        | TEXT        | `OGTĐ`, `OGHL`, `OGCH`, `ODNN Zone 1`, `ODNN Zone 2` |
| name        | TEXT        | Tên hiển thị                                         |
| slug        | TEXT UNIQUE | Slug URL: `ogtd`, `oghl`...                          |
| responsible | TEXT        | Người phụ trách                                      |
| manager_id  | FK → users  | Quản lý hệ (phân công tự động xuống)                 |

### `work_packages`

| Cột                   | Kiểu                  | Ghi chú                               |
| --------------------- | --------------------- | ------------------------------------- |
| id                    | SERIAL PK             |                                       |
| sheet_type_id         | FK → sheet_types      |                                       |
| boq_code              | TEXT UNIQUE (partial) | Mã BOQ toàn hệ thống                  |
| code                  | TEXT                  | `A1`, `H1`, `OGCH1`                   |
| seq_no                | TEXT                  |                                       |
| floor_label           | TEXT                  | `1F`, `2F`...                         |
| name                  | TEXT                  |                                       |
| drawing_url           | TEXT                  |                                       |
| start_date / end_date | DATE                  |                                       |
| duration_days         | INTEGER               |                                       |
| status                | TEXT                  | enum slug                             |
| progress              | DOUBLE                | Trung bình tasks                      |
| sort_order            | INTEGER               | Thứ tự hiển thị                       |
| assigned_to           | FK → users            |                                       |
| assigned_manual       | BOOLEAN               | Gán thủ công (không kế thừa từ sheet) |

### `tasks`

| Cột                   | Kiểu                  | Ghi chú                                                        |
| --------------------- | --------------------- | -------------------------------------------------------------- |
| id                    | SERIAL PK             |                                                                |
| package_id            | FK → work_packages    |                                                                |
| boq_code              | TEXT UNIQUE (partial) |                                                                |
| code                  | TEXT                  | `A1,01`                                                        |
| seq_no                | TEXT                  |                                                                |
| name                  | TEXT                  |                                                                |
| note                  | TEXT                  |                                                                |
| drawing_url           | TEXT                  |                                                                |
| status                | TEXT                  | `chuan_bi \| dang_thi_cong \| hoan_thanh \| tre \| nghiem_thu` |
| start_date / end_date | DATE                  |                                                                |
| duration_days         | INTEGER               |                                                                |
| progress_percent      | DOUBLE                | 0..1, tính từ dimensions                                       |
| assigned_to           | FK → users            |                                                                |
| assigned_manual       | BOOLEAN               |                                                                |
| delay_reason          | TEXT                  | 1 trong 6 lý do chuẩn                                          |
| delay_note            | TEXT                  | Ghi chú bổ sung                                                |
| sort_order            | INTEGER               |                                                                |
| updated_at            | TIMESTAMPTZ           |                                                                |

### `progress_dimensions`

| Cột             | Kiểu        | Ghi chú                       |
| --------------- | ----------- | ----------------------------- |
| id              | SERIAL PK   |                               |
| task_id         | FK → tasks  |                               |
| dimension_label | TEXT        | `1300x700 X3-X4` hoặc `CH 01` |
| installed       | INTEGER     | Số đã lắp (dùng cho OGTĐ)     |
| value           | DOUBLE      | % riêng nếu có                |
| sort_order      | INTEGER     |                               |
| updated_at      | TIMESTAMPTZ |                               |

### `task_history`

| Cột                         | Kiểu        |
| --------------------------- | ----------- |
| id                          | SERIAL PK   |
| task_id                     | FK → tasks  |
| old_progress / new_progress | DOUBLE      |
| status                      | TEXT        |
| note                        | TEXT        |
| changed_by                  | TEXT        |
| changed_at                  | TIMESTAMPTZ |

### `task_photos`

| Cột                                    | Kiểu        |
| -------------------------------------- | ----------- |
| id                                     | SERIAL PK   |
| task_id                                | FK → tasks  |
| file_name                              | TEXT        |
| original_name / mime_type / size_bytes |             |
| caption                                | TEXT        |
| uploaded_by                            | FK → users  |
| created_at                             | TIMESTAMPTZ |

### `task_comments`

| Cột        | Kiểu        |
| ---------- | ----------- |
| id         | SERIAL PK   |
| task_id    | FK → tasks  |
| user_id    | FK → users  |
| body       | TEXT        |
| created_at | TIMESTAMPTZ |

### `task_documents`

Biên bản nghiệm thu — cùng cấu trúc `task_photos`, lưu chung `data/uploads/`.

### `notifications`

| Cột         | Kiểu           | Ghi chú                                           |
| ----------- | -------------- | ------------------------------------------------- |
| id          | SERIAL PK      |                                                   |
| user_id     | FK → users     |                                                   |
| task_id     | FK → tasks     | NULL nếu type=material_over                       |
| material_id | FK → materials | NULL nếu không liên quan vật tư                   |
| type        | TEXT           | `delayed \| due_soon \| comment \| material_over` |
| message     | TEXT           |                                                   |
| is_read     | INTEGER        | 0/1                                               |
| created_at  | TIMESTAMPTZ    |                                                   |

UNIQUE: `(user_id, task_id, type)` + partial index `(user_id, material_id, type) WHERE material_id IS NOT NULL`.

### `push_subscriptions`

| Cột           | Kiểu        |
| ------------- | ----------- |
| id            | SERIAL PK   |
| user_id       | FK → users  |
| endpoint      | TEXT UNIQUE |
| p256dh / auth | TEXT        |
| created_at    | TIMESTAMPTZ |

---

## Vật tư & Đặt hàng

### `materials`

| Cột             | Kiểu                  | Ghi chú                            |
| --------------- | --------------------- | ---------------------------------- |
| id              | SERIAL PK             |                                    |
| sheet_type_id   | FK → sheet_types      |                                    |
| task_id         | FK → tasks            | nullable                           |
| boq_code        | TEXT UNIQUE (partial) |                                    |
| name            | TEXT                  |                                    |
| unit            | TEXT                  |                                    |
| qty_boq         | DOUBLE                | Định mức BOQ                       |
| qty_planned     | DOUBLE                | Kế hoạch                           |
| qty_used        | DOUBLE                | Đã dùng                            |
| qty_stock       | DOUBLE                | Tồn kho thực                       |
| min_stock_level | DOUBLE                | Ngưỡng cảnh báo tồn kho            |
| status          | TEXT                  | `dat_hang \| da_giao \| dang_dung` |
| note            | TEXT                  |                                    |
| sort_order      | INTEGER               |                                    |

### `material_transactions`

Ghi delta ±qty mỗi lần thay đổi `qty_used`.

| Cột             | Kiểu               |
| --------------- | ------------------ |
| delta           | DOUBLE             |
| qty_after       | DOUBLE             |
| type            | TEXT               | `dieu_chinh \| xuat \| nhap_kho` |
| task_id         | FK → tasks         |
| receipt_item_id | FK → receipt_items |
| created_by      | FK → users         |

### `suppliers`

| Cột                                               | Kiểu      | Ghi chú                               |
| ------------------------------------------------- | --------- | ------------------------------------- |
| id                                                | SERIAL PK |                                       |
| name                                              | TEXT      | Tên nhà cung cấp                      |
| title                                             | TEXT      | Phân loại (vd "Nhà Cung Cấp Ống Gió") |
| phone / email / address                           | TEXT      | Liên hệ                               |
| note                                              | TEXT      |                                       |
| buyer_company / buyer_project / buyer_address     | TEXT      | Bên mua (điền sẵn vào đơn ĐH)         |
| buyer_rep / buyer_title / buyer_phone             | TEXT      | Đại diện bên mua                      |
| seller_rep                                        | TEXT      | Đại diện bên bán                      |
| receiver_company / receiver_address               | TEXT      | Bên nhận hàng                         |
| receiver_rep / receiver_phone / receiver_subcon   | TEXT      | Đại diện bên nhận                     |
| delivery_time / delivery_contact / delivery_phone | TEXT      | Thông tin giao hàng                   |
| delivery_note / delivery_order                    | TEXT      |                                       |

### `purchase_requests` (PR — Yêu cầu mua)

| Cột                        | Kiểu           |
| -------------------------- | -------------- |
| pr_code                    | TEXT UNIQUE    |
| material_id                | FK → materials |
| qty_requested              | DOUBLE         |
| status                     | TEXT           | `pending \| approved \| rejected` |
| requested_by / reviewed_by | FK → users     |
| reviewed_at / review_note  |                |

### `purchase_orders` (PO — Đơn đặt hàng)

| Cột           | Kiểu           |
| ------------- | -------------- |
| po_code       | TEXT UNIQUE    |
| supplier_id   | FK → suppliers |
| status        | TEXT           | `draft \| sent \| received` |
| expected_date | DATE           |
| created_by    | FK → users     |

### `po_items` (Chi tiết PO)

| Cột                        | Kiểu                   |
| -------------------------- | ---------------------- |
| po_id                      | FK → purchase_orders   |
| material_id                | FK → materials         |
| pr_id                      | FK → purchase_requests |
| qty_ordered / qty_received | DOUBLE                 |
| unit_price                 | DOUBLE                 |

### `warehouse_receipts` (Phiếu nhập kho)

| Cột          | Kiểu                 |
| ------------ | -------------------- |
| receipt_code | TEXT UNIQUE          |
| po_id        | FK → purchase_orders |
| received_by  | FK → users           |
| received_at  | TIMESTAMPTZ          |

### `receipt_items` (Chi tiết phiếu nhập)

| Cột          | Kiểu                    |
| ------------ | ----------------------- |
| receipt_id   | FK → warehouse_receipts |
| material_id  | FK → materials          |
| po_item_id   | FK → po_items           |
| qty_received | DOUBLE                  |

---

## Hợp đồng & thanh toán (M16, `migrations/0012_contracts.sql`)

### `contracts`

| Cột                               | Kiểu                                   |
| --------------------------------- | -------------------------------------- |
| code                              | TEXT UNIQUE (số HĐ nhập tay)           |
| kind                              | TEXT (`nhan_thau`\|`giao_thau`\|`ncc`) |
| party_supplier_id                 | FK → suppliers (giao_thau/ncc)         |
| party_name                        | TEXT (nhan_thau — tên CĐT/tổng thầu)   |
| discipline_id                     | FK → disciplines                       |
| value, advance_pct, retention_pct | NUMERIC                                |
| valid_from, valid_to, status      | —                                      |

### `contract_addenda` (phụ lục)

FK → `contracts`, `UNIQUE(contract_id, code)`, `value_delta` (âm được).

### `contract_documents`

Pattern `task_documents` — file trong `data/uploads/`.

Liên kết mềm (nullable, backfill dần): `floor_contracts.contract_id`, `payment_bills.contract_id`, `purchase_orders.contract_id`, `boq_items.contract_id` (dùng cho M17).

---

## Phát sinh / VO (M6, `migrations/0013_vo.sql`)

### `variation_orders`

| Cột                      | Kiểu                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| code                     | TEXT UNIQUE (`VO-0001`, sinh tự động)                                             |
| reason                   | TEXT (`design_change\|client_request\|site_condition\|other`)                     |
| discipline_id            | FK → disciplines (áp cho mọi dòng KL con)                                         |
| contract_id              | FK → contracts (HĐ nhận phụ lục khi chốt — nullable, gán lúc `contract-add`)      |
| status                   | TEXT (`draft\|submitted\|approved\|partially_approved\|rejected\|contract_added`) |
| submitted_at, decided_at | DATE                                                                              |
| created_by               | FK → users                                                                        |

`boq_items` thêm `vo_id` (FK → variation_orders, ON DELETE CASCADE) + `qty_approved` — dòng KL của VO dùng chung bảng BOQ (`qty_contract` = KL đề xuất). Ngân sách/KL nhận thầu (`lib/boq.ts`, `lib/cost.ts`) = dòng gốc (`vo_id IS NULL`) + dòng VO có status `approved|partially_approved|contract_added` (lấy `qty_approved`) — tham số `includeVo` (mặc định true).

### `vo_documents`

Pattern `contract_documents`/`task_documents` — file trong `data/uploads/`.

Khi VO chốt vào phụ lục HĐ (`POST /api/variations/:id/contract-add`, trạng thái `approved`/`partially_approved`): sinh 1 dòng `contract_addenda` (value_delta = approvedValue của VO) + chuyển VO sang `contract_added` + gán `contract_id`.

---

## Nghiệm thu KL & thanh toán theo đợt / IPC (M17, `migrations/0014_payment_certs.sql`)

### `payment_certs`

| Cột                                  | Kiểu                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| code                                 | TEXT UNIQUE (`IPC-0001`, sinh tự động)                            |
| contract_id                          | FK → contracts (NOT NULL)                                         |
| period_no                            | INTEGER — đợt số mấy của HĐ này, `UNIQUE(contract_id, period_no)` |
| period_label                         | TEXT (hiển thị, vd "Tháng 7/2026" — không tính toán)              |
| status                               | TEXT (`draft\|submitted\|approved\|rejected`)                     |
| submitted_at, decided_at, decided_by | DATE / FK → users                                                 |
| reject_reason                        | TEXT                                                              |
| created_by                           | FK → users                                                        |

### `payment_cert_items`

| Cột            | Kiểu                                                              |
| -------------- | ----------------------------------------------------------------- |
| cert_id        | FK → payment_certs, `UNIQUE(cert_id, boq_item_id)`                |
| boq_item_id    | FK → boq_items                                                    |
| qty_period     | NUMERIC — KL nghiệm thu đợt này                                   |
| qty_cumulative | NUMERIC — luỹ kế tới hết đợt này (snapshot lúc lập)               |
| unit_price     | NUMERIC — snapshot đơn giá lúc lập (không đổi khi HĐ sửa giá sau) |

Giá trị đợt tính động (`lib/paymentcerts.ts`, không lưu cột trùng lặp): `periodValue = Σ qty_period×unit_price`, trừ tạm ứng/giữ lại theo `%` của hợp đồng (M16) → `approvedValue`. Duyệt (`approved`) trong transaction tự sinh 1 dòng `payment_bills` (`type='bill'`, `amount=approvedValue`, `contract_id`, `payment_cert_id` — cột mới trên `payment_bills`).

---

## Đấu thầu (M7, `migrations/0015_tender.sql`)

### `tender_packages`

| Cột                 | Kiểu                                                          |
| ------------------- | ------------------------------------------------------------- |
| code                | TEXT UNIQUE (`GT-0001`, sinh tự động)                         |
| status              | TEXT (`draft\|open\|closed\|awarded\|cancelled`)              |
| awarded_bid_id      | FK → tender_bids (nullable — gán lúc trao thầu)               |
| awarded_contract_id | FK → contracts (HĐ giao thầu tự sinh cho NCC trúng thầu, M16) |
| created_by          | FK → users                                                    |

### `tender_items` (phạm vi mời thầu)

FK → `tender_packages` + `boq_items`, PK ghép; `qty` = KL mời (có thể ≠ KL HĐ gốc).

### `tender_bids`

FK → `tender_packages` + `suppliers`, `UNIQUE(tender_id, supplier_id)`; `lump_sum` (chào trọn gói, nullable); file chào thầu gốc inline (`file_name`/`original_name`/`mime_type`/`size_bytes`, pattern `task_documents` — 1 file/bid).

### `tender_bid_prices` (giá theo dòng)

FK → `tender_bids` + `boq_items`, PK ghép. **Dòng NCC chưa chào không có bản ghi** — bảng so sánh (`lib/tender.ts:comparisonTable`) hiện "—" cho dòng thiếu, tổng chỉ cộng dòng đã chào (không cộng 0), kèm `quotedLines/totalLines` để UI ghi chú "chào N/M dòng".

Trao thầu (`POST /api/tenders/:id/award`, `lib/tender.ts:awardTender`): sinh 1 dòng `contracts` (`kind='giao_thau'`, `party_supplier_id` = NCC trúng thầu, `value` = tổng giá của bid thắng) → gán `awarded_bid_id`/`awarded_contract_id`, khoá sửa giá.

---

## Bản vẽ (M8, `migrations/0016_drawings.sql`)

### `drawings`

| Cột             | Kiểu                                          |
| --------------- | --------------------------------------------- |
| code            | TEXT UNIQUE (số bản vẽ, VD `ACMV-SD-T05-001`) |
| kind            | TEXT (`shop\|asbuilt\|bim\|method`)           |
| system_group    | TEXT                                          |
| floor_label     | TEXT                                          |
| work_package_id | FK → work_packages (ON DELETE SET NULL)       |

### `drawing_revisions`

FK → `drawings`, `UNIQUE(drawing_id, rev)`.

| Cột                                             | Kiểu                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| rev                                             | TEXT (A, B, C...)                                                                     |
| status                                          | TEXT (`submitted\|commented\|approved\|approved_with_comments\|rejected\|superseded`) |
| file_name, original_name, mime_type, size_bytes | pattern `task_documents` — file trong `data/uploads/`                                 |
| submitted_at, decided_at, decision_note         | —                                                                                     |

Rev mới chuyển `approved`/`approved_with_comments` tự thay thế (`superseded`) rev khác của cùng drawing đang ở 1 trong 2 trạng thái đó (`lib/drawings.ts` `setRevisionStatus`, trong transaction). Backfill: 1 file `work_packages.drawing_file_name` cũ (route `/api/workpackages/:id/drawing`, vẫn giữ hoạt động song song) → 1 `drawings` (code tạm `WP-<id>`) + 1 rev `A` trạng thái `approved`.

---

## Baseline & S-curve

### `baselines` + `baseline_tasks`

Snapshot ngày BĐ/KT + % tại thời điểm chốt. S-curve nhận `?baseline=<id>` để vẽ đường kế hoạch gốc.

---

## Khởi động & Pháp lý (M23, `migrations/0030_kickoff.sql`)

### `legal_documents`

Hồ sơ pháp lý dự án: giấy phép xây dựng, phê duyệt QH/TK, hợp đồng chính, và các loại khác. Mỗi loại có ngày cấp/hết hạn, trạng thái (draft/valid/expired/superseded) và 1 file đính kèm. Cảnh báo tự động khi sắp hết hạn qua notifications.

| Cột                                             | Kiểu          | Ghi chú                                                    |
| ----------------------------------------------- | ------------- | ---------------------------------------------------------- |
| id                                              | SERIAL PK     |                                                            |
| project_id                                      | FK → projects |                                                            |
| kind                                            | TEXT CHECK    | `giay_phep_xd\|phe_duyet_qh\|phe_duyet_tk\|hd_chinh\|khac` |
| code / title                                    | TEXT          | Mã/tên tài liệu                                            |
| issued_by                                       | TEXT          | Cơ quan/đơn vị cấp                                         |
| issued_date                                     | DATE          | Ngày cấp                                                   |
| expiry_date                                     | DATE          | Ngày hết hạn (NULL = không hạn)                            |
| status                                          | TEXT          | `draft\|valid\|expired\|superseded`                        |
| file_name, original_name, mime_type, size_bytes |               | 1 file chính (pattern gọn)                                 |

### `mobilization_items`

Checklist huy động công trường: bàn giao mặt bằng, khảo sát, trắc đạc, huy động lán trại. Mỗi mục có category, trạng thái (pending/in_progress/done), ngày hạn/hoàn thành, người giao. Dùng để theo dõi các bước chuẩn bị trước khi khởi công.

| Cột        | Kiểu          | Ghi chú                                        |
| ---------- | ------------- | ---------------------------------------------- |
| id         | SERIAL PK     |                                                |
| project_id | FK → projects |                                                |
| category   | TEXT CHECK    | `mat_bang\|khao_sat\|trac_dac\|huy_dong\|khac` |
| title      | TEXT          | Tên mục việc                                   |
| status     | TEXT CHECK    | `pending\|in_progress\|done`                   |
| due_date   | DATE          | Hạn hoàn thành                                 |
| done_date  | DATE          | Ngày hoàn thành thực                           |
| assignee   | FK → users    | Người phụ trách                                |

---

## Nhân sự & Tổ chức (M24, `migrations/0031_hr.sql`)

### `personnel`

Nhân sự công trường (khác với user hệ thống): gồm các kỹ sư, công nhân, thầu phụ. Mỗi nhân sự gắn nhà thầu (supplier_id), có chức danh riêng, mã CCCD (nhạy cảm), trạng thái (active/inactive).

| Cột              | Kiểu           | Ghi chú                        |
| ---------------- | -------------- | ------------------------------ |
| id               | SERIAL PK      |                                |
| project_id       | FK → projects  |                                |
| code / full_name | TEXT           | Mã/tên nhân sự                 |
| role_title       | TEXT           | Chức danh công trường          |
| supplier_id      | FK → suppliers | Nhà thầu phụ (nullable)        |
| phone            | TEXT           | SĐT liên lạc                   |
| id_number        | TEXT           | CCCD (nhạy cảm — chỉ admin/pm) |
| status           | TEXT CHECK     | `active\|inactive`             |

### `crews`

Tổ đội công trường: nhóm người cùng chuyên ngành, gắn nhà thầu/cấp tầng (discipline), có người dẫn đầu. Dùng cho chấm công tổ, phân công hệ thống, quản lý nhân sự.

| Cột           | Kiểu                | Ghi chú                     |
| ------------- | ------------------- | --------------------------- |
| id            | SERIAL PK           |                             |
| project_id    | FK → projects       |                             |
| name          | TEXT, UNIQUE (ghép) | Tên tổ                      |
| discipline_id | FK → disciplines    | Chuyên ngành (MEP/ACMV/...) |
| supplier_id   | FK → suppliers      | Nhà thầu phụ                |
| leader_id     | FK → personnel      | Người dẫn đầu               |

**Bảng nối `crew_members`** (PK ghép `crew_id, personnel_id`) — liệt kê nhân sự trong mỗi tổ.

### `attendance`

Chấm công ngày: ghi nhân sự có mặt/vắng mặt, số giờ làm việc, theo tổ hoặc cá nhân. Có thể ghi headcount gộp (personnel_id NULL, chỉ ghi số người).

| Cột          | Kiểu           | Ghi chú                           |
| ------------ | -------------- | --------------------------------- |
| id           | SERIAL PK      |                                   |
| project_id   | FK → projects  |                                   |
| work_date    | DATE NOT NULL  | Ngày chấm công                    |
| crew_id      | FK → crews     | Tổ (nullable — có thể chấm riêng) |
| personnel_id | FK → personnel | Nhân sự (NULL = chấm gộp theo tổ) |
| headcount    | INTEGER        | Số đầu khi chấm gộp               |
| present      | BOOLEAN        | Có mặt/vắng                       |
| hours        | NUMERIC(4,1)   | Số giờ làm việc                   |

### `certifications`

Chứng chỉ/giấy phép nhân sự: thẻ an toàn, chứng chỉ nghề, giấy phép vận hành máy. Mỗi chứng chỉ có loại, ngày cấp/hết hạn, 1 file scan.

| Cột                                             | Kiểu           | Ghi chú                         |
| ----------------------------------------------- | -------------- | ------------------------------- |
| id                                              | SERIAL PK      |                                 |
| project_id                                      | FK → projects  |                                 |
| personnel_id                                    | FK → personnel |                                 |
| kind                                            | TEXT           | Loại: thẻ an toàn, chứng chỉ... |
| code                                            | TEXT           | Mã chứng chỉ                    |
| issued_date / expiry_date                       | DATE           |                                 |
| file_name, original_name, mime_type, size_bytes |                | 1 file scan                     |

### `raci_matrix`

Ma trận RACI (Responsible/Accountable/Consulted/Informed) — phân công vai trò cho từng hạng mục/quy trình. Mỗi dòng ghi: phạm vi (scope), chức danh (role_label), nhân sự (personnel_id), và ký tự RACI.

| Cột          | Kiểu           | Ghi chú            |
| ------------ | -------------- | ------------------ |
| id           | SERIAL PK      |                    |
| project_id   | FK → projects  |                    |
| scope        | TEXT           | Hạng mục/quy trình |
| role_label   | TEXT           | Chức danh          |
| personnel_id | FK → personnel | Nhân sự            |
| raci         | CHAR(1) CHECK  | R / A / C / I      |

---

## Môi trường & Giấy phép (M25, `migrations/0033_environment.sql`)

### `env_permits`

Hồ sơ môi trường: đánh giá tác động môi trường (ĐTM), giấy phép môi trường, giấy phép xả thải. Mỗi loại có ngày cấp, hết hạn, trạng thái (valid/expired/superseded) và 1 file đính kèm.

| Cột                                             | Kiểu          | Ghi chú                                      |
| ----------------------------------------------- | ------------- | -------------------------------------------- |
| id                                              | SERIAL PK     |                                              |
| project_id                                      | FK → projects |                                              |
| kind                                            | TEXT CHECK    | `dtm\|giay_phep_mt\|giay_phep_xa_thai\|khac` |
| code / title                                    | TEXT          | Mã/tên giấy phép                             |
| issued_by                                       | TEXT          | Cơ quan cấp                                  |
| issued_date / expiry_date                       | DATE          |                                              |
| status                                          | TEXT CHECK    | `valid\|expired\|superseded`                 |
| file_name, original_name, mime_type, size_bytes |               | 1 file                                       |

### `env_monitoring`

Quan trắc môi trường theo kỳ: nước thải, khí thải/bụi, độ ồn, rung động. Mỗi kỳ ghi chỉ tiêu, giá trị đo, ngưỡng cho phép, và đánh giá passed/failed. Cảnh báo khi vượt ngưỡng.

| Cột         | Kiểu          | Ghi chú                             |
| ----------- | ------------- | ----------------------------------- |
| id          | SERIAL PK     |                                     |
| project_id  | FK → projects |                                     |
| measured_at | DATE NOT NULL | Ngày đo                             |
| category    | TEXT CHECK    | `nuoc_thai\|khi_bui\|on_rung\|khac` |
| indicator   | TEXT          | Chỉ tiêu (pH, TSS, độ ồn dBA...)    |
| value       | NUMERIC(12,3) | Kết quả đo                          |
| unit        | TEXT          | Đơn vị                              |
| threshold   | NUMERIC(12,3) | Ngưỡng cho phép                     |
| passed      | BOOLEAN       | value ≤ threshold                   |
| location    | TEXT          | Địa điểm lấy mẫu                    |

### `waste_logs`

Quản lý chất thải: rác thải xây dựng, chất nguy hại, nước thải. Ghi loại, khối lượng, phương pháp xử lý, đơn vị xử lý.

| Cột             | Kiểu          | Ghi chú                             |
| --------------- | ------------- | ----------------------------------- |
| id              | SERIAL PK     |                                     |
| project_id      | FK → projects |                                     |
| log_date        | DATE NOT NULL | Ngày ghi                            |
| waste_type      | TEXT CHECK    | `ran_xd\|nguy_hai\|nuoc_thai\|khac` |
| quantity        | NUMERIC(12,2) | Khối lượng                          |
| unit            | TEXT          | Đơn vị (tấn, m³...)                 |
| disposal_method | TEXT          | Phương pháp xử lý (đốt, chôn...)    |
| handler         | TEXT          | Đơn vị xử lý                        |

---

## Quan hệ & Quan trắc (M26, `migrations/0034_monitoring.sql`)

### `monitoring_points`

Mốc quan trắc kết cấu/nền: lún, chuyển vị/nghiêng, công trình lân cận. Mỗi mốc có code, vị trí, ngưỡng cảnh báo warn/alarm, đơn vị đo, trạng thái (active/stopped).

| Cột             | Kiểu          | Ghi chú                                  |
| --------------- | ------------- | ---------------------------------------- |
| id              | SERIAL PK     |                                          |
| project_id      | FK → projects |                                          |
| code            | TEXT NOT NULL | Mã mốc (UNIQUE ghép project_id)          |
| kind            | TEXT CHECK    | `lun\|chuyen_vi\|nghieng\|lan_can\|khac` |
| location        | TEXT          | Vị trí mốc                               |
| warn_threshold  | NUMERIC(12,3) | Ngưỡng cảnh báo vàng                     |
| alarm_threshold | NUMERIC(12,3) | Ngưỡng cảnh báo đỏ                       |
| unit            | TEXT          | Đơn vị (mm, cm...)                       |
| status          | TEXT CHECK    | `active\|stopped`                        |

**Bảng liên quan `monitoring_readings`** (FK → `monitoring_points` ON DELETE CASCADE) — ghi mỗi lần đo (ngày, giá trị, luỹ kế, so ngưỡng warn/alarm/normal, người ghi).

### `community_cases`

Khiếu nại/quan hệ cộng đồng: tiếp nhận → xử lý → đóng. Mỗi vụ ghi nguồn (dân cư/chính quyền/khác), tiêu đề, ngày nhận, trạng thái, giải pháp, ngày đóng.

| Cột           | Kiểu          | Ghi chú                          |
| ------------- | ------------- | -------------------------------- |
| id            | SERIAL PK     |                                  |
| project_id    | FK → projects |                                  |
| code / title  | TEXT          | Mã/tiêu đề khiếu nại             |
| source        | TEXT          | Nguồn: dân cư, chính quyền, khác |
| received_date | DATE          | Ngày tiếp nhận                   |
| status        | TEXT CHECK    | `open\|handling\|closed`         |
| resolution    | TEXT          | Giải pháp/kết quả xử lý          |
| closed_date   | DATE          | Ngày đóng (khi status=closed)    |

---

## Bảo hiểm & Bảo lãnh (M28, `migrations/0032_insurance_bonds.sql`)

### `insurance_bonds`

Sổ theo dõi bảo hiểm & bảo lãnh: bảo hiểm công trình (CAR), trách nhiệm bên thứ ba, tai nạn lao động, bảo lãnh thực hiện/tạm ứng/bảo hành. Mỗi loại gắn hợp đồng (nullable — một số cấp toàn dự án không theo 1 HĐ), có giá trị, ngày cấp/hết hạn, 1 file chính. Cảnh báo sắp hết hiệu lực qua notifications.

| Cột                                             | Kiểu           | Ghi chú                                   |
| ----------------------------------------------- | -------------- | ----------------------------------------- |
| id                                              | SERIAL PK      |                                           |
| project_id                                      | FK → projects  |                                           |
| contract_id                                     | FK → contracts | Nullable — có loại cấp toàn dự án         |
| kind                                            | TEXT CHECK     | `car\|tnbt\|tai_nan_ld\|bao_lanh_*\|khac` |
| title                                           | TEXT           | Tên giấy chứng nhận                       |
| provider                                        | TEXT           | Đơn vị bảo hiểm/ngân hàng phát hành       |
| code                                            | TEXT           | Số giấy chứng nhận                        |
| value                                           | NUMERIC(15,2)  | Giá trị bảo hiểm/bảo lãnh                 |
| issued_date / expiry_date                       | DATE           | Ngày cấp/hết hạn (NULL = không hạn)       |
| status                                          | TEXT CHECK     | `valid\|expired\|released`                |
| file_name, original_name, mime_type, size_bytes |                | 1 file chính                              |

---

## Bàn giao & Kết thúc (M29, `migrations/0035_handover.sql`)

### `commissioning`

Chạy thử & nghiệm thu hệ thống: gồm các hệ (ACMV, điện, PCCC...) với checklist bước T&C, trạng thái (draft/testing/passed/failed), ngày test, ghi chú.

| Cột                | Kiểu             | Ghi chú                              |
| ------------------ | ---------------- | ------------------------------------ |
| id                 | SERIAL PK        |                                      |
| project_id         | FK → projects    |                                      |
| code / system_name | TEXT             | Mã/tên hệ                            |
| discipline_id      | FK → disciplines | Chuyên ngành (ACMV, điện...)         |
| checklist          | JSONB            | Các bước T&C (pattern qc_checklists) |
| result             | TEXT CHECK       | `draft\|testing\|passed\|failed`     |
| tested_at          | DATE             | Ngày chạy thử                        |

### `handover_items`

Hạng mục bàn giao CĐT: gồm tiêu đề, chuyên ngành, gắn nhóm công việc (nếu có), trạng thái (pending/handed_over/accepted), ngày bàn giao, biên bản (1 file).

| Cột             | Kiểu               | Ghi chú                          |
| --------------- | ------------------ | -------------------------------- |
| id              | SERIAL PK          |                                  |
| project_id      | FK → projects      |                                  |
| title           | TEXT               | Tiêu đề hạng mục                 |
| discipline_id   | FK → disciplines   | Chuyên ngành                     |
| work_package_id | FK → work_packages | Gắn nhóm công việc (nullable)    |
| status          | TEXT CHECK         | `pending\|handed_over\|accepted` |
| handover_date   | DATE               | Ngày bàn giao                    |
| minutes_file    | TEXT               | Tên file biên bản (1 file gọn)   |

### `punch_list`

Tồn tại khi bàn giao: danh sách công việc còn dang dở trước khi đóng (độ ưu tiên low/medium/high, người giao, hạn hoàn thành). Trạng thái open/fixing/closed.

| Cột              | Kiểu                | Ghi chú                 |
| ---------------- | ------------------- | ----------------------- |
| id               | SERIAL PK           |                         |
| project_id       | FK → projects       |                         |
| handover_item_id | FK → handover_items | Gắn hạng mục bàn giao   |
| description      | TEXT                | Mô tả công việc dang dở |
| severity         | TEXT CHECK          | `low\|medium\|high`     |
| status           | TEXT CHECK          | `open\|fixing\|closed`  |
| due_date         | DATE                | Hạn hoàn thành          |
| assignee         | FK → users          | Người giao việc         |

### `demob_items`

Giải thể công trường: các mục giải thể (lán trại, mặt bằng, vật tư dư...) với trạng thái (pending/done), ghi chú.

| Cột        | Kiểu          | Ghi chú                           |
| ---------- | ------------- | --------------------------------- |
| id         | SERIAL PK     |                                   |
| project_id | FK → projects |                                   |
| title      | TEXT          | Mục giải thể                      |
| category   | TEXT          | Phân loại (lán trại, mặt bằng...) |
| status     | TEXT CHECK    | `pending\|done`                   |

### `lessons_learned`

Bài học kinh nghiệm từ dự án: ghi tiêu đề, danh mục (kỹ thuật, quản lý, an toàn...), nội dung chi tiết, tác giả & ngày.

| Cột        | Kiểu          | Ghi chú                    |
| ---------- | ------------- | -------------------------- |
| id         | SERIAL PK     |                            |
| project_id | FK → projects |                            |
| title      | TEXT          | Tiêu đề bài học            |
| category   | TEXT          | Danh mục (kỹ thuật, QL...) |
| content    | TEXT          | Nội dung chi tiết          |

---

## Chuyển đổi số & Công nghệ (M31, `migrations/0036_tech.sql`)

### `tech_links`

Link công cụ ngoài: P6/MS Project (lịch trình), BIM viewer (mô hình), camera/drone (giám sát). Mỗi link ghi category, tiêu đề, URL, có thể nhúng iframe hay mở ngoài.

| Cột        | Kiểu          | Ghi chú                               |
| ---------- | ------------- | ------------------------------------- |
| id         | SERIAL PK     |                                       |
| project_id | FK → projects |                                       |
| category   | TEXT CHECK    | `bim\|schedule\|camera\|drone\|other` |
| title      | TEXT          | Tên công cụ                           |
| url        | TEXT          | Địa chỉ truy cập                      |
| embed      | BOOLEAN       | true = nhúng iframe; false = link ra  |

### `progress_albums`

Album ảnh mốc tiến độ (thường từ drone): ghi milestone/mốc quan trọng, ngày chụp, ghi chú, người quản lý. Ảnh trong `task_photos` với `album_id` = NULL khi không gắn album.

| Cột             | Kiểu          | Ghi chú                |
| --------------- | ------------- | ---------------------- |
| id              | SERIAL PK     |                        |
| project_id      | FK → projects |                        |
| milestone_label | TEXT          | Tên mốc (vd "Tầng 10") |
| captured_date   | DATE          | Ngày chụp              |
| note            | TEXT          | Ghi chú về album       |

**Lưu ý:** `task_photos` thêm cột `album_id` (FK → `progress_albums`) — cho phép ảnh gắn với album thay vì task cụ thể.

---

## Audit & Phân công

### `assignment_log`

Ghi mỗi lần gán người vào sheet/nhóm/task: ai gán, từ ai sang ai, thủ công hay kế thừa.

---

## Indexes quan trọng

| Index               | Cột                                    |
| ------------------- | -------------------------------------- |
| idx_tasks_end       | tasks(end_date)                        |
| idx_tasks_package   | tasks(package_id)                      |
| idx_tasks_assigned  | tasks(assigned_to)                     |
| idx_dims_task       | progress_dimensions(task_id)           |
| idx_history_task    | task_history(task_id)                  |
| idx_notif_user      | notifications(user_id, is_read)        |
| idx_materials_sheet | materials(sheet_type_id)               |
| idx_photos_task     | task_photos(task_id)                   |
| idx_comments_task   | task_comments(task_id)                 |
| uniq_sheet_slug     | sheet_types(slug)                      |
| uniq_tasks_boq      | tasks(boq_code) WHERE NOT NULL         |
| uniq_wp_boq         | work_packages(boq_code) WHERE NOT NULL |
| uniq_materials_boq  | materials(boq_code) WHERE NOT NULL     |
