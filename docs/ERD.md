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
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | SERIAL PK | |
| name | TEXT | |
| email | TEXT UNIQUE | |
| password_hash | TEXT | bcrypt |
| role | TEXT | `admin \| pm \| engineer \| subcon` |
| created_at | TIMESTAMPTZ | |

### `projects`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | SERIAL PK | |
| name | TEXT | Tên dự án |
| code | TEXT UNIQUE | Mã dự án |
| investor | TEXT | Chủ đầu tư |
| contractor | TEXT | Nhà thầu |
| start_date / end_date | DATE | |
| heatmap_title | TEXT | Tiêu đề heatmap tuỳ chỉnh |
| material_col_labels | TEXT | JSON — nhãn cột tùy biến vật tư |

### `towers`
| Cột | Kiểu |
|---|---|
| id | SERIAL PK |
| project_id | FK → projects |
| name | TEXT |
| description | TEXT |

### `sheet_types`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | SERIAL PK | |
| tower_id | FK → towers | |
| code | TEXT | `OGTĐ`, `OGHL`, `OGCH`, `ODNN Zone 1`, `ODNN Zone 2` |
| name | TEXT | Tên hiển thị |
| slug | TEXT UNIQUE | Slug URL: `ogtd`, `oghl`... |
| responsible | TEXT | Người phụ trách |
| manager_id | FK → users | Quản lý hệ (phân công tự động xuống) |

### `work_packages`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | SERIAL PK | |
| sheet_type_id | FK → sheet_types | |
| boq_code | TEXT UNIQUE (partial) | Mã BOQ toàn hệ thống |
| code | TEXT | `A1`, `H1`, `OGCH1` |
| seq_no | TEXT | |
| floor_label | TEXT | `1F`, `2F`... |
| name | TEXT | |
| drawing_url | TEXT | |
| start_date / end_date | DATE | |
| duration_days | INTEGER | |
| status | TEXT | enum slug |
| progress | DOUBLE | Trung bình tasks |
| sort_order | INTEGER | Thứ tự hiển thị |
| assigned_to | FK → users | |
| assigned_manual | BOOLEAN | Gán thủ công (không kế thừa từ sheet) |

### `tasks`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | SERIAL PK | |
| package_id | FK → work_packages | |
| boq_code | TEXT UNIQUE (partial) | |
| code | TEXT | `A1,01` |
| seq_no | TEXT | |
| name | TEXT | |
| note | TEXT | |
| drawing_url | TEXT | |
| status | TEXT | `chuan_bi \| dang_thi_cong \| hoan_thanh \| tre \| nghiem_thu` |
| start_date / end_date | DATE | |
| duration_days | INTEGER | |
| progress_percent | DOUBLE | 0..1, tính từ dimensions |
| assigned_to | FK → users | |
| assigned_manual | BOOLEAN | |
| delay_reason | TEXT | 1 trong 6 lý do chuẩn |
| delay_note | TEXT | Ghi chú bổ sung |
| sort_order | INTEGER | |
| updated_at | TIMESTAMPTZ | |

### `progress_dimensions`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | SERIAL PK | |
| task_id | FK → tasks | |
| dimension_label | TEXT | `1300x700 X3-X4` hoặc `CH 01` |
| installed | INTEGER | Số đã lắp (dùng cho OGTĐ) |
| value | DOUBLE | % riêng nếu có |
| sort_order | INTEGER | |
| updated_at | TIMESTAMPTZ | |

### `task_history`
| Cột | Kiểu |
|---|---|
| id | SERIAL PK |
| task_id | FK → tasks |
| old_progress / new_progress | DOUBLE |
| status | TEXT |
| note | TEXT |
| changed_by | TEXT |
| changed_at | TIMESTAMPTZ |

### `task_photos`
| Cột | Kiểu |
|---|---|
| id | SERIAL PK |
| task_id | FK → tasks |
| file_name | TEXT |
| original_name / mime_type / size_bytes | |
| caption | TEXT |
| uploaded_by | FK → users |
| created_at | TIMESTAMPTZ |

### `task_comments`
| Cột | Kiểu |
|---|---|
| id | SERIAL PK |
| task_id | FK → tasks |
| user_id | FK → users |
| body | TEXT |
| created_at | TIMESTAMPTZ |

### `task_documents`
Biên bản nghiệm thu — cùng cấu trúc `task_photos`, lưu chung `data/uploads/`.

### `notifications`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | SERIAL PK | |
| user_id | FK → users | |
| task_id | FK → tasks | NULL nếu type=material_over |
| material_id | FK → materials | NULL nếu không liên quan vật tư |
| type | TEXT | `delayed \| due_soon \| comment \| material_over` |
| message | TEXT | |
| is_read | INTEGER | 0/1 |
| created_at | TIMESTAMPTZ | |

UNIQUE: `(user_id, task_id, type)` + partial index `(user_id, material_id, type) WHERE material_id IS NOT NULL`.

### `push_subscriptions`
| Cột | Kiểu |
|---|---|
| id | SERIAL PK |
| user_id | FK → users |
| endpoint | TEXT UNIQUE |
| p256dh / auth | TEXT |
| created_at | TIMESTAMPTZ |

---

## Vật tư & Đặt hàng

### `materials`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | SERIAL PK | |
| sheet_type_id | FK → sheet_types | |
| task_id | FK → tasks | nullable |
| boq_code | TEXT UNIQUE (partial) | |
| name | TEXT | |
| unit | TEXT | |
| qty_boq | DOUBLE | Định mức BOQ |
| qty_planned | DOUBLE | Kế hoạch |
| qty_used | DOUBLE | Đã dùng |
| qty_stock | DOUBLE | Tồn kho thực |
| min_stock_level | DOUBLE | Ngưỡng cảnh báo tồn kho |
| status | TEXT | `dat_hang \| da_giao \| dang_dung` |
| note | TEXT | |
| sort_order | INTEGER | |

### `material_transactions`
Ghi delta ±qty mỗi lần thay đổi `qty_used`.
| Cột | Kiểu |
|---|---|
| delta | DOUBLE |
| qty_after | DOUBLE |
| type | TEXT | `dieu_chinh \| xuat \| nhap_kho` |
| task_id | FK → tasks |
| receipt_item_id | FK → receipt_items |
| created_by | FK → users |

### `suppliers`
Nhà cung cấp, kèm thông tin 3 bên cho đơn đặt hàng (buyer/seller/receiver) và thông tin giao hàng.

### `purchase_requests` → `purchase_orders` → `po_items` → `warehouse_receipts` → `receipt_items`
Chuỗi PR → PO → nhập kho đầy đủ.

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

| Index | Cột |
|---|---|
| idx_tasks_end | tasks(end_date) |
| idx_tasks_package | tasks(package_id) |
| idx_tasks_assigned | tasks(assigned_to) |
| idx_dims_task | progress_dimensions(task_id) |
| idx_history_task | task_history(task_id) |
| idx_notif_user | notifications(user_id, is_read) |
| idx_materials_sheet | materials(sheet_type_id) |
| idx_photos_task | task_photos(task_id) |
| idx_comments_task | task_comments(task_id) |
| uniq_sheet_slug | sheet_types(slug) |
| uniq_tasks_boq | tasks(boq_code) WHERE NOT NULL |
| uniq_wp_boq | work_packages(boq_code) WHERE NOT NULL |
| uniq_materials_boq | materials(boq_code) WHERE NOT NULL |
