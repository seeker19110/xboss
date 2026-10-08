# S02e — cấu hình theo tổ chức (org) thay vì toàn hệ

State: **Approved for implementation**.
Chủ dự án duyệt QUALITY-FINAL-1 (2026-09-25) và duyệt S02e ngày 2026-10-08 ("mọi đề xuất đều
duyệt với chất lượng cao"). Spec cha: [A1 Scope](AUDIT-2026-09-25/A1-SCOPE.md) (A1-FR05/FR06,
A1-AC01, Q-AC01), PLAN §S02, mục "Còn mở, cần đặc tả schema" của S02 trong `PROGRESS.md`.
Đây là phạm vi con của S02; không đổi luật resolver dự án/quyền của A1.

## Vấn đề

Năm cấu hình/nhật ký còn đặt ở phạm vi **toàn hệ** dù XBoss đa tổ chức (ADR-0004, 0078/0080):

1. `cost_settings` — bảng 1 dòng (`id = 1`): admin org B đổi ngưỡng cảnh báo chi phí của org A;
   `getCostReport`/thông báo `cost_over` của mọi org đọc chung dòng đó.
2. `code_lists` — `UNIQUE(domain, code)` toàn hệ: org B không tạo được mã org A đã có (409);
   `getList` (đường đọc chung + `require_2fa_roles` của đăng nhập) trả danh mục mọi org;
   `countReferences` đếm task của mọi org (org B không xoá được mã vì task org A dùng mã cùng tên).
3. `alert_rules` — unique `(metric, COALESCE(project_id,0)) WHERE active` toàn hệ: org B tạo rule
   toàn cục khi org A đã có → 500 (23505); `getAlertThreshold` đọc rule toàn cục của org khác;
   `listAlertRules(null)` trả mọi rule mọi org.
4. `sheet_types.slug` — `uniq_sheet_slug` toàn hệ: import Excel sang dự án thứ 2 đụng slug `ogtd`
   (500); `POST /api/sheets` kiểm trùng toàn hệ (lộ slug/mã của org khác) và gắn sheet vào **tháp đầu
   tiên toàn hệ** (có thể thuộc dự án/tổ chức khác); `sheetVersion(slug)` không lọc dự án.
5. `admin/traffic/events` — ring buffer in-memory không gắn org: admin org nào cũng xem path/IP/UA
   request của mọi org.

## Phạm vi và quyết định

| #   | Hạng mục        | Phạm vi mới                                       | Mặc định khi thiếu                              |
| --- | --------------- | ------------------------------------------------- | ----------------------------------------------- |
| 1   | Ngưỡng chi phí  | 1 dòng / org (`org_cost_settings`)                | 90/100 (như cũ)                                 |
| 2   | Danh mục mềm    | unique `(org_id, domain, code)`; đọc/ghi theo org | danh mục rỗng của org (sau backfill — xem dưới) |
| 3   | Ngưỡng cảnh báo | unique `(org_id, metric, dự án) WHERE active`     | `defaultThreshold`; không dự án → luôn mặc định |
| 4   | Slug sheet      | unique `(dự án, slug)`                            | —                                               |
| 5   | Nhật ký traffic | entry gắn `orgId` của phiên đã ký                 | ẩn danh (`null`) — không hiện cho admin org nào |

- **Slug theo DỰ ÁN, không theo tháp:** URL `/tracking/<slug>` luôn được giải trong ngữ cảnh dự án
  đang chọn (`/api/tasks`, `/api/tasks/version`, `/api/events`, `export/excel`, `v1/*` đều lọc dự
  án). Dự án có thể có nhiều tháp (`POST /api/towers`) nên unique theo tháp không bảo đảm slug xác
  định duy nhất trong dự án. Không đổi hình dạng URL. Giới hạn đã biết: link `/tracking/<slug>` lưu
  trong thông báo không mang dự án (như trước) — mở khi đang chọn dự án khác cùng slug sẽ thấy sheet
  cùng tên của dự án đang chọn (trước đây: 404).
- **`sheet_types.project_id`** là cột suy diễn (= `towers.project_id`), giữ bằng trigger
  `BEFORE INSERT OR UPDATE OF tower_id, project_id` (ghi tay bị ghi đè) + trigger `AFTER UPDATE OF
project_id ON towers`. Không phải trục RLS. Code tạo sheet không cần truyền cột này.
- **`POST /api/sheets`** gắn sheet vào tháp đầu tiên của **dự án đang chọn** (chưa có tháp → tạo
  "Tháp A" trong dự án đó); không có dự án khả kiến → **404** (bỏ nhánh tự tạo "Dự án mới" ở org
  mặc định). Kiểm trùng slug/mã trong dự án đang chọn; `PATCH /api/sheets/:id` cũng vậy.
  `clone-config` giữ cách sinh slug duy nhất toàn hệ (chặt hơn ràng buộc mới, không cần đổi).
- **Traffic:** proxy suy `orgId` từ cookie phiên bằng `parseToken` (HMAC + hạn); ingest chỉ nhận số
  nguyên dương, giá trị lạ → ẩn danh. Buffer vẫn một vòng 500 entry chung (in-memory là đủ); lớp đọc
  `getRecentOfOrg`/`subscribeTrafficOfOrg` lọc theo org. Traffic ẩn danh (đăng nhập, `/api/project`,
  API key `v1`) không quy được org → không hiện cho ai (fail-closed); người vận hành xem log máy chủ.
  `id` vẫn là bộ đếm toàn tiến trình (khoảng trống id chỉ lộ "có traffic khác", không lộ nội dung).
- **2FA bắt buộc theo vai trò** (`require_2fa_roles`) đọc theo org của tài khoản đăng nhập
  (`requiredRoles(orgId)` ở `auth/login`, `auth/password`).
- **Ngưỡng cảnh báo:** rule riêng dự án vẫn ưu tiên; rule toàn cục chỉ của org sở hữu dự án.
  `listAlertRules(orgId, projectId)`; `projectId` null → chỉ rule toàn cục của org (fail-closed).

## DDL — migration `0159_org_config_scope.sql`

```sql
CREATE TABLE IF NOT EXISTS org_cost_settings (
  org_id INT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  warn_pct NUMERIC(5,2) NOT NULL DEFAULT 90,
  over_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);  -- + RLS ENABLE/FORCE, policy 3 nhánh app.org_id như 0080
CREATE UNIQUE INDEX IF NOT EXISTS uq_code_lists_org_domain_code ON code_lists (org_id, domain, code);
-- DROP constraint unique (domain, code) — tìm theo định nghĩa cột, không theo tên
CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_rule_org_active
  ON alert_rules (org_id, metric, COALESCE(project_id, 0)) WHERE active;
DROP INDEX IF EXISTS ux_alert_rule_active;
ALTER TABLE sheet_types ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id);
-- trigger sheet_types_sync_project / towers_sync_sheet_project
CREATE UNIQUE INDEX IF NOT EXISTS uq_sheet_types_project_slug
  ON sheet_types (COALESCE(project_id, 0), slug);
DROP INDEX IF EXISTS uniq_sheet_slug;
```

Thứ tự đổi unique: index mới tạo **trước**, index/constraint cũ xoá **sau**. Mọi index cũ chặt hơn
index mới (tập cột con) nên index mới luôn dựng được trên dữ liệu đang có. Bảng `cost_settings` cũ
giữ nguyên (không đọc/ghi nữa) để rollback code.

### Backfill (quy tắc dữ liệu legacy)

"Tổ chức mặc định" = `organizations.id = 1` (0078 tạo và gán mọi dữ liệu cũ về 1).

- **`org_cost_settings`:** chép dòng `cost_settings.id = 1` sang **mọi tổ chức hiện có**
  (`ON CONFLICT DO NOTHING`). Lý do: ngưỡng toàn hệ đang áp cho mọi org — chép giữ nguyên hành vi lúc
  deploy cho từng org; sau đó mỗi org đổi độc lập.
- **`code_lists`:** mỗi tổ chức ≠ 1 nhận bản sao các mục `(domain, code)` của tổ chức 1 mà nó **chưa
  có** (giữ label/sort/active/meta; `ON CONFLICT (org_id, domain, code) DO NOTHING`). Lý do: trước
  đây `getList` không lọc org nên mọi org dùng danh mục của org 1 (nguyên nhân trễ seed 0060,
  `require_2fa_roles`) — chép giữ nguyên danh mục và yêu cầu 2FA từng org đang chịu. Mục org khác đã
  tự tạo giữ nguyên. Tổ chức tạo SAU migration bắt đầu với danh mục rỗng (UI nguyên nhân trễ rỗng cho
  tới khi admin org thêm mục).
- **`alert_rules`:** rule gắn dự án được căn `org_id = projects.org_id` (bản cũ INSERT không truyền
  org → DEFAULT 1 dù dự án thuộc org khác). Rule toàn cục không suy được org khác → giữ `org_id` đã ghi.
- **`sheet_types.project_id`:** `= towers.project_id` qua `tower_id`; sheet mồ côi (không tháp) để
  NULL, gộp nhóm 0 trong unique.

**Migration ĐỤNG DỮ LIỆU** (INSERT backfill 2 bảng + UPDATE `alert_rules`/`sheet_types`) → **bắt buộc
qua staging** (`bash deploy.sh --staging`) và `npm run db:migrate -- --dry-run` trước production.
Idempotent: chạy lại toàn file không lỗi, không nhân dòng (đã kiểm chạy 2 lần trên DB có dữ liệu cũ).

## API (giữ format phản hồi, 401/403/404 như S02)

| Route                                                 | Thay đổi                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET/PATCH /api/costs/settings`                       | Đọc/ghi ngưỡng của `user.orgId`. Shape `{warnPct, overPct}` / `{ok:true}`.                |
| `GET /api/costs` (+ thông báo)                        | `getCostReport` đọc ngưỡng theo org của dự án, cùng snapshot REPEATABLE READ.             |
| `GET /api/code-lists`                                 | Danh mục của `user.orgId`.                                                                |
| `POST/PATCH/DELETE /api/admin/code-lists`             | Unique theo org (org khác cùng mã → 201); ghi/xoá kèm `org_id`; đếm tham chiếu trong org. |
| `GET/POST /api/admin/alert-rules`, `DELETE …/[id]`    | Danh sách/unique/xoá theo org; org khác cùng rule toàn cục → 201.                         |
| `POST /api/sheets`                                    | Gắn vào dự án đang chọn; null → 404; trùng slug/mã trong dự án → 409.                     |
| `PATCH /api/sheets/:id`                               | Kiểm trùng slug/mã trong dự án đang chọn.                                                 |
| `GET /api/tasks`, `/api/tasks/version`, `/api/events` | `sheetVersion(slug, projectId)` — watermark đúng sheet của dự án.                         |
| `GET /api/admin/traffic/events`                       | Chỉ entry `orgId = user.orgId`.                                                           |
| `POST /api/admin/traffic/ingest`                      | Nhận thêm `orgId` (số nguyên dương hoặc bỏ qua → ẩn danh).                                |

Lib đổi chữ ký: `getCostSettings(orgId)`, `updateCostSettings(orgId, s)`, `getList(domain, orgId,
opts?)`, `countReferences(domain, code, orgId)`, `updateItem(id, orgId, patch)`, `deleteItem(id,
orgId)`, `requiredRoles(orgId)`, `listAlertRules(orgId, projectId)`, `deleteAlertRule(id, orgId)`,
`sheetVersion(slug, projectId)`; mới `getRecentOfOrg`, `subscribeTrafficOfOrg`.

## Tiêu chí chấp nhận

- AC1: admin org B PATCH ngưỡng chi phí không đổi ngưỡng org A; báo cáo dự án A/B dùng ngưỡng org
  tương ứng; org chưa cấu hình → 90/100.
- AC2: hai org tạo cùng `(domain, code)` → 201 cả hai; trùng trong cùng org → 409; `GET /api/code-lists`
  không trả mục org khác; `require_2fa_roles` org A không áp cho org B; tham chiếu task org A không
  chặn org B xoá mã cùng tên.
- AC3: hai org cùng rule toàn cục → 201 (không 500); `getAlertThreshold` dự án org C không có rule →
  mặc định; danh sách admin org B không chứa rule org A.
- AC4: import Excel sang 2 dự án cùng slug thành công; `/api/tasks?sheet=` và `/api/tasks/version`
  trả đúng sheet/watermark của dự án đang chọn; `POST /api/sheets` cùng slug ở dự án khác → 201 và
  sheet thuộc dự án đang chọn.
- AC5: SSE traffic của admin org A không chứa entry org B hay ẩn danh; proxy gắn `orgId` từ cookie đã
  ký, cookie giả/không cookie → `null`.
- RLS `org_cost_settings` kiểm bằng role `xboss_app`; khai vào `tests/rls.test.ts` (TO_CHUC).
- Migration chạy 2 lần không lỗi, đúng trên DB có dữ liệu cũ; ERD sinh lại.
- Mỗi AC có test đỏ trên code cũ → xanh (`tests/s02e-org-config.test.ts`).

## Rollout / rollback

1. Staging: `npm run db:migrate -- --dry-run` → `npm run db:migrate` → kiểm `org_cost_settings` có
   đủ mỗi org một dòng, `code_lists` mỗi org có danh mục nguyên nhân trễ, không lỗi unique.
2. Production sau staging xanh; deploy code cùng lúc (code mới cần bảng/cột của 0159).
3. **Rollback code** (giữ schema): code cũ đọc lại `cost_settings` id 1 (đã giữ nguyên, nhưng không
   thấy thay đổi ngưỡng làm sau khi lên bản mới); code cũ `createItem` kiểm trùng toàn hệ (chặt hơn,
   không lỗi); `upsertAlertRule` cũ vẫn chạy với index mới; `sheetVersion(slug)` cũ có thể chọn nhầm
   sheet khi hai dự án đã trùng slug (chỉ ảnh hưởng watermark đồng bộ, không ghi sai dữ liệu).
   Không khôi phục index toàn hệ cũ (sẽ lỗi nếu đã có slug/mã/rule trùng giữa org) — không
   down-migration, rollback giữ fail-closed theo A1 §5.
