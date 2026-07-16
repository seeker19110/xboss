# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: M50 — Phân quyền nâng cao (3 PR: override quyền, quyền theo trường, SoD)

### Bối cảnh & mục tiêu

Kế hoạch trước (M48 PR1 — khung `lib/integrations/`) **đã hoàn tất và merge** (PR #208).
M48 PR2/PR3 vẫn chờ công ty chốt nhà cung cấp thật (không đưa vào kế hoạch — luật cứng).

Theo thứ tự ưu tiên `docs/nang-cap/README.md`: M43–M48 (phần code được) đã xong; còn lại
M50/M51/M52 (P2) và M49 (P3). Chọn **M50** cho đợt này vì:

- **M51 (RLS)** bị chặn bởi quyết định vận hành chưa chốt với người dùng: tạo role
  Postgres `xboss_app` trên production, tách `MIGRATE_DATABASE_URL`, kèm ADR-0005 —
  KHÔNG code trước khi người dùng xác nhận sẵn sàng đụng cấu hình prod.
- **M49 (P3)** xếp sau P2, và PR3 (SSO OIDC) cần người dùng chốt việc thêm thư viện
  `jose` (hoặc ADR zero-dep).
- **M52 PR3** (module registry) tham chiếu ma trận perm của M50 — M50 đi trước hợp lẽ.
- M50 không có điểm nào phải hỏi thêm: đặc tả `docs/nang-cap/M50-phan-quyen-nang-cao.md`
  đã kín, phụ thuộc (audit trail M43) đã xong.

**Worker PHẢI đọc `docs/nang-cap/M50-phan-quyen-nang-cao.md` trước khi code** — kế hoạch
này không chép lại toàn bộ đặc tả, chỉ ghi các điểm ĐÍNH CHÍNH so với đặc tả (đặc tả
viết trước, code đã đổi) + quyết định đã chốt. Khi kế hoạch và file đặc tả lệch nhau,
**kế hoạch này thắng**.

### Đính chính chung so với đặc tả M50 (áp cho mọi việc bên dưới)

1. **Số migration**: đặc tả ghi `0055_role_permissions.sql` nhưng 0054–0057 đã bị
   M47/M48 chiếm (mới nhất hiện là `migrations/0057_integrations.sql`) → dùng
   **`migrations/0058_role_permissions.sql`**. Xác nhận lại bằng `ls migrations/ | sort`
   lúc code (bài học M32/M33).
2. **Tên perm thật**: đặc tả ghi `viewPayment` — tên thật trong map `CAN`
   (`lib/auth.ts:171`) là **`viewPayments`**. Toàn bộ chỗ đặc tả nhắc `viewPayment`
   hiểu là `viewPayments`.
3. **Tên bảng thật**: đặc tả ghi `variations`/`payrolls` — bảng thật là
   **`variation_orders`** (migration `0013_vo.sql`) và **`payroll`** (`0037_finance.sql`).
4. **Cột tiền thật**: `variation_orders` và `payment_certs` KHÔNG có cột tiền trực
   tiếp — giá trị nằm ở `boq_items` (qty × đơn giá) và `payment_cert_items`/tổng do
   SQL tính trả trong response. Phần quyền theo trường (việc 2) làm việc trên **trường
   của JSON response route GET**, không phải tên cột DB trong đặc tả.
5. **Ngoài map `CAN` còn `isAdminOrPm`** (`lib/auth.ts:168`, ~14 route dùng) — các
   route đó KHÔNG override được qua ma trận. Chấp nhận (đặc tả chỉ nói CAN); UI ma
   trận ghi chú rõ giới hạn này bằng tiếng Việt.

### Việc

#### 1. M50 PR1 — Override quyền trong DB: migration + `can()` + cache + trang ma trận

- `route:` `complex` (chạm `lib/auth.ts` — vùng rủi ro cao theo `docs/audit.md`)
- agent: `complex-implementer`
- nhánh/worktree: `claude/feat-m50-permissions-pr1` (base `origin/main` mới nhất)
- đặc tả nền: mục **PR1** của `docs/nang-cap/M50-phan-quyen-nang-cao.md` + đính chính
  chung ở trên. Các quyết định đã CHỐT (không tự đổi):

  **Migration `migrations/0058_role_permissions.sql`** — đúng schema trong đặc tả
  (bảng `role_permissions(role, perm_key, allowed, updated_by, updated_at)`, PK
  `(role, perm_key)`, idempotent). Thêm khối `DO $$` gắn trigger
  `audit_row_change()` cho bảng `role_permissions` (copy đúng pattern cuối
  `migrations/0053_approvals.sql:71` — M43 audit mọi thay đổi cấu hình quyền).
  Migration thêm thuần (CREATE TABLE/TRIGGER) → đi thẳng production được.
  Chạy `npm run gen:erd` cùng PR.

  **`lib/auth.ts` — GIỮ NGUYÊN chữ ký `CAN.x(role)` , KHÔNG đổi call-site hàng loạt**
  (quyết định của phiên chính, đơn giản hoá so với đặc tả — đặc tả cho phép "2 API
  cùng tồn tại, CAN.x đọc override qua cùng cache"; vì override chỉ theo `role`,
  chữ ký `(r?: Role) => boolean` là đủ, đổi ~119 call-site không thêm giá trị):
  - Đổi tên map hàm tĩnh hiện tại thành `CAN_DEFAULT` (nội bộ, không export đổi tên
    ra ngoài file).
  - `CAN` export mới = proxy cùng shape: mỗi `CAN.x(role)` tra cache override
    `(role, 'x')` → có dòng thì theo `allowed`, không có → `CAN_DEFAULT.x(role)`.
    Mọi route hiện có giữ nguyên không sửa.
  - **Cache**: nạp toàn bộ `role_permissions` vào memory (bảng <100 dòng). Vì
    `CAN.x` là hàm sync, dùng mô hình **stale-while-revalidate**: đọc luôn từ
    snapshot memory hiện có; một tác vụ nền refresh snapshot khi quá TTL 60s
    (kích hoạt lười ở lần gọi kế tiếp, không setInterval — thân thiện serverless).
    Snapshot rỗng lúc cold start → mọi perm theo default cho tới lần nạp đầu
    (an toàn: default là hành vi hiện tại). PATCH ma trận gọi invalidate trực tiếp
    trong cùng process; instance khác tự bắt kịp trong ≤60s — chấp nhận độ trễ này
    (ghi chú trên UI). Ranh giới được phép tự quyết: chi tiết cấu trúc module cache
    (file mới `lib/permissions.ts` hay trong `lib/auth.ts`) — miễn `lib/auth.ts`
    không import vòng.
  - **`LOCKED_PERMS`**: danh sách perm KHÔNG cho override mở (allowed=true) cho
    `VIEW_ONLY_ROLES` (`bch/cdt/viewer`) = mọi perm ghi dữ liệu. Duyệt map
    `CAN_DEFAULT` thật để liệt kê (mọi perm `manage*`, `edit*`, `create*`,
    `record*`, `decide*`, `assign`, `approve`, `import`); perm chỉ-xem
    (`view*`, `export`) được mở. Quy tắc API: chỉ cho **siết** (allowed=false)
    với vai trò thao tác, hoặc **mở/siết** perm xem — vi phạm → 422 kèm lý do
    tiếng Việt.

  **API** (pattern `app/api/admin/alert-rules/route.ts`):
  - `GET /api/admin/role-permissions` — `CAN.manageUsers` (admin): trả toàn bộ
    override + danh sách perm_key hợp lệ (tên hàm trong `CAN_DEFAULT`) + giá trị
    default từng (role, perm) để UI vẽ ma trận 3 trạng thái.
  - `PATCH /api/admin/role-permissions` — admin, body
    `{role, permKey, allowed: boolean | null}` (`null` = xoá override, về default).
    Validate: role hợp lệ (`lib/roles.ts`), permKey tồn tại trong `CAN_DEFAULT`,
    luật `LOCKED_PERMS` → 422. Upsert/DELETE + invalidate cache.

  **Trang `app/admin/permissions/page.tsx`** (mới, client component, bố cục tham
  khảo `app/admin/alert-rules/page.tsx`): ma trận role × perm_key nhóm theo module
  (nhóm theo prefix/comment trong `CAN_DEFAULT`, đặt nhãn tiếng Việt), ô 3 trạng
  thái: mặc định (nhạt, ghi rõ giá trị default) / mở / siết; chỉ admin sửa (PM
  không có mục sidebar — gate `CAN.manageUsers`); ô thuộc `LOCKED_PERMS` với vai
  trò chỉ-xem: disable + tooltip lý do. Ghi chú giới hạn `isAdminOrPm` (đính chính
  §5) + độ trễ cache ≤60s. Sidebar: thêm node vào `app/lib/dashboardTree.ts` nhóm
  "Hệ thống" cạnh "Cấu hình duyệt", gate theo `manageUsers`.

  **Test `tests/permissions.test.ts`** (mới, import `tests/setup.ts` đầu tiên,
  integration `TEST_DATABASE_URL`): (1) không override → `CAN.x` = default;
  (2) siết `approve` của `pm` → false thật sau invalidate; (3) mở perm ghi cho
  `viewer` qua API → 422; (4) mở perm xem (`viewPayments`) cho `viewer` → true;
  (5) xoá override (`allowed: null`) → về default; (6) PATCH xong cache invalidate
  ngay trong cùng process. Thêm file vào lệnh `npm test` trong `package.json`.

- tiêu chí chấp nhận:
  - [ ] `npm run lint` + `npm run typecheck` + `npm test` + `npm run build` xanh;
        `npm run gen:erd` không lệch
  - [ ] Không sửa call-site `CAN.x(...)` nào ngoài `lib/auth.ts` (diff các route = 0)
  - [ ] DB trống bảng override → hành vi mọi perm y hệt trước PR (test 1 + chạy lại
        toàn bộ test suite cũ pass là bằng chứng)
  - [ ] Luật `LOCKED_PERMS` chặn ở API (422), không chỉ disable ở UI
  - [ ] Thay đổi override có dòng `audit_log` tương ứng (trigger M43)
  - [ ] Đọc perm mỗi request không chạm DB (trừ lần refresh TTL) — kiểm bằng đọc code
        + reviewer xác nhận

#### 2. M50 PR2 — Quyền theo trường: `lib/sensitive-fields.ts` + strip tại route + `MaskedValue`

- `route:` `complex` (chạm route tài chính — vùng rủi ro cao; danh sách trường thật
  phải tự xác định từ response, đặc tả chỉ nêu tinh thần)
- agent: `complex-implementer`
- nhánh/worktree: `claude/feat-m50-permissions-pr2`, base **nhánh việc 1** (cần perm
  `viewPayroll` đăng ký vào `CAN_DEFAULT` + cache của PR1)
- đặc tả nền: mục **PR2** của `docs/nang-cap/M50-phan-quyen-nang-cao.md` + đính chính
  chung. Quyết định đã chốt:

  - Perm mới `viewPayroll` thêm vào `CAN_DEFAULT`: `(r) => r === "admin" || r === "pm"`
    (kèm comment tiếng Việt: lương nhạy cảm hơn thanh toán — `bch` xem được trang
    payroll nhưng số tiền bị che). Route payroll GET vẫn gate vào trang bằng
    `viewPayments` như hiện tại (`app/api/payroll/route.ts:31`) — KHÔNG đổi; chỉ
    thêm lớp che trường.
  - `lib/sensitive-fields.ts` (mới): map entity → `{ fields, perm }[]` như đặc tả
    nhưng **fields là tên trường trong JSON response** (camelCase) của từng route
    GET. **Ranh giới được phép tự quyết**: worker đọc từng route GET trả 4 entity
    (`variation_orders`: `app/api/variations/*`; `contracts`: `app/api/contracts/*`;
    `payment_certs`: `app/api/payment-certs/*` kể cả `[id]/excel`; `payroll`:
    `app/api/payroll/*`) và tự liệt kê đúng các trường mang giá trị tiền/đơn giá/
    tỷ lệ nhạy cảm (vd `contracts`: `value`, `advancePct`, `retentionPct`; `payroll`:
    `rate`, `gross`, `deductions`, `net`; VO/IPC: các trường tổng tiền do SQL tính
    và đơn giá trong items) — danh sách cuối phải ghi thành comment đầu file kèm
    route áp dụng, reviewer đối chiếu.
  - `stripSensitive(entity, rows, user)`: thay giá trị bằng `null` khi user thiếu
    perm; thuần, không chạm DB (perm check qua `CAN` PR1). Áp tại route GET (ranh
    giới bảo mật duy nhất) TRƯỚC `res.json`. Route tổng hợp tài chính đã chặn cả
    trang bằng `PAYMENT_VIEW_ROLES` → không đụng (đúng đặc tả).
  - Export Excel của payment-certs (`[id]/excel`): user thiếu perm → 403 luôn
    (che từng ô trong file Excel là vô nghĩa — quyết định của phiên chính).
  - UI: component `MaskedValue` (`app/components/MaskedValue.tsx`) hiển thị "•••"
    khi giá trị `null` ở cột tiền, kèm `aria-label` "Không có quyền xem"; gắn vào
    các trang/bảng hiển thị 4 entity. Không đổi layout khác.
  - Test `tests/sensitive-fields.test.ts` (unit, thuần): strip đúng trường theo
    perm, không đụng trường khác, mảng rỗng, user đủ perm → nguyên vẹn.

- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] User `bch` GET payroll: vẫn 200, các trường tiền = `null`; `admin`/`pm`
        thấy đủ (test integration hoặc unit trên handler logic — chọn cách rẻ nhất
        verify được thật)
  - [ ] Strip nằm ở API route, không phải chỉ ẩn ở UI
  - [ ] Không route nào ngoài danh sách 4 entity bị đổi hành vi

#### 3. M50 PR3 — Báo cáo SoD + xuất ma trận quyền hiệu lực

- `route:` `standard` (đọc-only, SQL + export, đặc tả cụ thể, không đổi hành vi ghi)
- agent: `standard-worker`
- nhánh/worktree: `claude/feat-m50-permissions-pr3`, base **nhánh việc 1** (tab gắn
  vào trang `/admin/permissions` của PR1; chạy SONG SONG được với việc 2 — không
  chung file với việc 2)
- đặc tả nền: mục **PR3** của `docs/nang-cap/M50-phan-quyen-nang-cao.md` + đính chính
  chung. Cụ thể hoá:

  - `lib/sod.ts` (mới): mỗi rule = 1 câu SQL placeholder `?` + mô tả tiếng Việt.
    3 rule v1 (đối chiếu bảng thật trước khi viết): (a) cùng user vừa tạo vừa duyệt
    — quét `approval_requests`/`approval_actions` (M46) VÀ dữ liệu trước M46 qua
    `variation_orders`/`payment_certs` (`created_by` = `decided_by`); (b) vừa lập
    PO vừa nhận hàng (`purchase_orders.created_by` = người ghi nhận giao nhận —
    đọc schema `0016`+ để lấy đúng bảng nhận hàng; nếu bảng nhận hàng không có cột
    người ghi thì BỎ rule này kèm ghi chú trong code, không chế thêm cột); (c) vừa
    ghi chi vừa duyệt chi trên `cash_transactions`/`advances` (tương tự — chỉ viết
    rule khi cột người-duyệt thật sự tồn tại). Tham số `days` giới hạn theo
    `created_at`.
  - `GET /api/admin/sod-report?days=90` — `CAN.viewAudit` (admin, cùng độ nhạy
    audit log): trả mảng `{rule, description, violations: [...]}`.
  - `GET /api/admin/permissions-snapshot` — admin: xuất Excel (exceljs, pattern
    `app/api/export/excel/route.ts`) ma trận role × perm hiệu lực (default +
    override đè), 1 sheet, kèm cột "nguồn" (mặc định/override) + thời điểm xuất.
  - UI: trang `/admin/permissions` (PR1) thêm tab "Báo cáo SoD" (bảng vi phạm,
    chọn khoảng ngày 30/90/180) + nút "Xuất ma trận quyền (.xlsx)".
  - Test `tests/sod.test.ts` (integration): seed 1 cặp vi phạm rule (a) → report
    bắt được; user không vi phạm → không xuất hiện.

- tiêu chí chấp nhận:
  - [ ] lint/typecheck/test/build xanh
  - [ ] Chỉ admin gọi được 2 route mới (401/403 đúng), `dynamic = "force-dynamic"`
  - [ ] Rule chỉ dựa cột có thật — không migration mới nào trong PR này
  - [ ] File Excel mở được, đủ ma trận + nguồn

### Thứ tự & phụ thuộc

- Việc 1 đi trước, một mình một đợt dispatch. Việc 2 và việc 3 base nhánh việc 1,
  chạy **song song** với nhau sau khi việc 1 qua reviewer (2 việc không chung file:
  việc 2 đụng `lib/sensitive-fields.ts` + route 4 entity + components; việc 3 đụng
  `lib/sod.ts` + 2 route admin mới + tab trong trang permissions — nếu cùng sửa
  `app/admin/permissions/page.tsx` gây conflict nhỏ, coordinator tự tích hợp).
  - Ngoại lệ chung file duy nhất: cả việc 2 lẫn việc 1 đụng `lib/auth.ts` (thêm
    `viewPayroll`) — việc 2 base nhánh việc 1 nên không conflict.
- Migration duy nhất của đợt: `0058_role_permissions.sql` (việc 1). Việc 2/3 không
  migration.
- Trước khi tạo worktree: `git fetch origin` + xác nhận `0058` còn trống.

### Sau khi worker xong (coordinator thực hiện)

- [ ] Đối chiếu từng việc với tiêu chí chấp nhận (chạy lại lint/typecheck/test/build)
- [ ] `reviewer` soát diff từng việc — chú ý: (1) việc 1: cache stale-while-revalidate
      không chạm DB mỗi request, `LOCKED_PERMS` đủ mọi perm ghi (đối chiếu
      `CAN_DEFAULT` thật, dễ sót perm mới như `manageIntegrations`), hành vi khi bảng
      override trống phải y hệt trước PR; (2) việc 2: danh sách trường nhạy cảm khớp
      response thật từng route (đối chiếu comment đầu `lib/sensitive-fields.ts`),
      strip đặt trước MỌI đường return của route; (3) việc 3: SQL rule không nối
      chuỗi, quyền admin đúng.
- [ ] Worker phát hiện đặc tả sai/thiếu (vd cột người-nhận-hàng không tồn tại làm
      rỗng rule (b)) → ghi nhận theo hướng dẫn trong brief; vướng NGOÀI ranh giới đã
      cho → dừng việc đó, báo phiên chính, không tự đổi phạm vi
- [ ] Báo cáo tổng hợp: trạng thái từng việc, nhánh + commit, kết quả reviewer, các
      quyết định worker tự đưa trong ranh giới (đặc biệt: danh sách trường nhạy cảm
      cuối cùng của việc 2, rule SoD nào bị bỏ vì thiếu cột)

### Duyệt cuối (phiên chính thực hiện)

- [ ] Đối chiếu diff 3 việc với đặc tả + báo cáo coordinator; chú ý điểm phiên chính
      đã quyết lệch đặc tả (không đổi call-site; Excel 403 thay vì che ô)
- [ ] Cập nhật `PROGRESS.md` (mục M50, ghi rõ các quyết định lệch đặc tả) +
      `docs/nang-cap/README.md` nếu cần
- [ ] Push nhánh + mở PR draft theo template (3 PR, thứ tự merge: 1 → 2/3)
- [ ] Nhắc người dùng quyết định đang chờ cho các đợt sau (hỏi khi tới lượt, không
      tự quyết): **M51 PR1** cần xác nhận sẵn sàng đổi cấu hình production (role
      `xboss_app`, `MIGRATE_DATABASE_URL`, ADR-0005). (Câu hỏi thư viện OIDC của M49
      PR3 ĐÃ chốt 2026-07-16: dùng `openid-client` — đặc tả M49 đã viết lại toàn diện
      theo quyết định này, xem `docs/nang-cap/M49-api-mo-sso.md`.)
