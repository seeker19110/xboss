# XBoss — Database ERD

> **SINH TỰ ĐỘNG** từ schema Postgres (`information_schema` + `pg_indexes`) —
> **KHÔNG sửa tay**. Chạy `npm run gen:erd` để cập nhật (CI kiểm bằng `git diff`).

## WBS & tiến độ

### projects

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('projects_id_seq'::regclass)` |
| name | text |  |  |
| code | text | ✓ |  |
| investor | text | ✓ |  |
| contractor | text | ✓ |  |
| start_date | date | ✓ |  |
| end_date | date | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| heatmap_title | text | ✓ |  |
| material_col_labels | text | ✓ |  |
| ui_texts | text | ✓ |  |
| logo | text | ✓ |  |
| status | text |  | `'active'::text` |
| color | text | ✓ |  |
| org_id | integer | ✓ |  |

**Khóa ngoại:**
- `org_id` → `organizations(id)`

**Index:**
- `projects_code_key`: UNIQUE INDEX projects_code_key ON public.projects USING btree (code)
- `projects_pkey`: UNIQUE INDEX projects_pkey ON public.projects USING btree (id)

### towers

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('towers_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| name | text |  |  |
| description | text | ✓ |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `towers_pkey`: UNIQUE INDEX towers_pkey ON public.towers USING btree (id)

### sheet_types

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('sheet_types_id_seq'::regclass)` |
| tower_id | integer | ✓ |  |
| code | text |  |  |
| name | text |  |  |
| responsible | text | ✓ |  |
| slug | text | ✓ |  |
| manager_id | integer | ✓ |  |
| sort_order | integer |  | `0` |
| system_id | integer | ✓ |  |

**Khóa ngoại:**
- `manager_id` → `users(id)`
- `system_id` → `systems(id)`
- `tower_id` → `towers(id)`

**Index:**
- `sheet_types_pkey`: UNIQUE INDEX sheet_types_pkey ON public.sheet_types USING btree (id)
- `sheet_types_tower_id_code_key`: UNIQUE INDEX sheet_types_tower_id_code_key ON public.sheet_types USING btree (tower_id, code)
- `uniq_sheet_slug`: UNIQUE INDEX uniq_sheet_slug ON public.sheet_types USING btree (slug)

### work_packages

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('work_packages_id_seq'::regclass)` |
| boq_code | text | ✓ |  |
| sheet_type_id | integer | ✓ |  |
| code | text |  |  |
| seq_no | text | ✓ |  |
| floor_label | text | ✓ |  |
| name | text |  |  |
| drawing_url | text | ✓ |  |
| start_date | date | ✓ |  |
| end_date | date | ✓ |  |
| duration_days | integer | ✓ |  |
| status | text | ✓ | `'chuan_bi'::text` |
| progress | float8 | ✓ | `0` |
| sort_order | integer | ✓ | `0` |
| created_at | timestamptz | ✓ | `now()` |
| drawing_file_name | text | ✓ |  |
| drawing_original_name | text | ✓ |  |
| bbnt_url | text | ✓ |  |
| bbnt_file_name | text | ✓ |  |
| bbnt_original_name | text | ✓ |  |
| assigned_to | integer | ✓ |  |
| assigned_manual | boolean |  | `false` |
| requires_method_statement | boolean |  | `false` |
| custom | jsonb |  | `'{}'::jsonb` |

**Khóa ngoại:**
- `assigned_to` → `users(id)`
- `sheet_type_id` → `sheet_types(id)`

**Index:**
- `idx_wp_boq_lower`: INDEX idx_wp_boq_lower ON public.work_packages USING btree (lower(boq_code)) WHERE (boq_code IS NOT NULL)
- `idx_wp_code_lower`: INDEX idx_wp_code_lower ON public.work_packages USING btree (lower(code))
- `idx_wp_fts`: INDEX idx_wp_fts ON public.work_packages USING gin (to_tsvector('simple'::regconfig, COALESCE(name, ''::text)))
- `idx_wp_fts_ua`: INDEX idx_wp_fts_ua ON public.work_packages USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((((COALESCE(code, ''::text) || ' '::text) || COALESCE(boq_code, ''::text)) || ' '::text) || COALESCE(name, ''::text)))))
- `idx_wp_sheet`: INDEX idx_wp_sheet ON public.work_packages USING btree (sheet_type_id)
- `uniq_wp_boq`: UNIQUE INDEX uniq_wp_boq ON public.work_packages USING btree (boq_code) WHERE (boq_code IS NOT NULL)
- `uniq_wp_sheet_code`: UNIQUE INDEX uniq_wp_sheet_code ON public.work_packages USING btree (sheet_type_id, lower(code))
- `work_packages_pkey`: UNIQUE INDEX work_packages_pkey ON public.work_packages USING btree (id)
- `work_packages_sheet_type_id_code_key`: UNIQUE INDEX work_packages_sheet_type_id_code_key ON public.work_packages USING btree (sheet_type_id, code)

### tasks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('tasks_id_seq'::regclass)` |
| boq_code | text | ✓ |  |
| package_id | integer | ✓ |  |
| code | text |  |  |
| seq_no | text | ✓ |  |
| name | text |  |  |
| note | text | ✓ |  |
| drawing_url | text | ✓ |  |
| status | text | ✓ | `'chuan_bi'::text` |
| start_date | date | ✓ |  |
| end_date | date | ✓ |  |
| duration_days | integer | ✓ |  |
| progress_percent | float8 | ✓ | `0` |
| assigned_to | integer | ✓ |  |
| sort_order | integer | ✓ | `0` |
| updated_at | timestamptz | ✓ | `now()` |
| delay_reason | text | ✓ |  |
| delay_note | text | ✓ |  |
| assigned_manual | boolean |  | `false` |
| custom | jsonb |  | `'{}'::jsonb` |

**Khóa ngoại:**
- `assigned_to` → `users(id)`
- `package_id` → `work_packages(id)`

**Index:**
- `idx_tasks_assigned`: INDEX idx_tasks_assigned ON public.tasks USING btree (assigned_to)
- `idx_tasks_boq_lower`: INDEX idx_tasks_boq_lower ON public.tasks USING btree (lower(boq_code)) WHERE (boq_code IS NOT NULL)
- `idx_tasks_code_lower`: INDEX idx_tasks_code_lower ON public.tasks USING btree (lower(code))
- `idx_tasks_end`: INDEX idx_tasks_end ON public.tasks USING btree (end_date)
- `idx_tasks_fts`: INDEX idx_tasks_fts ON public.tasks USING gin (to_tsvector('simple'::regconfig, COALESCE(name, ''::text)))
- `idx_tasks_fts_ua`: INDEX idx_tasks_fts_ua ON public.tasks USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((((COALESCE(code, ''::text) || ' '::text) || COALESCE(boq_code, ''::text)) || ' '::text) || COALESCE(name, ''::text)))))
- `idx_tasks_package`: INDEX idx_tasks_package ON public.tasks USING btree (package_id)
- `idx_tasks_start`: INDEX idx_tasks_start ON public.tasks USING btree (start_date)
- `idx_tasks_updated_at`: INDEX idx_tasks_updated_at ON public.tasks USING btree (updated_at DESC)
- `tasks_package_id_code_key`: UNIQUE INDEX tasks_package_id_code_key ON public.tasks USING btree (package_id, code)
- `tasks_pkey`: UNIQUE INDEX tasks_pkey ON public.tasks USING btree (id)
- `uniq_tasks_boq`: UNIQUE INDEX uniq_tasks_boq ON public.tasks USING btree (boq_code) WHERE (boq_code IS NOT NULL)

### progress_dimensions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('progress_dimensions_id_seq'::regclass)` |
| task_id | integer | ✓ |  |
| dimension_label | text |  |  |
| installed | integer | ✓ | `0` |
| value | float8 | ✓ |  |
| sort_order | integer | ✓ | `0` |
| updated_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `task_id` → `tasks(id)`

**Index:**
- `idx_dims_task`: INDEX idx_dims_task ON public.progress_dimensions USING btree (task_id)
- `progress_dimensions_pkey`: UNIQUE INDEX progress_dimensions_pkey ON public.progress_dimensions USING btree (id)
- `uq_progress_dimensions_task_label`: UNIQUE INDEX uq_progress_dimensions_task_label ON public.progress_dimensions USING btree (task_id, dimension_label)

### task_history

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('task_history_id_seq'::regclass)` |
| task_id | integer | ✓ |  |
| old_progress | float8 | ✓ |  |
| new_progress | float8 | ✓ |  |
| status | text | ✓ |  |
| note | text | ✓ |  |
| changed_by | text | ✓ |  |
| changed_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `task_id` → `tasks(id)`

**Index:**
- `idx_history_changed_at`: INDEX idx_history_changed_at ON public.task_history USING btree (changed_at DESC)
- `idx_history_task`: INDEX idx_history_task ON public.task_history USING btree (task_id)
- `idx_task_history_task_changed`: INDEX idx_task_history_task_changed ON public.task_history USING btree (task_id, changed_at DESC)
- `task_history_pkey`: UNIQUE INDEX task_history_pkey ON public.task_history USING btree (id)

### baselines

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('baselines_id_seq'::regclass)` |
| name | text |  |  |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`

**Index:**
- `baselines_pkey`: UNIQUE INDEX baselines_pkey ON public.baselines USING btree (id)

### baseline_tasks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('baseline_tasks_id_seq'::regclass)` |
| baseline_id | integer | ✓ |  |
| task_id | integer | ✓ |  |
| start_date | date | ✓ |  |
| end_date | date | ✓ |  |
| progress_percent | float8 | ✓ | `0` |

**Khóa ngoại:**
- `baseline_id` → `baselines(id)`
- `task_id` → `tasks(id)`

**Index:**
- `baseline_tasks_baseline_id_task_id_key`: UNIQUE INDEX baseline_tasks_baseline_id_task_id_key ON public.baseline_tasks USING btree (baseline_id, task_id)
- `baseline_tasks_pkey`: UNIQUE INDEX baseline_tasks_pkey ON public.baseline_tasks USING btree (id)
- `idx_baseline_tasks`: INDEX idx_baseline_tasks ON public.baseline_tasks USING btree (baseline_id)

### package_dependencies

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('package_dependencies_id_seq'::regclass)` |
| predecessor_id | integer |  |  |
| successor_id | integer |  |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| requires_handover | boolean |  | `false` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `predecessor_id` → `work_packages(id)`
- `successor_id` → `work_packages(id)`

**Index:**
- `idx_package_dep_handover`: INDEX idx_package_dep_handover ON public.package_dependencies USING btree (successor_id) WHERE requires_handover
- `idx_pkg_dep_pred`: INDEX idx_pkg_dep_pred ON public.package_dependencies USING btree (predecessor_id)
- `idx_pkg_dep_succ`: INDEX idx_pkg_dep_succ ON public.package_dependencies USING btree (successor_id)
- `package_dependencies_pkey`: UNIQUE INDEX package_dependencies_pkey ON public.package_dependencies USING btree (id)
- `package_dependencies_predecessor_id_successor_id_key`: UNIQUE INDEX package_dependencies_predecessor_id_successor_id_key ON public.package_dependencies USING btree (predecessor_id, successor_id)

### construction_stages

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('construction_stages_id_seq'::regclass)` |
| name | text |  |  |
| sort_order | integer |  | `0` |
| active | boolean |  | `true` |
| created_at | timestamptz | ✓ | `now()` |
| duration_days | integer |  | `1` |

**Index:**
- `construction_stages_pkey`: UNIQUE INDEX construction_stages_pkey ON public.construction_stages USING btree (id)

## Người dùng & phân quyền

### users

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('users_id_seq'::regclass)` |
| name | text |  |  |
| email | text |  |  |
| password_hash | text |  |  |
| role | text |  | `'engineer'::text` |
| created_at | timestamptz | ✓ | `now()` |
| supplier_id | integer | ✓ |  |
| totp_secret | text | ✓ |  |
| totp_enabled_at | timestamptz | ✓ |  |
| totp_last_step | bigint | ✓ |  |

**Khóa ngoại:**
- `supplier_id` → `suppliers(id)`

**Index:**
- `users_email_key`: UNIQUE INDEX users_email_key ON public.users USING btree (email)
- `users_pkey`: UNIQUE INDEX users_pkey ON public.users USING btree (id)

### user_projects

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| user_id | integer |  |  |
| project_id | integer |  |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `user_id` → `users(id)`

**Index:**
- `user_projects_pkey`: UNIQUE INDEX user_projects_pkey ON public.user_projects USING btree (user_id, project_id)

### login_rate_limits

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| key | text |  |  |
| count | integer |  | `0` |
| reset_at | timestamptz |  |  |

**Index:**
- `login_rate_limits_pkey`: UNIQUE INDEX login_rate_limits_pkey ON public.login_rate_limits USING btree (key)

### nav_settings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('nav_settings_id_seq'::regclass)` |
| node_key | text |  |  |
| project_id | integer | ✓ |  |
| enabled | boolean |  | `true` |
| updated_by | integer | ✓ |  |
| updated_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `updated_by` → `users(id)`

**Index:**
- `nav_settings_pkey`: UNIQUE INDEX nav_settings_pkey ON public.nav_settings USING btree (id)
- `uq_nav_settings_global`: UNIQUE INDEX uq_nav_settings_global ON public.nav_settings USING btree (node_key) WHERE (project_id IS NULL)
- `uq_nav_settings_project`: UNIQUE INDEX uq_nav_settings_project ON public.nav_settings USING btree (node_key, project_id) WHERE (project_id IS NOT NULL)

### role_permissions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | bigint |  | `nextval('role_permissions_id_seq'::regclass)` |
| role | text |  |  |
| perm_key | text |  |  |
| allowed | boolean |  |  |
| updated_by | integer | ✓ |  |
| updated_at | timestamptz |  | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `role_permissions_pkey`: UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (id)
- `uq_role_perm_scope`: UNIQUE INDEX uq_role_perm_scope ON public.role_permissions USING btree (role, perm_key, COALESCE(project_id, 0))

## Kèm task (ảnh/bình luận/tài liệu/nghiệm thu)

### task_photos

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('task_photos_id_seq'::regclass)` |
| task_id | integer | ✓ |  |
| file_name | text |  |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| caption | text | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| ncr_id | integer | ✓ |  |
| album_id | integer | ✓ |  |

**Khóa ngoại:**
- `album_id` → `progress_albums(id)`
- `ncr_id` → `ncrs(id)`
- `task_id` → `tasks(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `idx_photos_album`: INDEX idx_photos_album ON public.task_photos USING btree (album_id)
- `idx_photos_task`: INDEX idx_photos_task ON public.task_photos USING btree (task_id)
- `task_photos_pkey`: UNIQUE INDEX task_photos_pkey ON public.task_photos USING btree (id)

### task_comments

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('task_comments_id_seq'::regclass)` |
| task_id | integer | ✓ |  |
| user_id | integer | ✓ |  |
| body | text |  |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `task_id` → `tasks(id)`
- `user_id` → `users(id)`

**Index:**
- `idx_comments_task`: INDEX idx_comments_task ON public.task_comments USING btree (task_id)
- `idx_task_comments_fts`: INDEX idx_task_comments_fts ON public.task_comments USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(COALESCE(body, ''::text))))
- `task_comments_pkey`: UNIQUE INDEX task_comments_pkey ON public.task_comments USING btree (id)

### task_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('task_documents_id_seq'::regclass)` |
| task_id | integer | ✓ |  |
| file_name | text |  |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| caption | text | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| floor_approval_id | integer | ✓ |  |
| link_url | text | ✓ |  |
| doc_category | text | ✓ |  |
| sha256 | text | ✓ |  |

**Khóa ngoại:**
- `floor_approval_id` → `floor_approvals(id)`
- `task_id` → `tasks(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `idx_documents_floor`: INDEX idx_documents_floor ON public.task_documents USING btree (floor_approval_id)
- `idx_documents_task`: INDEX idx_documents_task ON public.task_documents USING btree (task_id)
- `task_documents_pkey`: UNIQUE INDEX task_documents_pkey ON public.task_documents USING btree (id)

### progress_albums

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('progress_albums_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| milestone_label | text |  |  |
| captured_date | date | ✓ |  |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `progress_albums_pkey`: UNIQUE INDEX progress_albums_pkey ON public.progress_albums USING btree (id)

### notifications

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('notifications_id_seq'::regclass)` |
| user_id | integer | ✓ |  |
| task_id | integer | ✓ |  |
| type | text |  | `'delayed'::text` |
| message | text |  |  |
| is_read | integer | ✓ | `0` |
| created_at | timestamptz | ✓ | `now()` |
| material_id | integer | ✓ |  |
| cost_group | text | ✓ |  |
| ncr_id | integer | ✓ |  |
| po_id | integer | ✓ |  |
| vehicle_id | integer | ✓ |  |
| diary_date | date | ✓ |  |
| contract_id | integer | ✓ |  |
| vo_id | integer | ✓ |  |
| payment_cert_id | integer | ✓ |  |
| drawing_revision_id | integer | ✓ |  |
| correspondence_id | integer | ✓ |  |
| work_front_id | integer | ✓ |  |
| equipment_id | integer | ✓ |  |
| boq_norm_id | integer | ✓ |  |
| hse_record_id | integer | ✓ |  |
| meeting_action_id | integer | ✓ |  |
| proposal_id | integer | ✓ |  |
| nav_node_key | text | ✓ |  |
| legal_document_id | integer | ✓ |  |
| certification_id | integer | ✓ |  |
| insurance_bond_id | integer | ✓ |  |
| env_permit_id | integer | ✓ |  |
| env_monitoring_id | integer | ✓ |  |
| monitoring_point_id | integer | ✓ |  |
| punch_item_id | integer | ✓ |  |
| warranty_item_id | integer | ✓ |  |
| warranty_claim_id | integer | ✓ |  |
| advance_id | integer | ✓ |  |
| design_change_id | integer | ✓ |  |
| claim_id | integer | ✓ |  |
| floor_stage_front_id | integer | ✓ |  |

**Khóa ngoại:**
- `advance_id` → `advances(id)`
- `boq_norm_id` → `boq_norms(id)`
- `certification_id` → `certifications(id)`
- `claim_id` → `claims(id)`
- `contract_id` → `contracts(id)`
- `correspondence_id` → `correspondences(id)`
- `design_change_id` → `design_changes(id)`
- `drawing_revision_id` → `drawing_revisions(id)`
- `env_monitoring_id` → `env_monitoring(id)`
- `env_permit_id` → `env_permits(id)`
- `equipment_id` → `equipment(id)`
- `floor_stage_front_id` → `floor_stage_fronts(id)`
- `hse_record_id` → `hse_records(id)`
- `insurance_bond_id` → `insurance_bonds(id)`
- `legal_document_id` → `legal_documents(id)`
- `material_id` → `materials(id)`
- `meeting_action_id` → `meeting_actions(id)`
- `monitoring_point_id` → `monitoring_points(id)`
- `ncr_id` → `ncrs(id)`
- `payment_cert_id` → `payment_certs(id)`
- `po_id` → `purchase_orders(id)`
- `proposal_id` → `proposals(id)`
- `punch_item_id` → `punch_list(id)`
- `task_id` → `tasks(id)`
- `user_id` → `users(id)`
- `vehicle_id` → `vehicle_logs(id)`
- `vo_id` → `variation_orders(id)`
- `warranty_claim_id` → `warranty_claims(id)`
- `warranty_item_id` → `warranty_items(id)`
- `work_front_id` → `work_fronts(id)`

**Index:**
- `idx_notif_user`: INDEX idx_notif_user ON public.notifications USING btree (user_id, is_read)
- `notifications_pkey`: UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)
- `notifications_user_id_task_id_type_key`: UNIQUE INDEX notifications_user_id_task_id_type_key ON public.notifications USING btree (user_id, task_id, type)
- `uniq_notif_correspondence`: UNIQUE INDEX uniq_notif_correspondence ON public.notifications USING btree (user_id, correspondence_id, type) WHERE (correspondence_id IS NOT NULL)
- `uniq_notif_drawing_rev`: UNIQUE INDEX uniq_notif_drawing_rev ON public.notifications USING btree (user_id, drawing_revision_id, type) WHERE (drawing_revision_id IS NOT NULL)
- `uniq_notif_equipment`: UNIQUE INDEX uniq_notif_equipment ON public.notifications USING btree (user_id, equipment_id, type) WHERE (equipment_id IS NOT NULL)
- `uniq_notif_floor_stage_front`: UNIQUE INDEX uniq_notif_floor_stage_front ON public.notifications USING btree (user_id, floor_stage_front_id, type) WHERE (floor_stage_front_id IS NOT NULL)
- `uniq_notif_hse`: UNIQUE INDEX uniq_notif_hse ON public.notifications USING btree (user_id, hse_record_id, type) WHERE (hse_record_id IS NOT NULL)
- `uniq_notif_material`: UNIQUE INDEX uniq_notif_material ON public.notifications USING btree (user_id, material_id, type) WHERE (material_id IS NOT NULL)
- `uniq_notif_meeting_action`: UNIQUE INDEX uniq_notif_meeting_action ON public.notifications USING btree (user_id, meeting_action_id, type) WHERE (meeting_action_id IS NOT NULL)
- `uniq_notif_work_front`: UNIQUE INDEX uniq_notif_work_front ON public.notifications USING btree (user_id, work_front_id, type) WHERE (work_front_id IS NOT NULL)
- `uq_notif_advance`: UNIQUE INDEX uq_notif_advance ON public.notifications USING btree (user_id, type, advance_id) WHERE (advance_id IS NOT NULL)
- `uq_notif_cert`: UNIQUE INDEX uq_notif_cert ON public.notifications USING btree (user_id, type, payment_cert_id) WHERE (payment_cert_id IS NOT NULL)
- `uq_notif_certification`: UNIQUE INDEX uq_notif_certification ON public.notifications USING btree (user_id, type, certification_id) WHERE (certification_id IS NOT NULL)
- `uq_notif_claim`: UNIQUE INDEX uq_notif_claim ON public.notifications USING btree (user_id, type, claim_id) WHERE (claim_id IS NOT NULL)
- `uq_notif_contract`: UNIQUE INDEX uq_notif_contract ON public.notifications USING btree (user_id, type, contract_id) WHERE (contract_id IS NOT NULL)
- `uq_notif_cost`: UNIQUE INDEX uq_notif_cost ON public.notifications USING btree (user_id, type, cost_group) WHERE (cost_group IS NOT NULL)
- `uq_notif_design_change`: UNIQUE INDEX uq_notif_design_change ON public.notifications USING btree (user_id, type, design_change_id) WHERE (design_change_id IS NOT NULL)
- `uq_notif_diary`: UNIQUE INDEX uq_notif_diary ON public.notifications USING btree (user_id, diary_date, type) WHERE (diary_date IS NOT NULL)
- `uq_notif_env_mon`: UNIQUE INDEX uq_notif_env_mon ON public.notifications USING btree (user_id, type, env_monitoring_id) WHERE (env_monitoring_id IS NOT NULL)
- `uq_notif_env_permit`: UNIQUE INDEX uq_notif_env_permit ON public.notifications USING btree (user_id, type, env_permit_id) WHERE (env_permit_id IS NOT NULL)
- `uq_notif_insurance_bond`: UNIQUE INDEX uq_notif_insurance_bond ON public.notifications USING btree (user_id, type, insurance_bond_id) WHERE (insurance_bond_id IS NOT NULL)
- `uq_notif_legal`: UNIQUE INDEX uq_notif_legal ON public.notifications USING btree (user_id, type, legal_document_id) WHERE (legal_document_id IS NOT NULL)
- `uq_notif_mon_point`: UNIQUE INDEX uq_notif_mon_point ON public.notifications USING btree (user_id, type, monitoring_point_id) WHERE (monitoring_point_id IS NOT NULL)
- `uq_notif_nav`: UNIQUE INDEX uq_notif_nav ON public.notifications USING btree (user_id, type, nav_node_key) WHERE (nav_node_key IS NOT NULL)
- `uq_notif_ncr`: UNIQUE INDEX uq_notif_ncr ON public.notifications USING btree (user_id, ncr_id, type) WHERE (ncr_id IS NOT NULL)
- `uq_notif_norm`: UNIQUE INDEX uq_notif_norm ON public.notifications USING btree (user_id, type, boq_norm_id) WHERE (boq_norm_id IS NOT NULL)
- `uq_notif_po`: UNIQUE INDEX uq_notif_po ON public.notifications USING btree (user_id, po_id, type) WHERE (po_id IS NOT NULL)
- `uq_notif_proposal`: UNIQUE INDEX uq_notif_proposal ON public.notifications USING btree (user_id, type, proposal_id) WHERE (proposal_id IS NOT NULL)
- `uq_notif_punch`: UNIQUE INDEX uq_notif_punch ON public.notifications USING btree (user_id, type, punch_item_id) WHERE (punch_item_id IS NOT NULL)
- `uq_notif_vehicle`: UNIQUE INDEX uq_notif_vehicle ON public.notifications USING btree (user_id, vehicle_id, type) WHERE (vehicle_id IS NOT NULL)
- `uq_notif_vo`: UNIQUE INDEX uq_notif_vo ON public.notifications USING btree (user_id, type, vo_id) WHERE (vo_id IS NOT NULL)
- `uq_notif_warranty`: UNIQUE INDEX uq_notif_warranty ON public.notifications USING btree (user_id, type, warranty_item_id) WHERE (warranty_item_id IS NOT NULL)
- `uq_notif_wclaim`: UNIQUE INDEX uq_notif_wclaim ON public.notifications USING btree (user_id, type, warranty_claim_id) WHERE (warranty_claim_id IS NOT NULL)

### notification_prefs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| user_id | integer |  |  |
| prefs | text |  | `'{}'::text` |

**Khóa ngoại:**
- `user_id` → `users(id)`

**Index:**
- `notification_prefs_pkey`: UNIQUE INDEX notification_prefs_pkey ON public.notification_prefs USING btree (user_id)

### push_subscriptions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('push_subscriptions_id_seq'::regclass)` |
| user_id | integer | ✓ |  |
| endpoint | text |  |  |
| p256dh | text |  |  |
| auth | text |  |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `user_id` → `users(id)`

**Index:**
- `push_subscriptions_endpoint_key`: UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions USING btree (endpoint)
- `push_subscriptions_pkey`: UNIQUE INDEX push_subscriptions_pkey ON public.push_subscriptions USING btree (id)

## BOQ & khối lượng

### boq_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('boq_items_id_seq'::regclass)` |
| code | text |  |  |
| name | text |  |  |
| unit | text |  |  |
| system_id | integer | ✓ |  |
| qty_contract | numeric(15,3) |  | `0` |
| unit_price | numeric(15,2) |  | `0` |
| qty_sub | numeric(15,3) | ✓ | `0` |
| sub_unit_price | numeric(15,2) | ✓ | `0` |
| note | text | ✓ |  |
| sort_order | integer | ✓ | `0` |
| created_at | timestamptz | ✓ | `now()` |
| contract_id | integer | ✓ |  |
| vo_id | integer | ✓ |  |
| qty_approved | numeric(15,3) | ✓ |  |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`
- `vo_id` → `variation_orders(id)`

**Index:**
- `boq_items_code_key`: UNIQUE INDEX boq_items_code_key ON public.boq_items USING btree (code)
- `boq_items_pkey`: UNIQUE INDEX boq_items_pkey ON public.boq_items USING btree (id)
- `idx_boq_items_project`: INDEX idx_boq_items_project ON public.boq_items USING btree (project_id)
- `idx_boq_items_system`: INDEX idx_boq_items_system ON public.boq_items USING btree (system_id)
- `idx_boq_items_vo`: INDEX idx_boq_items_vo ON public.boq_items USING btree (vo_id)
- `uniq_boq_items_code_lower`: UNIQUE INDEX uniq_boq_items_code_lower ON public.boq_items USING btree (lower(code))

### boq_norms

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('boq_norms_id_seq'::regclass)` |
| boq_item_id | integer |  |  |
| resource_type | text |  |  |
| material_id | integer | ✓ |  |
| resource_name | text | ✓ |  |
| qty_per_unit | numeric(15,4) |  |  |
| unit_label | text |  |  |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `boq_item_id` → `boq_items(id)`
- `created_by` → `users(id)`
- `material_id` → `materials(id)`

**Index:**
- `boq_norms_pkey`: UNIQUE INDEX boq_norms_pkey ON public.boq_norms USING btree (id)
- `idx_boq_norms_item`: INDEX idx_boq_norms_item ON public.boq_norms USING btree (boq_item_id)

### boq_task_map

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| boq_item_id | integer |  |  |
| task_id | integer |  |  |
| weight | numeric(5,4) |  | `1` |

**Khóa ngoại:**
- `boq_item_id` → `boq_items(id)`
- `task_id` → `tasks(id)`

**Index:**
- `boq_task_map_pkey`: UNIQUE INDEX boq_task_map_pkey ON public.boq_task_map USING btree (boq_item_id, task_id)
- `idx_boq_task_map_task`: INDEX idx_boq_task_map_task ON public.boq_task_map USING btree (task_id)

### boq_codes

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| code | text |  |  |
| table_name | text |  |  |
| row_id | integer |  |  |

**Index:**
- `boq_codes_pkey`: UNIQUE INDEX boq_codes_pkey ON public.boq_codes USING btree (code)
- `boq_codes_table_name_row_id_key`: UNIQUE INDEX boq_codes_table_name_row_id_key ON public.boq_codes USING btree (table_name, row_id)

## Hợp đồng & tài chính

### contracts

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('contracts_id_seq'::regclass)` |
| code | text |  |  |
| kind | text |  |  |
| title | text |  |  |
| party_supplier_id | integer | ✓ |  |
| party_name | text | ✓ |  |
| system_id | integer | ✓ |  |
| value | numeric(15,2) |  | `0` |
| advance_pct | numeric(5,2) |  | `0` |
| retention_pct | numeric(5,2) |  | `0` |
| signed_date | date | ✓ |  |
| valid_from | date | ✓ |  |
| valid_to | date | ✓ |  |
| status | text |  | `'active'::text` |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |
| deleted_at | timestamptz | ✓ |  |
| custom | jsonb |  | `'{}'::jsonb` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `party_supplier_id` → `suppliers(id)`
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`

**Index:**
- `contracts_code_key`: UNIQUE INDEX contracts_code_key ON public.contracts USING btree (code)
- `contracts_pkey`: UNIQUE INDEX contracts_pkey ON public.contracts USING btree (id)
- `idx_contracts_alive`: INDEX idx_contracts_alive ON public.contracts USING btree (id) WHERE (deleted_at IS NULL)
- `idx_contracts_fts`: INDEX idx_contracts_fts ON public.contracts USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((((COALESCE(code, ''::text) || ' '::text) || COALESCE(title, ''::text)) || ' '::text) || COALESCE(party_name, ''::text)))))
- `idx_contracts_kind`: INDEX idx_contracts_kind ON public.contracts USING btree (kind)
- `idx_contracts_project`: INDEX idx_contracts_project ON public.contracts USING btree (project_id)

### contract_addenda

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('contract_addenda_id_seq'::regclass)` |
| contract_id | integer |  |  |
| code | text |  |  |
| title | text | ✓ |  |
| value_delta | numeric(15,2) |  | `0` |
| signed_date | date | ✓ |  |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `created_by` → `users(id)`

**Index:**
- `contract_addenda_contract_id_code_key`: UNIQUE INDEX contract_addenda_contract_id_code_key ON public.contract_addenda USING btree (contract_id, code)
- `contract_addenda_pkey`: UNIQUE INDEX contract_addenda_pkey ON public.contract_addenda USING btree (id)

### contract_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('contract_documents_id_seq'::regclass)` |
| contract_id | integer |  |  |
| file_name | text |  |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| caption | text | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| sha256 | text | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `contract_documents_pkey`: UNIQUE INDEX contract_documents_pkey ON public.contract_documents USING btree (id)

### variation_orders

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('variation_orders_id_seq'::regclass)` |
| code | text |  |  |
| title | text |  |  |
| reason | text |  |  |
| description | text | ✓ |  |
| system_id | integer | ✓ |  |
| contract_id | integer | ✓ |  |
| status | text |  | `'draft'::text` |
| submitted_at | date | ✓ |  |
| decided_at | date | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |
| design_change_id | integer | ✓ |  |
| deleted_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `created_by` → `users(id)`
- `design_change_id` → `design_changes(id)`
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`

**Index:**
- `idx_variation_orders_project`: INDEX idx_variation_orders_project ON public.variation_orders USING btree (project_id)
- `idx_vo_status`: INDEX idx_vo_status ON public.variation_orders USING btree (status)
- `variation_orders_code_key`: UNIQUE INDEX variation_orders_code_key ON public.variation_orders USING btree (code)
- `variation_orders_pkey`: UNIQUE INDEX variation_orders_pkey ON public.variation_orders USING btree (id)

### vo_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('vo_documents_id_seq'::regclass)` |
| vo_id | integer |  |  |
| file_name | text |  |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| caption | text | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| sha256 | text | ✓ |  |

**Khóa ngoại:**
- `uploaded_by` → `users(id)`
- `vo_id` → `variation_orders(id)`

**Index:**
- `vo_documents_pkey`: UNIQUE INDEX vo_documents_pkey ON public.vo_documents USING btree (id)

### payment_certs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('payment_certs_id_seq'::regclass)` |
| code | text |  |  |
| contract_id | integer |  |  |
| period_no | integer |  |  |
| period_label | text | ✓ |  |
| status | text |  | `'draft'::text` |
| submitted_at | date | ✓ |  |
| decided_at | date | ✓ |  |
| decided_by | integer | ✓ |  |
| reject_reason | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| deleted_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `created_by` → `users(id)`
- `decided_by` → `users(id)`

**Index:**
- `payment_certs_code_key`: UNIQUE INDEX payment_certs_code_key ON public.payment_certs USING btree (code)
- `payment_certs_contract_id_period_no_key`: UNIQUE INDEX payment_certs_contract_id_period_no_key ON public.payment_certs USING btree (contract_id, period_no)
- `payment_certs_pkey`: UNIQUE INDEX payment_certs_pkey ON public.payment_certs USING btree (id)

### payment_cert_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('payment_cert_items_id_seq'::regclass)` |
| cert_id | integer |  |  |
| boq_item_id | integer |  |  |
| qty_period | numeric(15,3) |  | `0` |
| qty_cumulative | numeric(15,3) |  | `0` |
| unit_price | numeric(15,2) |  | `0` |

**Khóa ngoại:**
- `boq_item_id` → `boq_items(id)`
- `cert_id` → `payment_certs(id)`

**Index:**
- `payment_cert_items_cert_id_boq_item_id_key`: UNIQUE INDEX payment_cert_items_cert_id_boq_item_id_key ON public.payment_cert_items USING btree (cert_id, boq_item_id)
- `payment_cert_items_pkey`: UNIQUE INDEX payment_cert_items_pkey ON public.payment_cert_items USING btree (id)

### payment_bills

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('payment_bills_id_seq'::regclass)` |
| responsible | text |  |  |
| type | text |  | `'bill'::text` |
| period | text | ✓ |  |
| amount | numeric(15,2) |  | `0` |
| description | text | ✓ |  |
| paid_date | date |  |  |
| progress_snapshot | numeric(5,4) | ✓ | `0` |
| note | text | ✓ |  |
| unit | text | ✓ | `'LS'::text` |
| quantity | numeric(15,3) | ✓ |  |
| labor | numeric(15,2) | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| sheet_type_id | integer | ✓ |  |
| floor_label | text | ✓ |  |
| pct_this_period | numeric(5,4) | ✓ | `0` |
| responsible_supplier_id | integer | ✓ |  |
| contract_id | integer | ✓ |  |
| payment_cert_id | integer | ✓ |  |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `created_by` → `users(id)`
- `payment_cert_id` → `payment_certs(id)`
- `project_id` → `projects(id)`
- `responsible_supplier_id` → `suppliers(id)`
- `sheet_type_id` → `sheet_types(id)`

**Index:**
- `idx_payment_bills_contract`: INDEX idx_payment_bills_contract ON public.payment_bills USING btree (contract_id)
- `idx_payment_bills_project`: INDEX idx_payment_bills_project ON public.payment_bills USING btree (project_id)
- `idx_payment_bills_resp`: INDEX idx_payment_bills_resp ON public.payment_bills USING btree (responsible)
- `idx_payment_bills_resp_supplier`: INDEX idx_payment_bills_resp_supplier ON public.payment_bills USING btree (responsible_supplier_id)
- `payment_bills_pkey`: UNIQUE INDEX payment_bills_pkey ON public.payment_bills USING btree (id)

### claims

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('claims_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| code | text |  |  |
| kind | text |  |  |
| title | text |  |  |
| contract_id | integer | ✓ |  |
| vo_id | integer | ✓ |  |
| notice_date | date |  |  |
| cause | text |  |  |
| amount_requested | numeric(15,2) | ✓ |  |
| days_requested | integer | ✓ |  |
| amount_settled | numeric(15,2) | ✓ |  |
| days_settled | integer | ✓ |  |
| status | text |  | `'notice'::text` |
| settlement_note | text | ✓ |  |
| settled_by | integer | ✓ |  |
| settled_at | timestamptz | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| deleted_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `settled_by` → `users(id)`
- `vo_id` → `variation_orders(id)`

**Index:**
- `claims_code_key`: UNIQUE INDEX claims_code_key ON public.claims USING btree (code)
- `claims_pkey`: UNIQUE INDEX claims_pkey ON public.claims USING btree (id)
- `idx_claims_alive`: INDEX idx_claims_alive ON public.claims USING btree (id) WHERE (deleted_at IS NULL)
- `idx_claims_contract`: INDEX idx_claims_contract ON public.claims USING btree (contract_id)
- `idx_claims_project`: INDEX idx_claims_project ON public.claims USING btree (project_id)
- `idx_claims_status`: INDEX idx_claims_status ON public.claims USING btree (status)

### claim_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('claim_documents_id_seq'::regclass)` |
| claim_id | integer |  |  |
| title | text | ✓ |  |
| file_name | text | ✓ |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| sha256 | text | ✓ |  |

**Khóa ngoại:**
- `claim_id` → `claims(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `claim_documents_pkey`: UNIQUE INDEX claim_documents_pkey ON public.claim_documents USING btree (id)

### invoices

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('invoices_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| invoice_no | text | ✓ |  |
| invoice_date | date | ✓ |  |
| direction | text |  |  |
| net_amount | numeric(15,2) | ✓ |  |
| vat_amount | numeric(15,2) | ✓ |  |
| vat_rate | numeric(5,2) | ✓ |  |
| counterparty | text | ✓ |  |
| contract_id | integer | ✓ |  |
| payment_bill_id | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| deleted_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `created_by` → `users(id)`
- `payment_bill_id` → `payment_bills(id)`
- `project_id` → `projects(id)`

**Index:**
- `idx_invoices_alive`: INDEX idx_invoices_alive ON public.invoices USING btree (id) WHERE (deleted_at IS NULL)
- `idx_invoices_project`: INDEX idx_invoices_project ON public.invoices USING btree (project_id, invoice_date)
- `invoices_pkey`: UNIQUE INDEX invoices_pkey ON public.invoices USING btree (id)

### advances

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('advances_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| code | text | ✓ |  |
| advance_date | date | ✓ |  |
| amount | numeric(15,2) |  |  |
| recipient | text | ✓ |  |
| reason | text | ✓ |  |
| settled_amount | numeric(15,2) | ✓ | `0` |
| status | text |  | `'open'::text` |
| proposal_id | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `proposal_id` → `proposals(id)`

**Index:**
- `advances_pkey`: UNIQUE INDEX advances_pkey ON public.advances USING btree (id)
- `idx_advances_project`: INDEX idx_advances_project ON public.advances USING btree (project_id, status)

### cash_transactions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('cash_transactions_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| tx_date | date |  |  |
| direction | text |  |  |
| category | text | ✓ |  |
| amount | numeric(15,2) |  |  |
| is_petty_cash | boolean | ✓ | `false` |
| contract_id | integer | ✓ |  |
| supplier_id | integer | ✓ |  |
| voucher_code | text | ✓ |  |
| description | text | ✓ |  |
| recorded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `project_id` → `projects(id)`
- `recorded_by` → `users(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `cash_transactions_pkey`: UNIQUE INDEX cash_transactions_pkey ON public.cash_transactions USING btree (id)
- `idx_cash_transactions_project`: INDEX idx_cash_transactions_project ON public.cash_transactions USING btree (project_id, tx_date)

### payroll

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('payroll_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| period | text |  |  |
| crew_id | integer | ✓ |  |
| personnel_id | integer | ✓ |  |
| workdays | numeric(6,1) | ✓ |  |
| rate | numeric(12,2) | ✓ |  |
| gross | numeric(15,2) | ✓ |  |
| deductions | numeric(15,2) | ✓ |  |
| net | numeric(15,2) | ✓ |  |
| status | text |  | `'draft'::text` |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `crew_id` → `crews(id)`
- `personnel_id` → `personnel(id)`
- `project_id` → `projects(id)`

**Index:**
- `idx_payroll_project`: INDEX idx_payroll_project ON public.payroll USING btree (project_id, period)
- `payroll_pkey`: UNIQUE INDEX payroll_pkey ON public.payroll USING btree (id)

### attendance

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('attendance_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| work_date | date |  |  |
| crew_id | integer | ✓ |  |
| personnel_id | integer | ✓ |  |
| headcount | integer | ✓ |  |
| present | boolean | ✓ |  |
| hours | numeric(4,1) | ✓ |  |
| note | text | ✓ |  |
| recorded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `crew_id` → `crews(id)`
- `personnel_id` → `personnel(id)`
- `project_id` → `projects(id)`
- `recorded_by` → `users(id)`

**Index:**
- `attendance_pkey`: UNIQUE INDEX attendance_pkey ON public.attendance USING btree (id)
- `idx_attendance_date`: INDEX idx_attendance_date ON public.attendance USING btree (project_id, work_date)

### insurance_bonds

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('insurance_bonds_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| contract_id | integer | ✓ |  |
| kind | text |  |  |
| title | text |  |  |
| provider | text | ✓ |  |
| code | text | ✓ |  |
| value | numeric(15,2) | ✓ |  |
| issued_date | date | ✓ |  |
| expiry_date | date | ✓ |  |
| status | text |  | `'valid'::text` |
| note | text | ✓ |  |
| file_name | text | ✓ |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| deleted_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `idx_insurance_bonds_alive`: INDEX idx_insurance_bonds_alive ON public.insurance_bonds USING btree (id) WHERE (deleted_at IS NULL)
- `insurance_bonds_pkey`: UNIQUE INDEX insurance_bonds_pkey ON public.insurance_bonds USING btree (id)

## Chi phí & mua sắm

### cost_settings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | smallint |  | `1` |
| warn_pct | numeric(5,2) |  | `90` |
| over_pct | numeric(5,2) |  | `100` |

**Index:**
- `cost_settings_pkey`: UNIQUE INDEX cost_settings_pkey ON public.cost_settings USING btree (id)

### purchase_requests

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('purchase_requests_id_seq'::regclass)` |
| pr_code | text | ✓ |  |
| material_id | integer | ✓ |  |
| qty_requested | float8 |  |  |
| note | text | ✓ |  |
| status | text | ✓ | `'pending'::text` |
| requested_by | integer | ✓ |  |
| reviewed_by | integer | ✓ |  |
| reviewed_at | timestamptz | ✓ |  |
| review_note | text | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `material_id` → `materials(id)`
- `project_id` → `projects(id)`
- `requested_by` → `users(id)`
- `reviewed_by` → `users(id)`

**Index:**
- `idx_pr_material`: INDEX idx_pr_material ON public.purchase_requests USING btree (material_id)
- `idx_pr_status`: INDEX idx_pr_status ON public.purchase_requests USING btree (status)
- `idx_purchase_requests_project`: INDEX idx_purchase_requests_project ON public.purchase_requests USING btree (project_id)
- `purchase_requests_pkey`: UNIQUE INDEX purchase_requests_pkey ON public.purchase_requests USING btree (id)
- `purchase_requests_pr_code_key`: UNIQUE INDEX purchase_requests_pr_code_key ON public.purchase_requests USING btree (pr_code)

### purchase_orders

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('purchase_orders_id_seq'::regclass)` |
| po_code | text | ✓ |  |
| supplier_id | integer | ✓ |  |
| status | text | ✓ | `'draft'::text` |
| expected_date | date | ✓ |  |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| contract_id | integer | ✓ |  |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `idx_po_status`: INDEX idx_po_status ON public.purchase_orders USING btree (status)
- `idx_purchase_orders_contract`: INDEX idx_purchase_orders_contract ON public.purchase_orders USING btree (contract_id)
- `idx_purchase_orders_project`: INDEX idx_purchase_orders_project ON public.purchase_orders USING btree (project_id)
- `purchase_orders_pkey`: UNIQUE INDEX purchase_orders_pkey ON public.purchase_orders USING btree (id)
- `purchase_orders_po_code_key`: UNIQUE INDEX purchase_orders_po_code_key ON public.purchase_orders USING btree (po_code)

### po_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('po_items_id_seq'::regclass)` |
| po_id | integer | ✓ |  |
| material_id | integer | ✓ |  |
| pr_id | integer | ✓ |  |
| qty_ordered | float8 |  |  |
| qty_received | float8 | ✓ | `0` |
| unit_price | float8 | ✓ |  |
| note | text | ✓ |  |

**Khóa ngoại:**
- `material_id` → `materials(id)`
- `po_id` → `purchase_orders(id)`
- `pr_id` → `purchase_requests(id)`

**Index:**
- `idx_po_items_mat`: INDEX idx_po_items_mat ON public.po_items USING btree (material_id)
- `idx_po_items_po`: INDEX idx_po_items_po ON public.po_items USING btree (po_id)
- `po_items_pkey`: UNIQUE INDEX po_items_pkey ON public.po_items USING btree (id)

### po_status_history

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('po_status_history_id_seq'::regclass)` |
| po_id | integer |  |  |
| from_status | text | ✓ |  |
| to_status | text |  |  |
| changed_by | integer | ✓ |  |
| changed_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `changed_by` → `users(id)`
- `po_id` → `purchase_orders(id)`

**Index:**
- `idx_po_status_history_po`: INDEX idx_po_status_history_po ON public.po_status_history USING btree (po_id, changed_at)
- `po_status_history_pkey`: UNIQUE INDEX po_status_history_pkey ON public.po_status_history USING btree (id)

### warehouse_receipts

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('warehouse_receipts_id_seq'::regclass)` |
| receipt_code | text | ✓ |  |
| po_id | integer | ✓ |  |
| received_by | integer | ✓ |  |
| received_at | timestamptz | ✓ | `now()` |
| note | text | ✓ |  |

**Khóa ngoại:**
- `po_id` → `purchase_orders(id)`
- `received_by` → `users(id)`

**Index:**
- `idx_receipt_po`: INDEX idx_receipt_po ON public.warehouse_receipts USING btree (po_id)
- `warehouse_receipts_pkey`: UNIQUE INDEX warehouse_receipts_pkey ON public.warehouse_receipts USING btree (id)
- `warehouse_receipts_receipt_code_key`: UNIQUE INDEX warehouse_receipts_receipt_code_key ON public.warehouse_receipts USING btree (receipt_code)

### receipt_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('receipt_items_id_seq'::regclass)` |
| receipt_id | integer | ✓ |  |
| material_id | integer | ✓ |  |
| po_item_id | integer | ✓ |  |
| qty_received | float8 |  |  |
| note | text | ✓ |  |

**Khóa ngoại:**
- `material_id` → `materials(id)`
- `po_item_id` → `po_items(id)`
- `receipt_id` → `warehouse_receipts(id)`

**Index:**
- `idx_receipt_items`: INDEX idx_receipt_items ON public.receipt_items USING btree (receipt_id)
- `receipt_items_pkey`: UNIQUE INDEX receipt_items_pkey ON public.receipt_items USING btree (id)

### proposals

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('proposals_id_seq'::regclass)` |
| code | text |  |  |
| kind | text |  |  |
| title | text |  |  |
| amount | numeric(15,2) | ✓ |  |
| contract_id | integer | ✓ |  |
| material_id | integer | ✓ |  |
| reason | text | ✓ |  |
| status | text |  | `'draft'::text` |
| submitted_at | date | ✓ |  |
| decided_at | date | ✓ |  |
| decided_by | integer | ✓ |  |
| reject_reason | text | ✓ |  |
| requested_by | integer |  |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `decided_by` → `users(id)`
- `material_id` → `materials(id)`
- `project_id` → `projects(id)`
- `requested_by` → `users(id)`

**Index:**
- `idx_proposals_kind`: INDEX idx_proposals_kind ON public.proposals USING btree (kind)
- `idx_proposals_project`: INDEX idx_proposals_project ON public.proposals USING btree (project_id)
- `idx_proposals_status`: INDEX idx_proposals_status ON public.proposals USING btree (status)
- `proposals_code_key`: UNIQUE INDEX proposals_code_key ON public.proposals USING btree (code)
- `proposals_pkey`: UNIQUE INDEX proposals_pkey ON public.proposals USING btree (id)

### proposal_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('proposal_documents_id_seq'::regclass)` |
| proposal_id | integer |  |  |
| file_name | text |  |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| caption | text | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `proposal_id` → `proposals(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `proposal_documents_pkey`: UNIQUE INDEX proposal_documents_pkey ON public.proposal_documents USING btree (id)

## Vật tư

### materials

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('materials_id_seq'::regclass)` |
| sheet_type_id | integer | ✓ |  |
| task_id | integer | ✓ |  |
| name | text |  |  |
| unit | text | ✓ |  |
| qty_boq | float8 | ✓ | `0` |
| qty_planned | float8 | ✓ | `0` |
| qty_used | float8 | ✓ | `0` |
| status | text | ✓ | `'dat_hang'::text` |
| note | text | ✓ |  |
| sort_order | integer | ✓ | `0` |
| updated_at | timestamptz | ✓ | `now()` |
| boq_code | text | ✓ |  |
| qty_stock | float8 | ✓ | `0` |
| min_stock_level | float8 | ✓ | `0` |
| project_id | integer | ✓ |  |
| custom | jsonb |  | `'{}'::jsonb` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `sheet_type_id` → `sheet_types(id)`
- `task_id` → `tasks(id)`

**Index:**
- `idx_materials_fts`: INDEX idx_materials_fts ON public.materials USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((COALESCE(boq_code, ''::text) || ' '::text) || COALESCE(name, ''::text)))))
- `idx_materials_project`: INDEX idx_materials_project ON public.materials USING btree (project_id)
- `idx_materials_sheet`: INDEX idx_materials_sheet ON public.materials USING btree (sheet_type_id)
- `idx_materials_updated_at`: INDEX idx_materials_updated_at ON public.materials USING btree (updated_at DESC)
- `materials_pkey`: UNIQUE INDEX materials_pkey ON public.materials USING btree (id)
- `uniq_materials_boq`: UNIQUE INDEX uniq_materials_boq ON public.materials USING btree (boq_code) WHERE (boq_code IS NOT NULL)

### material_transactions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('material_transactions_id_seq'::regclass)` |
| material_id | integer | ✓ |  |
| delta | float8 |  |  |
| qty_after | float8 |  |  |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| type | text | ✓ | `'dieu_chinh'::text` |
| task_id | integer | ✓ |  |
| receipt_item_id | integer | ✓ |  |
| floor_label | text | ✓ |  |
| crew | text | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `material_id` → `materials(id)`
- `receipt_item_id` → `receipt_items(id)`
- `task_id` → `tasks(id)`

**Index:**
- `idx_mat_trans`: INDEX idx_mat_trans ON public.material_transactions USING btree (material_id)
- `idx_mat_trans_floor`: INDEX idx_mat_trans_floor ON public.material_transactions USING btree (floor_label) WHERE (floor_label IS NOT NULL)
- `idx_mat_trans_type`: INDEX idx_mat_trans_type ON public.material_transactions USING btree (type)
- `material_transactions_pkey`: UNIQUE INDEX material_transactions_pkey ON public.material_transactions USING btree (id)

### material_sync

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| material_id | integer |  |  |
| synced_fields | text | ✓ |  |
| last_synced_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `material_id` → `materials(id)`

**Index:**
- `material_sync_pkey`: UNIQUE INDEX material_sync_pkey ON public.material_sync USING btree (material_id)

### sync_locks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| name | text |  |  |
| locked_at | timestamptz | ✓ |  |

**Index:**
- `sync_locks_pkey`: UNIQUE INDEX sync_locks_pkey ON public.sync_locks USING btree (name)

## Nhà thầu phụ & nhân sự

### suppliers

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('suppliers_id_seq'::regclass)` |
| name | text |  |  |
| phone | text | ✓ |  |
| email | text | ✓ |  |
| address | text | ✓ |  |
| note | text | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| buyer_company | text | ✓ |  |
| buyer_project | text | ✓ |  |
| buyer_address | text | ✓ |  |
| buyer_rep | text | ✓ |  |
| buyer_title | text | ✓ |  |
| buyer_phone | text | ✓ |  |
| seller_rep | text | ✓ |  |
| receiver_company | text | ✓ |  |
| receiver_address | text | ✓ |  |
| receiver_rep | text | ✓ |  |
| receiver_phone | text | ✓ |  |
| receiver_subcon | text | ✓ |  |
| title | text | ✓ |  |
| delivery_time | text | ✓ |  |
| delivery_contact | text | ✓ |  |
| delivery_phone | text | ✓ |  |
| delivery_note | text | ✓ |  |
| delivery_order | text | ✓ |  |

**Index:**
- `suppliers_pkey`: UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)

### supplier_ratings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('supplier_ratings_id_seq'::regclass)` |
| supplier_id | integer |  |  |
| po_id | integer | ✓ |  |
| quality | smallint | ✓ |  |
| delivery | smallint | ✓ |  |
| price | smallint | ✓ |  |
| note | text | ✓ |  |
| rated_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `po_id` → `purchase_orders(id)`
- `rated_by` → `users(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `idx_supplier_ratings_supplier`: INDEX idx_supplier_ratings_supplier ON public.supplier_ratings USING btree (supplier_id)
- `supplier_ratings_pkey`: UNIQUE INDEX supplier_ratings_pkey ON public.supplier_ratings USING btree (id)
- `supplier_ratings_supplier_id_po_id_key`: UNIQUE INDEX supplier_ratings_supplier_id_po_id_key ON public.supplier_ratings USING btree (supplier_id, po_id)

### subcontractor_profiles

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| supplier_id | integer |  |  |
| project_id | integer | ✓ |  |
| org_chart_note | text | ✓ |  |
| site_rep_name | text | ✓ |  |
| site_rep_phone | text | ✓ |  |
| capability_summary | text | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `subcontractor_profiles_pkey`: UNIQUE INDEX subcontractor_profiles_pkey ON public.subcontractor_profiles USING btree (supplier_id)

### subcon_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('subcon_documents_id_seq'::regclass)` |
| supplier_id | integer |  |  |
| title | text |  |  |
| doc_kind | text | ✓ |  |
| file_name | text | ✓ |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `supplier_id` → `suppliers(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `idx_subcon_documents_supplier`: INDEX idx_subcon_documents_supplier ON public.subcon_documents USING btree (supplier_id)
- `subcon_documents_pkey`: UNIQUE INDEX subcon_documents_pkey ON public.subcon_documents USING btree (id)

### subcon_evaluations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('subcon_evaluations_id_seq'::regclass)` |
| supplier_id | integer |  |  |
| period | text |  |  |
| safety_score | integer | ✓ |  |
| quality_score | integer | ✓ |  |
| schedule_score | integer | ✓ |  |
| manpower_score | integer | ✓ |  |
| note | text | ✓ |  |
| evaluated_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `evaluated_by` → `users(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `idx_subcon_evaluations_supplier`: INDEX idx_subcon_evaluations_supplier ON public.subcon_evaluations USING btree (supplier_id)
- `subcon_evaluations_pkey`: UNIQUE INDEX subcon_evaluations_pkey ON public.subcon_evaluations USING btree (id)
- `subcon_evaluations_supplier_id_period_key`: UNIQUE INDEX subcon_evaluations_supplier_id_period_key ON public.subcon_evaluations USING btree (supplier_id, period)

### system_contractors

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('discipline_contractors_id_seq'::regclass)` |
| system_id | integer |  |  |
| supplier_id | integer |  |  |
| floor_labels | text[] | ✓ |  |
| zone | text | ✓ |  |
| is_primary | boolean |  | `false` |
| note | text | ✓ |  |

**Khóa ngoại:**
- `supplier_id` → `suppliers(id)`
- `system_id` → `systems(id)`

**Index:**
- `discipline_contractors_discipline_id_supplier_id_zone_key`: UNIQUE INDEX discipline_contractors_discipline_id_supplier_id_zone_key ON public.system_contractors USING btree (system_id, supplier_id, zone)
- `discipline_contractors_pkey`: UNIQUE INDEX discipline_contractors_pkey ON public.system_contractors USING btree (id)
- `idx_system_contractors_supplier`: INDEX idx_system_contractors_supplier ON public.system_contractors USING btree (supplier_id)
- `idx_system_contractors_system`: INDEX idx_system_contractors_system ON public.system_contractors USING btree (system_id)

### systems

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('disciplines_id_seq'::regclass)` |
| code | text |  |  |
| name | text |  |  |
| color | text | ✓ |  |

**Index:**
- `disciplines_code_key`: UNIQUE INDEX disciplines_code_key ON public.systems USING btree (code)
- `disciplines_pkey`: UNIQUE INDEX disciplines_pkey ON public.systems USING btree (id)

### personnel

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('personnel_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| code | text | ✓ |  |
| full_name | text |  |  |
| role_title | text | ✓ |  |
| supplier_id | integer | ✓ |  |
| phone | text | ✓ |  |
| id_number | text | ✓ |  |
| status | text |  | `'active'::text` |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `personnel_pkey`: UNIQUE INDEX personnel_pkey ON public.personnel USING btree (id)

### crews

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('crews_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| name | text |  |  |
| system_id | integer | ✓ |  |
| supplier_id | integer | ✓ |  |
| leader_id | integer | ✓ |  |

**Khóa ngoại:**
- `leader_id` → `personnel(id)`
- `project_id` → `projects(id)`
- `supplier_id` → `suppliers(id)`
- `system_id` → `systems(id)`

**Index:**
- `crews_pkey`: UNIQUE INDEX crews_pkey ON public.crews USING btree (id)
- `crews_project_id_name_key`: UNIQUE INDEX crews_project_id_name_key ON public.crews USING btree (project_id, name)

### crew_members

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| crew_id | integer |  |  |
| personnel_id | integer |  |  |

**Khóa ngoại:**
- `crew_id` → `crews(id)`
- `personnel_id` → `personnel(id)`

**Index:**
- `crew_members_pkey`: UNIQUE INDEX crew_members_pkey ON public.crew_members USING btree (crew_id, personnel_id)

### certifications

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('certifications_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| personnel_id | integer | ✓ |  |
| kind | text |  |  |
| code | text | ✓ |  |
| issued_date | date | ✓ |  |
| expiry_date | date | ✓ |  |
| file_name | text | ✓ |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `personnel_id` → `personnel(id)`
- `project_id` → `projects(id)`

**Index:**
- `certifications_pkey`: UNIQUE INDEX certifications_pkey ON public.certifications USING btree (id)

### raci_matrix

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('raci_matrix_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| scope | text |  |  |
| role_label | text |  |  |
| personnel_id | integer | ✓ |  |
| raci | char(1) |  |  |

**Khóa ngoại:**
- `personnel_id` → `personnel(id)`
- `project_id` → `projects(id)`

**Index:**
- `raci_matrix_pkey`: UNIQUE INDEX raci_matrix_pkey ON public.raci_matrix USING btree (id)

## Chất lượng & an toàn

### qc_checklists

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('qc_checklists_id_seq'::regclass)` |
| name | text |  |  |
| category | text |  | `'work'::text` |
| system_id | integer | ✓ |  |
| required | boolean |  | `false` |
| items | jsonb |  | `'[]'::jsonb` |
| active | boolean |  | `true` |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`

**Index:**
- `idx_qc_checklists_project`: INDEX idx_qc_checklists_project ON public.qc_checklists USING btree (project_id)
- `idx_qc_checklists_system`: INDEX idx_qc_checklists_system ON public.qc_checklists USING btree (system_id)
- `qc_checklists_pkey`: UNIQUE INDEX qc_checklists_pkey ON public.qc_checklists USING btree (id)

### qc_inspections

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('qc_inspections_id_seq'::regclass)` |
| checklist_id | integer |  |  |
| task_id | integer | ✓ |  |
| work_package_id | integer | ✓ |  |
| results | jsonb |  | `'[]'::jsonb` |
| status | text |  | `'draft'::text` |
| inspected_by | integer | ✓ |  |
| approved_by | integer | ✓ |  |
| inspected_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `approved_by` → `users(id)`
- `checklist_id` → `qc_checklists(id)`
- `inspected_by` → `users(id)`
- `task_id` → `tasks(id)`
- `work_package_id` → `work_packages(id)`

**Index:**
- `idx_qc_inspections_package`: INDEX idx_qc_inspections_package ON public.qc_inspections USING btree (work_package_id)
- `idx_qc_inspections_task`: INDEX idx_qc_inspections_task ON public.qc_inspections USING btree (task_id)
- `qc_inspections_pkey`: UNIQUE INDEX qc_inspections_pkey ON public.qc_inspections USING btree (id)

### inspection_requests

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('inspection_requests_id_seq'::regclass)` |
| code | text |  |  |
| scheduled_at | timestamptz |  |  |
| status | text |  | `'sent'::text` |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`

**Index:**
- `idx_inspection_requests_status`: INDEX idx_inspection_requests_status ON public.inspection_requests USING btree (status)
- `inspection_requests_code_key`: UNIQUE INDEX inspection_requests_code_key ON public.inspection_requests USING btree (code)
- `inspection_requests_pkey`: UNIQUE INDEX inspection_requests_pkey ON public.inspection_requests USING btree (id)

### inspection_request_tasks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| request_id | integer |  |  |
| task_id | integer |  |  |

**Khóa ngoại:**
- `request_id` → `inspection_requests(id)`
- `task_id` → `tasks(id)`

**Index:**
- `idx_insreq_tasks_task`: INDEX idx_insreq_tasks_task ON public.inspection_request_tasks USING btree (task_id)
- `inspection_request_tasks_pkey`: UNIQUE INDEX inspection_request_tasks_pkey ON public.inspection_request_tasks USING btree (request_id, task_id)

### ncrs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('ncrs_id_seq'::regclass)` |
| code | text |  |  |
| task_id | integer | ✓ |  |
| inspection_id | integer | ✓ |  |
| description | text |  |  |
| assigned_to | integer | ✓ |  |
| due_date | date | ✓ |  |
| status | text |  | `'open'::text` |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| closed_at | timestamptz | ✓ |  |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `assigned_to` → `users(id)`
- `created_by` → `users(id)`
- `inspection_id` → `qc_inspections(id)`
- `project_id` → `projects(id)`
- `task_id` → `tasks(id)`

**Index:**
- `idx_ncrs_assigned`: INDEX idx_ncrs_assigned ON public.ncrs USING btree (assigned_to)
- `idx_ncrs_fts`: INDEX idx_ncrs_fts ON public.ncrs USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((COALESCE(code, ''::text) || ' '::text) || COALESCE(description, ''::text)))))
- `idx_ncrs_project`: INDEX idx_ncrs_project ON public.ncrs USING btree (project_id)
- `idx_ncrs_status`: INDEX idx_ncrs_status ON public.ncrs USING btree (status)
- `idx_ncrs_task`: INDEX idx_ncrs_task ON public.ncrs USING btree (task_id)
- `ncrs_code_key`: UNIQUE INDEX ncrs_code_key ON public.ncrs USING btree (code)
- `ncrs_pkey`: UNIQUE INDEX ncrs_pkey ON public.ncrs USING btree (id)

### punch_list

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('punch_list_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| handover_item_id | integer | ✓ |  |
| description | text |  |  |
| severity | text | ✓ |  |
| status | text |  | `'open'::text` |
| due_date | date | ✓ |  |
| assignee | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `assignee` → `users(id)`
- `created_by` → `users(id)`
- `handover_item_id` → `handover_items(id)`
- `project_id` → `projects(id)`

**Index:**
- `punch_list_pkey`: UNIQUE INDEX punch_list_pkey ON public.punch_list USING btree (id)

### hse_records

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('hse_records_id_seq'::regclass)` |
| kind | text |  |  |
| record_date | date |  |  |
| floor_label | text | ✓ |  |
| area | text | ✓ |  |
| description | text |  |  |
| severity | text | ✓ |  |
| permit_type | text | ✓ |  |
| permit_from | timestamptz | ✓ |  |
| permit_to | timestamptz | ✓ |  |
| inspection_id | integer | ✓ |  |
| action_required | text | ✓ |  |
| action_assignee | integer | ✓ |  |
| action_due | date | ✓ |  |
| action_status | text |  | `'none'::text` |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `action_assignee` → `users(id)`
- `created_by` → `users(id)`
- `inspection_id` → `qc_inspections(id)`
- `project_id` → `projects(id)`

**Index:**
- `hse_records_pkey`: UNIQUE INDEX hse_records_pkey ON public.hse_records USING btree (id)
- `idx_hse_records_action`: INDEX idx_hse_records_action ON public.hse_records USING btree (action_status, action_due)
- `idx_hse_records_date`: INDEX idx_hse_records_date ON public.hse_records USING btree (record_date)
- `idx_hse_records_kind`: INDEX idx_hse_records_kind ON public.hse_records USING btree (kind)
- `idx_hse_records_project`: INDEX idx_hse_records_project ON public.hse_records USING btree (project_id)

### hse_photos

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('hse_photos_id_seq'::regclass)` |
| record_id | integer |  |  |
| file_path | text |  |  |
| mime | text |  |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `record_id` → `hse_records(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `hse_photos_pkey`: UNIQUE INDEX hse_photos_pkey ON public.hse_photos USING btree (id)
- `idx_hse_photos_record`: INDEX idx_hse_photos_record ON public.hse_photos USING btree (record_id)

### risks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('risks_id_seq'::regclass)` |
| code | text |  |  |
| title | text |  |  |
| description | text | ✓ |  |
| category | text |  |  |
| probability | smallint |  |  |
| impact | smallint |  |  |
| mitigation | text | ✓ |  |
| owner | integer | ✓ |  |
| status | text |  | `'open'::text` |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| closed_at | timestamptz | ✓ |  |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `owner` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `idx_risks_project`: INDEX idx_risks_project ON public.risks USING btree (project_id)
- `idx_risks_status`: INDEX idx_risks_status ON public.risks USING btree (status)
- `risks_code_key`: UNIQUE INDEX risks_code_key ON public.risks USING btree (code)
- `risks_pkey`: UNIQUE INDEX risks_pkey ON public.risks USING btree (id)

### env_monitoring

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('env_monitoring_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| measured_at | date |  |  |
| category | text |  |  |
| indicator | text |  |  |
| value | numeric(12,3) | ✓ |  |
| unit | text | ✓ |  |
| threshold | numeric(12,3) | ✓ |  |
| passed | boolean | ✓ |  |
| location | text | ✓ |  |
| note | text | ✓ |  |
| recorded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `recorded_by` → `users(id)`

**Index:**
- `env_monitoring_pkey`: UNIQUE INDEX env_monitoring_pkey ON public.env_monitoring USING btree (id)

### env_permits

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('env_permits_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| kind | text |  |  |
| code | text | ✓ |  |
| title | text |  |  |
| issued_by | text | ✓ |  |
| issued_date | date | ✓ |  |
| expiry_date | date | ✓ |  |
| status | text |  | `'valid'::text` |
| file_name | text | ✓ |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `env_permits_pkey`: UNIQUE INDEX env_permits_pkey ON public.env_permits USING btree (id)

### monitoring_points

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('monitoring_points_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| code | text |  |  |
| kind | text |  |  |
| location | text | ✓ |  |
| warn_threshold | numeric(12,3) | ✓ |  |
| alarm_threshold | numeric(12,3) | ✓ |  |
| unit | text | ✓ |  |
| status | text |  | `'active'::text` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `monitoring_points_pkey`: UNIQUE INDEX monitoring_points_pkey ON public.monitoring_points USING btree (id)
- `monitoring_points_project_id_code_key`: UNIQUE INDEX monitoring_points_project_id_code_key ON public.monitoring_points USING btree (project_id, code)

### monitoring_readings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('monitoring_readings_id_seq'::regclass)` |
| point_id | integer |  |  |
| measured_at | date |  |  |
| value | numeric(12,3) |  |  |
| cumulative | numeric(12,3) | ✓ |  |
| level | text | ✓ |  |
| note | text | ✓ |  |
| recorded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `point_id` → `monitoring_points(id)`
- `recorded_by` → `users(id)`

**Index:**
- `monitoring_readings_pkey`: UNIQUE INDEX monitoring_readings_pkey ON public.monitoring_readings USING btree (id)
- `monitoring_readings_point_id_measured_at_key`: UNIQUE INDEX monitoring_readings_point_id_measured_at_key ON public.monitoring_readings USING btree (point_id, measured_at)

### waste_logs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('waste_logs_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| log_date | date |  |  |
| waste_type | text |  |  |
| quantity | numeric(12,2) | ✓ |  |
| unit | text | ✓ |  |
| disposal_method | text | ✓ |  |
| handler | text | ✓ |  |
| note | text | ✓ |  |
| recorded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `recorded_by` → `users(id)`

**Index:**
- `waste_logs_pkey`: UNIQUE INDEX waste_logs_pkey ON public.waste_logs USING btree (id)

## Hiện trường & nhật ký

### site_diaries

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('site_diaries_id_seq'::regclass)` |
| diary_date | date |  |  |
| weather_am | text | ✓ |  |
| weather_pm | text | ✓ |  |
| work_done | text | ✓ |  |
| obstacles | text | ✓ |  |
| safety_note | text | ✓ |  |
| status | text |  | `'draft'::text` |
| created_by | integer | ✓ |  |
| locked_by | integer | ✓ |  |
| locked_at | timestamptz | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `locked_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `idx_site_diaries_fts`: INDEX idx_site_diaries_fts ON public.site_diaries USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((((COALESCE(work_done, ''::text) || ' '::text) || COALESCE(obstacles, ''::text)) || ' '::text) || COALESCE(safety_note, ''::text)))))
- `idx_site_diaries_project`: INDEX idx_site_diaries_project ON public.site_diaries USING btree (project_id)
- `site_diaries_pkey`: UNIQUE INDEX site_diaries_pkey ON public.site_diaries USING btree (id)
- `uq_site_diaries_date_project`: UNIQUE INDEX uq_site_diaries_date_project ON public.site_diaries USING btree (diary_date, project_id)

### diary_manpower

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('diary_manpower_id_seq'::regclass)` |
| diary_id | integer |  |  |
| crew | text |  |  |
| headcount | smallint |  |  |
| note | text | ✓ |  |
| crew_id | integer | ✓ |  |

**Khóa ngoại:**
- `crew_id` → `crews(id)`
- `diary_id` → `site_diaries(id)`

**Index:**
- `diary_manpower_diary_id_crew_key`: UNIQUE INDEX diary_manpower_diary_id_crew_key ON public.diary_manpower USING btree (diary_id, crew)
- `diary_manpower_pkey`: UNIQUE INDEX diary_manpower_pkey ON public.diary_manpower USING btree (id)
- `idx_diary_manpower_diary`: INDEX idx_diary_manpower_diary ON public.diary_manpower USING btree (diary_id)

### diary_photos

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| diary_id | integer |  |  |
| photo_id | integer |  |  |

**Khóa ngoại:**
- `diary_id` → `site_diaries(id)`
- `photo_id` → `task_photos(id)`

**Index:**
- `diary_photos_pkey`: UNIQUE INDEX diary_photos_pkey ON public.diary_photos USING btree (diary_id, photo_id)

### diary_lock_history

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('diary_lock_history_id_seq'::regclass)` |
| diary_id | integer |  |  |
| action | text |  |  |
| changed_by | integer | ✓ |  |
| changed_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `changed_by` → `users(id)`
- `diary_id` → `site_diaries(id)`

**Index:**
- `diary_lock_history_pkey`: UNIQUE INDEX diary_lock_history_pkey ON public.diary_lock_history USING btree (id)

### work_fronts

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('work_fronts_id_seq'::regclass)` |
| sheet_type_id | integer |  |  |
| floor_label | text |  |  |
| status | text |  | `'pending'::text` |
| handed_over_at | date | ✓ |  |
| returned_at | date | ✓ |  |
| blocker | text | ✓ |  |
| note | text | ✓ |  |
| updated_by | integer | ✓ |  |
| updated_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `sheet_type_id` → `sheet_types(id)`
- `updated_by` → `users(id)`

**Index:**
- `idx_work_fronts_status`: INDEX idx_work_fronts_status ON public.work_fronts USING btree (status)
- `work_fronts_pkey`: UNIQUE INDEX work_fronts_pkey ON public.work_fronts USING btree (id)
- `work_fronts_sheet_type_id_floor_label_key`: UNIQUE INDEX work_fronts_sheet_type_id_floor_label_key ON public.work_fronts USING btree (sheet_type_id, floor_label)

### work_front_history

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('work_front_history_id_seq'::regclass)` |
| work_front_id | integer |  |  |
| old_status | text | ✓ |  |
| new_status | text |  |  |
| changed_by | integer | ✓ |  |
| changed_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `changed_by` → `users(id)`
- `work_front_id` → `work_fronts(id)`

**Index:**
- `idx_work_front_history_front`: INDEX idx_work_front_history_front ON public.work_front_history USING btree (work_front_id)
- `work_front_history_pkey`: UNIQUE INDEX work_front_history_pkey ON public.work_front_history USING btree (id)

### work_front_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('work_front_documents_id_seq'::regclass)` |
| work_front_id | integer |  |  |
| file_path | text |  |  |
| file_name | text |  |  |
| mime | text |  |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `uploaded_by` → `users(id)`
- `work_front_id` → `work_fronts(id)`

**Index:**
- `idx_work_front_documents_front`: INDEX idx_work_front_documents_front ON public.work_front_documents USING btree (work_front_id)
- `work_front_documents_pkey`: UNIQUE INDEX work_front_documents_pkey ON public.work_front_documents USING btree (id)

### floor_stage_fronts

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('floor_stage_fronts_id_seq'::regclass)` |
| floor_label | text |  |  |
| stage_id | integer |  |  |
| handed_over_at | date | ✓ |  |
| note | text | ✓ |  |
| updated_by | integer | ✓ |  |
| updated_at | timestamptz | ✓ | `now()` |
| received_at | date | ✓ |  |
| planned_received_at | date | ✓ |  |
| outgoing_supplier_id | integer | ✓ |  |
| incoming_supplier_id | integer | ✓ |  |
| transition_stage_id | integer | ✓ |  |
| outgoing_rep_name | text | ✓ |  |
| incoming_rep_name | text | ✓ |  |

**Khóa ngoại:**
- `incoming_supplier_id` → `suppliers(id)`
- `outgoing_supplier_id` → `suppliers(id)`
- `stage_id` → `construction_stages(id)`
- `transition_stage_id` → `construction_stages(id)`
- `updated_by` → `users(id)`

**Index:**
- `floor_stage_fronts_floor_label_stage_id_key`: UNIQUE INDEX floor_stage_fronts_floor_label_stage_id_key ON public.floor_stage_fronts USING btree (floor_label, stage_id)
- `floor_stage_fronts_pkey`: UNIQUE INDEX floor_stage_fronts_pkey ON public.floor_stage_fronts USING btree (id)
- `idx_floor_stage_fronts_stage`: INDEX idx_floor_stage_fronts_stage ON public.floor_stage_fronts USING btree (stage_id)

### floor_stage_front_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('floor_stage_front_documents_id_seq'::regclass)` |
| floor_stage_front_id | integer |  |  |
| file_path | text |  |  |
| file_name | text |  |  |
| mime | text |  |  |
| doc_kind | text |  | `'other'::text` |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `floor_stage_front_id` → `floor_stage_fronts(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `floor_stage_front_documents_pkey`: UNIQUE INDEX floor_stage_front_documents_pkey ON public.floor_stage_front_documents USING btree (id)
- `idx_floor_stage_front_documents_front`: INDEX idx_floor_stage_front_documents_front ON public.floor_stage_front_documents USING btree (floor_stage_front_id)

### floor_approvals

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('floor_approvals_id_seq'::regclass)` |
| sheet_type_id | integer |  |  |
| floor_label | text |  |  |
| is_approved | boolean |  | `false` |
| approved_by | integer | ✓ |  |
| approved_by_name | text | ✓ |  |
| approved_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `approved_by` → `users(id)`
- `sheet_type_id` → `sheet_types(id)`

**Index:**
- `floor_approvals_pkey`: UNIQUE INDEX floor_approvals_pkey ON public.floor_approvals USING btree (id)
- `floor_approvals_sheet_type_id_floor_label_key`: UNIQUE INDEX floor_approvals_sheet_type_id_floor_label_key ON public.floor_approvals USING btree (sheet_type_id, floor_label)
- `idx_floor_approvals_sheet`: INDEX idx_floor_approvals_sheet ON public.floor_approvals USING btree (sheet_type_id)

### floor_contracts

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('floor_contracts_id_seq'::regclass)` |
| sheet_type_id | integer |  |  |
| floor_label | text |  |  |
| contract_value | numeric(15,2) | ✓ | `0` |
| note | text | ✓ |  |
| contract_id | integer | ✓ |  |

**Khóa ngoại:**
- `contract_id` → `contracts(id)`
- `sheet_type_id` → `sheet_types(id)`

**Index:**
- `floor_contracts_pkey`: UNIQUE INDEX floor_contracts_pkey ON public.floor_contracts USING btree (id)
- `floor_contracts_sheet_type_id_floor_label_key`: UNIQUE INDEX floor_contracts_sheet_type_id_floor_label_key ON public.floor_contracts USING btree (sheet_type_id, floor_label)
- `idx_floor_contracts_sheet`: INDEX idx_floor_contracts_sheet ON public.floor_contracts USING btree (sheet_type_id)

### equipment

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('equipment_id_seq'::regclass)` |
| code | text |  |  |
| name | text |  |  |
| kind | text |  |  |
| serial | text | ✓ |  |
| condition | text |  | `'good'::text` |
| calibration_due | date | ✓ |  |
| cert_file_path | text | ✓ |  |
| cert_file_name | text | ✓ |  |
| cert_mime | text | ✓ |  |
| current_location | text | ✓ |  |
| current_crew | text | ✓ |  |
| note | text | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `equipment_code_key`: UNIQUE INDEX equipment_code_key ON public.equipment USING btree (code)
- `equipment_pkey`: UNIQUE INDEX equipment_pkey ON public.equipment USING btree (id)
- `idx_equipment_calibration`: INDEX idx_equipment_calibration ON public.equipment USING btree (calibration_due)
- `idx_equipment_condition`: INDEX idx_equipment_condition ON public.equipment USING btree (condition)
- `idx_equipment_project`: INDEX idx_equipment_project ON public.equipment USING btree (project_id)

### equipment_logs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('equipment_logs_id_seq'::regclass)` |
| equipment_id | integer |  |  |
| action | text |  |  |
| to_location | text | ✓ |  |
| to_crew | text | ✓ |  |
| note | text | ✓ |  |
| logged_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `equipment_id` → `equipment(id)`
- `logged_by` → `users(id)`

**Index:**
- `equipment_logs_pkey`: UNIQUE INDEX equipment_logs_pkey ON public.equipment_logs USING btree (id)
- `idx_equipment_logs_equipment`: INDEX idx_equipment_logs_equipment ON public.equipment_logs USING btree (equipment_id)

### vehicle_logs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('vehicle_logs_id_seq'::regclass)` |
| po_id | integer | ✓ |  |
| supplier_id | integer | ✓ |  |
| plate | text |  |  |
| driver | text | ✓ |  |
| driver_phone | text | ✓ |  |
| cargo | text | ✓ |  |
| gate | text | ✓ |  |
| expected_at | timestamptz |  |  |
| entered_at | timestamptz | ✓ |  |
| exited_at | timestamptz | ✓ |  |
| needs_crane | boolean |  | `false` |
| status | text |  | `'registered'::text` |
| receipt_id | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `po_id` → `purchase_orders(id)`
- `project_id` → `projects(id)`
- `receipt_id` → `warehouse_receipts(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `idx_vehicle_logs_expected`: INDEX idx_vehicle_logs_expected ON public.vehicle_logs USING btree (expected_at)
- `idx_vehicle_logs_project`: INDEX idx_vehicle_logs_project ON public.vehicle_logs USING btree (project_id)
- `vehicle_logs_pkey`: UNIQUE INDEX vehicle_logs_pkey ON public.vehicle_logs USING btree (id)

### warranty_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('warranty_items_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| title | text |  |  |
| system_id | integer | ✓ |  |
| handover_item_id | integer | ✓ |  |
| warranty_from | date | ✓ |  |
| warranty_months | integer | ✓ |  |
| guarantee_id | integer | ✓ |  |
| status | text |  | `'active'::text` |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `guarantee_id` → `insurance_bonds(id)`
- `handover_item_id` → `handover_items(id)`
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`

**Index:**
- `warranty_items_pkey`: UNIQUE INDEX warranty_items_pkey ON public.warranty_items USING btree (id)

### warranty_claims

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('warranty_claims_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| warranty_item_id | integer | ✓ |  |
| code | text | ✓ |  |
| reported_date | date | ✓ |  |
| description | text |  |  |
| severity | text | ✓ |  |
| status | text |  | `'open'::text` |
| due_date | date | ✓ |  |
| resolution | text | ✓ |  |
| closed_date | date | ✓ |  |
| assignee | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `assignee` → `users(id)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `warranty_item_id` → `warranty_items(id)`

**Index:**
- `warranty_claims_pkey`: UNIQUE INDEX warranty_claims_pkey ON public.warranty_claims USING btree (id)

### commissioning

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('commissioning_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| code | text | ✓ |  |
| system_name | text |  |  |
| system_id | integer | ✓ |  |
| checklist | jsonb | ✓ |  |
| result | text |  | `'draft'::text` |
| tested_at | date | ✓ |  |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`

**Index:**
- `commissioning_pkey`: UNIQUE INDEX commissioning_pkey ON public.commissioning USING btree (id)

### handover_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('handover_items_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| title | text |  |  |
| system_id | integer | ✓ |  |
| work_package_id | integer | ✓ |  |
| status | text |  | `'pending'::text` |
| handover_date | date | ✓ |  |
| minutes_file | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`
- `work_package_id` → `work_packages(id)`

**Index:**
- `handover_items_pkey`: UNIQUE INDEX handover_items_pkey ON public.handover_items USING btree (id)

### mobilization_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('mobilization_items_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| category | text |  |  |
| title | text |  |  |
| status | text |  | `'pending'::text` |
| due_date | date | ✓ |  |
| done_date | date | ✓ |  |
| assignee | integer | ✓ |  |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `assignee` → `users(id)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `mobilization_items_pkey`: UNIQUE INDEX mobilization_items_pkey ON public.mobilization_items USING btree (id)

### demob_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('demob_items_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| title | text |  |  |
| category | text | ✓ |  |
| status | text |  | `'pending'::text` |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `demob_items_pkey`: UNIQUE INDEX demob_items_pkey ON public.demob_items USING btree (id)

### om_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('om_documents_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| title | text |  |  |
| system_id | integer | ✓ |  |
| file_name | text | ✓ |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `om_documents_pkey`: UNIQUE INDEX om_documents_pkey ON public.om_documents USING btree (id)

## Bản vẽ & hồ sơ

### drawings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('drawings_id_seq'::regclass)` |
| code | text |  |  |
| name | text |  |  |
| kind | text |  | `'shop'::text` |
| system_group | text | ✓ |  |
| floor_label | text | ✓ |  |
| work_package_id | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `work_package_id` → `work_packages(id)`

**Index:**
- `drawings_code_key`: UNIQUE INDEX drawings_code_key ON public.drawings USING btree (code)
- `drawings_pkey`: UNIQUE INDEX drawings_pkey ON public.drawings USING btree (id)
- `idx_drawings_fts`: INDEX idx_drawings_fts ON public.drawings USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((COALESCE(code, ''::text) || ' '::text) || COALESCE(name, ''::text)))))
- `idx_drawings_kind`: INDEX idx_drawings_kind ON public.drawings USING btree (kind)
- `idx_drawings_project`: INDEX idx_drawings_project ON public.drawings USING btree (project_id)
- `idx_drawings_wp`: INDEX idx_drawings_wp ON public.drawings USING btree (work_package_id)

### drawing_revisions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('drawing_revisions_id_seq'::regclass)` |
| drawing_id | integer |  |  |
| rev | text |  |  |
| file_name | text |  |  |
| original_name | text | ✓ |  |
| mime_type | text |  |  |
| size_bytes | bigint | ✓ |  |
| status | text |  | `'submitted'::text` |
| submitted_at | date | ✓ |  |
| decided_at | date | ✓ |  |
| decision_note | text | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `drawing_id` → `drawings(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `drawing_revisions_drawing_id_rev_key`: UNIQUE INDEX drawing_revisions_drawing_id_rev_key ON public.drawing_revisions USING btree (drawing_id, rev)
- `drawing_revisions_pkey`: UNIQUE INDEX drawing_revisions_pkey ON public.drawing_revisions USING btree (id)
- `idx_drawing_revisions_drawing`: INDEX idx_drawing_revisions_drawing ON public.drawing_revisions USING btree (drawing_id)

### design_changes

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('design_changes_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| code | text | ✓ |  |
| title | text |  |  |
| system_id | integer | ✓ |  |
| drawing_id | integer | ✓ |  |
| requested_by_note | text | ✓ |  |
| reason | text |  |  |
| impact_technical | text | ✓ |  |
| impact_cost | text | ✓ |  |
| impact_schedule | text | ✓ |  |
| status | text |  | `'submitted'::text` |
| decision_note | text | ✓ |  |
| decided_by | integer | ✓ |  |
| decided_at | timestamptz | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `decided_by` → `users(id)`
- `drawing_id` → `drawings(id)`
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`

**Index:**
- `design_changes_pkey`: UNIQUE INDEX design_changes_pkey ON public.design_changes USING btree (id)
- `idx_design_changes_drawing`: INDEX idx_design_changes_drawing ON public.design_changes USING btree (drawing_id)
- `idx_design_changes_project`: INDEX idx_design_changes_project ON public.design_changes USING btree (project_id)

### legal_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('legal_documents_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| kind | text |  |  |
| code | text | ✓ |  |
| title | text |  |  |
| issued_by | text | ✓ |  |
| issued_date | date | ✓ |  |
| expiry_date | date | ✓ |  |
| status | text |  | `'valid'::text` |
| note | text | ✓ |  |
| file_name | text | ✓ |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `legal_documents_pkey`: UNIQUE INDEX legal_documents_pkey ON public.legal_documents USING btree (id)

### project_documents

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('project_documents_id_seq'::regclass)` |
| title | text |  |  |
| category | text | ✓ |  |
| file_name | text |  |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `idx_project_documents_fts`: INDEX idx_project_documents_fts ON public.project_documents USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(COALESCE(title, ''::text))))
- `idx_project_documents_project`: INDEX idx_project_documents_project ON public.project_documents USING btree (project_id)
- `project_documents_pkey`: UNIQUE INDEX project_documents_pkey ON public.project_documents USING btree (id)

### correspondences

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('correspondences_id_seq'::regclass)` |
| code | text |  |  |
| direction | text |  |  |
| kind | text |  | `'letter'::text` |
| counterparty | text |  |  |
| subject | text |  |  |
| sent_date | date |  |  |
| due_date | date | ✓ |  |
| status | text |  | `'awaiting'::text` |
| reply_id | integer | ✓ |  |
| task_id | integer | ✓ |  |
| work_package_id | integer | ✓ |  |
| drawing_id | integer | ✓ |  |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `drawing_id` → `drawings(id)`
- `project_id` → `projects(id)`
- `reply_id` → `correspondences(id)`
- `task_id` → `tasks(id)`
- `work_package_id` → `work_packages(id)`

**Index:**
- `correspondences_pkey`: UNIQUE INDEX correspondences_pkey ON public.correspondences USING btree (id)
- `idx_correspondences_drawing`: INDEX idx_correspondences_drawing ON public.correspondences USING btree (drawing_id)
- `idx_correspondences_fts`: INDEX idx_correspondences_fts ON public.correspondences USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((((COALESCE(code, ''::text) || ' '::text) || COALESCE(subject, ''::text)) || ' '::text) || COALESCE(note, ''::text)))))
- `idx_correspondences_project`: INDEX idx_correspondences_project ON public.correspondences USING btree (project_id)
- `idx_correspondences_reply`: INDEX idx_correspondences_reply ON public.correspondences USING btree (reply_id)
- `idx_correspondences_status`: INDEX idx_correspondences_status ON public.correspondences USING btree (status)
- `idx_correspondences_task`: INDEX idx_correspondences_task ON public.correspondences USING btree (task_id)
- `idx_correspondences_wp`: INDEX idx_correspondences_wp ON public.correspondences USING btree (work_package_id)

### correspondence_files

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('correspondence_files_id_seq'::regclass)` |
| correspondence_id | integer |  |  |
| file_name | text |  |  |
| original_name | text | ✓ |  |
| mime_type | text |  |  |
| size_bytes | bigint | ✓ |  |
| uploaded_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `correspondence_id` → `correspondences(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `correspondence_files_pkey`: UNIQUE INDEX correspondence_files_pkey ON public.correspondence_files USING btree (id)
- `idx_correspondence_files_corr`: INDEX idx_correspondence_files_corr ON public.correspondence_files USING btree (correspondence_id)

### meetings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('meetings_id_seq'::regclass)` |
| meeting_date | date |  |  |
| kind | text |  | `'weekly'::text` |
| title | text |  |  |
| attendees | text | ✓ |  |
| content | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `idx_meetings_date`: INDEX idx_meetings_date ON public.meetings USING btree (meeting_date)
- `idx_meetings_fts`: INDEX idx_meetings_fts ON public.meetings USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((COALESCE(title, ''::text) || ' '::text) || COALESCE(content, ''::text)))))
- `idx_meetings_project`: INDEX idx_meetings_project ON public.meetings USING btree (project_id)
- `meetings_pkey`: UNIQUE INDEX meetings_pkey ON public.meetings USING btree (id)

### meeting_actions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('meeting_actions_id_seq'::regclass)` |
| meeting_id | integer |  |  |
| content | text |  |  |
| assignee | integer | ✓ |  |
| due_date | date | ✓ |  |
| status | text |  | `'open'::text` |
| task_id | integer | ✓ |  |
| done_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `assignee` → `users(id)`
- `meeting_id` → `meetings(id)`
- `task_id` → `tasks(id)`

**Index:**
- `idx_meeting_actions_meeting`: INDEX idx_meeting_actions_meeting ON public.meeting_actions USING btree (meeting_id)
- `idx_meeting_actions_open`: INDEX idx_meeting_actions_open ON public.meeting_actions USING btree (status, due_date)
- `meeting_actions_pkey`: UNIQUE INDEX meeting_actions_pkey ON public.meeting_actions USING btree (id)

### lessons_learned

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('lessons_learned_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| title | text |  |  |
| category | text | ✓ |  |
| content | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `lessons_learned_pkey`: UNIQUE INDEX lessons_learned_pkey ON public.lessons_learned USING btree (id)

### community_cases

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('community_cases_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| code | text | ✓ |  |
| title | text |  |  |
| source | text | ✓ |  |
| received_date | date | ✓ |  |
| status | text |  | `'open'::text` |
| resolution | text | ✓ |  |
| closed_date | date | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `community_cases_pkey`: UNIQUE INDEX community_cases_pkey ON public.community_cases USING btree (id)

### tech_links

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('tech_links_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| category | text |  |  |
| title | text |  |  |
| url | text |  |  |
| embed | boolean | ✓ | `false` |
| note | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `tech_links_pkey`: UNIQUE INDEX tech_links_pkey ON public.tech_links USING btree (id)

## Đấu thầu

### tender_packages

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('tender_packages_id_seq'::regclass)` |
| code | text |  |  |
| name | text |  |  |
| scope | text | ✓ |  |
| due_date | date | ✓ |  |
| status | text |  | `'draft'::text` |
| awarded_bid_id | integer | ✓ |  |
| awarded_contract_id | integer | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| project_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `idx_tender_packages_project`: INDEX idx_tender_packages_project ON public.tender_packages USING btree (project_id)
- `tender_packages_code_key`: UNIQUE INDEX tender_packages_code_key ON public.tender_packages USING btree (code)
- `tender_packages_pkey`: UNIQUE INDEX tender_packages_pkey ON public.tender_packages USING btree (id)

### tender_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| tender_id | integer |  |  |
| boq_item_id | integer |  |  |
| qty | numeric(15,3) |  |  |

**Khóa ngoại:**
- `boq_item_id` → `boq_items(id)`
- `tender_id` → `tender_packages(id)`

**Index:**
- `tender_items_pkey`: UNIQUE INDEX tender_items_pkey ON public.tender_items USING btree (tender_id, boq_item_id)

### tender_bids

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('tender_bids_id_seq'::regclass)` |
| tender_id | integer |  |  |
| supplier_id | integer |  |  |
| lump_sum | numeric(15,2) | ✓ |  |
| note | text | ✓ |  |
| file_name | text | ✓ |  |
| original_name | text | ✓ |  |
| mime_type | text | ✓ |  |
| size_bytes | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `supplier_id` → `suppliers(id)`
- `tender_id` → `tender_packages(id)`

**Index:**
- `idx_tender_bids_tender`: INDEX idx_tender_bids_tender ON public.tender_bids USING btree (tender_id)
- `tender_bids_pkey`: UNIQUE INDEX tender_bids_pkey ON public.tender_bids USING btree (id)
- `tender_bids_tender_id_supplier_id_key`: UNIQUE INDEX tender_bids_tender_id_supplier_id_key ON public.tender_bids USING btree (tender_id, supplier_id)

### tender_bid_prices

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| bid_id | integer |  |  |
| boq_item_id | integer |  |  |
| unit_price | numeric(15,2) |  |  |

**Khóa ngoại:**
- `bid_id` → `tender_bids(id)`
- `boq_item_id` → `boq_items(id)`

**Index:**
- `tender_bid_prices_pkey`: UNIQUE INDEX tender_bid_prices_pkey ON public.tender_bid_prices USING btree (bid_id, boq_item_id)

## Phê duyệt (Approval Engine)

### approval_flows

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('approval_flows_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| entity_type | text |  |  |
| name | text |  |  |
| active | boolean |  | `true` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `approval_flows_pkey`: UNIQUE INDEX approval_flows_pkey ON public.approval_flows USING btree (id)
- `ux_flow_active`: UNIQUE INDEX ux_flow_active ON public.approval_flows USING btree (entity_type, COALESCE(project_id, 0)) WHERE active

### approval_steps

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('approval_steps_id_seq'::regclass)` |
| flow_id | integer |  |  |
| seq | integer |  |  |
| role | text |  |  |
| min_amount | numeric(15,2) | ✓ |  |
| sla_days | integer | ✓ |  |

**Khóa ngoại:**
- `flow_id` → `approval_flows(id)`

**Index:**
- `approval_steps_flow_id_seq_key`: UNIQUE INDEX approval_steps_flow_id_seq_key ON public.approval_steps USING btree (flow_id, seq)
- `approval_steps_pkey`: UNIQUE INDEX approval_steps_pkey ON public.approval_steps USING btree (id)

### approval_requests

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('approval_requests_id_seq'::regclass)` |
| flow_id | integer |  |  |
| entity_type | text |  |  |
| entity_id | integer |  |  |
| project_id | integer |  |  |
| amount | numeric(15,2) | ✓ |  |
| current_seq | integer |  | `1` |
| status | text |  | `'pending'::text` |
| created_by | integer |  |  |
| created_at | timestamptz |  | `now()` |
| decided_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `flow_id` → `approval_flows(id)`

**Index:**
- `approval_requests_pkey`: UNIQUE INDEX approval_requests_pkey ON public.approval_requests USING btree (id)
- `ux_request_live`: UNIQUE INDEX ux_request_live ON public.approval_requests USING btree (entity_type, entity_id) WHERE (status = 'pending'::text)

### approval_actions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('approval_actions_id_seq'::regclass)` |
| request_id | integer |  |  |
| step_seq | integer |  |  |
| actor_id | integer |  |  |
| decision | text |  |  |
| note | text | ✓ |  |
| at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `actor_id` → `users(id)`
- `request_id` → `approval_requests(id)`

**Index:**
- `approval_actions_pkey`: UNIQUE INDEX approval_actions_pkey ON public.approval_actions USING btree (id)
- `approval_actions_request_id_step_seq_key`: UNIQUE INDEX approval_actions_request_id_step_seq_key ON public.approval_actions USING btree (request_id, step_seq)

## Tích hợp hệ ngoài (Integrations)

### integrations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('integrations_id_seq'::regclass)` |
| provider | text |  |  |
| project_id | integer | ✓ |  |
| config | jsonb |  | `'{}'::jsonb` |
| active | boolean |  | `false` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `integrations_pkey`: UNIQUE INDEX integrations_pkey ON public.integrations USING btree (id)
- `integrations_provider_project_id_key`: UNIQUE INDEX integrations_provider_project_id_key ON public.integrations USING btree (provider, project_id)

### integration_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('integration_runs_id_seq'::regclass)` |
| integration_id | integer |  |  |
| started_at | timestamptz | ✓ | `now()` |
| finished_at | timestamptz | ✓ |  |
| status | text |  | `'running'::text` |
| stats | jsonb | ✓ |  |
| error | text | ✓ |  |

**Khóa ngoại:**
- `integration_id` → `integrations(id)`

**Index:**
- `integration_runs_pkey`: UNIQUE INDEX integration_runs_pkey ON public.integration_runs USING btree (id)

### sync_cursors

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| integration_id | integer |  |  |
| entity | text |  |  |
| last_local_id | bigint | ✓ |  |
| last_remote_key | text | ✓ |  |
| last_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `integration_id` → `integrations(id)`

**Index:**
- `sync_cursors_pkey`: UNIQUE INDEX sync_cursors_pkey ON public.sync_cursors USING btree (integration_id, entity)

### remote_links

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| entity_type | text |  |  |
| entity_id | bigint |  |  |
| integration_id | integer |  |  |
| remote_key | text |  |  |
| remote_status | text | ✓ |  |
| synced_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `integration_id` → `integrations(id)`

**Index:**
- `remote_links_pkey`: UNIQUE INDEX remote_links_pkey ON public.remote_links USING btree (entity_type, entity_id, integration_id)

## Hệ thống & audit

### audit_log

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | bigint |  | `nextval('audit_log_id_seq'::regclass)` |
| at | timestamptz |  | `now()` |
| actor_id | integer | ✓ |  |
| actor_role | text | ✓ |  |
| entity_type | text |  |  |
| entity_id | bigint |  |  |
| action | text |  |  |
| changes | jsonb | ✓ |  |
| project_id | integer | ✓ |  |
| request_id | text | ✓ |  |
| row_hash | text | ✓ |  |

**Index:**
- `audit_log_pkey`: UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)
- `idx_audit_at`: INDEX idx_audit_at ON public.audit_log USING btree (at DESC)
- `idx_audit_entity`: INDEX idx_audit_entity ON public.audit_log USING btree (entity_type, entity_id)

### assignment_log

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('assignment_log_id_seq'::regclass)` |
| level | text |  |  |
| target_id | integer |  |  |
| target_label | text | ✓ |  |
| prev_user_id | integer | ✓ |  |
| new_user_id | integer | ✓ |  |
| changed_by | integer | ✓ |  |
| is_manual | boolean | ✓ |  |
| changed_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `changed_by` → `users(id)`
- `new_user_id` → `users(id)`
- `prev_user_id` → `users(id)`

**Index:**
- `assignment_log_pkey`: UNIQUE INDEX assignment_log_pkey ON public.assignment_log USING btree (id)
- `idx_asgn_log_changed`: INDEX idx_asgn_log_changed ON public.assignment_log USING btree (changed_at DESC)
- `idx_asgn_log_target`: INDEX idx_asgn_log_target ON public.assignment_log USING btree (level, target_id)

### schema_migrations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| name | text |  |  |
| applied_at | timestamptz |  | `now()` |

**Index:**
- `schema_migrations_pkey`: UNIQUE INDEX schema_migrations_pkey ON public.schema_migrations USING btree (name)

### code_lists

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('code_lists_id_seq'::regclass)` |
| domain | text |  |  |
| code | text |  |  |
| label | text |  |  |
| sort | integer |  | `0` |
| active | boolean |  | `true` |
| meta | jsonb |  | `'{}'::jsonb` |

**Index:**
- `code_lists_domain_code_key`: UNIQUE INDEX code_lists_domain_code_key ON public.code_lists USING btree (domain, code)
- `code_lists_pkey`: UNIQUE INDEX code_lists_pkey ON public.code_lists USING btree (id)

## Khác (chưa gán module)

### alert_rules

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('alert_rules_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| metric | text |  |  |
| operator | text |  |  |
| threshold | numeric |  |  |
| channel | text |  | `'notification'::text` |
| active | boolean |  | `true` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `alert_rules_pkey`: UNIQUE INDEX alert_rules_pkey ON public.alert_rules USING btree (id)
- `ux_alert_rule_active`: UNIQUE INDEX ux_alert_rule_active ON public.alert_rules USING btree (metric, COALESCE(project_id, 0)) WHERE active

### api_keys

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('api_keys_id_seq'::regclass)` |
| name | text |  |  |
| key_hash | text |  |  |
| project_id | integer | ✓ |  |
| scopes | text[] |  | `'{read}'::text[]` |
| created_by | integer |  |  |
| created_at | timestamptz | ✓ | `now()` |
| last_used_at | timestamptz | ✓ |  |
| revoked_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `api_keys_key_hash_key`: UNIQUE INDEX api_keys_key_hash_key ON public.api_keys USING btree (key_hash)
- `api_keys_pkey`: UNIQUE INDEX api_keys_pkey ON public.api_keys USING btree (id)

### custom_field_defs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('custom_field_defs_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| entity_type | text |  |  |
| key | text |  |  |
| label | text |  |  |
| type | text |  |  |
| options | jsonb | ✓ |  |
| required | boolean |  | `false` |
| sort | integer |  | `0` |
| active | boolean |  | `true` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `custom_field_defs_pkey`: UNIQUE INDEX custom_field_defs_pkey ON public.custom_field_defs USING btree (id)
- `custom_field_defs_scope_key_uidx`: UNIQUE INDEX custom_field_defs_scope_key_uidx ON public.custom_field_defs USING btree (entity_type, COALESCE(project_id, 0), key)

### feature_flags

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| module_key | text |  |  |
| project_id | integer |  |  |
| enabled | boolean |  | `true` |
| updated_by | integer | ✓ |  |
| updated_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `updated_by` → `users(id)`

**Index:**
- `feature_flags_pkey`: UNIQUE INDEX feature_flags_pkey ON public.feature_flags USING btree (module_key, project_id)

### organizations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('organizations_id_seq'::regclass)` |
| name | text |  |  |
| tax_code | text | ✓ |  |

**Index:**
- `organizations_pkey`: UNIQUE INDEX organizations_pkey ON public.organizations USING btree (id)

### saved_reports

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('saved_reports_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| owner_id | integer |  |  |
| name | text |  |  |
| source | text |  |  |
| config | jsonb |  | `'{}'::jsonb` |
| shared | boolean |  | `false` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `owner_id` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `ix_saved_reports_owner`: INDEX ix_saved_reports_owner ON public.saved_reports USING btree (owner_id)
- `ix_saved_reports_project`: INDEX ix_saved_reports_project ON public.saved_reports USING btree (project_id)
- `saved_reports_pkey`: UNIQUE INDEX saved_reports_pkey ON public.saved_reports USING btree (id)

### sheet_versions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| sheet_type_id | integer |  |  |
| version | bigint |  | `1` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `sheet_type_id` → `sheet_types(id)`

**Index:**
- `sheet_versions_pkey`: UNIQUE INDEX sheet_versions_pkey ON public.sheet_versions USING btree (sheet_type_id)

### totp_recovery_codes

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | bigint |  | `nextval('totp_recovery_codes_id_seq'::regclass)` |
| user_id | integer |  |  |
| code_hash | text |  |  |
| used_at | timestamptz | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `user_id` → `users(id)`

**Index:**
- `idx_totp_recovery_codes_user`: INDEX idx_totp_recovery_codes_user ON public.totp_recovery_codes USING btree (user_id)
- `totp_recovery_codes_pkey`: UNIQUE INDEX totp_recovery_codes_pkey ON public.totp_recovery_codes USING btree (id)

### webhook_deliveries

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | bigint |  | `nextval('webhook_deliveries_id_seq'::regclass)` |
| webhook_id | integer |  |  |
| event | text |  |  |
| payload | jsonb |  |  |
| status | text |  | `'pending'::text` |
| attempts | integer |  | `0` |
| last_error | text | ✓ |  |
| next_retry_at | timestamptz | ✓ | `now()` |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `webhook_id` → `webhooks(id)`

**Index:**
- `idx_webhook_deliveries_due`: INDEX idx_webhook_deliveries_due ON public.webhook_deliveries USING btree (next_retry_at) WHERE (status = 'pending'::text)
- `webhook_deliveries_pkey`: UNIQUE INDEX webhook_deliveries_pkey ON public.webhook_deliveries USING btree (id)

### webhooks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('webhooks_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| url | text |  |  |
| secret | text |  |  |
| events | text[] |  |  |
| active | boolean |  | `true` |
| created_by | integer |  |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `webhooks_pkey`: UNIQUE INDEX webhooks_pkey ON public.webhooks USING btree (id)

