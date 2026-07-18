# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: M61 — Override quyền theo dự án (`role_permissions.project_id`, 2 PR tuần tự)

### Bối cảnh & mục tiêu

Thi hành `docs/nang-cap/M61-phan-quyen-theo-du-an.md` (đặc tả viết 2026-07-18, đối chiếu
code thật cùng ngày — đặc tả và code chưa kịp lệch nhau): thêm chiều dự án cho override
quyền (bảng `role_permissions`, M50 PR1), đóng nợ kỹ thuật cuối của M52 PR4 (module
`permissions` là module quản trị duy nhất chưa scope theo dự án được). Giải quyền 3 tầng:
**override dự án > override toàn hệ (`project_id NULL`) > `CAN_DEFAULT`**, đọc `projectId`
từ request-context (AsyncLocalStorage sẵn có của M43) nên **không đổi chữ ký `CAN.x(role)`,
0 call site phải sửa**.

**Mọi worker PHẢI đọc `docs/nang-cap/M61-phan-quyen-theo-du-an.md` trọn vẹn trước khi
code** — kế hoạch này chỉ ghi đính chính + phân việc, không lặp lại đặc tả. Kế hoạch và
đặc tả lệch nhau → kế hoạch này thắng.

**Ghi chú cho coordinator — kế hoạch đợt trước chưa thi hành:** kế hoạch M53/M57 (commit
`d6d6dd9`, PR #236) vẫn **chưa chạy** (xác minh 2026-07-18: `lib/version.ts` còn aggregate
JOIN cũ, chưa có `lib/search.ts`/`poolStats`) — đợt đó KHÔNG bị huỷ, chỉ nhường chỗ trong
file này (tra lại nguyên văn ở commit `d6d6dd9`); không tự nhặt lại trong đợt M61.

### Đính chính so với đặc tả (xác minh trên code 2026-07-18)

- **Số migration cao nhất trên `main`: `0065_totp.sql`** (0064 bị bỏ trống, có 2 file cùng
  số 0060 — đánh số lỏng). Đặc tả ghi `0066` — worker PHẢI tự chạy
  `ls migrations/ | sort -V | tail -5` ngay trước khi tạo file để lấy số thật tại thời
  điểm code (đợt M53/M57 nếu chạy trước sẽ chiếm số).
- **Tên constraint UNIQUE cũ không hardcode được chắc chắn** (mặc định Postgres là
  `role_permissions_role_perm_key_key` nhưng chưa xác minh trên production). Thay vì
  `DROP CONSTRAINT IF EXISTS <tên đoán>` như DDL mẫu trong đặc tả, worker viết **DO block
  tra `pg_constraint`** tìm constraint UNIQUE trên đúng cặp cột `(role, perm_key)` của
  bảng `role_permissions` rồi `EXECUTE` drop theo `conname` thật — idempotent, đúng với
  mọi tên. Vẫn bắt buộc qua staging (xem mục Lưu ý migration).
- **`tests/permissions.test.ts` đã tồn tại** (113 dòng, test M50) — PR1 mở rộng file này
  cho phần unit/cache. Runner `scripts/run-tests.mjs` **tự phát hiện mọi file trong
  `tests/`** — KHÔNG cần (và không có chỗ) đăng ký file test mới vào `package.json`;
  file mới `tests/auth-perms-project.test.ts` cứ tạo là được chạy. File test chạm DB
  import `tests/setup.ts` ĐẦU TIÊN (quy ước dự án).
- **E2E cho `/admin/permissions` nằm trong `e2e/authed/admin-config.spec.ts`** (không có
  file riêng như đặc tả đoán) — PR2 mở rộng file này, không tạo file mới.
- **Trang `app/admin/permissions/page.tsx` là client component KHÔNG import `lib/auth`**
  (tránh kéo `node:crypto`) — mọi dữ liệu quyền qua API, nhãn/nhóm từ
  `app/lib/permissionMeta.ts` (client-safe). Selector phạm vi ở PR2 lấy danh sách dự án
  từ response GET `/api/admin/role-permissions` (PR1 thêm field `projects`), KHÔNG import
  gì từ `lib/projects.ts` vào client.
- **Điểm chèn trong `getCurrentUser()`** (`lib/auth.ts`, hàm ~dòng 87): sau dòng
  `patchRequestContext({ userId: user.id, role: user.role })` hiện có. `lib/projects.ts`
  không import `lib/auth.ts` (đã kiểm — thêm import chiều `auth → projects` không tạo
  vòng).
- **3 route hiện có của module**: `GET/PATCH /api/admin/role-permissions` (gate
  `CAN.manageUsers`), `GET /api/admin/permissions-snapshot` (Excel, gate `CAN.viewAudit`).
  PR1 chỉ đụng route đầu; snapshot để PR2.

### Việc

#### 1. M61 PR1 — Nền: migration + cache + giải quyền + API

- route: `complex`
- nhánh: `claude/feat-m61-pr1-perm-project`
- đọc trước: `docs/nang-cap/M61-phan-quyen-theo-du-an.md` (mục "Ngữ nghĩa giải quyền" +
  "PR1" trọn vẹn) + toàn bộ Đính chính ở trên + các file sẽ sửa:
  `migrations/0058_role_permissions.sql` (hiểu schema hiện tại), `lib/permissions.ts`,
  `lib/auth.ts` (vùng `resolvePerm`/`CAN`/`validatePermOverride`/`getCurrentUser`),
  `lib/projects.ts` (`getCurrentProjectId`/`resolveProjectId`), `lib/request-context.ts`,
  `app/api/admin/role-permissions/route.ts`.
- việc: đúng theo đặc tả mục PR1 —
  - Migration (số thật lúc code): `ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS
    project_id INT REFERENCES projects(id) ON DELETE CASCADE` + DO block drop UNIQUE cũ
    theo `pg_constraint` (xem Đính chính) + `CREATE UNIQUE INDEX IF NOT EXISTS
    uq_role_perm_scope ON role_permissions (role, perm_key, COALESCE(project_id, 0))`.
    Chạy `npm run gen:erd` cùng PR.
  - `lib/permissions.ts`: snapshot key `` `${role}|${permKey}|${projectId ?? "*"}` ``;
    `getPermissionOverride(role, permKey, projectId?)` tra dự án trước, miss → tra `*`;
    `hasProjectOverrides()` (boolean tính sẵn lúc `reload()`, đọc đồng bộ);
    `listPermissionOverrides(projectId?)` (undefined = hết / null = toàn hệ / số = dự án);
    `setPermissionOverride(..., projectId)` — upsert
    `ON CONFLICT (role, perm_key, COALESCE(project_id, 0))`, DELETE dùng
    `project_id IS NOT DISTINCT FROM ?`. Giữ nguyên stale-while-revalidate/TTL/cold-start.
  - `lib/auth.ts`: `resolvePerm` đọc `getRequestContext()?.projectId` truyền vào
    `getPermissionOverride`; `getCurrentUser` — CHỈ KHI `hasProjectOverrides()` →
    `await getCurrentProjectId(user)` bọc try/catch nuốt lỗi + `log.warn` (lỗi giải dự
    án không được fail xác thực); `validatePermOverride(role, permKey, allowed,
    projectId?)` — luật LOCKED_PERMS + chống tự khoá `admin/manageUsers` áp MỌI phạm vi.
  - `lib/projects.ts::getCurrentProjectId`: memoize đầu hàm qua
    `getRequestContext()?.projectId` (comment rõ: chỉ patch sau khi đã validate nên tin
    được trong cùng request).
  - Route `GET /api/admin/role-permissions?projectId=` (trả overrides dự án + toàn hệ +
    field `projects: [{id, name}]`) / `PATCH` body thêm `projectId?: number|null`
    (validate id tồn tại trong `projects` → 422).
- **ranh giới được phép quyết** (vì `route: complex`): cấu trúc nội bộ cache/tên hàm
  phụ/cách tổ chức test. **KHÔNG được quyết khác**: ngữ nghĩa 3 tầng, chữ ký
  `CAN.x(role)`, luật LOCKED_PERMS + chống tự khoá (áp mọi phạm vi), nguyên tắc không
  đọc cookie `xboss_project` thô để giải quyền, bất biến "bảng không có dòng theo dự án
  → hành vi + chi phí y hệt trước M61". Vướng đặc tả sai/thiếu → DỪNG, báo coordinator,
  không tự chế.
- tiêu chí chấp nhận:
  - Test unit + integration đúng danh sách mục "Test" PR1 của đặc tả: thứ tự 3 tầng;
    `hasProjectOverrides` false khi chỉ có override toàn hệ; validate chặn mở quyền ghi
    theo dự án + chặn siết `admin/manageUsers` theo dự án; siết `engineer/editProgress`
    ở dự án A → `runWithRequestContext({projectId: A})` bị chặn, context B/không-context
    không bị; upsert 2 lần cùng `(role, perm, NULL)` không sinh 2 dòng; xoá dự án →
    override theo dự án tự mất (CASCADE); `invalidatePermissionCache` nạp ngay.
  - Toàn bộ test cũ xanh KHÔNG SỬA (bất biến tương thích — phải sửa test cũ mới pass =
    fail tiêu chí; trừ khi test cũ sai thật thì dừng và báo).
  - `npm run lint`/`typecheck`/`build` xanh; `npm test` xanh trên Postgres cục bộ
    (`TEST_DATABASE_URL`); `docs/ERD.md` đã sinh lại khớp schema (CI gate).
  - Diff không chạm file ngoài danh sách: migration mới, `docs/ERD.md`,
    `lib/permissions.ts`, `lib/auth.ts`, `lib/projects.ts`,
    `app/api/admin/role-permissions/route.ts`, `tests/permissions.test.ts`,
    `tests/auth-perms-project.test.ts` (mới).

#### 2. M61 PR2 — UI ma trận + export snapshot + tài liệu

- route: `standard`
- nhánh: `claude/feat-m61-pr2-perm-ui` (tạo TỪ kết quả PR1 đã tích hợp — phụ thuộc cứng)
- đọc trước: `docs/nang-cap/M61-phan-quyen-theo-du-an.md` mục PR2 + Đính chính +
  `app/admin/permissions/page.tsx`, `app/lib/permissionMeta.ts`,
  `app/api/admin/permissions-snapshot/route.ts`, `e2e/authed/admin-config.spec.ts`.
- việc: đúng đặc tả mục PR2 —
  - Selector phạm vi ("Toàn hệ thống" mặc định + danh sách dự án từ API) trên
    `/admin/permissions`; ở phạm vi dự án, ô "mặc định" = giá trị hiệu lực kế thừa
    (CAN_DEFAULT + override toàn hệ) kèm chú thích nguồn "kế thừa toàn hệ" khi nguồn là
    override toàn hệ; bấm đổi → PATCH kèm `projectId`; quyền trong `lockedPerms` vẫn
    không cho bật.
  - Export snapshot: thêm cột "Phạm vi" — ma trận toàn hệ đầy đủ như cũ + mỗi dự án CÓ
    override riêng chỉ xuất các dòng chênh lệch (không nhân bản toàn ma trận × N dự án);
    nguồn "Mặc định" / "Override toàn hệ" / "Override dự án <tên>".
  - Tài liệu: `PROGRESS.md` đóng dòng nợ M52 PR4 (ghi kết cục: 4/5 module quản trị scope
    shape ✅, `permissions` = M61, `ops` không áp dụng, không gate module `permissions`
    bằng feature flag) + `docs/nang-cap/README.md` chuyển M61 → ✅.
  - Mở rộng `e2e/authed/admin-config.spec.ts`: render selector, đổi phạm vi, axe
    desktop + mobile.
- tiêu chí chấp nhận: quy ước UI/UX chung (`docs/nang-cap/README.md` — dark-first không
  `dark:`/hex, thang `zinc`, select có `aria-label`); e2e + axe xanh trên Postgres cục
  bộ; lint/typecheck/build xanh; phạm vi "Toàn hệ thống" hành xử y hệt UI cũ.

### Thứ tự & phụ thuộc

Tuần tự, KHÔNG song song: PR1 → `reviewer` soát diff (bắt buộc rà mục "Vùng rủi ro cao"
trong `docs/audit.md` vì chạm `lib/auth.ts`) → tích hợp → PR2 (base = kết quả PR1) →
`reviewer` → tích hợp → báo cáo phiên chính duyệt cuối. Trước khi tạo nhánh:
`git fetch origin` + base khớp `origin/main` mới nhất (luật đồng bộ nhánh CLAUDE.md).

### Lưu ý migration (coordinator ghi vào mô tả PR, KHÔNG tự deploy)

Migration PR1 có **DROP CONSTRAINT** → không thuộc whitelist "thêm thuần tuý" của DoD:
PHẢI chạy staging (`bash deploy.sh --staging`, kiểm trước `npm run db:migrate -- --dry-run`)
trước production. Đây là việc của người vận hành sau khi merge — coordinator chỉ cần ghi
rõ cảnh báo này vào mô tả PR1.

### Tiêu chí duyệt cuối (phiên chính kiểm khi coordinator báo xong)

5 tiêu chí "Tiêu chí chấp nhận (toàn M61)" trong đặc tả: (1) bảng không có dòng theo dự
án → hành vi + hiệu năng y hệt trước M61, test cũ xanh không sửa; (2) siết theo dự án A
chặn đúng A, đổi dự án B quyền trở lại, đổi cookie tay không né được; (3) không mở quyền
ghi / không siết `admin+manageUsers` ở mọi phạm vi; (4) mọi thay đổi override có trong
`audit_log` với actor đúng; (5) lint/typecheck/build/test xanh + ERD khớp + cảnh báo
staging có trong mô tả PR1.
