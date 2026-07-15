# M51 — Đa dự án cấp 2: RLS phòng tuyến DB, template dự án, tổ chức (P2)

> **Mục tiêu**: đóng vĩnh viễn lớp lỗi "quên scope `project_id`" (đã xảy ra thật ≥2 lần) bằng Row-Level Security làm phòng tuyến thứ hai sau check app; giảm chi phí mở dự án mới bằng template; đặt nền đa pháp nhân. Nâng trục Đa dự án 3.5 → ~4.5.
>
> **Phụ thuộc**: M43 PR1 (SET LOCAL context trong `withTransaction`) + M45 PR5 (test bất biến — phòng tuyến 1). **PR1 phải kèm ADR-0005** vì đổi cách app nói chuyện với DB.

## PR1 — RLS trên nhóm bảng tài chính (kèm `docs/adr/0005-rls.md`)

### Nguyên tắc

- RLS là **lưới an toàn**, không thay check app: app vẫn filter `project_id = ?` như cũ; RLS chỉ bảo đảm nếu app quên thì trả **rỗng** thay vì lộ chéo dự án.
- Phạm vi đợt 1: bảng tài chính/hợp đồng có cột `project_id` trực tiếp: `contracts`, `variations`, `payment_certs`, `invoices`, `costs`, `advances`, `cash_transactions`, `payrolls`, `insurance_bonds`, `claims`, `tenders`, `purchase_orders`. KHÔNG áp bảng WBS sâu (`tasks`, `progress_dimensions` — scope qua JOIN, policy đắt và các route này đã scope kỹ).

### Migration `0056_rls.sql`

```sql
-- Role ứng dụng riêng, không owner, không BYPASSRLS (cạm bẫy #1 của RLS:
-- app chạy bằng role owner thì policy bị BỎ QUA ÂM THẦM nếu thiếu FORCE).
-- Migration chạy bằng role owner như cũ; app đổi DATABASE_URL sang xboss_app.
CREATE ROLE xboss_app LOGIN PASSWORD :app_password NOBYPASSRLS;  -- tạo tay khi deploy, ghi trong ADR
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xboss_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xboss_app;

-- Mỗi bảng trong phạm vi:
ALTER TABLE costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE costs FORCE ROW LEVEL SECURITY;
CREATE POLICY p_costs_project ON costs
  USING (project_id = NULLIF(current_setting('app.project_id', true), '')::int
         OR current_setting('app.project_id', true) IS NULL
         OR current_setting('app.project_id', true) = '*');
```

- GUC `app.project_id` đặt trong `withTransaction` (đã có từ M43). Giá trị `'*'` = ngữ cảnh cross-project hợp lệ (portfolio, cron, export toàn cục) — chỉ `lib/` đặt được qua `withProjectScope('*')`, route thường không có đường gọi.
- **Điều kiện `IS NULL` cho qua**: quyết định chuyển tiếp — query ngoài transaction (đường đọc cũ) không có GUC, nếu policy chặn NULL thì vỡ hàng loạt. Lộ trình siết ở PR2.

### Điểm chạm app

- `.env` production: `DATABASE_URL` đổi sang user `xboss_app`; migration dùng biến mới `MIGRATE_DATABASE_URL` (owner) — `lib/db/migrate.ts` ưu tiên biến này, fallback DATABASE_URL (dev không đổi gì).
- `tests/setup.ts`: TEST DB chạy 2 role như prod để test RLS thật.

## PR2 — Siết đường đọc: `withProjectScope`

- `lib/db/index.ts` thêm:
  ```ts
  export async function withProjectScope<T>(projectId: number | '*', fn: () => Promise<T>): Promise<T>;
  // = withTransaction + set_config('app.project_id', ...) — transaction read-only nếu chỉ đọc.
  ```
- Chuyển các route GET tài chính (nhóm bảng đợt 1) sang bọc `withProjectScope(await getCurrentProjectId(user))` — cơ học, giao `mechanical` theo lô, mỗi lô chạy test tích hợp.
- Khi 100% route chạm nhóm bảng đợt 1 đã bọc: migration mới sửa policy bỏ nhánh `IS NULL` (chỉ còn match hoặc `'*'`) — thời điểm "khoá cửa". Đo trước bằng log: 1 tuần production không còn query nhóm bảng này thiếu GUC (thêm log warn tạm trong query() khi bảng thuộc danh sách mà GUC trống — xoá sau khi khoá).

## PR3 — Template dự án

- `POST /api/projects/:id/clone-config` (admin): tạo dự án mới sao chép từ dự án nguồn phần **cấu hình** (không dữ liệu): sheet_types (+ hệ), towers, cost codes/norms mẫu, nav_settings, approval_flows (M46), alert_rules (M47), role overrides không copy (toàn cục).
- Chạy trong 1 `withTransaction`; map id cũ→mới trong memory; BOQCODE các bản ghi mẫu re-sinh (tôn trọng unique toàn hệ qua `boqTakenBy`).
- UI: bước "Sao chép cấu hình từ dự án có sẵn" trong flow tạo dự án (`/projects`).

## PR4 — Nền đa pháp nhân (chỉ nền, không UI hợp nhất)

- Migration: `organizations(id, name, tax_code)` + cột `projects.org_id INT REFERENCES organizations(id)` (nullable — dữ liệu cũ NULL = tổ chức mặc định).
- `/api/portfolio` thêm filter `?org=`; trang portfolio thêm select tổ chức khi có >1 org.
- Hợp nhất tài chính đa pháp nhân, phân cấp cây tổ chức: **ngoài phạm vi** — ghi nợ chủ đích vào PROGRESS.md, làm khi có nhu cầu thật (YAGNI).

## Test

- `tests/rls.test.ts` (integration, role xboss_app): (1) query có GUC dự án A không thấy dòng dự án B **dù SQL không có WHERE project_id**; (2) GUC trống giai đoạn chuyển tiếp vẫn đọc được (PR1) và bị chặn sau khoá (PR2 — cập nhật test cùng migration khoá); (3) `'*'` thấy tất; (4) INSERT sai project_id với GUC khác → policy chặn (thêm `WITH CHECK` cùng biểu thức).
- `tests/clone-config.test.ts`: clone đủ nhóm cấu hình, BOQCODE không trùng, không copy dữ liệu giao dịch.

## Chia PR

1. **PR1**: ADR-0005 + migration RLS + 2 role + policy chuyển tiếp + test.
2. **PR2**: `withProjectScope` + chuyển route theo lô + migration khoá (tách commit cuối, sau 1 tuần theo dõi).
3. **PR3**: clone-config + UI.
4. **PR4**: organizations + portfolio filter.
