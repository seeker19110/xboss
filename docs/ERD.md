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

| Cột                   | Kiểu        | Ghi chú                         |
| --------------------- | ----------- | ------------------------------- |
| id                    | SERIAL PK   |                                 |
| name                  | TEXT        | Tên dự án                       |
| code                  | TEXT UNIQUE | Mã dự án                        |
| investor              | TEXT        | Chủ đầu tư                      |
| contractor            | TEXT        | Nhà thầu                        |
| start_date / end_date | DATE        |                                 |
| heatmap_title         | TEXT        | Tiêu đề heatmap tuỳ chỉnh       |
| material_col_labels   | TEXT        | JSON — nhãn cột tùy biến vật tư |

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

## Bản vẽ (M8, `migrations/0014_drawings.sql`)

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
