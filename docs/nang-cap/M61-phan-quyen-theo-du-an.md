# M61 — Override quyền theo dự án (`role_permissions.project_id`)

> **Mục tiêu**: đóng nợ kỹ thuật cuối cùng của đợt scope module quản trị theo dự án (M52 PR4, xem `PROGRESS.md` 2026-07-17): 4/5 module quản trị (`audit`/`approval-flows`/`alert-rules`/`integrations`) đã scope theo pattern M22, riêng `permissions` (bảng `role_permissions`, M50 PR1) chưa làm được vì bảng `UNIQUE(role, perm_key)` không có cột `project_id`. M61 thêm chiều dự án vào override quyền: Admin siết/mở quyền của một vai trò **chỉ trong 1 dự án** (vd siết `editProgress` của `engineer` ở dự án đã bàn giao, các dự án khác giữ nguyên).
>
> **Không làm**: quyền theo từng USER (vẫn theo vai trò — muốn quyền riêng cho 1 người thì đổi role hoặc dùng `user_projects` giới hạn dự án thấy được); RLS tầng DB (M51 riêng); gate module `permissions` bằng feature flag theo dự án (trang `/admin/permissions` là cấu hình xuyên dự án, admin-only — **quyết định: không gate**, ghi nhận đóng luôn dòng nợ "5 module quản trị" của M52 PR4: `audit`/`approval-flows`/`alert-rules`/`integrations` scope shape ✅, `permissions` xử lý bằng M61, `ops` không áp dụng).
>
> **Vùng rủi ro cao** (`docs/audit.md` — chạm `lib/auth.ts`): bắt buộc rà mục "Vùng rủi ro cao" khi review; mọi thay đổi phải giữ bất biến "**bảng không có dòng override nào theo dự án → hành vi y hệt trước M61**".

## Ngữ nghĩa giải quyền (quyết định thiết kế cốt lõi)

Thứ tự ưu tiên khi tính quyền hiệu lực cho `(role, permKey)` trong một request:

```
1. Override THEO DỰ ÁN   (role, perm_key, project_id = dự án đang chọn)   — nếu có
2. Override TOÀN HỆ      (role, perm_key, project_id IS NULL)             — nếu có
3. Mặc định CAN_DEFAULT  (lib/auth.ts)
```

- `projectId` của request lấy từ **request-context (AsyncLocalStorage, `lib/request-context.ts`)** — đã có sẵn từ M43, được `getCurrentProjectId()` patch. `resolvePerm` (lib/auth.ts) đọc đồng bộ `getRequestContext()?.projectId`, **không đổi chữ ký `CAN.x(role)`** → 0 call site phải sửa.
- **Điểm hiểm phải xử lý — thứ tự gọi trong route**: đa số route check `CAN.x(user.role)` **trước** khi gọi `getCurrentProjectId(user)` → lúc check quyền, context chưa có `projectId`. Giải pháp: `getCurrentUser()` (lib/auth.ts) sau khi xác thực thành công tự giải + patch `projectId` đã validate (gọi `getCurrentProjectId` từ `lib/projects.ts` — kiểm tra vòng import: `projects.ts` không import `auth.ts`, an toàn). Kèm 2 chốt:
  - **Memoize trong request**: `getCurrentProjectId` đọc `getRequestContext()?.projectId` trước — có rồi thì trả luôn, không query lại (route gọi cả 2 hàm chỉ tốn 1 lần `visibleProjectIds`).
  - **Tránh trả giá khi chưa dùng tính năng**: chỉ giải `projectId` trong `getCurrentUser` khi cache override **có ít nhất 1 dòng theo dự án** — thêm `hasProjectOverrides(): boolean` (đọc đồng bộ từ snapshot, `lib/permissions.ts`). Bảng chưa có override theo dự án (tức toàn bộ hệ hiện tại) → `getCurrentUser` không thêm query nào, chi phí = 0, hành vi = trước M61.
- **KHÔNG đọc cookie `xboss_project` thô** để giải quyền: cookie phải qua `resolveProjectId` đối chiếu `visibleProjectIds` (nguyên tắc M22 "không tin project_id client gửi") — nếu không, user tự đổi cookie sang dự án khác để né override siết.
- Request không có ngữ cảnh dự án (cron `CRON_SECRET`, API key `/api/v1`, test gọi `CAN` trực tiếp): rơi về tầng 2→3 (toàn hệ) — ghi rõ trong comment `resolvePerm`.

## PR1 — Nền: migration + cache + giải quyền + API (`route: complex` — chạm `lib/auth.ts` vùng rủi ro cao; ranh giới được quyết: chi tiết cấu trúc cache/tên hàm nội bộ; KHÔNG được đổi ngữ nghĩa 3 tầng, luật LOCKED_PERMS, chữ ký `CAN.x(role)`)

### Migration `0066_role_permissions_project.sql` (đổi số nếu bị chiếm)

```sql
-- M61: thêm chiều dự án cho override quyền. NULL = override toàn hệ (mọi dòng hiện có
-- giữ NULL → hành vi không đổi). Đổi UNIQUE(role, perm_key) → unique theo cả phạm vi:
-- dùng COALESCE(project_id, 0) vì UNIQUE thường coi NULL ≠ NULL (id dự án luôn > 0
-- nên 0 an toàn làm sentinel "toàn hệ"; không phụ thuộc NULLS NOT DISTINCT của PG15+).
ALTER TABLE role_permissions
  ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_perm_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_perm_scope
  ON role_permissions (role, perm_key, COALESCE(project_id, 0));
```

- **DROP CONSTRAINT → không thuộc whitelist "thêm thuần tuý" của DoD** (`CLAUDE.md`): bắt buộc chạy qua staging (`bash deploy.sh --staging`, `npm run db:migrate -- --dry-run`) trước production.
- Trigger audit `audit_role_permissions` (0058) giữ nguyên — `audit_row_change()` tự ghi cột mới qua `to_jsonb`.
- Tên constraint UNIQUE cũ: xác minh trên staging bằng `\d role_permissions` trước khi chốt (mặc định Postgres đặt `role_permissions_role_perm_key_key`); nếu khác thì sửa đúng tên trong file migration **trước khi** áp production.
- Chạy `npm run gen:erd` cùng PR (CI gate khớp schema).

### `lib/permissions.ts`

- `PermOverride` thêm `projectId: number | null`.
- Snapshot key: `` `${role}|${permKey}|${projectId ?? "*"}` ``; `reload()` SELECT thêm `project_id`.
- `getPermissionOverride(role, permKey, projectId?: number | null)`: tra key theo dự án trước (khi `projectId` là số), miss thì tra key `*`. Giữ nguyên stale-while-revalidate/TTL 60s/cold-start rỗng.
- Thêm `hasProjectOverrides(): boolean` — snapshot có ≥1 key không kết thúc bằng `|*` (tính sẵn 1 boolean lúc `reload()`, không duyệt Map mỗi lần gọi).
- `listPermissionOverrides(projectId?: number | null)`: `undefined` = trả hết (export snapshot); `null` = chỉ toàn hệ; số = chỉ dự án đó.
- `setPermissionOverride(role, permKey, allowed, updatedBy, projectId: number | null)`: upsert/DELETE thêm điều kiện phạm vi — vì unique là index theo biểu thức, upsert dùng `ON CONFLICT (role, perm_key, COALESCE(project_id, 0))`; DELETE dùng `WHERE role = ? AND perm_key = ? AND project_id IS NOT DISTINCT FROM ?`.

### `lib/auth.ts`

- `resolvePerm`: đọc `getRequestContext()?.projectId` → truyền vào `getPermissionOverride`. Không đổi gì khác trong proxy `CAN`.
- `getCurrentUser()`: sau `patchRequestContext({ userId, role })`, nếu `hasProjectOverrides()` → `await getCurrentProjectId(user)` (hàm này tự patch context). Bọc try/catch nuốt lỗi (DB lỗi lúc giải dự án không được phép làm fail xác thực — rơi về override toàn hệ, an toàn theo hướng "ít quyền hơn hoặc bằng" chỉ khi override dự án là MỞ; ghi log warn).
- `validatePermOverride(role, permKey, allowed, projectId?)`: luật cũ giữ nguyên và áp cho **mọi phạm vi** — LOCKED_PERMS (không mở quyền ghi, kể cả theo dự án), chống tự khoá `admin+manageUsers` (kể cả siết chỉ trong 1 dự án — admin phải luôn vào được ma trận ở mọi ngữ cảnh). Thêm: `projectId` phải là `null` hoặc id có thật trong `projects` (route kiểm DB, hàm thuần chỉ kiểm kiểu).

### `lib/projects.ts`

- `getCurrentProjectId`: thêm memoize đầu hàm — `getRequestContext()?.projectId` có giá trị thì trả luôn (comment rõ: patch chỉ xảy ra sau khi ĐÃ validate nên tin được trong cùng request).

### API `app/api/admin/role-permissions/route.ts`

- `GET ?projectId=<id>`: có param → trả overrides của dự án đó **kèm** overrides toàn hệ (UI vẽ trạng thái kế thừa); không param → như cũ (toàn hệ). Response thêm `projects: [{id, name}]` cho selector.
- `PATCH` body thêm `projectId?: number | null` (mặc định `null` = toàn hệ, tương thích ngược). Validate id dự án tồn tại → 422. Vẫn chỉ Admin (`CAN.manageUsers`), vẫn `withTransaction` cho audit M43.

### Test `tests/permissions.test.ts` (mở rộng file sẵn có) + `tests/auth-perms-project.test.ts` (mới, import `tests/setup.ts` đầu tiên)

- Unit: `getPermissionOverride` đúng thứ tự 3 tầng (dự án > toàn hệ > undefined); `hasProjectOverrides` false khi chỉ có override toàn hệ; `validatePermOverride` chặn mở quyền ghi theo dự án + chặn siết `admin/manageUsers` theo dự án.
- Integration (`TEST_DATABASE_URL`): siết `engineer/editProgress` ở dự án A → `runWithRequestContext({projectId: A})` CAN.editProgress('engineer') = false, context dự án B = true, không context = true; mở `viewPayments` cho `bch` toàn hệ + siết ở A → A=false, B=true; upsert 2 lần cùng (role, perm, NULL) không sinh 2 dòng (unique sentinel 0 hoạt động); xoá dự án → override theo dự án đó tự mất (CASCADE); `invalidatePermissionCache` nạp dòng theo dự án ngay.
- **Bất biến tương thích**: toàn bộ test cũ của `permissions`/`auth` xanh không sửa; DB không có dòng `project_id NOT NULL` → không thêm query nào trong `getCurrentUser` (assert qua đếm query nếu tiện, không thì kiểm logic `hasProjectOverrides`).

## PR2 — UI ma trận + export snapshot (`route: standard`, sau PR1 merge)

### `/admin/permissions` (`app/admin/permissions/page.tsx`)

- Thêm **selector phạm vi** trên đầu ma trận: "Toàn hệ thống" (mặc định) + danh sách dự án (từ response GET). Đổi phạm vi → fetch lại với `?projectId=`.
- Phạm vi dự án: ô hiển thị 3 trạng thái như cũ nhưng "mặc định" = **giá trị hiệu lực kế thừa** (CAN_DEFAULT + override toàn hệ nếu có, kèm chú thích nhỏ "kế thừa toàn hệ" khi nguồn là override toàn hệ); bấm đổi → PATCH kèm `projectId`; xoá override dự án → về giá trị kế thừa. Giữ nguyên luật UI: quyền trong `lockedPerms` không cho bật.
- A11y/theme theo quy ước chung (README `docs/nang-cap/` mục UI/UX); cập nhật `e2e/authed/admin-permissions.spec.ts` (hoặc file sẵn có tương ứng): render selector, đổi phạm vi, axe desktop+mobile.

### Export snapshot (`app/api/admin/permissions-snapshot/route.ts`)

- Thêm cột **"Phạm vi"**: xuất ma trận toàn hệ như cũ + mỗi dự án CÓ override riêng thêm các dòng chênh lệch (chỉ dòng có override dự án — không nhân bản toàn ma trận × N dự án). Nguồn: "Mặc định" / "Override toàn hệ" / "Override dự án <tên>".

### Tài liệu cùng PR2

- `PROGRESS.md`: đóng dòng nợ M52 PR4 (mục "Còn lại 6/10 module chưa gate") — ghi kết cục từng module như phần "Không làm" ở đầu file này.
- `docs/nang-cap/README.md`: chuyển M61 sang trạng thái ✅ trong bảng.

## Tiêu chí chấp nhận (toàn M61)

1. Bảng `role_permissions` không có dòng `project_id NOT NULL` → mọi hành vi (API, UI, hiệu năng `getCurrentUser`) y hệt trước M61; toàn bộ test cũ xanh không sửa.
2. Siết 1 quyền theo dự án A: request đang chọn A bị chặn đúng (403 tại API), chuyển sang dự án B (project switcher) quyền trở lại; đổi cookie tay sang dự án không được thấy KHÔNG né được override (cookie bị `resolveProjectId` loại).
3. Quyền ghi không mở được ở bất kỳ phạm vi nào; `admin+manageUsers` không siết được ở bất kỳ phạm vi nào.
4. Mọi thay đổi override (kể cả theo dự án) có mặt trong `audit_log` với actor đúng.
5. `npm run lint`/`typecheck`/`build`/`npm test` xanh; migration đã qua staging trước production (có DROP CONSTRAINT); `npm run gen:erd` khớp.

## Rủi ro & lưu ý cho reviewer

- **Cửa sổ cache TTL 60s giữa nhiều instance**: instance khác áp override dự án chậm ≤60s — chấp nhận, cùng đặc tính M50 hiện tại (ghi rõ trong PR).
- **Cold start**: snapshot rỗng → `hasProjectOverrides()=false` → request đầu giải quyền toàn-hệ-mặc-định dù DB có override dự án; tự đúng lại sau lần nạp đầu (≤1 request). Cùng ngữ nghĩa cold-start đã chấp nhận ở M50 — không siết thêm.
- **UI client gate bằng role tĩnh**: một số nút client suy từ `user.role`, không biết override theo dự án → có thể hiện nút rồi ăn 403. Giới hạn có sẵn từ M50 PR1 (API là ranh giới bảo mật duy nhất) — không mở rộng phạm vi sửa trong M61.
- `getCurrentProjectId` memoize qua request-context: kiểm kỹ không có đường nào patch `projectId` **trước** khi validate (grep toàn repo `patchRequestContext` — hiện chỉ `projects.ts` sau validate và `runWithRequestContext` trong test).
