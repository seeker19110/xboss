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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`

**Index:**
- `projects_org_code_key`: UNIQUE INDEX projects_org_code_key ON public.projects USING btree (org_id, code)
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
| import_batch_id | integer | ✓ |  |
| dim_denominator_mode | text | ✓ |  |

**Khóa ngoại:**
- `assigned_to` → `users(id)`
- `import_batch_id` → `import_batches(id)`
- `package_id` → `work_packages(id)`

**Index:**
- `idx_tasks_assigned`: INDEX idx_tasks_assigned ON public.tasks USING btree (assigned_to)
- `idx_tasks_boq_lower`: INDEX idx_tasks_boq_lower ON public.tasks USING btree (lower(boq_code)) WHERE (boq_code IS NOT NULL)
- `idx_tasks_code_lower`: INDEX idx_tasks_code_lower ON public.tasks USING btree (lower(code))
- `idx_tasks_end`: INDEX idx_tasks_end ON public.tasks USING btree (end_date)
- `idx_tasks_fts`: INDEX idx_tasks_fts ON public.tasks USING gin (to_tsvector('simple'::regconfig, COALESCE(name, ''::text)))
- `idx_tasks_fts_ua`: INDEX idx_tasks_fts_ua ON public.tasks USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((((COALESCE(code, ''::text) || ' '::text) || COALESCE(boq_code, ''::text)) || ' '::text) || COALESCE(name, ''::text)))))
- `idx_tasks_import_batch`: INDEX idx_tasks_import_batch ON public.tasks USING btree (import_batch_id)
- `idx_tasks_package`: INDEX idx_tasks_package ON public.tasks USING btree (package_id)
- `idx_tasks_start`: INDEX idx_tasks_start ON public.tasks USING btree (start_date)
- `idx_tasks_status`: INDEX idx_tasks_status ON public.tasks USING btree (status)
- `idx_tasks_updated_at`: INDEX idx_tasks_updated_at ON public.tasks USING btree (updated_at DESC)
- `tasks_package_id_code_key`: UNIQUE INDEX tasks_package_id_code_key ON public.tasks USING btree (package_id, code)
- `tasks_pkey`: UNIQUE INDEX tasks_pkey ON public.tasks USING btree (id)

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

### system_uploads

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('system_uploads_id_seq'::regclass)` |
| system_id | integer |  |  |
| project_id | integer | ✓ |  |
| kind | text |  |  |
| file_name | text |  |  |
| original_name | text | ✓ |  |
| uploaded_by | integer | ✓ |  |
| row_count | integer |  | `0` |
| matched_count | integer |  | `0` |
| unmatched_count | integer |  | `0` |
| warnings | jsonb |  | `'[]'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `system_id` → `systems(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `idx_system_uploads_system`: INDEX idx_system_uploads_system ON public.system_uploads USING btree (project_id, system_id, kind, created_at DESC)
- `system_uploads_pkey`: UNIQUE INDEX system_uploads_pkey ON public.system_uploads USING btree (id)

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
| session_version | integer |  | `0` |
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`
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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`
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
| sha256 | text | ✓ |  |

**Khóa ngoại:**
- `album_id` → `progress_albums(id)`
- `ncr_id` → `ncrs(id)`
- `task_id` → `tasks(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `idx_photos_album`: INDEX idx_photos_album ON public.task_photos USING btree (album_id)
- `idx_photos_task`: INDEX idx_photos_task ON public.task_photos USING btree (task_id)
- `idx_task_photos_task_hash`: INDEX idx_task_photos_task_hash ON public.task_photos USING btree (task_id, sha256) WHERE (sha256 IS NOT NULL)
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
| extracted_text | text | ✓ |  |

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
| org_id | integer |  |  |

**Khóa ngoại:**
- `org_id` → `organizations(id)`

**Index:**
- `boq_codes_pkey`: UNIQUE INDEX boq_codes_pkey ON public.boq_codes USING btree (org_id, code)
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
| extracted_text | text | ✓ |  |

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
| unit_price | numeric(15,2) | ✓ |  |
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
| idempotency_key | text | ✓ |  |

**Khóa ngoại:**
- `po_id` → `purchase_orders(id)`
- `received_by` → `users(id)`

**Index:**
- `idx_receipt_po`: INDEX idx_receipt_po ON public.warehouse_receipts USING btree (po_id)
- `warehouse_receipts_idem_key`: UNIQUE INDEX warehouse_receipts_idem_key ON public.warehouse_receipts USING btree (po_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)
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
| system_id | integer | ✓ |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `sheet_type_id` → `sheet_types(id)`
- `system_id` → `systems(id)`
- `task_id` → `tasks(id)`

**Index:**
- `idx_materials_fts`: INDEX idx_materials_fts ON public.materials USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((COALESCE(boq_code, ''::text) || ' '::text) || COALESCE(name, ''::text)))))
- `idx_materials_project`: INDEX idx_materials_project ON public.materials USING btree (project_id)
- `idx_materials_sheet`: INDEX idx_materials_sheet ON public.materials USING btree (sheet_type_id)
- `idx_materials_system`: INDEX idx_materials_system ON public.materials USING btree (system_id)
- `idx_materials_updated_at`: INDEX idx_materials_updated_at ON public.materials USING btree (updated_at DESC)
- `materials_pkey`: UNIQUE INDEX materials_pkey ON public.materials USING btree (id)

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
| idempotency_key | text | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `material_id` → `materials(id)`
- `receipt_item_id` → `receipt_items(id)`
- `task_id` → `tasks(id)`

**Index:**
- `idx_mat_trans`: INDEX idx_mat_trans ON public.material_transactions USING btree (material_id)
- `idx_mat_trans_floor`: INDEX idx_mat_trans_floor ON public.material_transactions USING btree (floor_label) WHERE (floor_label IS NOT NULL)
- `idx_mat_trans_type`: INDEX idx_mat_trans_type ON public.material_transactions USING btree (type)
- `material_transactions_idem_key`: UNIQUE INDEX material_transactions_idem_key ON public.material_transactions USING btree (material_id, type, idempotency_key) WHERE (idempotency_key IS NOT NULL)
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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`

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
| iso_path | text | ✓ |  |
| rule_pack_version | text | ✓ |  |
| standardize_report | jsonb | ✓ |  |
| source_tool | text | ✓ |  |
| content_sha256 | text | ✓ |  |

**Khóa ngoại:**
- `drawing_id` → `drawings(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `drawing_revisions_drawing_id_rev_key`: UNIQUE INDEX drawing_revisions_drawing_id_rev_key ON public.drawing_revisions USING btree (drawing_id, rev)
- `drawing_revisions_pkey`: UNIQUE INDEX drawing_revisions_pkey ON public.drawing_revisions USING btree (id)
- `idx_drawing_revisions_drawing`: INDEX idx_drawing_revisions_drawing ON public.drawing_revisions USING btree (drawing_id)
- `idx_drawing_revisions_hash`: INDEX idx_drawing_revisions_hash ON public.drawing_revisions USING btree (drawing_id, content_sha256)

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
| extracted_text | text | ✓ |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `uploaded_by` → `users(id)`

**Index:**
- `idx_project_documents_fts`: INDEX idx_project_documents_fts ON public.project_documents USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(COALESCE(title, ''::text))))
- `idx_project_documents_fts_text`: INDEX idx_project_documents_fts_text ON public.project_documents USING gin (to_tsvector('simple'::regconfig, xboss_unaccent(((COALESCE(title, ''::text) || ' '::text) || COALESCE(extracted_text, ''::text)))))
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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`
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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`
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
| entity_id | bigint | ✓ |  |
| action | text |  |  |
| changes | jsonb | ✓ |  |
| project_id | integer | ✓ |  |
| request_id | text | ✓ |  |
| row_hash | text | ✓ |  |
| entity_key | text | ✓ |  |

**Index:**
- `audit_log_pkey`: UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)
- `idx_audit_at`: INDEX idx_audit_at ON public.audit_log USING btree (at DESC)
- `idx_audit_entity`: INDEX idx_audit_entity ON public.audit_log USING btree (entity_type, entity_id)
- `idx_audit_entity_key`: INDEX idx_audit_entity_key ON public.audit_log USING btree (entity_type, entity_key, at DESC)

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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`

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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `org_id` → `organizations(id)`
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
| org_id | integer |  | `1` |
| expires_at | timestamptz | ✓ |  |
| device_name | text | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `org_id` → `organizations(id)`
- `project_id` → `projects(id)`

**Index:**
- `api_keys_key_hash_key`: UNIQUE INDEX api_keys_key_hash_key ON public.api_keys USING btree (key_hash)
- `api_keys_pkey`: UNIQUE INDEX api_keys_pkey ON public.api_keys USING btree (id)

### cad_block_libs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | bigint |  | `nextval('cad_block_libs_id_seq'::regclass)` |
| version | text |  |  |
| manifest | jsonb |  |  |
| storage_key | text |  |  |
| dwg_sha256 | text |  |  |
| published_by | bigint | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |

**Khóa ngoại:**
- `published_by` → `users(id)`

**Index:**
- `cad_block_libs_pkey`: UNIQUE INDEX cad_block_libs_pkey ON public.cad_block_libs USING btree (id)
- `cad_block_libs_version_key`: UNIQUE INDEX cad_block_libs_version_key ON public.cad_block_libs USING btree (version)
- `idx_cad_block_libs_moi_nhat`: INDEX idx_cad_block_libs_moi_nhat ON public.cad_block_libs USING btree (id DESC)

### cad_block_proposals

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('cad_block_proposals_id_seq'::regclass)` |
| block_name | text |  |  |
| kind | text |  |  |
| system_id | text | ✓ |  |
| takeoff_item_id | text | ✓ |  |
| paper_size | text | ✓ |  |
| note | text | ✓ |  |
| base_lib_version | text |  |  |
| candidate_manifest | jsonb |  |  |
| candidate_storage_key | text |  |  |
| candidate_dwg_sha256 | text |  |  |
| preview_svg | text | ✓ |  |
| status | text |  | `'pending'::text` |
| reject_reason | text | ✓ |  |
| published_version | text | ✓ |  |
| proposed_by | integer |  |  |
| decided_by | integer | ✓ |  |
| decided_at | timestamptz | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `decided_by` → `users(id)`
- `proposed_by` → `users(id)`

**Index:**
- `cad_block_proposals_pkey`: UNIQUE INDEX cad_block_proposals_pkey ON public.cad_block_proposals USING btree (id)
- `idx_cad_block_proposals_status`: INDEX idx_cad_block_proposals_status ON public.cad_block_proposals USING btree (status)

### cad_device_pairings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('cad_device_pairings_id_seq'::regclass)` |
| user_code | text |  |  |
| device_code_hash | text |  |  |
| device_name | text |  |  |
| status | text |  | `'pending'::text` |
| confirmed_by | integer | ✓ |  |
| api_key_id | integer | ✓ |  |
| created_at | timestamptz | ✓ | `now()` |
| expires_at | timestamptz |  |  |

**Khóa ngoại:**
- `api_key_id` → `api_keys(id)`
- `confirmed_by` → `users(id)`

**Index:**
- `cad_device_pairings_device_code_hash_key`: UNIQUE INDEX cad_device_pairings_device_code_hash_key ON public.cad_device_pairings USING btree (device_code_hash)
- `cad_device_pairings_pkey`: UNIQUE INDEX cad_device_pairings_pkey ON public.cad_device_pairings USING btree (id)
- `cad_device_pairings_user_code_key`: UNIQUE INDEX cad_device_pairings_user_code_key ON public.cad_device_pairings USING btree (user_code)

### cad_takeoff_boq_map

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('cad_takeoff_boq_map_id_seq'::regclass)` |
| project_id | integer |  |  |
| takeoff_item_id | text |  |  |
| boq_code | text |  |  |
| updated_by | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `updated_by` → `users(id)`

**Index:**
- `cad_takeoff_boq_map_pkey`: UNIQUE INDEX cad_takeoff_boq_map_pkey ON public.cad_takeoff_boq_map USING btree (id)
- `idx_cad_takeoff_boq_map_project`: INDEX idx_cad_takeoff_boq_map_project ON public.cad_takeoff_boq_map USING btree (project_id)
- `uniq_cad_takeoff_boq_map`: UNIQUE INDEX uniq_cad_takeoff_boq_map ON public.cad_takeoff_boq_map USING btree (project_id, takeoff_item_id)

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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`
- `project_id` → `projects(id)`

**Index:**
- `custom_field_defs_pkey`: UNIQUE INDEX custom_field_defs_pkey ON public.custom_field_defs USING btree (id)
- `custom_field_defs_scope_key_uidx`: UNIQUE INDEX custom_field_defs_scope_key_uidx ON public.custom_field_defs USING btree (entity_type, COALESCE(project_id, 0), key)

### engineering_agent_claims

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| session_id | uuid |  |  |
| agent_role | text |  |  |
| agent_name | text |  |  |
| topic | text |  |  |
| claim | text |  |  |
| payload | jsonb |  | `'{}'::jsonb` |
| assumptions | jsonb |  | `'[]'::jsonb` |
| confidence | text |  | `'unknown'::text` |
| confidence_signals | jsonb |  | `'{}'::jsonb` |
| source_authority | text |  | `'derived'::text` |
| source_revision_id | uuid | ✓ |  |
| round | integer |  | `1` |
| created_at | timestamptz |  | `now()` |
| project_id | integer |  |  |

**Khóa ngoại:**
- `project_id` → `engineering_agent_sessions(project_id)`
- `project_id` → `engineering_source_revisions(project_id)`
- `session_id` → `engineering_agent_sessions(id)`
- `session_id` → `engineering_agent_sessions(id)`
- `source_revision_id` → `engineering_source_revisions(id)`
- `source_revision_id` → `engineering_source_revisions(id)`

**Index:**
- `engineering_agent_claims_pkey`: UNIQUE INDEX engineering_agent_claims_pkey ON public.engineering_agent_claims USING btree (id)
- `idx_eng_ac_session`: INDEX idx_eng_ac_session ON public.engineering_agent_claims USING btree (session_id, topic)
- `idx_engineering_agent_claims_project`: INDEX idx_engineering_agent_claims_project ON public.engineering_agent_claims USING btree (project_id)

### engineering_agent_debate_sessions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| session_code | text |  |  |
| topic_title | text |  |  |
| issue_description | text |  |  |
| agent_perspectives | jsonb |  | `'[]'::jsonb` |
| consensus_verdict | text |  |  |
| recommended_actions | jsonb |  | `'[]'::jsonb` |
| consensus_token | text |  |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_agent_debate_sessions_pkey`: UNIQUE INDEX engineering_agent_debate_sessions_pkey ON public.engineering_agent_debate_sessions USING btree (id)
- `idx_agent_debate_proj`: INDEX idx_agent_debate_proj ON public.engineering_agent_debate_sessions USING btree (project_id, created_at DESC)
- `uq_agent_debate_code`: UNIQUE INDEX uq_agent_debate_code ON public.engineering_agent_debate_sessions USING btree (project_id, session_code)

### engineering_agent_sessions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| intent | text |  |  |
| consensus | text |  | `'pending'::text` |
| status | text |  | `'open'::text` |
| max_rounds | integer |  | `5` |
| round_count | integer |  | `0` |
| conflict_budget | integer |  | `10` |
| reconciled_plan | jsonb | ✓ |  |
| workflow_id | uuid | ✓ |  |
| trace_id | text | ✓ |  |
| api_key_id | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `api_key_id` → `api_keys(id)`
- `project_id` → `projects(id)`
- `project_id` → `engineering_workflows(project_id)`
- `workflow_id` → `engineering_workflows(id)`
- `workflow_id` → `engineering_workflows(id)`

**Index:**
- `engineering_agent_sessions_pkey`: UNIQUE INDEX engineering_agent_sessions_pkey ON public.engineering_agent_sessions USING btree (id)
- `idx_eng_as_project`: INDEX idx_eng_as_project ON public.engineering_agent_sessions USING btree (project_id, status)
- `uq_engineering_agent_sessions_id_project`: UNIQUE INDEX uq_engineering_agent_sessions_id_project ON public.engineering_agent_sessions USING btree (id, project_id)

### engineering_apex_command_actions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| action_type | text |  |  |
| initiated_by | bigint | ✓ |  |
| action_payload | jsonb |  | `'{}'::jsonb` |
| result_status | text |  | `'COMPLETED'::text` |
| result_summary | text | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `initiated_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_apex_command_actions_pkey`: UNIQUE INDEX engineering_apex_command_actions_pkey ON public.engineering_apex_command_actions USING btree (id)
- `idx_engineering_apex_actions_project`: INDEX idx_engineering_apex_actions_project ON public.engineering_apex_command_actions USING btree (project_id)

### engineering_apex_system_pulses

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| apex_index | numeric(5,2) |  | `95.00` |
| spatial_score | numeric(5,2) |  | `95.00` |
| financial_score | numeric(5,2) |  | `95.00` |
| legal_score | numeric(5,2) |  | `95.00` |
| site_score | numeric(5,2) |  | `95.00` |
| agent_score | numeric(5,2) |  | `95.00` |
| status_tier | text |  | `'OPTIMAL'::text` |
| pulse_summary | jsonb |  | `'{}'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_apex_system_pulses_pkey`: UNIQUE INDEX engineering_apex_system_pulses_pkey ON public.engineering_apex_system_pulses USING btree (id)
- `idx_engineering_apex_pulses_created`: INDEX idx_engineering_apex_pulses_created ON public.engineering_apex_system_pulses USING btree (created_at DESC)
- `idx_engineering_apex_pulses_project`: INDEX idx_engineering_apex_pulses_project ON public.engineering_apex_system_pulses USING btree (project_id)

### engineering_async_tasks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| task_type | varchar(64) |  |  |
| status | varchar(32) |  | `'pending'::character varying` |
| priority | integer |  | `0` |
| payload | jsonb |  | `'{}'::jsonb` |
| progress_percent | numeric(5,2) |  | `0.00` |
| worker_id | varchar(128) | ✓ |  |
| lease_expires_at | timestamptz | ✓ |  |
| retry_count | integer |  | `0` |
| max_retries | integer |  | `3` |
| result | jsonb | ✓ |  |
| error_message | text | ✓ |  |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| updated_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_async_tasks_pkey`: UNIQUE INDEX engineering_async_tasks_pkey ON public.engineering_async_tasks USING btree (id)
- `idx_async_tasks_queue`: INDEX idx_async_tasks_queue ON public.engineering_async_tasks USING btree (project_id, status, priority DESC, created_at)

### engineering_auto_routes

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| system_type | text |  |  |
| start_point | jsonb |  |  |
| end_point | jsonb |  |  |
| waypoints | jsonb |  | `'[]'::jsonb` |
| obstacles | jsonb |  | `'[]'::jsonb` |
| total_length_m | numeric(10,3) |  |  |
| elbow_count | integer |  | `0` |
| head_loss_pa | numeric(10,2) |  | `0` |
| status | text |  | `'computed'::text` |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_auto_routes_pkey`: UNIQUE INDEX engineering_auto_routes_pkey ON public.engineering_auto_routes USING btree (id)
- `idx_auto_routes_proj_sys`: INDEX idx_auto_routes_proj_sys ON public.engineering_auto_routes USING btree (project_id, system_type)

### engineering_autonomy_capabilities

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| key | text |  |  |
| label | text |  |  |
| max_autonomy_level | text |  |  |
| risk_class | text |  |  |
| is_reversible | boolean |  | `true` |
| is_active | boolean |  | `true` |
| created_at | timestamptz |  | `now()` |

**Index:**
- `engineering_autonomy_capabilities_pkey`: UNIQUE INDEX engineering_autonomy_capabilities_pkey ON public.engineering_autonomy_capabilities USING btree (key)

### engineering_autonomy_kill_switches

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer | ✓ |  |
| capability_key | text | ✓ |  |
| is_active | boolean |  | `true` |
| reason | text |  |  |
| activated_by | integer | ✓ |  |
| activated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `activated_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_autonomy_kill_switches_pkey`: UNIQUE INDEX engineering_autonomy_kill_switches_pkey ON public.engineering_autonomy_kill_switches USING btree (id)
- `idx_eng_kill_switches_active`: INDEX idx_eng_kill_switches_active ON public.engineering_autonomy_kill_switches USING btree (project_id, is_active)

### engineering_autonomy_policies

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| capability_key | text |  |  |
| max_level | text |  |  |
| allowed_roles | text[] |  | `'{admin,pm}'::text[]` |
| max_budget | numeric | ✓ |  |
| rate_limit_hourly | integer |  | `50` |
| approval_mode | text |  | `'manual'::text` |
| is_active | boolean |  | `true` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `capability_key` → `engineering_autonomy_capabilities(key)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_autonomy_policies_pkey`: UNIQUE INDEX engineering_autonomy_policies_pkey ON public.engineering_autonomy_policies USING btree (id)
- `engineering_autonomy_policies_project_id_capability_key_key`: UNIQUE INDEX engineering_autonomy_policies_project_id_capability_key_key ON public.engineering_autonomy_policies USING btree (project_id, capability_key)
- `idx_eng_autonomy_policies_lookup`: INDEX idx_eng_autonomy_policies_lookup ON public.engineering_autonomy_policies USING btree (project_id, capability_key, is_active)

### engineering_bcf_issues

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| bcf_code | text |  |  |
| title | text |  |  |
| description | text | ✓ |  |
| discipline | text |  | `'combined'::text` |
| issue_type | text |  | `'clash'::text` |
| severity | text |  | `'medium'::text` |
| status | text |  | `'open'::text` |
| camera_position | jsonb | ✓ |  |
| camera_direction | jsonb | ✓ |  |
| camera_up | jsonb | ✓ |  |
| camera_fov_deg | numeric(5,2) | ✓ | `60.0` |
| clash_element_a_guid | text | ✓ |  |
| clash_element_b_guid | text | ✓ |  |
| linked_clash_code | text | ✓ |  |
| linked_spool_code | text | ✓ |  |
| assigned_to | bigint | ✓ |  |
| due_date | date | ✓ |  |
| resolved_by | bigint | ✓ |  |
| resolved_at | timestamptz | ✓ |  |
| resolution_note | text | ✓ |  |
| attachments | jsonb |  | `'[]'::jsonb` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `assigned_to` → `users(id)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `resolved_by` → `users(id)`

**Index:**
- `engineering_bcf_issues_pkey`: UNIQUE INDEX engineering_bcf_issues_pkey ON public.engineering_bcf_issues USING btree (id)
- `engineering_bcf_issues_project_id_bcf_code_key`: UNIQUE INDEX engineering_bcf_issues_project_id_bcf_code_key ON public.engineering_bcf_issues USING btree (project_id, bcf_code)
- `idx_bcf_issues_assignee`: INDEX idx_bcf_issues_assignee ON public.engineering_bcf_issues USING btree (assigned_to)
- `idx_bcf_issues_project`: INDEX idx_bcf_issues_project ON public.engineering_bcf_issues USING btree (project_id, created_at DESC)
- `idx_bcf_issues_severity`: INDEX idx_bcf_issues_severity ON public.engineering_bcf_issues USING btree (project_id, severity)
- `idx_bcf_issues_status`: INDEX idx_bcf_issues_status ON public.engineering_bcf_issues USING btree (project_id, status)

### engineering_bidding_analysis_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| package_id | uuid |  |  |
| variance_matrix | jsonb |  | `'{}'::jsonb` |
| skew_metrics | jsonb |  | `'{}'::jsonb` |
| ranking_results | jsonb |  | `'[]'::jsonb` |
| recommendation_summary | text |  |  |
| provenance_token | text |  |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `package_id` → `engineering_bidding_packages(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_bidding_analysis_runs_pkey`: UNIQUE INDEX engineering_bidding_analysis_runs_pkey ON public.engineering_bidding_analysis_runs USING btree (id)
- `idx_bidding_analysis_pkg`: INDEX idx_bidding_analysis_pkg ON public.engineering_bidding_analysis_runs USING btree (project_id, package_id)

### engineering_bidding_packages

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| package_code | text |  |  |
| title | text |  |  |
| discipline | text |  |  |
| target_budget_vnd | bigint |  | `0` |
| status | text |  | `'draft'::text` |
| rfq_specs | jsonb |  | `'{}'::jsonb` |
| awarded_vendor | text | ✓ |  |
| awarded_amount_vnd | bigint | ✓ |  |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| updated_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_bidding_packages_pkey`: UNIQUE INDEX engineering_bidding_packages_pkey ON public.engineering_bidding_packages USING btree (id)
- `idx_bidding_pkg_proj_code`: INDEX idx_bidding_pkg_proj_code ON public.engineering_bidding_packages USING btree (project_id, package_code)

### engineering_bidding_vendor_quotes

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| package_id | uuid |  |  |
| vendor_name | text |  |  |
| vendor_type | text |  | `'subcontractor'::text` |
| total_amount_vnd | bigint |  | `0` |
| line_items | jsonb |  | `'[]'::jsonb` |
| capacity_score | numeric(5,2) |  | `80.0` |
| safety_score | numeric(5,2) |  | `85.0` |
| technical_compliance_score | numeric(5,2) |  | `80.0` |
| submitted_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| status | text |  | `'submitted'::text` |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| supplier_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `package_id` → `engineering_bidding_packages(id)`
- `project_id` → `projects(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `engineering_bidding_vendor_quotes_pkey`: UNIQUE INDEX engineering_bidding_vendor_quotes_pkey ON public.engineering_bidding_vendor_quotes USING btree (id)
- `engineering_bidding_vendor_quotes_supplier_idx`: INDEX engineering_bidding_vendor_quotes_supplier_idx ON public.engineering_bidding_vendor_quotes USING btree (supplier_id)
- `idx_bidding_quotes_pkg`: INDEX idx_bidding_quotes_pkg ON public.engineering_bidding_vendor_quotes USING btree (project_id, package_id, status)

### engineering_bim_4d_simulations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| model_id | uuid |  |  |
| title | text |  |  |
| start_date | date |  |  |
| end_date | date |  |  |
| current_time_step | integer |  | `0` |
| settings | jsonb |  | `'{"showGhost": true, "colorScheme": "status", "playbackSpeed": 1}'::jsonb` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `model_id` → `engineering_bim_models(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_bim_4d_simulations_pkey`: UNIQUE INDEX engineering_bim_4d_simulations_pkey ON public.engineering_bim_4d_simulations USING btree (id)
- `idx_engineering_bim_4d_simulations_project`: INDEX idx_engineering_bim_4d_simulations_project ON public.engineering_bim_4d_simulations USING btree (project_id)

### engineering_bim_elements

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| model_id | uuid |  |  |
| project_id | bigint |  |  |
| guid | text |  |  |
| element_type | text |  |  |
| system_type | text |  | `'HVAC_SUPPLY'::text` |
| name | text |  |  |
| geometry_data | jsonb |  |  |
| properties | jsonb |  | `'{}'::jsonb` |
| wbs_task_id | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `model_id` → `engineering_bim_models(id)`
- `project_id` → `projects(id)`
- `wbs_task_id` → `tasks(id)`

**Index:**
- `engineering_bim_elements_pkey`: UNIQUE INDEX engineering_bim_elements_pkey ON public.engineering_bim_elements USING btree (id)
- `idx_engineering_bim_elements_model`: INDEX idx_engineering_bim_elements_model ON public.engineering_bim_elements USING btree (model_id)
- `idx_engineering_bim_elements_project`: INDEX idx_engineering_bim_elements_project ON public.engineering_bim_elements USING btree (project_id)
- `idx_engineering_bim_elements_system`: INDEX idx_engineering_bim_elements_system ON public.engineering_bim_elements USING btree (project_id, system_type)
- `idx_engineering_bim_elements_wbs_task`: INDEX idx_engineering_bim_elements_wbs_task ON public.engineering_bim_elements USING btree (wbs_task_id)
- `uq_bim_element_model_guid`: UNIQUE INDEX uq_bim_element_model_guid ON public.engineering_bim_elements USING btree (model_id, guid)

### engineering_bim_models

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| name | text |  |  |
| discipline | text |  | `'mepf'::text` |
| floor_id | bigint | ✓ |  |
| format | text |  | `'json_mesh'::text` |
| file_url | text | ✓ |  |
| file_hash | text | ✓ |  |
| element_count | integer |  | `0` |
| bounding_box | jsonb |  | `'{"max": [100, 100, 30], "min": [0, 0, 0]}'::jsonb` |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_bim_models_pkey`: UNIQUE INDEX engineering_bim_models_pkey ON public.engineering_bim_models USING btree (id)
- `idx_engineering_bim_models_discipline`: INDEX idx_engineering_bim_models_discipline ON public.engineering_bim_models USING btree (project_id, discipline)
- `idx_engineering_bim_models_project`: INDEX idx_engineering_bim_models_project ON public.engineering_bim_models USING btree (project_id)

### engineering_bim_routing_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| routing_code | text |  |  |
| discipline | text |  | `'hvac'::text` |
| system_code | text | ✓ |  |
| grid_cell_size_mm | numeric(8,2) |  | `100.0` |
| start_point | jsonb |  | `'{}'::jsonb` |
| end_point | jsonb |  | `'{}'::jsonb` |
| path_points | jsonb |  | `'[]'::jsonb` |
| total_length_m | numeric(12,3) | ✓ |  |
| elbow_count | integer | ✓ | `0` |
| warnings | jsonb |  | `'[]'::jsonb` |
| violates_gravity_slope | boolean |  | `false` |
| violates_structural_zone | boolean |  | `false` |
| routing_status | text |  | `'success'::text` |
| linked_spool_code | text | ✓ |  |
| bcf_issue_id | uuid | ✓ |  |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `bcf_issue_id` → `engineering_bcf_issues(id)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_bim_routing_runs_pkey`: UNIQUE INDEX engineering_bim_routing_runs_pkey ON public.engineering_bim_routing_runs USING btree (id)
- `engineering_bim_routing_runs_project_id_routing_code_key`: UNIQUE INDEX engineering_bim_routing_runs_project_id_routing_code_key ON public.engineering_bim_routing_runs USING btree (project_id, routing_code)
- `idx_bim_routing_runs_project`: INDEX idx_bim_routing_runs_project ON public.engineering_bim_routing_runs USING btree (project_id, created_at DESC)
- `idx_bim_routing_runs_status`: INDEX idx_bim_routing_runs_status ON public.engineering_bim_routing_runs USING btree (project_id, routing_status)

### engineering_cad_block_catalogs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| block_name | text |  |  |
| discipline | text |  |  |
| category | text |  |  |
| attribute_schema | jsonb |  | `'{}'::jsonb` |
| mapped_boq_code | text | ✓ |  |
| mapped_material_id | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `mapped_material_id` → `materials(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_cad_block_catalogs_pkey`: UNIQUE INDEX engineering_cad_block_catalogs_pkey ON public.engineering_cad_block_catalogs USING btree (id)
- `idx_cad_block_catalogs_proj`: INDEX idx_cad_block_catalogs_proj ON public.engineering_cad_block_catalogs USING btree (project_id, discipline)
- `uq_cad_block_project_name`: UNIQUE INDEX uq_cad_block_project_name ON public.engineering_cad_block_catalogs USING btree (project_id, block_name)

### engineering_cad_diff_sessions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| base_drawing_id | bigint | ✓ |  |
| compare_drawing_id | bigint | ✓ |  |
| total_entities_base | integer |  | `0` |
| total_entities_compare | integer |  | `0` |
| diff_summary | jsonb |  | `'{"added": 0, "removed": 0, "modified": 0, "unchanged": 0}'::jsonb` |
| diff_details | jsonb |  | `'[]'::jsonb` |
| potential_vo_impact | jsonb |  | `'{"risk_level": "low", "estimated_cost_vnd": 0}'::jsonb` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `base_drawing_id` → `drawings(id)`
- `compare_drawing_id` → `drawings(id)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_cad_diff_sessions_pkey`: UNIQUE INDEX engineering_cad_diff_sessions_pkey ON public.engineering_cad_diff_sessions USING btree (id)
- `idx_cad_diff_sessions_proj`: INDEX idx_cad_diff_sessions_proj ON public.engineering_cad_diff_sessions USING btree (project_id, created_at DESC)

### engineering_cad_lisp_templates

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| template_code | text |  |  |
| title | text |  |  |
| detail_category | text |  |  |
| lisp_code_template | text |  |  |
| parameter_schema | jsonb |  | `'{}'::jsonb` |
| is_active | boolean |  | `true` |
| created_at | timestamptz |  | `now()` |

**Index:**
- `engineering_cad_lisp_templates_pkey`: UNIQUE INDEX engineering_cad_lisp_templates_pkey ON public.engineering_cad_lisp_templates USING btree (id)
- `engineering_cad_lisp_templates_template_code_key`: UNIQUE INDEX engineering_cad_lisp_templates_template_code_key ON public.engineering_cad_lisp_templates USING btree (template_code)

### engineering_cad_qto_variances

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| boq_item_id | integer |  |  |
| qty_contract | numeric(15,3) |  | `0` |
| qty_shop_cad | numeric(15,3) |  | `0` |
| qty_installed | numeric(15,3) |  | `0` |
| qty_approved_bbnt | numeric(15,3) |  | `0` |
| delta_vo_qty | numeric(15,3) | ✓ |  |
| estimated_vo_vnd | numeric(18,2) |  | `0` |
| status | text |  | `'normal'::text` |
| last_calculated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `boq_item_id` → `boq_items(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_cad_qto_variances_pkey`: UNIQUE INDEX engineering_cad_qto_variances_pkey ON public.engineering_cad_qto_variances USING btree (id)
- `uq_cad_qto_variance_proj_boq`: UNIQUE INDEX uq_cad_qto_variance_proj_boq ON public.engineering_cad_qto_variances USING btree (project_id, boq_item_id)

### engineering_cad_spools

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| drawing_id | integer | ✓ |  |
| spool_code | text |  |  |
| discipline | text |  |  |
| system_code | text |  |  |
| floor_label | text |  |  |
| zone_label | text |  | `'Main'::text` |
| dimension_spec | text |  |  |
| length_m | numeric(12,3) |  | `0` |
| calculated_qty | numeric(15,3) |  | `0` |
| unit | text |  |  |
| boq_item_id | integer | ✓ |  |
| task_id | integer | ✓ |  |
| status | text |  | `'fabricated'::text` |
| inspection_request_id | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `boq_item_id` → `boq_items(id)`
- `drawing_id` → `drawings(id)`
- `inspection_request_id` → `inspection_requests(id)`
- `project_id` → `projects(id)`
- `task_id` → `tasks(id)`

**Index:**
- `engineering_cad_spools_pkey`: UNIQUE INDEX engineering_cad_spools_pkey ON public.engineering_cad_spools USING btree (id)
- `idx_cad_spools_boq`: INDEX idx_cad_spools_boq ON public.engineering_cad_spools USING btree (boq_item_id)
- `idx_cad_spools_floor_zone`: INDEX idx_cad_spools_floor_zone ON public.engineering_cad_spools USING btree (project_id, floor_label, zone_label)
- `idx_cad_spools_insreq`: INDEX idx_cad_spools_insreq ON public.engineering_cad_spools USING btree (inspection_request_id)
- `idx_cad_spools_proj_status`: INDEX idx_cad_spools_proj_status ON public.engineering_cad_spools USING btree (project_id, status)
- `uq_cad_spool_project_code`: UNIQUE INDEX uq_cad_spool_project_code ON public.engineering_cad_spools USING btree (project_id, spool_code)

### engineering_carbon_lca_reports

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| report_code | text |  |  |
| total_embodied_carbon_kgco2e | numeric(15,2) |  |  |
| carbon_intensity_kgco2e_per_m2 | numeric(8,2) |  |  |
| leed_points_estimated | integer |  | `0` |
| carbon_breakdown | jsonb |  | `'[]'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_carbon_lca_reports_pkey`: UNIQUE INDEX engineering_carbon_lca_reports_pkey ON public.engineering_carbon_lca_reports USING btree (id)
- `idx_carbon_lca_proj`: INDEX idx_carbon_lca_proj ON public.engineering_carbon_lca_reports USING btree (project_id, created_at DESC)
- `uq_carbon_lca_code`: UNIQUE INDEX uq_carbon_lca_code ON public.engineering_carbon_lca_reports USING btree (project_id, report_code)

### engineering_carbon_lifecycle_records

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| record_code | text |  |  |
| element_type | text |  |  |
| system_code | text |  |  |
| material_category | text |  |  |
| weight_kg | numeric(10,3) |  | `0.000` |
| carbon_factor_kg_co2e_per_kg | numeric(8,4) |  | `2.1000` |
| embodied_carbon_kg_co2e | numeric(12,3) |  | `0.000` |
| asset_guid | text | ✓ |  |
| equipment_serial | text | ✓ |  |
| mtbf_hours | integer |  | `20000` |
| expected_lifespan_years | integer |  | `15` |
| remaining_useful_life_percent | numeric(5,2) |  | `100.00` |
| maintenance_cycle_days | integer |  | `90` |
| next_maintenance_due | timestamptz | ✓ |  |
| status | text |  | `'active'::text` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_carbon_lifecycle_records_pkey`: UNIQUE INDEX engineering_carbon_lifecycle_records_pkey ON public.engineering_carbon_lifecycle_records USING btree (id)
- `engineering_carbon_lifecycle_records_project_id_record_code_key`: UNIQUE INDEX engineering_carbon_lifecycle_records_project_id_record_code_key ON public.engineering_carbon_lifecycle_records USING btree (project_id, record_code)
- `idx_carbon_lifecycle_project`: INDEX idx_carbon_lifecycle_project ON public.engineering_carbon_lifecycle_records USING btree (project_id, material_category)

### engineering_cashflow_forecast_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| run_name | text |  |  |
| parameters | jsonb |  | `'{}'::jsonb` |
| total_contract_value | numeric(15,2) |  |  |
| advance_percent | numeric(5,2) |  | `15.00` |
| retention_percent | numeric(5,2) |  | `5.00` |
| payment_delay_days | integer |  | `30` |
| status | text |  | `'completed'::text` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_cashflow_forecast_runs_pkey`: UNIQUE INDEX engineering_cashflow_forecast_runs_pkey ON public.engineering_cashflow_forecast_runs USING btree (id)
- `idx_engineering_cashflow_runs_project`: INDEX idx_engineering_cashflow_runs_project ON public.engineering_cashflow_forecast_runs USING btree (project_id)

### engineering_cashflow_period_projections

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| run_id | uuid |  |  |
| project_id | bigint |  |  |
| period_index | integer |  |  |
| period_label | text |  |  |
| projected_earned_value | numeric(15,2) |  | `0` |
| projected_cash_in | numeric(15,2) |  | `0` |
| projected_cash_out | numeric(15,2) |  | `0` |
| net_cash_flow | numeric(15,2) |  | `0` |
| cumulative_cash_flow | numeric(15,2) |  | `0` |
| working_capital_gap | numeric(15,2) |  | `0` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `run_id` → `engineering_cashflow_forecast_runs(id)`

**Index:**
- `engineering_cashflow_period_projections_pkey`: UNIQUE INDEX engineering_cashflow_period_projections_pkey ON public.engineering_cashflow_period_projections USING btree (id)
- `idx_engineering_cashflow_projections_project`: INDEX idx_engineering_cashflow_projections_project ON public.engineering_cashflow_period_projections USING btree (project_id)
- `idx_engineering_cashflow_projections_run`: INDEX idx_engineering_cashflow_projections_run ON public.engineering_cashflow_period_projections USING btree (run_id)

### engineering_closed_loop_sync_logs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| sync_code | text |  |  |
| spool_id | text |  |  |
| wbs_task_id | integer | ✓ |  |
| synced_qty | numeric(10,3) |  |  |
| synced_amount_vnd | numeric(15,2) |  |  |
| provenance_token | text |  |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `wbs_task_id` → `tasks(id)`

**Index:**
- `engineering_closed_loop_sync_logs_pkey`: UNIQUE INDEX engineering_closed_loop_sync_logs_pkey ON public.engineering_closed_loop_sync_logs USING btree (id)
- `idx_closed_loop_sync_proj`: INDEX idx_closed_loop_sync_proj ON public.engineering_closed_loop_sync_logs USING btree (project_id, spool_id)
- `uq_closed_loop_sync_code`: UNIQUE INDEX uq_closed_loop_sync_code ON public.engineering_closed_loop_sync_logs USING btree (project_id, sync_code)

### engineering_compliance_audits

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| object_id | uuid |  |  |
| rule_id | uuid |  |  |
| compliance_status | text |  |  |
| finding_details | text | ✓ |  |
| evidence_snapshot | jsonb |  | `'{}'::jsonb` |
| audited_at | timestamptz |  | `now()` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `object_id` → `engineering_objects(id)`
- `project_id` → `projects(id)`
- `rule_id` → `engineering_compliance_rules(id)`

**Index:**
- `engineering_compliance_audits_pkey`: UNIQUE INDEX engineering_compliance_audits_pkey ON public.engineering_compliance_audits USING btree (id)
- `idx_compliance_audits_proj`: INDEX idx_compliance_audits_proj ON public.engineering_compliance_audits USING btree (project_id, compliance_status)

### engineering_compliance_rules

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| standard_code | text |  |  |
| standard_title | text |  |  |
| section_clause | text |  |  |
| domain | text |  |  |
| rule_expression | jsonb |  |  |
| severity | text |  |  |
| description | text |  |  |
| is_active | boolean |  | `true` |
| created_at | timestamptz |  | `now()` |

**Index:**
- `engineering_compliance_rules_pkey`: UNIQUE INDEX engineering_compliance_rules_pkey ON public.engineering_compliance_rules USING btree (id)
- `uq_compliance_rules_clause`: UNIQUE INDEX uq_compliance_rules_clause ON public.engineering_compliance_rules USING btree (standard_code, section_clause)

### engineering_conflicts

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| session_id | uuid |  |  |
| topic | text |  |  |
| conflict_type | text |  |  |
| stage | text |  | `'detected'::text` |
| claim_ids | jsonb |  | `'[]'::jsonb` |
| resolution | text | ✓ |  |
| resolution_method | text | ✓ |  |
| resolved_by | integer | ✓ |  |
| resolved_at | timestamptz | ✓ |  |
| created_at | timestamptz |  | `now()` |
| project_id | integer |  |  |

**Khóa ngoại:**
- `project_id` → `engineering_agent_sessions(project_id)`
- `resolved_by` → `users(id)`
- `session_id` → `engineering_agent_sessions(id)`
- `session_id` → `engineering_agent_sessions(id)`

**Index:**
- `engineering_conflicts_pkey`: UNIQUE INDEX engineering_conflicts_pkey ON public.engineering_conflicts USING btree (id)
- `idx_eng_cf_session`: INDEX idx_eng_cf_session ON public.engineering_conflicts USING btree (session_id, stage)
- `idx_engineering_conflicts_project`: INDEX idx_engineering_conflicts_project ON public.engineering_conflicts USING btree (project_id)

### engineering_corridor_layouts

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| corridor_code | text |  |  |
| title | text |  |  |
| tower_label | text |  | `'Tower-A'::text` |
| floor_label | text |  | `'FL-01'::text` |
| zone_label | text |  | `'Zone-Corridor'::text` |
| corridor_width_mm | numeric(10,2) |  | `2400.00` |
| corridor_clear_height_mm | numeric(10,2) |  | `2600.00` |
| slab_bottom_elevation_mm | numeric(10,2) |  | `3500.00` |
| beam_bottom_elevation_mm | numeric(10,2) |  | `3100.00` |
| ceiling_elevation_mm | numeric(10,2) |  | `2600.00` |
| available_service_depth_mm | numeric(10,2) |  | `500.00` |
| tier_allocation | jsonb |  | `'[]'::jsonb` |
| assigned_systems | jsonb |  | `'[]'::jsonb` |
| sprinkler_elevation_mm | numeric(10,2) |  | `2500.00` |
| status | text |  | `'optimized'::text` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_corridor_layouts_pkey`: UNIQUE INDEX engineering_corridor_layouts_pkey ON public.engineering_corridor_layouts USING btree (id)
- `engineering_corridor_layouts_project_id_corridor_code_key`: UNIQUE INDEX engineering_corridor_layouts_project_id_corridor_code_key ON public.engineering_corridor_layouts USING btree (project_id, corridor_code)
- `idx_corridor_layouts_project`: INDEX idx_corridor_layouts_project ON public.engineering_corridor_layouts USING btree (project_id, created_at DESC)
- `idx_corridor_layouts_spatial`: INDEX idx_corridor_layouts_spatial ON public.engineering_corridor_layouts USING btree (project_id, tower_label, floor_label)

### engineering_cross_project_lessons

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| source_project_id | integer | ✓ |  |
| pattern_id | uuid | ✓ |  |
| work_package_code | text | ✓ |  |
| observed_problem | text |  |  |
| root_cause | text |  |  |
| prescribed_preventative_action | text |  |  |
| effectiveness_score | numeric(5,4) | ✓ | `1.0000` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `pattern_id` → `engineering_knowledge_patterns(id)`
- `source_project_id` → `projects(id)`

**Index:**
- `engineering_cross_project_lessons_pkey`: UNIQUE INDEX engineering_cross_project_lessons_pkey ON public.engineering_cross_project_lessons USING btree (id)

### engineering_data_quality_issues

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| entity_type | text |  |  |
| entity_id | text |  |  |
| issue_rule | text |  |  |
| severity | text |  |  |
| description | text |  |  |
| status | text |  | `'open'::text` |
| detected_at | timestamptz |  | `now()` |
| resolved_at | timestamptz | ✓ |  |
| resolved_by | integer | ✓ |  |
| resolution_note | text | ✓ |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `resolved_by` → `users(id)`

**Index:**
- `engineering_data_quality_issues_pkey`: UNIQUE INDEX engineering_data_quality_issues_pkey ON public.engineering_data_quality_issues USING btree (id)
- `idx_eng_dq_issues_entity`: INDEX idx_eng_dq_issues_entity ON public.engineering_data_quality_issues USING btree (entity_type, entity_id)
- `idx_eng_dq_issues_project_status`: INDEX idx_eng_dq_issues_project_status ON public.engineering_data_quality_issues USING btree (project_id, status, severity)

### engineering_digital_handover_passports

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| passport_code | text |  |  |
| project_title | text |  |  |
| handover_date | date |  |  |
| total_spools_count | integer |  |  |
| total_bbnt_count | integer |  |  |
| total_tc_tests_passed | integer |  |  |
| provenance_master_hash | text |  |  |
| digital_certificate_token | text |  |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_digital_handover_passports_pkey`: UNIQUE INDEX engineering_digital_handover_passports_pkey ON public.engineering_digital_handover_passports USING btree (id)
- `idx_digital_handover_proj`: INDEX idx_digital_handover_proj ON public.engineering_digital_handover_passports USING btree (project_id, passport_code)
- `uq_digital_handover_code`: UNIQUE INDEX uq_digital_handover_code ON public.engineering_digital_handover_passports USING btree (project_id, passport_code)

### engineering_duct_diffuser_alignments

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| alignment_code | text |  |  |
| ductline_code | text |  |  |
| plenum_code | text |  |  |
| target_ceiling_grid_x_mm | numeric(10,2) |  |  |
| target_ceiling_grid_y_mm | numeric(10,2) |  |  |
| target_ceiling_grid_z_mm | numeric(10,2) |  |  |
| accumulated_drift_mm | numeric(8,2) |  | `0.00` |
| flange_accumulated_mm | numeric(8,2) |  | `0.00` |
| accessories_accumulated_mm | numeric(8,2) |  | `0.00` |
| canvas_expansion_mm | numeric(8,2) |  | `0.00` |
| nominal_straight_cut_length_mm | numeric(10,2) |  |  |
| adjusted_straight_cut_length_mm | numeric(10,2) |  |  |
| final_deviation_from_grid_mm | numeric(6,2) |  | `0.00` |
| is_aligned_zero_drift | boolean |  | `true` |
| flexible_duct_cut_length_m | numeric(6,3) |  | `1.500` |
| notes | text | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_duct_diffuser_alignme_project_id_alignment_code_key`: UNIQUE INDEX engineering_duct_diffuser_alignme_project_id_alignment_code_key ON public.engineering_duct_diffuser_alignments USING btree (project_id, alignment_code)
- `engineering_duct_diffuser_alignments_pkey`: UNIQUE INDEX engineering_duct_diffuser_alignments_pkey ON public.engineering_duct_diffuser_alignments USING btree (id)
- `idx_diffuser_align_project`: INDEX idx_diffuser_align_project ON public.engineering_duct_diffuser_alignments USING btree (project_id, ductline_code)

### engineering_duct_plenum_boxes

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| plenum_code | text |  |  |
| system_code | text |  | `'ACMV_SUPPLY'::text` |
| diffuser_type | text |  | `'square_4way'::text` |
| diffuser_neck_width_mm | numeric(8,2) |  |  |
| diffuser_neck_height_mm | numeric(8,2) |  |  |
| diffuser_face_width_mm | numeric(8,2) |  |  |
| diffuser_face_height_mm | numeric(8,2) |  |  |
| plenum_opening_width_mm | numeric(8,2) |  |  |
| plenum_opening_height_mm | numeric(8,2) |  |  |
| clearance_applied_mm | numeric(5,2) |  | `10.00` |
| plenum_box_height_mm | numeric(8,2) |  | `300.00` |
| spigot_dia_mm | numeric(8,2) |  | `200.00` |
| spigot_length_mm | numeric(6,2) |  | `60.00` |
| spigots_count | integer |  | `1` |
| has_obd_damper | boolean |  | `false` |
| insulation_type | text |  | `'internal_rubber_15mm'::text` |
| sheet_metal_area_m2 | numeric(8,4) |  | `0.0000` |
| tower_label | text | ✓ | `'Tower-A'::text` |
| floor_label | text | ✓ | `'FL-01'::text` |
| zone_label | text | ✓ | `'Zone-1'::text` |
| apartment_label | text | ✓ |  |
| target_ceiling_coordinate | jsonb |  | `'[0, 0, 2700]'::jsonb` |
| qr_plenum_token | text |  |  |
| status | text |  | `'designed'::text` |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_duct_plenum_boxes_pkey`: UNIQUE INDEX engineering_duct_plenum_boxes_pkey ON public.engineering_duct_plenum_boxes USING btree (id)
- `engineering_duct_plenum_boxes_project_id_plenum_code_key`: UNIQUE INDEX engineering_duct_plenum_boxes_project_id_plenum_code_key ON public.engineering_duct_plenum_boxes USING btree (project_id, plenum_code)
- `idx_plenum_boxes_project`: INDEX idx_plenum_boxes_project ON public.engineering_duct_plenum_boxes USING btree (project_id, created_at DESC)
- `idx_plenum_boxes_spatial`: INDEX idx_plenum_boxes_spatial ON public.engineering_duct_plenum_boxes USING btree (project_id, tower_label, floor_label, apartment_label)

### engineering_edge_vision_detections

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| detection_code | text |  |  |
| video_session_id | text |  |  |
| frame_timestamp_sec | numeric(8,2) |  | `0.00` |
| camera_pose | jsonb |  | `'{}'::jsonb` |
| bim_element_guid | text | ✓ |  |
| element_type | text |  |  |
| zone_label | text |  | `'Zone-01'::text` |
| installation_status | text |  | `'in_progress'::text` |
| confidence_score | numeric(5,4) |  | `0.9000` |
| anomaly_detected | boolean |  | `false` |
| anomaly_description | text | ✓ |  |
| bounding_box_2d | jsonb | ✓ | `'{}'::jsonb` |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_edge_vision_detection_project_id_detection_code_key`: UNIQUE INDEX engineering_edge_vision_detection_project_id_detection_code_key ON public.engineering_edge_vision_detections USING btree (project_id, detection_code)
- `engineering_edge_vision_detections_pkey`: UNIQUE INDEX engineering_edge_vision_detections_pkey ON public.engineering_edge_vision_detections USING btree (id)
- `idx_edge_vision_guid`: INDEX idx_edge_vision_guid ON public.engineering_edge_vision_detections USING btree (project_id, bim_element_guid)
- `idx_edge_vision_project`: INDEX idx_edge_vision_project ON public.engineering_edge_vision_detections USING btree (project_id, video_session_id)

### engineering_esign_audit_certificates

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| envelope_id | uuid |  |  |
| project_id | bigint |  |  |
| certificate_code | text |  |  |
| merkle_leaf_hash | text |  |  |
| tamper_proof_token | text |  |  |
| legal_timestamp | timestamptz |  | `now()` |
| signatory_summary | jsonb |  | `'[]'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `envelope_id` → `engineering_esign_envelopes(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_esign_audit_certificates_certificate_code_key`: UNIQUE INDEX engineering_esign_audit_certificates_certificate_code_key ON public.engineering_esign_audit_certificates USING btree (certificate_code)
- `engineering_esign_audit_certificates_pkey`: UNIQUE INDEX engineering_esign_audit_certificates_pkey ON public.engineering_esign_audit_certificates USING btree (id)
- `idx_engineering_esign_audit_certificates_project`: INDEX idx_engineering_esign_audit_certificates_project ON public.engineering_esign_audit_certificates USING btree (project_id)

### engineering_esign_envelopes

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| title | text |  |  |
| document_type | text |  |  |
| reference_id | bigint | ✓ |  |
| reference_code | text | ✓ |  |
| status | text |  | `'draft'::text` |
| document_hash | text |  |  |
| document_payload | jsonb |  | `'{}'::jsonb` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| completed_at | timestamptz | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_esign_envelopes_pkey`: UNIQUE INDEX engineering_esign_envelopes_pkey ON public.engineering_esign_envelopes USING btree (id)
- `idx_engineering_esign_envelopes_project`: INDEX idx_engineering_esign_envelopes_project ON public.engineering_esign_envelopes USING btree (project_id)
- `idx_engineering_esign_envelopes_status`: INDEX idx_engineering_esign_envelopes_status ON public.engineering_esign_envelopes USING btree (project_id, status)

### engineering_esign_signatories

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| envelope_id | uuid |  |  |
| project_id | bigint |  |  |
| user_id | bigint | ✓ |  |
| signer_name | text |  |  |
| signer_role | text |  |  |
| signing_order | integer |  | `1` |
| status | text |  | `'waiting'::text` |
| signature_data | text | ✓ |  |
| otp_code | text | ✓ |  |
| otp_expires_at | timestamptz | ✓ |  |
| signed_at | timestamptz | ✓ |  |
| ip_address | text | ✓ |  |
| geo_location | jsonb | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `envelope_id` → `engineering_esign_envelopes(id)`
- `project_id` → `projects(id)`
- `user_id` → `users(id)`

**Index:**
- `engineering_esign_signatories_pkey`: UNIQUE INDEX engineering_esign_signatories_pkey ON public.engineering_esign_signatories USING btree (id)
- `idx_engineering_esign_signatories_envelope`: INDEX idx_engineering_esign_signatories_envelope ON public.engineering_esign_signatories USING btree (envelope_id)
- `idx_engineering_esign_signatories_project`: INDEX idx_engineering_esign_signatories_project ON public.engineering_esign_signatories USING btree (project_id)

### engineering_evidence

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| suggestion_id | uuid |  |  |
| kind | text |  |  |
| statement | text |  |  |
| source_revision_id | uuid | ✓ |  |
| object_id | uuid | ✓ |  |
| locator | text | ✓ |  |
| standard_ref | text | ✓ |  |
| sort_order | integer |  | `0` |
| created_at | timestamptz |  | `now()` |
| project_id | integer |  |  |

**Khóa ngoại:**
- `object_id` → `engineering_objects(id)`
- `object_id` → `engineering_objects(id)`
- `project_id` → `engineering_objects(project_id)`
- `project_id` → `engineering_suggestions(project_id)`
- `project_id` → `engineering_source_revisions(project_id)`
- `source_revision_id` → `engineering_source_revisions(id)`
- `source_revision_id` → `engineering_source_revisions(id)`
- `suggestion_id` → `engineering_suggestions(id)`
- `suggestion_id` → `engineering_suggestions(id)`

**Index:**
- `engineering_evidence_pkey`: UNIQUE INDEX engineering_evidence_pkey ON public.engineering_evidence USING btree (id)
- `idx_eng_evidence_suggestion`: INDEX idx_eng_evidence_suggestion ON public.engineering_evidence USING btree (suggestion_id, sort_order)
- `idx_engineering_evidence_project`: INDEX idx_engineering_evidence_project ON public.engineering_evidence USING btree (project_id)

### engineering_execution_requests

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| capability_key | text |  |  |
| autonomy_level | text |  |  |
| intent | text |  |  |
| dry_run_diff | jsonb |  | `'{}'::jsonb` |
| risk_class | text |  |  |
| status | text |  | `'dry_run_passed'::text` |
| approval_token | text | ✓ |  |
| token_expires_at | timestamptz | ✓ |  |
| execution_result | jsonb | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `capability_key` → `engineering_autonomy_capabilities(key)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_execution_requests_pkey`: UNIQUE INDEX engineering_execution_requests_pkey ON public.engineering_execution_requests USING btree (id)
- `idx_eng_exec_requests_project`: INDEX idx_eng_exec_requests_project ON public.engineering_execution_requests USING btree (project_id, status, created_at DESC)

### engineering_fidic_claim_evidences

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| claim_id | uuid |  |  |
| evidence_type | text |  |  |
| reference_code | text |  |  |
| description | text | ✓ |  |
| impact_days | integer |  | `0` |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `claim_id` → `engineering_fidic_claims(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_fidic_claim_evidences_pkey`: UNIQUE INDEX engineering_fidic_claim_evidences_pkey ON public.engineering_fidic_claim_evidences USING btree (id)
- `idx_claim_evidences_claim`: INDEX idx_claim_evidences_claim ON public.engineering_fidic_claim_evidences USING btree (project_id, claim_id)

### engineering_fidic_claims

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| claim_code | text |  |  |
| contract_type | text |  | `'FIDIC_RED_1999'::text` |
| fidic_clause | text |  | `'8.4'::text` |
| event_title | text |  |  |
| event_date | date |  |  |
| notice_date | date |  |  |
| eot_days_claimed | integer |  | `0` |
| cost_claimed_vnd | bigint |  | `0` |
| is_time_bar_compliant | boolean |  | `true` |
| status | text |  | `'draft'::text` |
| tia_analysis_payload | jsonb |  | `'{}'::jsonb` |
| dossier_content | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| updated_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_fidic_claims_claim_code_key`: UNIQUE INDEX engineering_fidic_claims_claim_code_key ON public.engineering_fidic_claims USING btree (claim_code)
- `engineering_fidic_claims_pkey`: UNIQUE INDEX engineering_fidic_claims_pkey ON public.engineering_fidic_claims USING btree (id)
- `idx_fidic_claims_proj_code`: INDEX idx_fidic_claims_proj_code ON public.engineering_fidic_claims USING btree (project_id, claim_code, status)

### engineering_fidic_tia_claims

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| claim_code | text |  |  |
| delay_event_title | text |  |  |
| event_category | text |  |  |
| fidic_sub_clause | text |  | `'Clause 20.1 (1999) / 20.2 (2017)'::text` |
| delay_start_date | date |  |  |
| delay_end_date | date |  |  |
| fragnet_duration_days | integer |  | `14` |
| calculated_eot_days | integer |  | `14` |
| daily_overhead_cost_vnd | numeric(14,2) |  | `15000000.00` |
| total_prolongation_cost_vnd | numeric(16,2) |  | `210000000.00` |
| impacted_critical_tasks | jsonb |  | `'[]'::jsonb` |
| notice_letter_markdown | text |  |  |
| time_bar_deadline_date | date |  |  |
| status | text |  | `'submitted'::text` |
| merkle_proof_hash | text |  |  |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_fidic_tia_claims_pkey`: UNIQUE INDEX engineering_fidic_tia_claims_pkey ON public.engineering_fidic_tia_claims USING btree (id)
- `engineering_fidic_tia_claims_project_id_claim_code_key`: UNIQUE INDEX engineering_fidic_tia_claims_project_id_claim_code_key ON public.engineering_fidic_tia_claims USING btree (project_id, claim_code)
- `idx_fidic_tia_project`: INDEX idx_fidic_tia_project ON public.engineering_fidic_tia_claims USING btree (project_id, created_at DESC)

### engineering_generative_routing_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| routing_code | text |  |  |
| system_type | text |  |  |
| start_point | jsonb |  |  |
| end_point | jsonb |  |  |
| nominal_size_mm | numeric(10,2) |  | `100.00` |
| slope_percent | numeric(6,3) |  | `0.000` |
| path_nodes | jsonb |  | `'[]'::jsonb` |
| fittings_schedule | jsonb |  | `'[]'::jsonb` |
| total_length_m | numeric(10,3) |  | `0.000` |
| pressure_drop_pa | numeric(12,2) |  | `0.00` |
| clash_count_avoided | integer |  | `0` |
| sleeve_openings_checked | integer |  | `0` |
| status | text |  | `'solved'::text` |
| dxf_content | text | ✓ |  |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_generative_routing_runs_pkey`: UNIQUE INDEX engineering_generative_routing_runs_pkey ON public.engineering_generative_routing_runs USING btree (id)
- `engineering_generative_routing_runs_project_id_routing_code_key`: UNIQUE INDEX engineering_generative_routing_runs_project_id_routing_code_key ON public.engineering_generative_routing_runs USING btree (project_id, routing_code)
- `idx_gen_routing_project`: INDEX idx_gen_routing_project ON public.engineering_generative_routing_runs USING btree (project_id, created_at DESC)
- `idx_gen_routing_system`: INDEX idx_gen_routing_system ON public.engineering_generative_routing_runs USING btree (project_id, system_type)

### engineering_god_tier_clashes

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| model_id | uuid |  |  |
| clash_code | text |  |  |
| element_a_guid | text |  |  |
| element_b_guid | text |  |  |
| element_a_type | text |  |  |
| element_b_type | text |  |  |
| spatial_point | jsonb |  | `'{"x": 0, "y": 0, "z": 0}'::jsonb` |
| clearance_mm | numeric(10,2) |  | `0` |
| reroute_solution | jsonb | ✓ |  |
| status | text |  | `'detected'::text` |
| resolved_by | bigint | ✓ |  |
| resolved_at | timestamptz | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `model_id` → `engineering_god_tier_models(id)`
- `project_id` → `projects(id)`
- `resolved_by` → `users(id)`

**Index:**
- `engineering_god_tier_clashes_pkey`: UNIQUE INDEX engineering_god_tier_clashes_pkey ON public.engineering_god_tier_clashes USING btree (id)
- `engineering_god_tier_clashes_project_id_clash_code_key`: UNIQUE INDEX engineering_god_tier_clashes_project_id_clash_code_key ON public.engineering_god_tier_clashes USING btree (project_id, clash_code)
- `idx_eng_gt_clashes_model`: INDEX idx_eng_gt_clashes_model ON public.engineering_god_tier_clashes USING btree (model_id)
- `idx_eng_gt_clashes_project_status`: INDEX idx_eng_gt_clashes_project_status ON public.engineering_god_tier_clashes USING btree (project_id, status)

### engineering_god_tier_models

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| model_code | text |  |  |
| name | text |  |  |
| discipline | text |  | `'combined'::text` |
| lod_level | text |  | `'LOD_400'::text` |
| total_elements | integer |  | `0` |
| instanced_mesh_url | text | ✓ |  |
| spatial_octree_data | jsonb |  | `'{}'::jsonb` |
| bounding_box | jsonb |  | `'{"max": [0, 0, 0], "min": [0, 0, 0]}'::jsonb` |
| merkle_root_hash | text | ✓ |  |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_god_tier_models_pkey`: UNIQUE INDEX engineering_god_tier_models_pkey ON public.engineering_god_tier_models USING btree (id)
- `engineering_god_tier_models_project_id_model_code_key`: UNIQUE INDEX engineering_god_tier_models_project_id_model_code_key ON public.engineering_god_tier_models USING btree (project_id, model_code)
- `idx_eng_gt_models_discipline`: INDEX idx_eng_gt_models_discipline ON public.engineering_god_tier_models USING btree (project_id, discipline)
- `idx_eng_gt_models_project`: INDEX idx_eng_gt_models_project ON public.engineering_god_tier_models USING btree (project_id, created_at DESC)

### engineering_goods_receipt_notes

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| shipment_id | uuid |  |  |
| grn_number | text |  |  |
| received_by | integer | ✓ |  |
| inspection_status | text |  | `'passed'::text` |
| variance_report | jsonb |  | `'{}'::jsonb` |
| signed_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `received_by` → `users(id)`
- `shipment_id` → `engineering_material_shipments(id)`

**Index:**
- `engineering_goods_receipt_notes_pkey`: UNIQUE INDEX engineering_goods_receipt_notes_pkey ON public.engineering_goods_receipt_notes USING btree (id)
- `idx_grn_proj_shipment`: INDEX idx_grn_proj_shipment ON public.engineering_goods_receipt_notes USING btree (project_id, shipment_id)

### engineering_hse_action_tickets

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| scan_id | uuid |  |  |
| hazard_id | uuid |  |  |
| project_id | bigint |  |  |
| ticket_code | text |  |  |
| assigned_subcon | text |  |  |
| fine_amount | numeric(12,2) |  | `0` |
| deadline_hours | integer |  | `4` |
| status | text |  | `'OPEN'::text` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `hazard_id` → `engineering_hse_detected_hazards(id)`
- `project_id` → `projects(id)`
- `scan_id` → `engineering_hse_vision_scans(id)`

**Index:**
- `engineering_hse_action_tickets_pkey`: UNIQUE INDEX engineering_hse_action_tickets_pkey ON public.engineering_hse_action_tickets USING btree (id)
- `engineering_hse_action_tickets_ticket_code_key`: UNIQUE INDEX engineering_hse_action_tickets_ticket_code_key ON public.engineering_hse_action_tickets USING btree (ticket_code)
- `idx_engineering_hse_tickets_project`: INDEX idx_engineering_hse_tickets_project ON public.engineering_hse_action_tickets USING btree (project_id)

### engineering_hse_detected_hazards

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| scan_id | uuid |  |  |
| project_id | bigint |  |  |
| hazard_type | text |  |  |
| severity | text |  | `'MEDIUM'::text` |
| confidence | numeric(5,2) |  | `90.00` |
| bounding_box | jsonb |  | `'[0, 0, 100, 100]'::jsonb` |
| description | text |  |  |
| standard_violation | text | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `scan_id` → `engineering_hse_vision_scans(id)`

**Index:**
- `engineering_hse_detected_hazards_pkey`: UNIQUE INDEX engineering_hse_detected_hazards_pkey ON public.engineering_hse_detected_hazards USING btree (id)
- `idx_engineering_hse_hazards_project`: INDEX idx_engineering_hse_hazards_project ON public.engineering_hse_detected_hazards USING btree (project_id)
- `idx_engineering_hse_hazards_scan`: INDEX idx_engineering_hse_hazards_scan ON public.engineering_hse_detected_hazards USING btree (scan_id)

### engineering_hse_vision_scans

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| scan_name | text |  |  |
| image_url | text |  |  |
| image_hash | text |  |  |
| total_hazards_found | integer |  | `0` |
| site_safety_score | numeric(5,2) |  | `100.00` |
| risk_tier | text |  | `'SAFE'::text` |
| analyzed_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_hse_vision_scans_pkey`: UNIQUE INDEX engineering_hse_vision_scans_pkey ON public.engineering_hse_vision_scans USING btree (id)
- `idx_engineering_hse_scans_project`: INDEX idx_engineering_hse_scans_project ON public.engineering_hse_vision_scans USING btree (project_id)

### engineering_hydraulic_checks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| check_code | text |  |  |
| system_type | text |  | `'domestic_water'::text` |
| formula_used | text |  | `'hazen_williams'::text` |
| flow_rate_lps | numeric(10,4) | ✓ |  |
| pipe_diameter_mm | numeric(8,2) | ✓ |  |
| pipe_length_m | numeric(10,3) | ✓ |  |
| roughness_mm | numeric(6,4) | ✓ |  |
| fluid_temp_c | numeric(5,2) | ✓ | `25.0` |
| velocity_ms | numeric(8,4) | ✓ |  |
| reynolds_number | numeric(12,2) | ✓ |  |
| friction_factor | numeric(10,6) | ✓ |  |
| head_loss_per_m_pa | numeric(12,4) | ✓ |  |
| total_head_loss_pa | numeric(14,4) | ✓ |  |
| pressure_drop_bar | numeric(10,6) | ✓ |  |
| airflow_cfm | numeric(12,2) | ✓ |  |
| duct_width_mm | numeric(8,2) | ✓ |  |
| duct_height_mm | numeric(8,2) | ✓ |  |
| velocity_limit_ms | numeric(8,4) | ✓ |  |
| velocity_ok | boolean |  | `true` |
| warnings | jsonb |  | `'[]'::jsonb` |
| status | text |  | `'pass'::text` |
| linked_spool_code | text | ✓ |  |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_hydraulic_checks_pkey`: UNIQUE INDEX engineering_hydraulic_checks_pkey ON public.engineering_hydraulic_checks USING btree (id)
- `engineering_hydraulic_checks_project_id_check_code_key`: UNIQUE INDEX engineering_hydraulic_checks_project_id_check_code_key ON public.engineering_hydraulic_checks USING btree (project_id, check_code)
- `idx_hydraulic_checks_project`: INDEX idx_hydraulic_checks_project ON public.engineering_hydraulic_checks USING btree (project_id, created_at DESC)
- `idx_hydraulic_checks_status`: INDEX idx_hydraulic_checks_status ON public.engineering_hydraulic_checks USING btree (project_id, status)
- `idx_hydraulic_checks_system`: INDEX idx_hydraulic_checks_system ON public.engineering_hydraulic_checks USING btree (project_id, system_type)

### engineering_hydraulic_networks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| network_code | text |  |  |
| system_type | text |  |  |
| title | text |  |  |
| nodes_graph | jsonb |  | `'[]'::jsonb` |
| edges_graph | jsonb |  | `'[]'::jsonb` |
| total_flow_rate_lps | numeric(10,3) |  | `0.000` |
| critical_run_path | jsonb |  | `'[]'::jsonb` |
| critical_pressure_drop_pa | numeric(12,2) |  | `0.00` |
| critical_pressure_drop_bar | numeric(8,4) |  | `0.0000` |
| balancing_valves_schedule | jsonb |  | `'[]'::jsonb` |
| status | text |  | `'balanced'::text` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_hydraulic_networks_pkey`: UNIQUE INDEX engineering_hydraulic_networks_pkey ON public.engineering_hydraulic_networks USING btree (id)
- `engineering_hydraulic_networks_project_id_network_code_key`: UNIQUE INDEX engineering_hydraulic_networks_project_id_network_code_key ON public.engineering_hydraulic_networks USING btree (project_id, network_code)
- `idx_hydraulic_networks_project`: INDEX idx_hydraulic_networks_project ON public.engineering_hydraulic_networks USING btree (project_id, created_at DESC)

### engineering_ingest_requests

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| idempotency_key | text |  |  |
| request_sha256 | text |  |  |
| status | text |  | `'completed'::text` |
| response_status | integer |  |  |
| response_body | jsonb |  | `'{}'::jsonb` |
| correlation_id | text | ✓ |  |
| api_key_id | integer | ✓ |  |
| contract_version | text | ✓ |  |
| created_at | timestamptz |  | `now()` |
| expires_at | timestamptz |  | `(now() + '30 days'::interval)` |

**Khóa ngoại:**
- `api_key_id` → `api_keys(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_ingest_requests_pkey`: UNIQUE INDEX engineering_ingest_requests_pkey ON public.engineering_ingest_requests USING btree (id)
- `idx_engineering_ingest_requests_expires`: INDEX idx_engineering_ingest_requests_expires ON public.engineering_ingest_requests USING btree (expires_at)
- `uq_engineering_ingest_requests_key`: UNIQUE INDEX uq_engineering_ingest_requests_key ON public.engineering_ingest_requests USING btree (project_id, idempotency_key)

### engineering_intelligence_packages

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| objective | text |  |  |
| source_revision_id | uuid | ✓ |  |
| provenance | jsonb |  | `'{}'::jsonb` |
| trace_id | text | ✓ |  |
| api_key_id | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `api_key_id` → `api_keys(id)`
- `project_id` → `projects(id)`
- `project_id` → `engineering_source_revisions(project_id)`
- `source_revision_id` → `engineering_source_revisions(id)`
- `source_revision_id` → `engineering_source_revisions(id)`

**Index:**
- `engineering_intelligence_packages_pkey`: UNIQUE INDEX engineering_intelligence_packages_pkey ON public.engineering_intelligence_packages USING btree (id)
- `idx_eng_ip_project`: INDEX idx_eng_ip_project ON public.engineering_intelligence_packages USING btree (project_id, created_at DESC)
- `uq_engineering_intelligence_packages_id_project`: UNIQUE INDEX uq_engineering_intelligence_packages_id_project ON public.engineering_intelligence_packages USING btree (id, project_id)

### engineering_iot_devices

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| device_code | text |  |  |
| device_name | text |  |  |
| device_type | text |  |  |
| location_area | text |  |  |
| tower_id | bigint | ✓ |  |
| is_active | boolean |  | `true` |
| threshold_min | numeric(10,2) | ✓ |  |
| threshold_max | numeric(10,2) | ✓ |  |
| unit | text |  |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `tower_id` → `towers(id)`

**Index:**
- `engineering_iot_devices_pkey`: UNIQUE INDEX engineering_iot_devices_pkey ON public.engineering_iot_devices USING btree (id)

### engineering_iot_telemetry_logs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| device_id | uuid |  |  |
| metric_value | numeric(10,2) |  |  |
| status | text |  | `'NORMAL'::text` |
| measured_at | timestamptz |  | `now()` |
| raw_payload | jsonb | ✓ | `'{}'::jsonb` |

**Khóa ngoại:**
- `device_id` → `engineering_iot_devices(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_iot_telemetry_logs_pkey`: UNIQUE INDEX engineering_iot_telemetry_logs_pkey ON public.engineering_iot_telemetry_logs USING btree (id)

### engineering_iot_threshold_alerts

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| device_id | uuid |  |  |
| severity | text |  |  |
| alert_title | text |  |  |
| alert_message | text |  |  |
| standard_reference | text | ✓ |  |
| triggered_value | numeric(10,2) |  |  |
| is_resolved | boolean |  | `false` |
| resolved_at | timestamptz | ✓ |  |
| resolved_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `device_id` → `engineering_iot_devices(id)`
- `project_id` → `projects(id)`
- `resolved_by` → `users(id)`

**Index:**
- `engineering_iot_threshold_alerts_pkey`: UNIQUE INDEX engineering_iot_threshold_alerts_pkey ON public.engineering_iot_threshold_alerts USING btree (id)
- `uq_iot_alert_dang_mo`: UNIQUE INDEX uq_iot_alert_dang_mo ON public.engineering_iot_threshold_alerts USING btree (device_id) WHERE (is_resolved = false)

### engineering_knowledge_patterns

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| pattern_type | text |  |  |
| category | text |  |  |
| fingerprint_hash | text |  |  |
| pattern_metrics | jsonb |  | `'{}'::jsonb` |
| confidence_score | numeric(5,4) |  | `0.5000` |
| sample_size_projects | integer |  | `1` |
| sample_size_observations | bigint |  | `1` |
| lesson_learned | text |  |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Index:**
- `engineering_knowledge_patterns_fingerprint_hash_key`: UNIQUE INDEX engineering_knowledge_patterns_fingerprint_hash_key ON public.engineering_knowledge_patterns USING btree (fingerprint_hash)
- `engineering_knowledge_patterns_pkey`: UNIQUE INDEX engineering_knowledge_patterns_pkey ON public.engineering_knowledge_patterns USING btree (id)
- `idx_knowledge_patterns_type`: INDEX idx_knowledge_patterns_type ON public.engineering_knowledge_patterns USING btree (pattern_type, category)

### engineering_material_mass_balance_audits

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| audit_code | text |  |  |
| system_code | text |  |  |
| nominal_dia_mm | numeric(8,2) |  |  |
| total_bim_design_m | numeric(12,3) |  |  |
| total_po_ordered_m | numeric(12,3) |  |  |
| total_grn_received_m | numeric(12,3) |  |  |
| total_installed_verified_m | numeric(12,3) |  |  |
| total_staged_on_floors_m | numeric(12,3) |  |  |
| total_in_central_warehouse_m | numeric(12,3) |  |  |
| total_reusable_remnants_m | numeric(12,3) |  |  |
| total_scrap_logged_m | numeric(12,3) |  |  |
| delta_unaccounted_or_stash_m | numeric(12,3) |  |  |
| remaining_to_install_m | numeric(12,3) |  |  |
| remaining_to_procure_m | numeric(12,3) |  |  |
| progress_percentage | numeric(6,2) |  |  |
| stash_risk_status | text |  | `'CLEAN_BALANCED'::text` |
| suspect_locations | jsonb |  | `'[]'::jsonb` |
| audited_at | timestamptz |  | `now()` |
| audited_by | bigint | ✓ |  |
| merkle_seal_hash | text |  |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `audited_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_material_mass_balance_aud_project_id_audit_code_key`: UNIQUE INDEX engineering_material_mass_balance_aud_project_id_audit_code_key ON public.engineering_material_mass_balance_audits USING btree (project_id, audit_code)
- `engineering_material_mass_balance_audits_pkey`: UNIQUE INDEX engineering_material_mass_balance_audits_pkey ON public.engineering_material_mass_balance_audits USING btree (id)
- `idx_mass_balance_proj`: INDEX idx_mass_balance_proj ON public.engineering_material_mass_balance_audits USING btree (project_id, created_at DESC)
- `idx_mass_balance_system`: INDEX idx_mass_balance_system ON public.engineering_material_mass_balance_audits USING btree (project_id, system_code)

### engineering_material_qr_tags

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| shipment_id | uuid | ✓ |  |
| qr_code | text |  |  |
| tag_type | text |  | `'material_unit'::text` |
| item_code | text |  |  |
| item_name | text |  |  |
| quantity | numeric(12,3) |  | `1.0` |
| unit | text |  | `'cái'::text` |
| status | text |  | `'issued'::text` |
| scanned_at | timestamptz | ✓ |  |
| scanned_by | integer | ✓ |  |
| location_note | text | ✓ |  |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `scanned_by` → `users(id)`
- `shipment_id` → `engineering_material_shipments(id)`

**Index:**
- `engineering_material_qr_tags_pkey`: UNIQUE INDEX engineering_material_qr_tags_pkey ON public.engineering_material_qr_tags USING btree (id)
- `engineering_material_qr_tags_qr_code_key`: UNIQUE INDEX engineering_material_qr_tags_qr_code_key ON public.engineering_material_qr_tags USING btree (qr_code)
- `idx_qr_tags_proj_code`: INDEX idx_qr_tags_proj_code ON public.engineering_material_qr_tags USING btree (project_id, qr_code, status)

### engineering_material_shipments

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| shipment_code | text |  |  |
| do_number | text |  |  |
| po_number | text |  |  |
| supplier_name | text |  |  |
| status | text |  | `'dispatched'::text` |
| total_items_count | integer |  | `0` |
| received_items_count | integer |  | `0` |
| dispatch_date | date |  | `CURRENT_DATE` |
| delivery_date | date | ✓ |  |
| manifest_payload | jsonb |  | `'[]'::jsonb` |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| updated_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| supplier_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `engineering_material_shipments_pkey`: UNIQUE INDEX engineering_material_shipments_pkey ON public.engineering_material_shipments USING btree (id)
- `engineering_material_shipments_supplier_idx`: INDEX engineering_material_shipments_supplier_idx ON public.engineering_material_shipments USING btree (supplier_id)
- `idx_shipments_proj_code`: INDEX idx_shipments_proj_code ON public.engineering_material_shipments USING btree (project_id, shipment_code, status)

### engineering_mepf_hydraulic_calculations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| calc_code | text |  |  |
| system_type | text |  |  |
| flow_rate_m3h | numeric(10,3) |  |  |
| pipe_length_m | numeric(10,3) |  |  |
| selected_diameter_spec | text |  |  |
| fluid_velocity_ms | numeric(6,3) |  |  |
| head_loss_bar | numeric(8,4) |  |  |
| recommended_hanger_spacing_m | numeric(5,2) |  |  |
| recommended_rod_size | text |  |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_mepf_hydraulic_calculations_pkey`: UNIQUE INDEX engineering_mepf_hydraulic_calculations_pkey ON public.engineering_mepf_hydraulic_calculations USING btree (id)
- `idx_mepf_hydraulic_proj`: INDEX idx_mepf_hydraulic_proj ON public.engineering_mepf_hydraulic_calculations USING btree (project_id, system_type)
- `uq_mepf_hydraulic_code`: UNIQUE INDEX uq_mepf_hydraulic_code ON public.engineering_mepf_hydraulic_calculations USING btree (project_id, calc_code)

### engineering_mepf_nesting_plans

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| plan_code | text |  |  |
| material_type | text |  |  |
| stock_length_m | numeric(8,3) |  | `6.0` |
| total_required_pieces | integer |  | `0` |
| total_stock_bars_needed | integer |  | `0` |
| scrap_waste_percent | numeric(5,2) |  | `0` |
| cutting_patterns | jsonb |  | `'[]'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_mepf_nesting_plans_pkey`: UNIQUE INDEX engineering_mepf_nesting_plans_pkey ON public.engineering_mepf_nesting_plans USING btree (id)
- `idx_mepf_nesting_proj`: INDEX idx_mepf_nesting_proj ON public.engineering_mepf_nesting_plans USING btree (project_id)
- `uq_mepf_nesting_code`: UNIQUE INDEX uq_mepf_nesting_code ON public.engineering_mepf_nesting_plans USING btree (project_id, plan_code)

### engineering_mepf_predictive_assets

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| asset_code | text |  |  |
| asset_name | text |  |  |
| system_type | text |  |  |
| installation_date | date |  |  |
| operating_hours_total | numeric(10,2) |  | `0` |
| mtbf_hours | numeric(10,2) |  |  |
| remaining_useful_life_days | integer |  |  |
| health_score_percent | numeric(5,2) |  |  |
| next_maintenance_date | date |  |  |
| maintenance_action_recommended | text |  |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_mepf_predictive_assets_pkey`: UNIQUE INDEX engineering_mepf_predictive_assets_pkey ON public.engineering_mepf_predictive_assets USING btree (id)
- `idx_mepf_predictive_proj`: INDEX idx_mepf_predictive_proj ON public.engineering_mepf_predictive_assets USING btree (project_id, system_type)
- `uq_mepf_predictive_code`: UNIQUE INDEX uq_mepf_predictive_code ON public.engineering_mepf_predictive_assets USING btree (project_id, asset_code)

### engineering_mepf_takeoff_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| drawing_id | integer | ✓ |  |
| session_code | text |  |  |
| discipline | text |  |  |
| drawing_name | text |  |  |
| total_symbols_detected | integer |  | `0` |
| total_linear_meters | numeric(15,3) |  | `0` |
| total_duct_area_m2 | numeric(15,3) |  | `0` |
| inferred_fittings_count | integer |  | `0` |
| detected_elements | jsonb |  | `'[]'::jsonb` |
| fitting_summary | jsonb |  | `'{}'::jsonb` |
| boq_mapping_results | jsonb |  | `'[]'::jsonb` |
| vo_risk_summary | jsonb |  | `'{"has_vo_risk": false, "total_delta_vnd": 0}'::jsonb` |
| compliance_flags | jsonb |  | `'[]'::jsonb` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `drawing_id` → `drawings(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_mepf_takeoff_runs_pkey`: UNIQUE INDEX engineering_mepf_takeoff_runs_pkey ON public.engineering_mepf_takeoff_runs USING btree (id)
- `idx_mepf_takeoff_proj`: INDEX idx_mepf_takeoff_proj ON public.engineering_mepf_takeoff_runs USING btree (project_id, discipline)
- `uq_mepf_takeoff_project_code`: UNIQUE INDEX uq_mepf_takeoff_project_code ON public.engineering_mepf_takeoff_runs USING btree (project_id, session_code)

### engineering_mepf_tc_logs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| matrix_id | uuid |  |  |
| reading_time | timestamptz |  | `now()` |
| sensor_code | text | ✓ |  |
| recorded_value | numeric(10,3) |  |  |
| unit | text |  |  |
| ambient_temp_c | numeric(5,2) | ✓ |  |
| notes | text | ✓ |  |
| is_anomaly | boolean |  | `false` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `matrix_id` → `engineering_mepf_tc_matrices(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_mepf_tc_logs_pkey`: UNIQUE INDEX engineering_mepf_tc_logs_pkey ON public.engineering_mepf_tc_logs USING btree (id)
- `idx_mepf_tc_logs_matrix`: INDEX idx_mepf_tc_logs_matrix ON public.engineering_mepf_tc_logs USING btree (matrix_id, reading_time DESC)

### engineering_mepf_tc_matrices

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| matrix_code | text |  |  |
| title | text |  |  |
| test_type | text |  |  |
| system_code | text |  |  |
| floor_label | text |  |  |
| zone_label | text |  | `'Main'::text` |
| test_package_name | text |  |  |
| design_pressure_bar | numeric(8,2) | ✓ |  |
| test_pressure_bar | numeric(8,2) | ✓ |  |
| holding_duration_minutes | integer |  | `120` |
| allowable_drop_bar | numeric(8,2) |  | `0.2` |
| status | text |  | `'draft'::text` |
| interlock_logic | jsonb |  | `'[]'::jsonb` |
| assigned_inspector | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `assigned_inspector` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_mepf_tc_matrices_pkey`: UNIQUE INDEX engineering_mepf_tc_matrices_pkey ON public.engineering_mepf_tc_matrices USING btree (id)
- `idx_mepf_tc_matrices_proj`: INDEX idx_mepf_tc_matrices_proj ON public.engineering_mepf_tc_matrices USING btree (project_id, status)
- `uq_mepf_tc_matrix_project_code`: UNIQUE INDEX uq_mepf_tc_matrix_project_code ON public.engineering_mepf_tc_matrices USING btree (project_id, matrix_code)

### engineering_mepf_voice_logs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| transcribed_text | text |  |  |
| extracted_location | text |  |  |
| extracted_spool_code | text | ✓ |  |
| updated_stage | text | ✓ |  |
| defect_created | boolean |  | `false` |
| defect_description | text | ✓ |  |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_mepf_voice_logs_pkey`: UNIQUE INDEX engineering_mepf_voice_logs_pkey ON public.engineering_mepf_voice_logs USING btree (id)
- `idx_mepf_voice_proj`: INDEX idx_mepf_voice_proj ON public.engineering_mepf_voice_logs USING btree (project_id, created_at DESC)

### engineering_merkle_roots

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| batch_code | varchar(128) |  |  |
| merkle_root | varchar(64) |  |  |
| leaf_count | integer |  |  |
| start_timestamp | timestamptz |  |  |
| end_timestamp | timestamptz |  |  |
| previous_root | varchar(64) | ✓ |  |
| signature_token | varchar(256) |  |  |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_merkle_roots_pkey`: UNIQUE INDEX engineering_merkle_roots_pkey ON public.engineering_merkle_roots USING btree (id)
- `idx_merkle_roots_proj`: INDEX idx_merkle_roots_proj ON public.engineering_merkle_roots USING btree (project_id, created_at DESC)
- `uq_merkle_roots_project_batch`: UNIQUE INDEX uq_merkle_roots_project_batch ON public.engineering_merkle_roots USING btree (project_id, batch_code)

### engineering_modular_skids

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| skid_code | text |  |  |
| skid_type | text |  |  |
| title | text |  |  |
| frame_width_mm | numeric(10,2) |  | `1200.00` |
| frame_length_mm | numeric(10,2) |  | `2400.00` |
| frame_height_mm | numeric(10,2) |  | `1800.00` |
| total_skid_weight_kg | numeric(10,2) |  | `0.00` |
| included_equipment | jsonb |  | `'[]'::jsonb` |
| included_spools | jsonb |  | `'[]'::jsonb` |
| inlet_flange_spec | text |  | `'DN100 PN16 Flange'::text` |
| outlet_flange_spec | text |  | `'DN100 PN16 Flange'::text` |
| electrical_kw_rating | numeric(8,2) |  | `0.00` |
| qr_skid_token | text |  |  |
| status | text |  | `'designed'::text` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_modular_skids_pkey`: UNIQUE INDEX engineering_modular_skids_pkey ON public.engineering_modular_skids USING btree (id)
- `engineering_modular_skids_project_id_skid_code_key`: UNIQUE INDEX engineering_modular_skids_project_id_skid_code_key ON public.engineering_modular_skids USING btree (project_id, skid_code)
- `idx_modular_skids_project`: INDEX idx_modular_skids_project ON public.engineering_modular_skids USING btree (project_id, skid_type)

### engineering_object_relations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| from_object_id | uuid |  |  |
| to_object_id | uuid |  |  |
| relation_type | text |  |  |
| properties | jsonb |  | `'{}'::jsonb` |
| source_revision_id | uuid | ✓ |  |
| created_by | integer |  |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `from_object_id` → `engineering_objects(id)`
- `from_object_id` → `engineering_objects(id)`
- `project_id` → `projects(id)`
- `project_id` → `engineering_source_revisions(project_id)`
- `project_id` → `engineering_objects(project_id)`
- `project_id` → `engineering_objects(project_id)`
- `source_revision_id` → `engineering_source_revisions(id)`
- `source_revision_id` → `engineering_source_revisions(id)`
- `to_object_id` → `engineering_objects(id)`
- `to_object_id` → `engineering_objects(id)`

**Index:**
- `engineering_object_relations_pkey`: UNIQUE INDEX engineering_object_relations_pkey ON public.engineering_object_relations USING btree (id)
- `idx_engineering_object_relations_from`: INDEX idx_engineering_object_relations_from ON public.engineering_object_relations USING btree (from_object_id)
- `idx_engineering_object_relations_project`: INDEX idx_engineering_object_relations_project ON public.engineering_object_relations USING btree (project_id)
- `idx_engineering_object_relations_to`: INDEX idx_engineering_object_relations_to ON public.engineering_object_relations USING btree (to_object_id)
- `uq_engineering_object_relations_logical`: UNIQUE INDEX uq_engineering_object_relations_logical ON public.engineering_object_relations USING btree (project_id, from_object_id, to_object_id, relation_type, COALESCE(source_revision_id, '00000000-0000-0000-0000-000000000000'::uuid))

### engineering_object_revisions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| object_id | uuid |  |  |
| revision_no | integer |  |  |
| source_revision_id | uuid | ✓ |  |
| object_type | text |  |  |
| discipline | text | ✓ |  |
| name | text | ✓ |  |
| status | text |  |  |
| properties | jsonb |  | `'{}'::jsonb` |
| geometry_ref | jsonb |  | `'{}'::jsonb` |
| change_reason | text | ✓ |  |
| created_by | integer |  |  |
| created_at | timestamptz |  | `now()` |
| project_id | integer |  |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `object_id` → `engineering_objects(id)`
- `object_id` → `engineering_objects(id)`
- `project_id` → `engineering_objects(project_id)`
- `project_id` → `engineering_source_revisions(project_id)`
- `source_revision_id` → `engineering_source_revisions(id)`
- `source_revision_id` → `engineering_source_revisions(id)`

**Index:**
- `engineering_object_revisions_object_id_revision_no_key`: UNIQUE INDEX engineering_object_revisions_object_id_revision_no_key ON public.engineering_object_revisions USING btree (object_id, revision_no)
- `engineering_object_revisions_pkey`: UNIQUE INDEX engineering_object_revisions_pkey ON public.engineering_object_revisions USING btree (id)
- `idx_engineering_object_revisions_object`: INDEX idx_engineering_object_revisions_object ON public.engineering_object_revisions USING btree (object_id, revision_no DESC)
- `idx_engineering_object_revisions_project`: INDEX idx_engineering_object_revisions_project ON public.engineering_object_revisions USING btree (project_id)

### engineering_object_types

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| key | text |  |  |
| label | text |  |  |
| discipline | text | ✓ |  |
| schema_version | text |  | `'1.0'::text` |
| is_active | boolean |  | `true` |
| created_at | timestamptz |  | `now()` |

**Index:**
- `engineering_object_types_pkey`: UNIQUE INDEX engineering_object_types_pkey ON public.engineering_object_types USING btree (key)

### engineering_objects

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| object_type | text |  |  |
| discipline | text | ✓ |  |
| external_key | text | ✓ |  |
| name | text | ✓ |  |
| status | text |  | `'pending_review'::text` |
| properties | jsonb |  | `'{}'::jsonb` |
| geometry_ref | jsonb |  | `'{}'::jsonb` |
| source_revision_id | uuid | ✓ |  |
| created_by | integer |  |  |
| updated_by | integer |  |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `project_id` → `engineering_source_revisions(project_id)`
- `source_revision_id` → `engineering_source_revisions(id)`
- `source_revision_id` → `engineering_source_revisions(id)`
- `updated_by` → `users(id)`

**Index:**
- `engineering_objects_pkey`: UNIQUE INDEX engineering_objects_pkey ON public.engineering_objects USING btree (id)
- `idx_engineering_objects_project_status`: INDEX idx_engineering_objects_project_status ON public.engineering_objects USING btree (project_id, status)
- `idx_engineering_objects_project_type`: INDEX idx_engineering_objects_project_type ON public.engineering_objects USING btree (project_id, object_type)
- `uq_engineering_objects_external`: UNIQUE INDEX uq_engineering_objects_external ON public.engineering_objects USING btree (project_id, external_key) WHERE (external_key IS NOT NULL)
- `uq_engineering_objects_id_project`: UNIQUE INDEX uq_engineering_objects_id_project ON public.engineering_objects USING btree (id, project_id)

### engineering_pipe_micro_bom_items

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| spool_id | uuid | ✓ |  |
| level_tier | integer |  |  |
| category | text |  |  |
| item_code | text |  |  |
| item_name | text |  |  |
| spec | text |  |  |
| quantity | numeric(12,4) |  | `0.0000` |
| unit | text |  |  |
| unit_cost_vnd | numeric(14,2) |  | `0.00` |
| total_cost_vnd | numeric(14,2) |  | `0.00` |
| is_kitted | boolean |  | `false` |
| kitting_box_code | text | ✓ |  |
| created_at | timestamptz |  | `now()` |
| tower_label | text | ✓ | `'Tower-A'::text` |
| floor_label | text | ✓ |  |
| shaft_label | text | ✓ |  |
| zone_label | text | ✓ |  |
| apartment_label | text | ✓ |  |
| pipeline_code | text | ✓ |  |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `spool_id` → `engineering_pipe_spools(id)`

**Index:**
- `engineering_pipe_micro_bom_items_pkey`: UNIQUE INDEX engineering_pipe_micro_bom_items_pkey ON public.engineering_pipe_micro_bom_items USING btree (id)
- `idx_micro_bom_project`: INDEX idx_micro_bom_project ON public.engineering_pipe_micro_bom_items USING btree (project_id, level_tier)
- `idx_micro_bom_shaft`: INDEX idx_micro_bom_shaft ON public.engineering_pipe_micro_bom_items USING btree (project_id, shaft_label)
- `idx_micro_bom_spatial`: INDEX idx_micro_bom_spatial ON public.engineering_pipe_micro_bom_items USING btree (project_id, tower_label, floor_label, apartment_label)
- `idx_micro_bom_spool`: INDEX idx_micro_bom_spool ON public.engineering_pipe_micro_bom_items USING btree (spool_id)

### engineering_pipe_nesting_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| run_code | text |  |  |
| discipline | text |  | `'hvac'::text` |
| stock_length_mm | numeric(10,2) |  | `6000.00` |
| kerf_mm | numeric(5,2) |  | `2.00` |
| total_segments | integer |  | `0` |
| total_bars_used | integer |  | `0` |
| total_used_length_mm | numeric(14,2) |  | `0` |
| total_waste_mm | numeric(14,2) |  | `0` |
| waste_percent | numeric(5,2) |  | `0` |
| efficiency_grade | text |  | `'F'::text` |
| nesting_plan | jsonb |  | `'[]'::jsonb` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_pipe_nesting_runs_pkey`: UNIQUE INDEX engineering_pipe_nesting_runs_pkey ON public.engineering_pipe_nesting_runs USING btree (id)
- `engineering_pipe_nesting_runs_project_id_run_code_key`: UNIQUE INDEX engineering_pipe_nesting_runs_project_id_run_code_key ON public.engineering_pipe_nesting_runs USING btree (project_id, run_code)
- `idx_pipe_nesting_runs_discipline`: INDEX idx_pipe_nesting_runs_discipline ON public.engineering_pipe_nesting_runs USING btree (project_id, discipline)
- `idx_pipe_nesting_runs_project`: INDEX idx_pipe_nesting_runs_project ON public.engineering_pipe_nesting_runs USING btree (project_id, created_at DESC)

### engineering_pipe_remnant_inventory

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| remnant_code | text |  |  |
| diameter_mm | numeric(8,2) |  |  |
| material_type | text |  |  |
| remaining_length_mm | numeric(10,2) |  |  |
| source_stock_bar_code | text | ✓ |  |
| warehouse_bin_location | text | ✓ |  |
| qr_tag_token | text |  |  |
| status | text |  | `'available'::text` |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_pipe_remnant_inventory_pkey`: UNIQUE INDEX engineering_pipe_remnant_inventory_pkey ON public.engineering_pipe_remnant_inventory USING btree (id)
- `engineering_pipe_remnant_inventory_project_id_remnant_code_key`: UNIQUE INDEX engineering_pipe_remnant_inventory_project_id_remnant_code_key ON public.engineering_pipe_remnant_inventory USING btree (project_id, remnant_code)
- `idx_pipe_remnants_project`: INDEX idx_pipe_remnants_project ON public.engineering_pipe_remnant_inventory USING btree (project_id, status)
- `idx_pipe_remnants_spec`: INDEX idx_pipe_remnants_spec ON public.engineering_pipe_remnant_inventory USING btree (project_id, material_type, diameter_mm)

### engineering_pipe_spatial_qto_summaries

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| dimension_type | text |  |  |
| dimension_key | text |  |  |
| filter_scope | jsonb |  | `'{}'::jsonb` |
| total_spools_count | integer |  | `0` |
| total_cut_length_m | numeric(12,3) |  | `0.000` |
| pipe_summary_by_spec | jsonb |  | `'{}'::jsonb` |
| fittings_count_by_type | jsonb |  | `'{}'::jsonb` |
| consumables_summary | jsonb |  | `'{}'::jsonb` |
| supports_summary | jsonb |  | `'{}'::jsonb` |
| total_cost_vnd | numeric(14,2) |  | `0.00` |
| kitting_box_code | text | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_pipe_spatial_qto__project_id_dimension_type_dim_key`: UNIQUE INDEX engineering_pipe_spatial_qto__project_id_dimension_type_dim_key ON public.engineering_pipe_spatial_qto_summaries USING btree (project_id, dimension_type, dimension_key)
- `engineering_pipe_spatial_qto_summaries_pkey`: UNIQUE INDEX engineering_pipe_spatial_qto_summaries_pkey ON public.engineering_pipe_spatial_qto_summaries USING btree (id)
- `idx_spatial_qto_project`: INDEX idx_spatial_qto_project ON public.engineering_pipe_spatial_qto_summaries USING btree (project_id, dimension_type)

### engineering_pipe_spool_fittings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| spool_id | uuid |  |  |
| fitting_code | text |  |  |
| fitting_type | text |  |  |
| nominal_dia_primary_mm | numeric(8,2) |  |  |
| nominal_dia_secondary_mm | numeric(8,2) | ✓ |  |
| material_type | text |  | `'upvc'::text` |
| center_to_face_mm | numeric(8,2) |  | `0.00` |
| socket_depth_mm | numeric(8,2) |  | `0.00` |
| take_off_mm | numeric(8,2) |  | `0.00` |
| stop_ridge_mm | numeric(6,2) |  | `0.00` |
| is_field_installed | boolean |  | `false` |
| quantity | integer |  | `1` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `spool_id` → `engineering_pipe_spools(id)`

**Index:**
- `engineering_pipe_spool_fittings_pkey`: UNIQUE INDEX engineering_pipe_spool_fittings_pkey ON public.engineering_pipe_spool_fittings USING btree (id)
- `idx_spool_fittings_project`: INDEX idx_spool_fittings_project ON public.engineering_pipe_spool_fittings USING btree (project_id)
- `idx_spool_fittings_spool`: INDEX idx_spool_fittings_spool ON public.engineering_pipe_spool_fittings USING btree (spool_id)

### engineering_pipe_spool_tracking

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| spool_code | text |  |  |
| system_code | text |  |  |
| nominal_dia_mm | numeric(8,2) |  |  |
| material_type | text |  |  |
| design_length_mm | numeric(10,2) |  |  |
| cut_length_mm | numeric(10,2) |  |  |
| tower_label | text |  | `'Tower-A'::text` |
| floor_label | text |  | `'FL-12'::text` |
| zone_label | text |  | `'Zone-01'::text` |
| spatial_coords_start | jsonb |  | `'{"x": 0, "y": 0, "z": 0}'::jsonb` |
| spatial_coords_end | jsonb |  | `'{"x": 0, "y": 0, "z": 0}'::jsonb` |
| current_status | text |  | `'PO_ORDERED'::text` |
| current_location_tag | text | ✓ | `'CENTRAL_YARD_BIN_A4'::text` |
| staged_at | timestamptz | ✓ |  |
| holding_time_hours | numeric(8,2) | ✓ | `0.00` |
| installed_at | timestamptz | ✓ |  |
| scan_deviation_mm | numeric(6,2) | ✓ |  |
| assigned_subcon_id | bigint | ✓ |  |
| qr_spool_token | text |  |  |
| merkle_leaf_hash | text |  |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `assigned_subcon_id` → `suppliers(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_pipe_spool_tracking_pkey`: UNIQUE INDEX engineering_pipe_spool_tracking_pkey ON public.engineering_pipe_spool_tracking USING btree (id)
- `engineering_pipe_spool_tracking_project_id_spool_code_key`: UNIQUE INDEX engineering_pipe_spool_tracking_project_id_spool_code_key ON public.engineering_pipe_spool_tracking USING btree (project_id, spool_code)
- `idx_pipe_spool_track_loc`: INDEX idx_pipe_spool_track_loc ON public.engineering_pipe_spool_tracking USING btree (project_id, floor_label, zone_label)
- `idx_pipe_spool_track_proj`: INDEX idx_pipe_spool_track_proj ON public.engineering_pipe_spool_tracking USING btree (project_id, current_status)

### engineering_pipe_spools

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| spool_code | text |  |  |
| system_code | text |  | `'PLUMBING_WATER'::text` |
| discipline | text |  | `'plumbing'::text` |
| material_type | text |  | `'upvc'::text` |
| nominal_dia_mm | numeric(8,2) |  |  |
| outer_dia_mm | numeric(8,2) |  |  |
| c_to_c_length_mm | numeric(10,2) |  |  |
| cut_length_mm | numeric(10,2) |  |  |
| slope_percent | numeric(5,2) |  | `0.00` |
| weight_kg | numeric(8,2) |  | `0.00` |
| end1_prep | text |  | `'plain'::text` |
| end2_prep | text |  | `'plain'::text` |
| field_fit_allowance_mm | numeric(6,2) |  | `0.00` |
| zone_label | text | ✓ |  |
| floor_label | text | ✓ |  |
| drawing_ref | text | ✓ |  |
| qr_fabrication_token | text |  |  |
| isometric_data | jsonb |  | `'{}'::jsonb` |
| status | text |  | `'designed'::text` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |
| tower_label | text | ✓ | `'Tower-A'::text` |
| shaft_label | text | ✓ |  |
| apartment_label | text | ✓ |  |
| pipeline_code | text | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_pipe_spools_pkey`: UNIQUE INDEX engineering_pipe_spools_pkey ON public.engineering_pipe_spools USING btree (id)
- `engineering_pipe_spools_project_id_spool_code_key`: UNIQUE INDEX engineering_pipe_spools_project_id_spool_code_key ON public.engineering_pipe_spools USING btree (project_id, spool_code)
- `idx_pipe_spools_pipeline`: INDEX idx_pipe_spools_pipeline ON public.engineering_pipe_spools USING btree (project_id, pipeline_code)
- `idx_pipe_spools_project`: INDEX idx_pipe_spools_project ON public.engineering_pipe_spools USING btree (project_id, created_at DESC)
- `idx_pipe_spools_shaft`: INDEX idx_pipe_spools_shaft ON public.engineering_pipe_spools USING btree (project_id, shaft_label)
- `idx_pipe_spools_spatial`: INDEX idx_pipe_spools_spatial ON public.engineering_pipe_spools USING btree (project_id, tower_label, floor_label, zone_label, apartment_label)
- `idx_pipe_spools_status`: INDEX idx_pipe_spools_status ON public.engineering_pipe_spools USING btree (project_id, status)
- `idx_pipe_spools_system`: INDEX idx_pipe_spools_system ON public.engineering_pipe_spools USING btree (project_id, system_code)

### engineering_prediction_model_versions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| model_key | text |  |  |
| version | text |  |  |
| code_hash | text |  |  |
| metrics | jsonb |  | `'{}'::jsonb` |
| is_champion | boolean |  | `true` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `model_key` → `engineering_prediction_models(key)`

**Index:**
- `engineering_prediction_model_versions_model_key_version_key`: UNIQUE INDEX engineering_prediction_model_versions_model_key_version_key ON public.engineering_prediction_model_versions USING btree (model_key, version)
- `engineering_prediction_model_versions_pkey`: UNIQUE INDEX engineering_prediction_model_versions_pkey ON public.engineering_prediction_model_versions USING btree (id)

### engineering_prediction_models

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| key | text |  |  |
| label | text |  |  |
| use_case | text |  |  |
| risk_class | text |  |  |
| is_active | boolean |  | `true` |
| baseline_ref | text |  |  |
| created_at | timestamptz |  | `now()` |

**Index:**
- `engineering_prediction_models_pkey`: UNIQUE INDEX engineering_prediction_models_pkey ON public.engineering_prediction_models USING btree (key)

### engineering_prediction_outputs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| run_id | uuid | ✓ |  |
| project_id | integer |  |  |
| entity_type | text |  |  |
| entity_id | text |  |  |
| score | numeric |  |  |
| probability | numeric |  |  |
| uncertainty_bin | text |  |  |
| explanation | text |  |  |
| evidence_refs | jsonb |  | `'[]'::jsonb` |
| suggestion_id | uuid | ✓ |  |
| status | text |  | `'active'::text` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `run_id` → `engineering_prediction_runs(id)`
- `suggestion_id` → `engineering_suggestions(id)`

**Index:**
- `engineering_prediction_outputs_pkey`: UNIQUE INDEX engineering_prediction_outputs_pkey ON public.engineering_prediction_outputs USING btree (id)
- `idx_eng_pred_outputs_project`: INDEX idx_eng_pred_outputs_project ON public.engineering_prediction_outputs USING btree (project_id, status, score DESC)

### engineering_prediction_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| model_version_id | uuid | ✓ |  |
| use_case | text |  |  |
| status | text |  | `'completed'::text` |
| input_hash | text |  |  |
| started_at | timestamptz |  | `now()` |
| completed_at | timestamptz | ✓ |  |
| error_message | text | ✓ |  |

**Khóa ngoại:**
- `model_version_id` → `engineering_prediction_model_versions(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_prediction_runs_pkey`: UNIQUE INDEX engineering_prediction_runs_pkey ON public.engineering_prediction_runs USING btree (id)
- `idx_eng_pred_runs_project`: INDEX idx_eng_pred_runs_project ON public.engineering_prediction_runs USING btree (project_id, use_case, started_at DESC)

### engineering_prescriptive_scenarios

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| scenario_code | text |  |  |
| trigger_reason | text |  |  |
| target_metric | text |  |  |
| baseline_schedule_days | integer |  |  |
| baseline_cost_vnd | numeric(18,2) |  |  |
| status | text |  | `'simulated'::text` |
| simulated_options | jsonb |  | `'[]'::jsonb` |
| pareto_frontier | jsonb |  | `'[]'::jsonb` |
| recommended_option_index | integer | ✓ |  |
| approved_by | integer | ✓ |  |
| approved_at | timestamptz | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `approved_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_prescriptive_scenarios_pkey`: UNIQUE INDEX engineering_prescriptive_scenarios_pkey ON public.engineering_prescriptive_scenarios USING btree (id)
- `idx_prescriptive_scenarios_proj`: INDEX idx_prescriptive_scenarios_proj ON public.engineering_prescriptive_scenarios USING btree (project_id, status)
- `uq_prescriptive_scenarios_code`: UNIQUE INDEX uq_prescriptive_scenarios_code ON public.engineering_prescriptive_scenarios USING btree (project_id, scenario_code)

### engineering_project_health_snapshots

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| snapshot_date | date |  | `CURRENT_DATE` |
| health_index_percent | numeric(5,2) |  |  |
| spi_index | numeric(5,3) |  |  |
| cpi_index | numeric(5,3) |  |  |
| quality_pass_rate_percent | numeric(5,2) |  |  |
| projected_completion_p50 | date |  |  |
| projected_completion_p80 | date |  |  |
| projected_completion_p95 | date |  |  |
| risk_drivers | jsonb |  | `'[]'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_project_health_snapshots_pkey`: UNIQUE INDEX engineering_project_health_snapshots_pkey ON public.engineering_project_health_snapshots USING btree (id)
- `idx_project_health_proj`: INDEX idx_project_health_proj ON public.engineering_project_health_snapshots USING btree (project_id, snapshot_date DESC)

### engineering_qs_bom_explosions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| item_code | text |  |  |
| item_description | text |  |  |
| unit | text |  |  |
| contract_rate_vnd | numeric(15,2) |  |  |
| breakdown_material_main_vnd | numeric(15,2) |  |  |
| breakdown_material_aux_vnd | numeric(15,2) |  |  |
| breakdown_labor_vnd | numeric(15,2) |  |  |
| breakdown_machinery_vnd | numeric(15,2) |  |  |
| breakdown_margin_vnd | numeric(15,2) |  |  |
| target_subcon_rate_vnd | numeric(15,2) |  |  |
| bom_level_items | jsonb |  | `'[]'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_qs_bom_explosions_pkey`: UNIQUE INDEX engineering_qs_bom_explosions_pkey ON public.engineering_qs_bom_explosions USING btree (id)
- `idx_qs_bom_proj`: INDEX idx_qs_bom_proj ON public.engineering_qs_bom_explosions USING btree (project_id, item_code)
- `uq_qs_bom_code`: UNIQUE INDEX uq_qs_bom_code ON public.engineering_qs_bom_explosions USING btree (project_id, item_code)

### engineering_rebar_prepour_audits

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| audit_code | text |  |  |
| zone_label | text |  |  |
| slab_level | text |  | `'FL-02'::text` |
| element_name | text |  |  |
| design_pitch_mm | numeric(8,2) |  | `150.00` |
| measured_pitch_mm | numeric(8,2) |  | `150.00` |
| design_spacer_density_sqm | numeric(6,2) |  | `4.00` |
| measured_spacer_density_sqm | numeric(6,2) |  | `4.00` |
| pitch_deviation_mm | numeric(8,2) |  | `0.00` |
| circuit_breaker_status | text |  | `'PASS_PERMITTED'::text` |
| blocking_reasons | jsonb |  | `'[]'::jsonb` |
| photo_evidence_uris | jsonb |  | `'[]'::jsonb` |
| merkle_leaf_hash | text |  |  |
| audited_by | bigint | ✓ |  |
| audited_at | timestamptz |  | `now()` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `audited_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_rebar_prepour_audits_pkey`: UNIQUE INDEX engineering_rebar_prepour_audits_pkey ON public.engineering_rebar_prepour_audits USING btree (id)
- `engineering_rebar_prepour_audits_project_id_audit_code_key`: UNIQUE INDEX engineering_rebar_prepour_audits_project_id_audit_code_key ON public.engineering_rebar_prepour_audits USING btree (project_id, audit_code)
- `idx_rebar_audits_project`: INDEX idx_rebar_audits_project ON public.engineering_rebar_prepour_audits USING btree (project_id, created_at DESC)
- `idx_rebar_audits_zone`: INDEX idx_rebar_audits_zone ON public.engineering_rebar_prepour_audits USING btree (project_id, zone_label)

### engineering_relation_types

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| key | text |  |  |
| label | text |  |  |
| allowed_from_types | text[] |  | `'{}'::text[]` |
| allowed_to_types | text[] |  | `'{}'::text[]` |
| is_directed | boolean |  | `true` |
| is_acyclic | boolean |  | `false` |
| description | text | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Index:**
- `engineering_relation_types_pkey`: UNIQUE INDEX engineering_relation_types_pkey ON public.engineering_relation_types USING btree (key)

### engineering_remnant_inventory

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| remnant_barcode | text |  |  |
| material_type | text |  |  |
| spec_dimension | text |  |  |
| length_mm | numeric(10,2) |  |  |
| width_mm | numeric(10,2) | ✓ |  |
| thickness_mm | numeric(6,2) | ✓ | `1.00` |
| warehouse_bin_location | text | ✓ | `'RACK-REMNANT-01'::text` |
| is_allocated | boolean |  | `false` |
| allocated_to_spool_code | text | ✓ |  |
| status | text |  | `'available'::text` |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_remnant_inventory_pkey`: UNIQUE INDEX engineering_remnant_inventory_pkey ON public.engineering_remnant_inventory USING btree (id)
- `engineering_remnant_inventory_project_id_remnant_barcode_key`: UNIQUE INDEX engineering_remnant_inventory_project_id_remnant_barcode_key ON public.engineering_remnant_inventory USING btree (project_id, remnant_barcode)
- `idx_remnant_inv_project`: INDEX idx_remnant_inv_project ON public.engineering_remnant_inventory USING btree (project_id, material_type, status)

### engineering_scan_to_bim_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| scan_code | text |  |  |
| point_cloud_source | text |  |  |
| total_points_scanned | integer |  | `0` |
| spools_analyzed_count | integer |  | `0` |
| pass_rate_percent | numeric(5,2) |  | `0` |
| max_deviation_mm | numeric(8,2) |  | `0` |
| defects_count | integer |  | `0` |
| deviation_details | jsonb |  | `'[]'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_scan_to_bim_runs_pkey`: UNIQUE INDEX engineering_scan_to_bim_runs_pkey ON public.engineering_scan_to_bim_runs USING btree (id)
- `idx_scan_to_bim_proj`: INDEX idx_scan_to_bim_proj ON public.engineering_scan_to_bim_runs USING btree (project_id, created_at DESC)
- `uq_scan_to_bim_code`: UNIQUE INDEX uq_scan_to_bim_code ON public.engineering_scan_to_bim_runs USING btree (project_id, scan_code)

### engineering_shopdrawing_lod400_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| run_code | text |  |  |
| drawing_name | text |  |  |
| total_spools_generated | integer |  | `0` |
| slope_applied_percent | numeric(4,2) |  | `2.0` |
| flange_pairs_inserted | integer |  | `0` |
| insulation_spec | text | ✓ |  |
| sleeves_count | integer |  | `0` |
| sleeve_details | jsonb |  | `'[]'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_shopdrawing_lod400_runs_pkey`: UNIQUE INDEX engineering_shopdrawing_lod400_runs_pkey ON public.engineering_shopdrawing_lod400_runs USING btree (id)
- `idx_shopdrawing_lod400_proj`: INDEX idx_shopdrawing_lod400_proj ON public.engineering_shopdrawing_lod400_runs USING btree (project_id, created_at DESC)
- `uq_shopdrawing_lod400_code`: UNIQUE INDEX uq_shopdrawing_lod400_code ON public.engineering_shopdrawing_lod400_runs USING btree (project_id, run_code)

### engineering_sleeve_schedules

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| drawing_code | text |  |  |
| floor_id | text | ✓ |  |
| beam_ref | text |  |  |
| sleeve_type | text |  | `'pipe_sleeve'::text` |
| diameter_mm | numeric(8,2) |  |  |
| width_mm | numeric(8,2) | ✓ |  |
| height_mm | numeric(8,2) | ✓ |  |
| beam_depth_mm | numeric(8,2) |  |  |
| beam_span_mm | numeric(8,2) |  |  |
| coord_x | numeric(12,4) |  |  |
| coord_y | numeric(12,4) |  |  |
| coord_z | numeric(12,4) |  |  |
| is_structural_approved | boolean |  | `false` |
| validation_result | jsonb |  | `'{}'::jsonb` |
| status | text |  | `'proposed'::text` |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| updated_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_sleeve_schedules_pkey`: UNIQUE INDEX engineering_sleeve_schedules_pkey ON public.engineering_sleeve_schedules USING btree (id)
- `idx_sleeve_proj_drawing`: INDEX idx_sleeve_proj_drawing ON public.engineering_sleeve_schedules USING btree (project_id, drawing_code, status)

### engineering_smart_ipc_records

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| ipc_number | text |  |  |
| period_month | text |  |  |
| contractor_name | text |  |  |
| gross_claimed_vnd | numeric(16,2) |  | `0.00` |
| net_payable_vnd | numeric(16,2) |  | `0.00` |
| retention_amount_vnd | numeric(16,2) |  | `0.00` |
| gate1_geometry_passed | boolean |  | `true` |
| gate2_bbnt_signed_passed | boolean |  | `true` |
| gate3_hydro_iot_passed | boolean |  | `true` |
| gate4_quad_reconcile_passed | boolean |  | `true` |
| all_gates_cleared | boolean |  | `true` |
| merkle_seal_hash | text |  |  |
| banking_payment_payload | jsonb | ✓ | `'{}'::jsonb` |
| payment_status | text |  | `'released'::text` |
| released_at | timestamptz |  | `now()` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| supplier_id | integer | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `engineering_smart_ipc_records_pkey`: UNIQUE INDEX engineering_smart_ipc_records_pkey ON public.engineering_smart_ipc_records USING btree (id)
- `engineering_smart_ipc_records_project_id_ipc_number_key`: UNIQUE INDEX engineering_smart_ipc_records_project_id_ipc_number_key ON public.engineering_smart_ipc_records USING btree (project_id, ipc_number)
- `engineering_smart_ipc_records_supplier_idx`: INDEX engineering_smart_ipc_records_supplier_idx ON public.engineering_smart_ipc_records USING btree (supplier_id)
- `idx_smart_ipc_project`: INDEX idx_smart_ipc_project ON public.engineering_smart_ipc_records USING btree (project_id, created_at DESC)
- `idx_smart_ipc_status`: INDEX idx_smart_ipc_status ON public.engineering_smart_ipc_records USING btree (project_id, payment_status)

### engineering_source_revisions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| source_id | uuid |  |  |
| revision_no | integer |  |  |
| object_key | text | ✓ |  |
| sha256 | text | ✓ |  |
| parser_name | text | ✓ |  |
| parser_version | text | ✓ |  |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_by | integer |  |  |
| created_at | timestamptz |  | `now()` |
| external_revision_key | text | ✓ |  |
| project_id | integer |  |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `engineering_sources(project_id)`
- `source_id` → `engineering_sources(id)`
- `source_id` → `engineering_sources(id)`

**Index:**
- `engineering_source_revisions_pkey`: UNIQUE INDEX engineering_source_revisions_pkey ON public.engineering_source_revisions USING btree (id)
- `engineering_source_revisions_source_id_revision_no_key`: UNIQUE INDEX engineering_source_revisions_source_id_revision_no_key ON public.engineering_source_revisions USING btree (source_id, revision_no)
- `idx_engineering_source_revisions_project`: INDEX idx_engineering_source_revisions_project ON public.engineering_source_revisions USING btree (project_id)
- `uq_eng_source_rev_id_project`: UNIQUE INDEX uq_eng_source_rev_id_project ON public.engineering_source_revisions USING btree (id, project_id)
- `uq_engineering_source_revisions_external`: UNIQUE INDEX uq_engineering_source_revisions_external ON public.engineering_source_revisions USING btree (source_id, external_revision_key) WHERE (external_revision_key IS NOT NULL)

### engineering_sources

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| source_type | text |  |  |
| title | text |  |  |
| object_key | text | ✓ |  |
| mime_type | text | ✓ |  |
| sha256 | text | ✓ |  |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_by | integer |  |  |
| created_at | timestamptz |  | `now()` |
| external_key | text | ✓ |  |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_sources_pkey`: UNIQUE INDEX engineering_sources_pkey ON public.engineering_sources USING btree (id)
- `idx_engineering_sources_project`: INDEX idx_engineering_sources_project ON public.engineering_sources USING btree (project_id, created_at DESC)
- `uq_engineering_sources_external`: UNIQUE INDEX uq_engineering_sources_external ON public.engineering_sources USING btree (project_id, external_key) WHERE (external_key IS NOT NULL)
- `uq_engineering_sources_id_project`: UNIQUE INDEX uq_engineering_sources_id_project ON public.engineering_sources USING btree (id, project_id)

### engineering_spatial_annotations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| drawing_code | text |  |  |
| floor_id | text | ✓ |  |
| annot_type | text |  |  |
| coord_x | numeric(12,4) |  |  |
| coord_y | numeric(12,4) |  |  |
| coord_z | numeric(12,4) | ✓ | `0` |
| geom_payload | jsonb | ✓ | `'{}'::jsonb` |
| entity_ref_type | text | ✓ |  |
| entity_ref_id | text | ✓ |  |
| title | text |  |  |
| description | text | ✓ |  |
| severity | text | ✓ | `'normal'::text` |
| status | text | ✓ | `'open'::text` |
| metadata | jsonb | ✓ | `'{}'::jsonb` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| updated_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_spatial_annotations_pkey`: UNIQUE INDEX engineering_spatial_annotations_pkey ON public.engineering_spatial_annotations USING btree (id)
- `idx_spatial_annot_entity_ref`: INDEX idx_spatial_annot_entity_ref ON public.engineering_spatial_annotations USING btree (project_id, entity_ref_type, entity_ref_id)
- `idx_spatial_annot_proj_drawing`: INDEX idx_spatial_annot_proj_drawing ON public.engineering_spatial_annotations USING btree (project_id, drawing_code, status)

### engineering_spatial_compute_cache

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| cache_key | varchar(128) |  |  |
| algorithm_version | varchar(32) |  |  |
| input_hash | varchar(64) |  |  |
| output_data | jsonb |  |  |
| hit_count | bigint |  | `1` |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| updated_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_spatial_compute_cache_pkey`: UNIQUE INDEX engineering_spatial_compute_cache_pkey ON public.engineering_spatial_compute_cache USING btree (id)
- `idx_spatial_cache_lookup`: INDEX idx_spatial_cache_lookup ON public.engineering_spatial_compute_cache USING btree (project_id, cache_key)
- `uq_spatial_cache_key`: UNIQUE INDEX uq_spatial_cache_key ON public.engineering_spatial_compute_cache USING btree (project_id, cache_key)

### engineering_spool_isometrics

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| spool_code | text |  |  |
| discipline | text |  | `'MEPF'::text` |
| system_code | text |  |  |
| nominal_diameter_mm | numeric(8,2) |  | `50.00` |
| pipe_material | text |  | `'Galvanized Steel / Sch40'::text` |
| centerline_length_mm | numeric(10,2) |  |  |
| cut_length_mm | numeric(10,2) |  |  |
| socket_insertion_deduction_mm | numeric(8,2) |  | `0.00` |
| field_fit_allowance_mm | numeric(8,2) |  | `0.00` |
| bubble_tags | jsonb |  | `'[]'::jsonb` |
| micro_bom_items | jsonb |  | `'[]'::jsonb` |
| svg_isometric_vector | text | ✓ |  |
| qr_spool_token | text |  |  |
| status | text |  | `'ready_for_fab'::text` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_spool_isometrics_pkey`: UNIQUE INDEX engineering_spool_isometrics_pkey ON public.engineering_spool_isometrics USING btree (id)
- `engineering_spool_isometrics_project_id_spool_code_key`: UNIQUE INDEX engineering_spool_isometrics_project_id_spool_code_key ON public.engineering_spool_isometrics USING btree (project_id, spool_code)
- `idx_spool_isometrics_project`: INDEX idx_spool_isometrics_project ON public.engineering_spool_isometrics USING btree (project_id, system_code)

### engineering_subcon_bidding_recommendations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| package_name | text |  |  |
| discipline | text |  |  |
| estimated_budget | numeric(15,2) |  |  |
| required_capacity | integer | ✓ | `10` |
| recommended_profiles | jsonb |  | `'[]'::jsonb` |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_subcon_bidding_recommendations_pkey`: UNIQUE INDEX engineering_subcon_bidding_recommendations_pkey ON public.engineering_subcon_bidding_recommendations USING btree (id)

### engineering_subcon_performance_metrics

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| profile_id | uuid |  |  |
| evaluation_period | text |  |  |
| on_time_completion_rate | numeric(5,2) | ✓ | `100.00` |
| bbnt_pass_rate | numeric(5,2) | ✓ | `100.00` |
| ncr_incident_count | integer | ✓ | `0` |
| hse_safety_score | numeric(5,2) | ✓ | `95.00` |
| cost_variance_rate | numeric(5,2) | ✓ | `0.00` |
| trust_score | numeric(5,2) |  | `85.00` |
| tier_grade | text |  | `'TIER_B'::text` |
| ai_analysis_summary | text | ✓ |  |
| evaluated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `profile_id` → `engineering_subcon_profiles(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_subcon_performance_metrics_pkey`: UNIQUE INDEX engineering_subcon_performance_metrics_pkey ON public.engineering_subcon_performance_metrics USING btree (id)

### engineering_subcon_profiles

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| supplier_id | bigint | ✓ |  |
| company_name | text |  |  |
| tax_code | text | ✓ |  |
| primary_discipline | text |  |  |
| specialties | jsonb | ✓ | `'[]'::jsonb` |
| workforce_capacity | integer | ✓ | `20` |
| equipment_assets | jsonb | ✓ | `'[]'::jsonb` |
| certifications | jsonb | ✓ | `'[]'::jsonb` |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `supplier_id` → `suppliers(id)`

**Index:**
- `engineering_subcon_profiles_pkey`: UNIQUE INDEX engineering_subcon_profiles_pkey ON public.engineering_subcon_profiles USING btree (id)
- `engineering_subcon_profiles_project_supplier_uniq`: UNIQUE INDEX engineering_subcon_profiles_project_supplier_uniq ON public.engineering_subcon_profiles USING btree (project_id, supplier_id) WHERE (supplier_id IS NOT NULL)

### engineering_suggestions

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| package_id | uuid | ✓ |  |
| project_id | integer |  |  |
| object_id | uuid | ✓ |  |
| suggestion_class | text |  |  |
| title | text |  |  |
| body | text | ✓ |  |
| priority | text |  |  |
| severity | text |  | `'medium'::text` |
| confidence | text |  | `'unknown'::text` |
| confidence_signals | jsonb |  | `'{}'::jsonb` |
| impact | text | ✓ |  |
| urgency | text | ✓ |  |
| reversible | boolean | ✓ |  |
| estimated_effort | text | ✓ |  |
| status | text |  | `'open'::text` |
| decided_by | integer | ✓ |  |
| decided_at | timestamptz | ✓ |  |
| decision_note | text | ✓ |  |
| workflow_id | uuid | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `decided_by` → `users(id)`
- `object_id` → `engineering_objects(id)`
- `object_id` → `engineering_objects(id)`
- `package_id` → `engineering_intelligence_packages(id)`
- `package_id` → `engineering_intelligence_packages(id)`
- `project_id` → `projects(id)`
- `project_id` → `engineering_objects(project_id)`
- `project_id` → `engineering_intelligence_packages(project_id)`
- `project_id` → `engineering_workflows(project_id)`
- `workflow_id` → `engineering_workflows(id)`

**Index:**
- `engineering_suggestions_pkey`: UNIQUE INDEX engineering_suggestions_pkey ON public.engineering_suggestions USING btree (id)
- `idx_eng_sug_object`: INDEX idx_eng_sug_object ON public.engineering_suggestions USING btree (object_id)
- `idx_eng_sug_package`: INDEX idx_eng_sug_package ON public.engineering_suggestions USING btree (package_id)
- `idx_eng_sug_project_class`: INDEX idx_eng_sug_project_class ON public.engineering_suggestions USING btree (project_id, suggestion_class)
- `idx_eng_sug_project_status`: INDEX idx_eng_sug_project_status ON public.engineering_suggestions USING btree (project_id, status)
- `uq_engineering_suggestions_id_project`: UNIQUE INDEX uq_engineering_suggestions_id_project ON public.engineering_suggestions USING btree (id, project_id)

### engineering_swarm_arguments

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| debate_id | uuid |  |  |
| agent_role | text |  |  |
| stance | text |  |  |
| authority_weight | numeric(4,2) |  | `1.00` |
| argument_text | text |  |  |
| cited_clauses | jsonb |  | `'[]'::jsonb` |
| impact_assessment | jsonb |  | `'{"risk_score": 0, "cost_delta_vnd": 0, "schedule_delta_days": 0}'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `debate_id` → `engineering_swarm_debates(id)`

**Index:**
- `engineering_swarm_arguments_pkey`: UNIQUE INDEX engineering_swarm_arguments_pkey ON public.engineering_swarm_arguments USING btree (id)

### engineering_swarm_debates

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| debate_topic | text |  |  |
| trigger_event | text |  |  |
| participating_agents | jsonb |  | `'["agent_structural", "agent_mepf", "agent_cost_qs", "agent_safety", "agent_contract"]'::jsonb` |
| status | text |  | `'open'::text` |
| synthesis_summary | text | ✓ |  |
| consensus_level | text | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `engineering_swarm_debates_pkey`: UNIQUE INDEX engineering_swarm_debates_pkey ON public.engineering_swarm_debates USING btree (id)
- `idx_swarm_debates_proj`: INDEX idx_swarm_debates_proj ON public.engineering_swarm_debates USING btree (project_id, status)

### engineering_trapeze_hangers

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| hanger_code | text |  |  |
| corridor_layout_id | uuid | ✓ |  |
| location_station_m | numeric(8,2) |  | `0.00` |
| span_width_mm | numeric(10,2) |  | `1200.00` |
| drop_length_mm | numeric(10,2) |  | `600.00` |
| tiers_count | integer |  | `2` |
| total_load_kg | numeric(10,2) |  | `0.00` |
| factored_load_n | numeric(12,2) |  | `0.00` |
| selected_unistrut_spec | text |  | `'Unistrut P1000 41x41x2.5mm'::text` |
| unistrut_bending_stress_mpa | numeric(10,2) |  | `0.00` |
| allowable_bending_stress_mpa | numeric(10,2) |  | `160.00` |
| max_deflection_mm | numeric(8,2) |  | `0.00` |
| allowable_deflection_mm | numeric(8,2) |  | `3.33` |
| selected_rod_diameter_mm | numeric(6,2) |  | `10.00` |
| rod_tensile_stress_mpa | numeric(10,2) |  | `0.00` |
| safety_check_status | text |  | `'pass'::text` |
| anchor_type | text |  | `'M10 Wedge Anchor / Drop-in Anchor'::text` |
| lisp_script | text | ✓ |  |
| created_by | bigint | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `corridor_layout_id` → `engineering_corridor_layouts(id)`
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_trapeze_hangers_pkey`: UNIQUE INDEX engineering_trapeze_hangers_pkey ON public.engineering_trapeze_hangers USING btree (id)
- `engineering_trapeze_hangers_project_id_hanger_code_key`: UNIQUE INDEX engineering_trapeze_hangers_project_id_hanger_code_key ON public.engineering_trapeze_hangers USING btree (project_id, hanger_code)
- `idx_trapeze_hangers_layout`: INDEX idx_trapeze_hangers_layout ON public.engineering_trapeze_hangers USING btree (corridor_layout_id)
- `idx_trapeze_hangers_project`: INDEX idx_trapeze_hangers_project ON public.engineering_trapeze_hangers USING btree (project_id, created_at DESC)

### engineering_twin_bindings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| object_id | uuid |  |  |
| binding_type | text |  |  |
| target_key | text |  |  |
| target_id | text | ✓ |  |
| source_revision_id | uuid | ✓ |  |
| authority | text |  | `'primary_spec'::text` |
| metadata | jsonb |  | `'{}'::jsonb` |
| valid_from | timestamptz |  | `now()` |
| valid_to | timestamptz | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `object_id` → `engineering_objects(id)`
- `project_id` → `projects(id)`
- `source_revision_id` → `engineering_source_revisions(id)`

**Index:**
- `engineering_twin_bindings_pkey`: UNIQUE INDEX engineering_twin_bindings_pkey ON public.engineering_twin_bindings USING btree (id)
- `idx_eng_twin_bindings_lookup`: INDEX idx_eng_twin_bindings_lookup ON public.engineering_twin_bindings USING btree (project_id, object_id, binding_type)
- `idx_eng_twin_bindings_target`: INDEX idx_eng_twin_bindings_target ON public.engineering_twin_bindings USING btree (project_id, binding_type, target_key)

### engineering_twin_reality_captures

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| capture_code | text |  |  |
| capture_type | text |  |  |
| spatial_zone | text |  |  |
| elevation_level | text | ✓ |  |
| capture_timestamp | timestamptz |  |  |
| total_points | bigint | ✓ | `0` |
| storage_uri | text |  |  |
| bounding_box | jsonb |  | `'{}'::jsonb` |
| processing_status | text |  | `'completed'::text` |
| metadata | jsonb |  | `'{}'::jsonb` |
| created_by | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_twin_reality_captures_pkey`: UNIQUE INDEX engineering_twin_reality_captures_pkey ON public.engineering_twin_reality_captures USING btree (id)
- `uq_reality_captures_project_code`: UNIQUE INDEX uq_reality_captures_project_code ON public.engineering_twin_reality_captures USING btree (project_id, capture_code)

### engineering_twin_sensor_streams

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| sensor_code | text |  |  |
| sensor_type | text |  |  |
| object_id | uuid | ✓ |  |
| sampling_interval_seconds | integer |  | `60` |
| latest_value | numeric(14,4) | ✓ |  |
| latest_unit | text | ✓ |  |
| latest_observed_at | timestamptz | ✓ |  |
| anomaly_status | text |  | `'normal'::text` |
| threshold_config | jsonb |  | `'{"max": null, "min": null, "critical_max": null}'::jsonb` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `object_id` → `engineering_objects(id)`
- `project_id` → `projects(id)`

**Index:**
- `engineering_twin_sensor_streams_pkey`: UNIQUE INDEX engineering_twin_sensor_streams_pkey ON public.engineering_twin_sensor_streams USING btree (id)
- `idx_twin_sensor_streams_proj`: INDEX idx_twin_sensor_streams_proj ON public.engineering_twin_sensor_streams USING btree (project_id, anomaly_status)
- `uq_sensor_streams_project_code`: UNIQUE INDEX uq_sensor_streams_project_code ON public.engineering_twin_sensor_streams USING btree (project_id, sensor_code)

### engineering_twin_spatial_deviations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| capture_id | uuid |  |  |
| object_id | uuid |  |  |
| element_guid | text | ✓ |  |
| deviation_type | text |  |  |
| measured_deviation_mm | numeric(10,2) |  |  |
| tolerance_threshold_mm | numeric(10,2) |  |  |
| severity | text |  |  |
| point_coordinates | jsonb |  | `'{"x": 0, "y": 0, "z": 0}'::jsonb` |
| remediation_status | text |  | `'open'::text` |
| suggestion_id | uuid | ✓ |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `capture_id` → `engineering_twin_reality_captures(id)`
- `object_id` → `engineering_objects(id)`
- `project_id` → `projects(id)`
- `suggestion_id` → `engineering_suggestions(id)`

**Index:**
- `engineering_twin_spatial_deviations_pkey`: UNIQUE INDEX engineering_twin_spatial_deviations_pkey ON public.engineering_twin_spatial_deviations USING btree (id)
- `idx_twin_spatial_deviations_proj`: INDEX idx_twin_spatial_deviations_proj ON public.engineering_twin_spatial_deviations USING btree (project_id, severity, remediation_status)

### engineering_twin_states

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| object_id | uuid |  |  |
| state_type | text |  |  |
| observed_at | timestamptz |  |  |
| ingested_at | timestamptz |  | `now()` |
| value | jsonb |  |  |
| unit | text | ✓ |  |
| schema_version | text |  | `'1.0'::text` |
| quality | text |  | `'high'::text` |
| source | text |  |  |
| valid_from | timestamptz |  | `now()` |
| valid_to | timestamptz | ✓ |  |
| supersedes_id | uuid | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `object_id` → `engineering_objects(id)`
- `project_id` → `projects(id)`
- `supersedes_id` → `engineering_twin_states(id)`

**Index:**
- `engineering_twin_states_pkey`: UNIQUE INDEX engineering_twin_states_pkey ON public.engineering_twin_states USING btree (id)
- `idx_eng_twin_states_object_time`: INDEX idx_eng_twin_states_object_time ON public.engineering_twin_states USING btree (project_id, object_id, state_type, observed_at DESC)

### engineering_workflow_events

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| workflow_id | uuid |  |  |
| from_state | text | ✓ |  |
| to_state | text |  |  |
| actor_id | integer | ✓ |  |
| gate_seq | integer | ✓ |  |
| reason | text | ✓ |  |
| detail | jsonb |  | `'{}'::jsonb` |
| created_at | timestamptz |  | `now()` |
| project_id | integer |  |  |

**Khóa ngoại:**
- `actor_id` → `users(id)`
- `project_id` → `engineering_workflows(project_id)`
- `workflow_id` → `engineering_workflows(id)`
- `workflow_id` → `engineering_workflows(id)`

**Index:**
- `engineering_workflow_events_pkey`: UNIQUE INDEX engineering_workflow_events_pkey ON public.engineering_workflow_events USING btree (id)
- `idx_eng_wf_events_wf`: INDEX idx_eng_wf_events_wf ON public.engineering_workflow_events USING btree (workflow_id, created_at)
- `idx_engineering_workflow_events_project`: INDEX idx_engineering_workflow_events_project ON public.engineering_workflow_events USING btree (project_id)

### engineering_workflow_gates

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| workflow_id | uuid |  |  |
| seq | integer |  |  |
| gate_type | text |  |  |
| required_role | text |  |  |
| decision | text | ✓ |  |
| decided_by | integer | ✓ |  |
| decided_at | timestamptz | ✓ |  |
| comments | text | ✓ |  |
| evidence | jsonb |  | `'{}'::jsonb` |
| created_at | timestamptz |  | `now()` |
| project_id | integer |  |  |

**Khóa ngoại:**
- `decided_by` → `users(id)`
- `project_id` → `engineering_workflows(project_id)`
- `workflow_id` → `engineering_workflows(id)`
- `workflow_id` → `engineering_workflows(id)`

**Index:**
- `engineering_workflow_gates_pkey`: UNIQUE INDEX engineering_workflow_gates_pkey ON public.engineering_workflow_gates USING btree (id)
- `engineering_workflow_gates_workflow_id_seq_key`: UNIQUE INDEX engineering_workflow_gates_workflow_id_seq_key ON public.engineering_workflow_gates USING btree (workflow_id, seq)
- `idx_eng_wf_gates_wf`: INDEX idx_eng_wf_gates_wf ON public.engineering_workflow_gates USING btree (workflow_id, seq)
- `idx_engineering_workflow_gates_project`: INDEX idx_engineering_workflow_gates_project ON public.engineering_workflow_gates USING btree (project_id)

### engineering_workflows

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer |  |  |
| suggestion_id | uuid | ✓ |  |
| title | text |  |  |
| description | text | ✓ |  |
| profile | text |  |  |
| risk_class | text |  |  |
| risk_inputs | jsonb |  | `'{}'::jsonb` |
| state | text |  | `'draft'::text` |
| reversible | boolean |  | `false` |
| rollback_strategy | text | ✓ |  |
| gate0_result | jsonb |  | `'{}'::jsonb` |
| created_by | integer |  |  |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `project_id` → `projects(id)`
- `project_id` → `engineering_suggestions(project_id)`
- `suggestion_id` → `engineering_suggestions(id)`
- `suggestion_id` → `engineering_suggestions(id)`

**Index:**
- `engineering_workflows_pkey`: UNIQUE INDEX engineering_workflows_pkey ON public.engineering_workflows USING btree (id)
- `idx_eng_wf_project_state`: INDEX idx_eng_wf_project_state ON public.engineering_workflows USING btree (project_id, state)
- `idx_eng_wf_suggestion`: INDEX idx_eng_wf_suggestion ON public.engineering_workflows USING btree (suggestion_id)
- `uq_engineering_workflows_id_project`: UNIQUE INDEX uq_engineering_workflows_id_project ON public.engineering_workflows USING btree (id, project_id)

### engineering_working_capital_risks

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| run_id | uuid |  |  |
| project_id | bigint |  |  |
| risk_level | text |  | `'LOW'::text` |
| dip_period | text | ✓ |  |
| max_deficit_amount | numeric(15,2) |  | `0` |
| mitigation_recommendation | text | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `run_id` → `engineering_cashflow_forecast_runs(id)`

**Index:**
- `engineering_working_capital_risks_pkey`: UNIQUE INDEX engineering_working_capital_risks_pkey ON public.engineering_working_capital_risks USING btree (id)
- `idx_engineering_working_capital_risks_project`: INDEX idx_engineering_working_capital_risks_project ON public.engineering_working_capital_risks USING btree (project_id)

### feature_flags

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| module_key | text |  |  |
| project_id | integer |  |  |
| enabled | boolean |  | `true` |
| updated_by | integer | ✓ |  |
| updated_at | timestamptz | ✓ | `now()` |
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`
- `project_id` → `projects(id)`
- `updated_by` → `users(id)`

**Index:**
- `feature_flags_pkey`: UNIQUE INDEX feature_flags_pkey ON public.feature_flags USING btree (module_key, project_id)

### health_check_runs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | bigint |  | `nextval('health_check_runs_id_seq'::regclass)` |
| checked_at | timestamptz |  | `now()` |
| has_issues | boolean |  |  |
| fail_count | integer |  | `0` |
| warn_count | integer |  | `0` |
| results | jsonb |  |  |
| notified | boolean |  | `false` |
| triggered_by | text |  | `'cron'::text` |

**Index:**
- `health_check_runs_pkey`: UNIQUE INDEX health_check_runs_pkey ON public.health_check_runs USING btree (id)
- `idx_health_check_runs_checked_at`: INDEX idx_health_check_runs_checked_at ON public.health_check_runs USING btree (checked_at DESC)

### import_batches

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('import_batches_id_seq'::regclass)` |
| project_id | integer | ✓ |  |
| source_name | text |  |  |
| source_sha256 | text |  |  |
| source_bytes | bigint | ✓ |  |
| dim_denominator_mode | text |  |  |
| options | jsonb |  | `'{}'::jsonb` |
| stats | jsonb |  | `'{}'::jsonb` |
| imported_by | integer | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `imported_by` → `users(id)`
- `project_id` → `projects(id)`

**Index:**
- `idx_import_batches_project_created`: INDEX idx_import_batches_project_created ON public.import_batches USING btree (project_id, created_at DESC)
- `idx_import_batches_sha256`: INDEX idx_import_batches_sha256 ON public.import_batches USING btree (source_sha256)
- `import_batches_pkey`: UNIQUE INDEX import_batches_pkey ON public.import_batches USING btree (id)

### organizations

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | integer |  | `nextval('organizations_id_seq'::regclass)` |
| name | text |  |  |
| tax_code | text | ✓ |  |
| slug | text | ✓ |  |
| status | text |  | `'active'::text` |
| plan | text | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Index:**
- `organizations_pkey`: UNIQUE INDEX organizations_pkey ON public.organizations USING btree (id)
- `organizations_slug_key`: UNIQUE INDEX organizations_slug_key ON public.organizations USING btree (slug)

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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `org_id` → `organizations(id)`
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

### telegram_bot_message_logs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | integer | ✓ |  |
| user_id | integer | ✓ |  |
| chat_id | bigint |  |  |
| message_type | text |  | `'text'::text` |
| raw_payload | jsonb |  | `'{}'::jsonb` |
| raw_text | text | ✓ |  |
| parsed_intent | text | ✓ |  |
| action_result | jsonb |  | `'{}'::jsonb` |
| status | text |  | `'processed'::text` |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `user_id` → `users(id)`

**Index:**
- `idx_telegram_logs_proj`: INDEX idx_telegram_logs_proj ON public.telegram_bot_message_logs USING btree (project_id, chat_id, created_at DESC)
- `telegram_bot_message_logs_pkey`: UNIQUE INDEX telegram_bot_message_logs_pkey ON public.telegram_bot_message_logs USING btree (id)

### telegram_user_bindings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| user_id | integer |  |  |
| telegram_chat_id | bigint | ✓ |  |
| telegram_username | text | ✓ |  |
| is_verified | boolean |  | `false` |
| otp_code | text | ✓ |  |
| otp_expires_at | timestamptz | ✓ |  |
| created_at | timestamptz |  | `CURRENT_TIMESTAMP` |
| updated_at | timestamptz |  | `CURRENT_TIMESTAMP` |

**Khóa ngoại:**
- `user_id` → `users(id)`

**Index:**
- `idx_telegram_user_chat`: INDEX idx_telegram_user_chat ON public.telegram_user_bindings USING btree (telegram_chat_id, is_verified)
- `telegram_user_bindings_pkey`: UNIQUE INDEX telegram_user_bindings_pkey ON public.telegram_user_bindings USING btree (id)
- `telegram_user_bindings_telegram_chat_id_key`: UNIQUE INDEX telegram_user_bindings_telegram_chat_id_key ON public.telegram_user_bindings USING btree (telegram_chat_id)
- `uq_telegram_user_bindings_cho_lien_ket`: UNIQUE INDEX uq_telegram_user_bindings_cho_lien_ket ON public.telegram_user_bindings USING btree (user_id) WHERE (is_verified = false)

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
| org_id | integer |  | `1` |

**Khóa ngoại:**
- `created_by` → `users(id)`
- `org_id` → `organizations(id)`
- `project_id` → `projects(id)`

**Index:**
- `webhooks_pkey`: UNIQUE INDEX webhooks_pkey ON public.webhooks USING btree (id)

### zalo_field_action_dispatches

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| zalo_user_id | text |  |  |
| action_type | text |  |  |
| payload | jsonb |  | `'{}'::jsonb` |
| execution_status | text |  | `'SUCCESS'::text` |
| result_summary | text | ✓ |  |
| dispatched_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `idx_zalo_action_dispatches_project`: INDEX idx_zalo_action_dispatches_project ON public.zalo_field_action_dispatches USING btree (project_id)
- `zalo_field_action_dispatches_pkey`: UNIQUE INDEX zalo_field_action_dispatches_pkey ON public.zalo_field_action_dispatches USING btree (id)

### zalo_site_message_logs

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| zalo_user_id | text |  |  |
| message_direction | text |  | `'INCOMING'::text` |
| raw_text | text |  |  |
| intent | text |  | `'UNKNOWN'::text` |
| confidence | numeric(5,2) |  | `1.00` |
| parsed_entities | jsonb |  | `'{}'::jsonb` |
| response_text | text | ✓ |  |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`

**Index:**
- `idx_zalo_message_logs_project`: INDEX idx_zalo_message_logs_project ON public.zalo_site_message_logs USING btree (project_id)
- `idx_zalo_message_logs_zid`: INDEX idx_zalo_message_logs_zid ON public.zalo_site_message_logs USING btree (zalo_user_id)
- `zalo_site_message_logs_pkey`: UNIQUE INDEX zalo_site_message_logs_pkey ON public.zalo_site_message_logs USING btree (id)

### zalo_user_bindings

| Cột | Kiểu | Null | Default |
| --- | --- | --- | --- |
| id | uuid |  | `gen_random_uuid()` |
| project_id | bigint |  |  |
| user_id | bigint | ✓ |  |
| zalo_user_id | text |  |  |
| zalo_display_name | text | ✓ |  |
| phone_number | text | ✓ |  |
| verification_otp | text | ✓ |  |
| otp_expires_at | timestamptz | ✓ |  |
| is_verified | boolean |  | `false` |
| created_at | timestamptz |  | `now()` |

**Khóa ngoại:**
- `project_id` → `projects(id)`
- `user_id` → `users(id)`

**Index:**
- `idx_zalo_user_bindings_project`: INDEX idx_zalo_user_bindings_project ON public.zalo_user_bindings USING btree (project_id)
- `idx_zalo_user_bindings_zid`: INDEX idx_zalo_user_bindings_zid ON public.zalo_user_bindings USING btree (zalo_user_id)
- `uq_zalo_user_bindings_project_zid`: UNIQUE INDEX uq_zalo_user_bindings_project_zid ON public.zalo_user_bindings USING btree (project_id, zalo_user_id)
- `zalo_user_bindings_pkey`: UNIQUE INDEX zalo_user_bindings_pkey ON public.zalo_user_bindings USING btree (id)

