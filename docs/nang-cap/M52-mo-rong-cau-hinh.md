# M52 — Mở rộng bằng cấu hình: danh mục mềm, custom fields, module registry, feature flags (P2–P3)

> **Mục tiêu**: chuyển "mở rộng = viết code + deploy" thành "mở rộng = cấu hình" ở các điểm rẻ nhất: danh mục enum-mềm, trường tuỳ biến, manifest module tập trung, cờ tính năng theo dự án; kèm trả nợ tách file tracking ~3000 dòng. Nâng trục Mô hình dữ liệu + Kiến trúc lên ~4.0. Giữ monolith (ADR-0001) — không chia service.

## PR1 — Danh mục mềm `code_lists`

### Migration `0057_code_lists.sql`

```sql
CREATE TABLE IF NOT EXISTS code_lists (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,          -- 'delay_reason' | 'document_kind' | 'cost_group' | 'unit' | ...
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  meta JSONB NOT NULL DEFAULT '{}',
  UNIQUE(domain, code)
);
```

- Seed từ hằng hiện có (migration INSERT ... ON CONFLICT DO NOTHING): `DELAY_REASON_LABEL` (`lib/delay.ts`), loại tài liệu, nhóm chi phí, đơn vị tính đang rải trong `lib/*`/component.
- `lib/code-lists.ts`: `getList(domain)` cache memory + watermark version (pattern sheetVersion); helper client fetch `/api/code-lists?domain=` (mọi role đọc; admin CRUD qua `/api/admin/code-lists`, không cho xoá code đang được tham chiếu — check trước, 409 kèm số bản ghi).
- Chuyển call-site theo lô (giao `mechanical`): code cũ đọc hằng → đọc `getList`; **KHÔNG** chuyển `lib/status.ts` (enum có logic recompute — giữ cứng, đã ghi trong nghiên cứu §1).
- UI `/admin/code-lists`: bảng theo domain, kéo sort, bật/tắt.

## PR2 — Custom fields

### Migration `0058_custom_fields.sql`

```sql
CREATE TABLE IF NOT EXISTS custom_field_defs (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = mọi dự án
  entity_type TEXT NOT NULL,     -- 'task' | 'contract' | 'material' | 'work_package'
  key TEXT NOT NULL,             -- snake_case, immutable sau khi tạo
  label TEXT NOT NULL,
  type TEXT NOT NULL,            -- 'text' | 'number' | 'date' | 'select' | 'checkbox'
  options JSONB,                 -- cho select: ["..."]
  required BOOLEAN DEFAULT FALSE, sort INT DEFAULT 0, active BOOLEAN DEFAULT TRUE,
  UNIQUE(entity_type, COALESCE(project_id, 0), key)
);
ALTER TABLE tasks         ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
ALTER TABLE contracts     ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
ALTER TABLE materials     ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
```

- `lib/custom-fields.ts`: `validateCustom(entityType, projectId, patch)` — đúng type/options/required, key không có def → 422 (chặn rác); PATCH entity nhận khoá `custom` merge shallow.
- UI: component `CustomFieldsSection` (form theo defs, đúng chuẩn form Quy ước chung) gắn vào modal/trang chi tiết 4 entity; cột custom hiển thị trong bảng chỉ khi user bật (tránh phình lưới tracking).
- Search/filter theo custom field: **ngoài phạm vi v1** (ghi rõ trên UI admin); index GIN thêm sau khi có nhu cầu truy vấn thật.
- `/admin/custom-fields`: CRUD defs (admin; PM xem), không cho đổi type khi đã có dữ liệu (check `EXISTS ... custom ? key` → 409).

## PR3 — Module registry (refactor nội bộ, không đổi hành vi)

**Vấn đề**: thêm 1 module chạm ≥4 nơi rời rạc (`CAN`, `dashboardTree`, notification sources, sw.js exclude) — đã gây race/bỏ sót thật.

- `lib/modules.ts` (mới): mảng `MODULES: ModuleDef[]`:
  ```ts
  type ModuleDef = {
    key: string;                  // 'finance', 'hse', ...
    nav: { group: string; label: string; href: string; icon: string }[];
    permKeys: string[];           // perm thuộc module (đối chiếu ma trận M50)
    notificationTypes?: string[];
    swExclude?: string[];         // path loại trừ cache
    routePrefix: string[];        // '/api/finance', ... (dùng cho feature flag PR4)
  };
  ```
- `dashboardTree`/sidebar, trang `/admin/permissions` (M50), đăng ký notification đọc từ registry; script `scripts/check-sw-exclude.ts` chạy trong CI đối chiếu `swExclude` với `public/sw.js` (sw.js là file tĩnh — không sinh tự động, chỉ kiểm).
- Definition of Done cho module mới (cập nhật `docs/nang-cap/README.md`): thêm 1 entry `MODULES` là bắt buộc.

## PR4 — Feature flags theo dự án

- Migration: `feature_flags(module_key TEXT, project_id INT, enabled BOOLEAN, PRIMARY KEY(module_key, project_id))` — mặc định không dòng = bật (không đổi hành vi hiện tại); `nav_settings` hiện có di trú vào đây (giữ API cũ 1 bản release, đánh dấu deprecated).
- Enforcement 2 tầng: (1) sidebar ẩn nav của module tắt (đọc registry + flags); (2) **API chặn thật**: helper `assertModuleEnabled(moduleKey, projectId)` gọi đầu các route thuộc `routePrefix` — trả 404. Cache flags memory + watermark.
- UI: `/admin/features` — ma trận module × dự án, toggle (admin).

## PR5 — Trả nợ tách `app/tracking/[sheet]/page.tsx` (~3000 dòng)

- Tách thuần cơ học, **không đổi hành vi** (điều kiện nghiệm thu: diff render = 0 về logic): `TrackingToolbar` (filter/search/bulk bar), `TrackingGrid` (lưới + checkbox dimension), `BulkEditModal`, `DateEditModal`, `useTrackingData` (fetch + SSE + offline queue wiring — logic giữ nguyên từ `offlineQueue.ts`), page còn ~300 dòng lắp ghép.
- Mỗi component tách kèm chạy e2e tracking sẵn có; giao `coder` (không phải `mechanical` — cần phán đoán ranh giới state).

## Test

- `tests/code-lists.test.ts`: CRUD + chặn xoá đang tham chiếu + cache version.
- `tests/custom-fields.test.ts`: validate type/options/required; PATCH merge; đổi type khi có dữ liệu → 409.
- `tests/feature-flags.test.ts`: route module tắt → 404; bật lại → 200; mặc định bật.
- PR3: script check-sw-exclude chính là gate.

## Chia PR

1. **PR1**: code_lists + seed + chuyển call-site lô 1 + UI admin.
2. **PR2**: custom fields + component + UI admin.
3. **PR3**: module registry + CI check.
4. **PR4**: feature flags + enforcement + di trú nav_settings.
5. **PR5**: tách trang tracking.
