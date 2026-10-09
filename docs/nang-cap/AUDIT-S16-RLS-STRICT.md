# AUDIT S16 — Khoá cửa RLS nhóm bảng theo tổ chức/dự án (mục 6(b) của S15)

Đóng mục **6(b)** của `AUDIT-S15-RELEASE-CANDIDATE.md`: nhánh RLS "GUC rỗng → cho qua" còn trên
các bảng theo tổ chức/dự án, khiến role ứng dụng `xboss_app` không đặt GUC đọc được dữ liệu của
mọi tổ chức. D01: admin không phải quyền bỏ qua RLS hay nhìn mọi org.

## 1. Phạm vi

- Migration `migrations/0165_org_rls_strict.sql` — chỉ `DROP POLICY IF EXISTS` + `CREATE POLICY`,
  không đổi `ENABLE/FORCE ROW LEVEL SECURITY`, không đụng dữ liệu.
- Code: mọi đường chạy SQL trên các bảng này mà chưa có ngữ cảnh tổ chức/dự án (bảng mục 3).
- Không đổi: định dạng token phiên, hành vi membership (`visibleProjectIds`), policy các bảng khác.

## 2. Kiểm kê thật (pg_policies sau khi áp đủ 0001–0164)

Truy vấn `pg_policies` tìm `NULLIF(current_setting(...), '') IS NULL`:

| Nhóm                     | Bảng                                                                                                                                                                                                                                 | Policy                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Theo tổ chức (0080/0161) | `users`, `projects`, `suppliers`, `code_lists`, `role_permissions`, `custom_field_defs`, `feature_flags`, `alert_rules`, `approval_flows`, `api_keys`, `webhooks`, `integrations`, `saved_reports`, `boq_codes`, `org_cost_settings` | `p_<bảng>_org`             |
| Theo dự án (0149)        | `baselines`, `floor_stage_fronts`, `construction_stages`                                                                                                                                                                             | `p_<bảng>_project`         |
| **Không đổi**            | `cad_block_libs` — chỉ `WITH CHECK` (USING không có nhánh rỗng): GHI dòng bộ toàn cục `project_id IS NULL` chỉ khi phiên ở phạm vi toàn cục (0145, chống dự án tự "phát hành" block cho mọi dự án). Không phải lỗ đọc.               | `p_cad_block_libs_project` |
| Không phải nhánh cho qua | 10 policy `engineering_*` dùng `NULLIF(...)::integer/::bigint` làm phép ép kiểu (GUC rỗng → NULL → không khớp).                                                                                                                      | —                          |

Đúng 18 bảng như S15 liệt kê. Sau 0165: USING = WITH CHECK = `cột::text = GUC OR GUC = '*'`;
`construction_stages` giữ thêm nhánh `project_id IS NULL` (danh mục công tác dùng chung, D1 M123).

## 3. Điểm code đổi

**Cơ chế chung (`lib/db/index.ts`):**

- Câu lệnh `query/run/insertId` chạy **ngoài transaction** khi ngữ cảnh request có `orgId` (sau
  `getCurrentUser()`/`requireApiKey()`) được bọc 1 transaction ngắn `BEGIN; set_config('app.org_id',
<org>, true)` → câu lệnh → `COMMIT`. Chỉ đặt `app.org_id`; không có `orgId` thì chạy như cũ (GUC
  rỗng → bảng theo tổ chức trả rỗng). `SET LOCAL` nên vẫn tương thích PgBouncer transaction pooling
  và không rò GUC sang request sau trên cùng connection.
- `withOrgScope(orgId | '*', fn, { readOnly })` — cùng khuôn `withProjectScope`, cho đường chưa có
  actor. Lồng trong transaction đã gắn tổ chức khác (kể cả nâng lên `'*'`) → throw.
- `lib/ha-tang/to-chuc.ts` — `trongToChuc`/`theoTungToChuc`: job hệ thống chạy
  lần lượt từng tổ chức trong ngữ cảnh chỉ mang `orgId` (bảng `organizations` không bật RLS).

**Từng đường chưa có phạm vi:**

| Đường                                                                                                                                 | Phạm vi đặt                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `getCurrentUser` (`lib/bao-mat/auth.ts`) — tra `users` theo id                                                                        | org trong token đã ký (không `'*'`); user đổi org → dòng vô hình → null như trước                 |
| `POST /api/auth/login` — tra `users` theo email                                                                                       | `'*'` (chưa biết org, email UNIQUE toàn hệ), chỉ 1 câu; `requiredRoles` theo org user             |
| `POST /api/auth/login/2fa` — pending token chỉ có uid                                                                                 | `'*'` tra đúng cột `org_id` của uid; cả bước 2 chạy trong `withOrgScope(org)`                     |
| OIDC `upsertSsoUser` (`lib/bao-mat/oidc.ts`)                                                                                          | `'*'` tra email; đồng bộ role theo org tài khoản; tạo mới trong org 1 (như cũ)                    |
| API key `verifyApiKey`/`requireApiKey` (`lib/bao-mat/api-keys.ts`)                                                                    | `'*'` tra `key_hash` (sha256 bí mật 256-bit); `last_used_at` + kiểm dự án theo org key            |
| `GET /api/project` ẩn danh (trang /login)                                                                                             | org của user nếu có phiên, ẩn danh = org mặc định 1 (không `'*'` ở route công khai)               |
| Cron chỉ-secret `daily-report`, `weekly-report`, `sync-integrations`, `deliver-webhooks`                                              | `theoTungToChuc` — từng tổ chức một                                                               |
| Cron `sync-sheets` (chỉ-secret)                                                                                                       | `'*'` tra org của dự án trong `GOOGLE_SHEET_PROJECT_ID` (cấu hình server), rồi `trongToChuc(org)` |
| Cron `health-check` — email mọi Admin                                                                                                 | `'*'` (cảnh báo của cả hệ thống, giữ hành vi cũ), chỉ cột email                                   |
| `kiemBaselineThuocDuAn` (`lib/tien-do/baseline-scope.ts`, EVM/S-curve)                                                                | `withProjectScope(projectId)`                                                                     |
| `bootstrapAdmin`/`resetBootstrapAdminPassword`, `scripts/create-user.ts`, `scripts/backfill-boq.ts`                                   | `'*'` (lệnh vận hành toàn hệ / tra email UNIQUE toàn hệ)                                          |
| `ensureDefaultUsers` (seed demo), `scripts/seed*.ts`, `backfill-dims`, `backfill-import-dates`, `apply-nav-defaults`, `scan-drawings` | tổ chức mặc định 1 (dữ liệu đơn tổ chức)                                                          |

Không đổi: `refresh-views`, `retention`, `/api/health`, `/api/admin/traffic/ingest` (không chạm bảng
trong danh sách); route có phiên — tự có `app.org_id` qua cơ chế chung.

**Hệ quả hành vi (hẹp lại, đúng D01):** gọi tay `deliver-webhooks` bằng phiên Admin chỉ gửi webhook
của tổ chức người gọi (trước đây gửi mọi org); OIDC "không hạ cấp admin cuối cùng" đếm admin trong
tổ chức của tài khoản (trước đây đếm toàn hệ).

## 4. Bất biến

1. Role ứng dụng không đặt GUC → 0 dòng và không ghi được trên cả 18 bảng.
2. `'*'` chỉ do server đặt tường minh qua `withOrgScope('*')`/`withProjectScope('*')` ở đường đã
   liệt kê; không bao giờ lấy từ đầu vào client; không lồng nâng từ 1 org lên `'*'`.
3. Request đã xác thực chỉ thấy dữ liệu tổ chức của actor kể cả ở câu lệnh ngoài transaction.
4. Không policy nào (trừ `WITH CHECK` của `cad_block_libs`) còn nhánh "GUC rỗng → cho qua" — test
   `tests/s16-rls-strict.test.ts` quét `pg_policies` để chặn tái phát.

Test: `tests/s16-rls-strict.test.ts` (chạy bằng `xboss_app`) — đỏ trên policy cũ (18 bảng thấy 2
dòng khi GUC rỗng, INSERT GUC rỗng lọt), đỏ trên code cũ + policy mới (đăng nhập 401).

## 5. Kiểm trên staging

```bash
bash deploy.sh --staging                      # áp 0165 bằng MIGRATE_DATABASE_URL (role owner)
npm run db:migrate -- --dry-run               # trước khi áp: chỉ 0165 còn chờ
# Bằng role xboss_app (DATABASE_URL của app) — GUC rỗng phải ra 0:
psql "$DATABASE_URL" -c "SELECT count(*) FROM users"            # → 0
psql "$DATABASE_URL" -c "BEGIN; SELECT set_config('app.org_id','1',true); SELECT count(*) FROM users; COMMIT"
# Không còn policy nhánh rỗng — chỉ được ra đúng 1 dòng cad_block_libs (WITH CHECK, cố ý):
psql "$MIGRATE_DATABASE_URL" -c "SELECT tablename, policyname FROM pg_policies
  WHERE qual LIKE '%''''::text) IS NULL%' OR with_check LIKE '%''''::text) IS NULL%'"
```

Rồi thao tác tay: đăng nhập mật khẩu (+2FA nếu có), SSO (nếu bật), `/api/auth/me`, trang dashboard/
tracking, `/api/v1/*` bằng API key, gọi 1 cron bằng `Authorization: Bearer $CRON_SECRET`
(`/api/cron/daily-report` trả danh sách dự án mọi tổ chức).

**Metabase (`xboss_bi`)**: view `bi.users_dim`, `bi.projects`, `bi.tasks` đọc bảng `users`/`projects`
— nếu owner của view không phải superuser thì sau 0165 phải đặt GUC cho kết nối BI (vd tham số
`options=-c app.org_id=<org>`), nếu không các view này trả rỗng/thiếu tên. Cần chủ dự án quyết.

## 6. Rollback

Không có down-migration tự động. Chạy tay bằng role owner các khối tạo policy 3 nhánh cũ (đều
`DROP POLICY IF EXISTS` trước): khối `DO` của `migrations/0080_org_rls.sql` (14 bảng), câu
`CREATE POLICY p_org_cost_settings_org` của `0161_org_config_scope.sql`, khối `DO` + câu
`CREATE POLICY p_construction_stages_project` của `0149_baseline_stage_project.sql`. Không xoá
dòng `0165` khỏi `schema_migrations`. Code của S16 vẫn đúng với policy cũ (chỉ thêm GUC), nên
rollback policy không cần rollback code.
