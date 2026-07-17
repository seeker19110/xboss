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

---

## Kế hoạch: Đợt vá vận hành 2026-07-16 (độc lập, chạy song song được với M50)

### Bối cảnh & mục tiêu

Kết quả đợt quét dự án 2026-07-16 theo `docs/audit.md` (phiên chính tự quét, đã xác
minh ground-truth từng điểm bằng grep/đọc migration/chạy `npm audit`): nền bảo mật/vận
hành sau M43–M48 đã vững (`npm audit` 0 lỗ hổng, workflow pin SHA đủ, security headers
đủ trừ HSTS, M44 đóng đủ 4 PR) — còn lại 4 điểm nhỏ vá được ngay bằng đợt này.

**Phạm vi**: 2 việc, 2 nhánh, 2 PR nhỏ. KHÔNG đụng file nào của kế hoạch M50 ở trên
(deploy.yml/DEPLOY.md/PROGRESS.md/2 file test — không giao với `lib/auth.ts`/route/UI
của M50) → coordinator được dispatch song song cả hai kế hoạch.

**Ngoài phạm vi (chờ người dùng, KHÔNG tự làm)**: xác nhận branch protection `main`
có enforce cho admin không (quyết định giữ/bỏ deploy-on-push, nợ audit lần 5); cấp
`SENTRY_DSN`; tắt nguồn notification 8 module ẩn (giải tận gốc ở M52 PR3).

### Việc

#### A. Vá cấu hình + dọn tài liệu vận hành (deploy.yml, DEPLOY.md, PROGRESS.md)

- `route:` `mechanical` (mọi thay đổi là văn bản/cấu hình có nội dung cho sẵn dưới đây)
- agent: `mechanical-worker`
- nhánh/worktree: `claude/chore-ops-hardening` (base `origin/main` mới nhất)
- đặc tả (3 file, nội dung đóng — chép đúng, không sáng tác thêm):

  **A1. `.github/workflows/deploy.yml`** — file DUY NHẤT trong `.github/workflows/`
  thiếu khối `permissions:` (vi phạm checklist `docs/audit.md` §6 "least-privilege
  tường minh"). Job chỉ SSH vào VPS qua secrets, không dùng `GITHUB_TOKEN` → thêm
  ngay dưới khối `on:` (trước `jobs:`), thụt lề cấp 0:

  ```yaml
  # Job chỉ SSH vào VPS bằng secrets riêng — không cần bất kỳ quyền GITHUB_TOKEN nào
  # (least-privilege theo docs/audit.md §6).
  permissions: {}
  ```

  **A2. `DEPLOY.md`** — mục reverse proxy (~dòng 117, câu "Đặt Nginx/Caddy làm reverse
  proxy trước cổng 3000, rồi dùng `certbot --nginx` cấp SSL miễn phí."): bổ sung ngay
  sau câu đó đoạn sau (certbot KHÔNG tự thêm HSTS — app hiện không có
  `Strict-Transport-Security` ở đâu):

  ```markdown
  Sau khi HTTPS chạy ổn định, thêm HSTS vào block `server` cổng 443 của Nginx để chặn
  downgrade về HTTP (certbot không tự thêm header này):

      add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  > Lưu ý: chỉ thêm khi chắc chắn toàn bộ domain (kể cả subdomain nếu dùng
  > `includeSubDomains`) phục vụ HTTPS lâu dài; không dùng `preload` — ghi danh vào
  > danh sách preload của trình duyệt gần như không rút lại được.
  ```

  **A3. `PROGRESS.md`** — 3 chỉnh sửa vào mục nợ kỹ thuật (đã xác minh hiện trạng
  2026-07-16, ghi đúng như sau):

  1. Khối "**Nợ lớn đã biết theo ADR-0004**" (cụm `tasks`/`gantt`/`timeline`/
     `lookahead`/`my-tasks`/`schedule-control`/`norms/over` chưa lọc `project_id`):
     bọc `~~...~~` toàn dòng + nối vào cuối: "→ **đã đóng** (2026-07-16, PR #202 vá
     đủ 7 route + PR #209 vá nốt `pendingStageFloors`/`export/pdf`; bất biến tĩnh
     `tests/project-scope-invariant.test.ts` canh lớp lỗi này từ nay)".
  2. Dòng nợ "`lib/dashboardext.ts::cashflowSeries()`/`cpiBlock()` ... chưa scope
     theo dự án": bọc `~~...~~` + nối: "→ **hết hiện trạng** (xác minh 2026-07-16:
     2 hàm đã bị xoá khỏi codebase trong các đợt refactor trước, không còn định nghĩa
     trong `lib/dashboardext.ts` lẫn `lib/finance.ts` — chỉ còn comment nhắc tên ở
     `lib/finance.ts:18`; không còn gì để scope)".
  3. Thêm 1 dòng nợ MỚI (cùng danh sách nợ kỹ thuật, mục gần nhất): "**CSP còn
     `script-src 'unsafe-inline'`** (`next.config.mjs`) — chấp nhận có chủ đích
     2026-07-16: gỡ cần chuyển sang nonce-based CSP (đụng mọi inline script của
     Next/analytics), chi phí lớn, làm thành đợt riêng khi có yêu cầu cứng về CSP;
     các lớp chống XSS khác đã có (React escape mặc định, không `dangerouslySetInnerHTML`
     với dữ liệu người dùng)."

- tiêu chí chấp nhận:
  - [ ] `git diff` chỉ chạm đúng 3 file trên, nội dung khớp đặc tả
  - [ ] YAML hợp lệ (workflow parse được — chạy `npx --yes yaml-lint` hoặc để CI kiểm);
        `npm run lint`/`typecheck` xanh (không đụng code nên phải xanh nguyên trạng)
  - [ ] Không sửa/xoá mục nào khác trong `PROGRESS.md` ngoài 3 điểm nêu trên

#### B. Fixture test idempotent: `tests/evm.test.ts` + `tests/matviews.test.ts`

- `route:` `standard` (fix có cơ chế lỗi đã chẩn đoán sẵn + cách tái hiện cụ thể)
- agent: `standard-worker`
- nhánh/worktree: `claude/fix-test-fixture-rerun` (base `origin/main` mới nhất)
- đặc tả — cơ chế lỗi ĐÃ XÁC MINH (nợ ghi trong `PROGRESS.md`: "2 file thiếu cleanup
  fixture nên chỉ chạy đúng 1 lần/DB"):
  - Cả 2 file seed fixture bằng **mã cứng** va vào ràng buộc UNIQUE toàn cục:
    `tests/matviews.test.ts:19` chèn `systems (code='MVACMV')` — `systems.code` là
    `NOT NULL UNIQUE` (kế thừa `disciplines`, `migrations/0005_boq.sql`);
    `tests/evm.test.ts` chèn `boq_items` với BOQCODE cứng — BOQCODE unique **toàn
    hệ thống** qua bảng `boq_codes` + trigger (`migrations/0029_boq_codes.sql`).
  - Cleanup (`DELETE FROM ...`) nằm **cuối thân test, sau các assert, không bọc
    `finally`** (vd `evm.test.ts:131-141`, `matviews.test.ts:86-90`) → bất kỳ assert
    fail nào bỏ dở cleanup, dữ liệu mồ côi ở lại, lần chạy sau vỡ UNIQUE ngay từ seed
    → "fail giả" nối tiếp dù code đúng.
  - Sửa theo 2 lớp, áp cho CẢ 2 file (không đổi bất kỳ assert/logic kiểm nào):
    1. **Mã duy nhất theo lần chạy**: đầu mỗi file thêm
       `const RUN = Date.now().toString(36);` — mọi mã cứng trong fixture (code của
       systems/sheet_types/work_packages/tasks/boq_items, slug, tên project) nối thêm
       `-${RUN}` (vd `` `MVACMV-${RUN}` ``). Hai lần chạy không bao giờ đụng UNIQUE
       kể cả khi lần trước bỏ dở cleanup.
    2. **Cleanup chạy cả khi fail**: chuyển toàn bộ khối DELETE cuối test vào
       `try { ...thân test... } finally { ...cleanup... }` (node:test không có
       fixture teardown theo test — `try/finally` là pattern đơn giản nhất, giữ
       nguyên thứ tự DELETE con-trước-cha hiện có). Biến id khai báo trước `try`
       (kiểu `let`, gán trong `try`, cleanup check `if (id)` trước khi DELETE).
  - **Bắt buộc tái hiện lỗi TRƯỚC khi sửa** (ground-truth theo `docs/audit.md` §1):
    dựng Postgres cục bộ + `TEST_DATABASE_URL`, chạy
    `npx tsx --test tests/evm.test.ts tests/matviews.test.ts` **2 lần liên tiếp cùng
    DB** — ghi nhận lần 2 fail (nếu KHÔNG tái hiện được: dừng, báo lại, không sửa mù).
- tiêu chí chấp nhận:
  - [ ] Tái hiện được lỗi trước khi sửa (ghi output lần 2 fail vào báo cáo)
  - [ ] Sau sửa: chạy 2 file test **2 lần liên tiếp cùng DB** đều xanh; thêm lần 3
        sau khi giả lập fail giữa chừng (chèn tạm 1 assert sai, chạy, gỡ ra, chạy
        lại) vẫn xanh — chứng minh cả 2 lớp sửa đều hoạt động
  - [ ] Toàn bộ `npm test` xanh; `npm run lint`/`typecheck` xanh
  - [ ] Không assert/logic kiểm nào bị đổi — diff chỉ gồm mã fixture + `try/finally`

### Thứ tự & phụ thuộc

- Việc A và B độc lập hoàn toàn (không chung file) — dispatch song song, mỗi việc 1
  worktree. Cả hai độc lập với kế hoạch M50 ở trên.
- Không migration nào trong đợt này.

### Sau khi worker xong (coordinator thực hiện)

- [ ] Việc A: đối chiếu diff từng dòng với nội dung cho sẵn (mechanical — sai lệch
      văn bản là lỗi); việc B: kiểm tra báo cáo có bằng chứng tái hiện + 3 lượt chạy
      xanh như tiêu chí
- [ ] `reviewer` soát diff việc B (skill `code-review`) — chú ý: thứ tự DELETE
      con-trước-cha trong `finally` không đổi; không có đường code nào khiến cleanup
      chạy khi seed chưa xong (id undefined)
- [ ] Báo cáo tổng hợp về phiên chính: nhánh + commit từng việc, bằng chứng verify B

### Duyệt cuối (phiên chính thực hiện)

- [ ] Đối chiếu diff với đặc tả; push 2 nhánh + mở 2 PR draft
- [ ] Ghi kết quả đợt quét + đợt vá vào `PROGRESS.md` (mục "Đợt quét vận hành
      2026-07-16") sau khi 2 PR xong
- [ ] Nhắc người dùng 2 việc chỉ họ làm được: (a) kiểm tra branch protection `main`
      có "Include administrators" + chặn push thẳng không — nếu không, cân nhắc trả
      `deploy.yml` về `workflow_run` chờ CI; (b) cấp `SENTRY_DSN` để bật theo dõi lỗi
      production (scaffold M44 đã sẵn, chỉ thiếu secret)

---

## Kế hoạch: M49 PR3 — SSO OIDC bằng `openid-client` (độc lập, không cần PR1/PR2)

### Bối cảnh & mục tiêu

`docs/nang-cap/M49-api-mo-sso.md` (viết lại 2026-07-16, commit #211) đã chốt dùng thư
viện `openid-client` v6 cho SSO thay vì tự viết OIDC thủ công (quyết định đã chốt với
người dùng, không tự đổi). M49 PR1 (API keys)/PR2 (webhooks) **chưa làm** — PR3 độc
lập về code với PR1/PR2 (chỉ đụng luồng đăng nhập, không đụng `lib/ratelimit.ts` theo
cách PR1 định làm) nên tách ra một đợt riêng, không chờ PR1/PR2.

Người dùng đã xác nhận (2026-07-17): **chưa có IdP thật để verify** — cứ dispatch code
+ test tự động trước; PR giữ **draft** cho tới khi có IdP thật để xác minh thủ công
theo tiêu chí chấp nhận, không merge trước bước đó.

**Worker PHẢI đọc mục PR3 của `docs/nang-cap/M49-api-mo-sso.md` trước khi code** —
kế hoạch này chỉ ghi các điểm ĐÍNH CHÍNH so với đặc tả (đặc tả viết trước, giả định số
migration/PR1 đã xong — thực tế chưa) + quyết định đã chốt. Khi kế hoạch và file đặc
tả lệch nhau, **kế hoạch này thắng**.

### Đính chính so với đặc tả M49 PR3

1. **Số migration**: đặc tả ghi `0061` (giả định 0059=PR1, 0060=PR2 đã chiếm) —
   thực tế mới nhất là `migrations/0058_role_permissions.sql` (M50 PR1 vừa merge) và
   PR1/PR2 của M49 chưa tồn tại → dùng **`migrations/0059_sso_audit.sql`**. Xác nhận
   lại bằng `ls migrations/ | sort` lúc code (bài học M32/M33).
2. **Rate-limit callback lỗi**: đặc tả gọi `hitRateLimit()` — helper này thuộc M49
   PR1, chưa tồn tại. KHÔNG kéo theo cả PR1 chỉ để có 1 hàm, KHÔNG sửa
   `lib/ratelimit.ts` (giữ nguyên hành vi login rate-limit hiện có). Viết trực tiếp
   trong `lib/oidc.ts` 2 hàm riêng, tái dùng bảng `login_rate_limits` sẵn có
   (`migrations/0002_login_rate_limit.sql`) với khoá riêng `oidc|<ip>`:
   - `oidcCallbackBlocked(ip): Promise<number>` — số giây phải chờ hoặc 0 (đọc
     `count/reset_at` theo khoá `oidc|<ip>`, ngưỡng 10 lần/15 phút).
   - `recordOidcCallbackFailure(ip): Promise<void>` — upsert atomic same pattern
     `bump()` trong `lib/ratelimit.ts` (`INSERT ... ON CONFLICT` reset theo cửa sổ),
     nhưng viết local trong `lib/oidc.ts`, không export từ `lib/ratelimit.ts`.
   - Chỉ ĐẾM khi callback KẾT THÚC lỗi (gọi ở mọi nhánh lỗi của callback), không đếm
     lần thành công.

### Việc — 1 PR duy nhất

- `route:` `complex` (auth flow tạo user mới + phát session — vùng rủi ro cao theo
  `docs/audit.md`; đặc tả dù đã kín vẫn chọn route đắt hơn theo luật tie-break trong
  `CLAUDE.md`)
- agent: `complex-implementer`
- nhánh/worktree: `claude/feat-m49-pr3-sso-oidc` (base `origin/main` mới nhất — xác
  nhận lại `0059` còn trống lúc code)
- đặc tả nền: mục **PR3** của `docs/nang-cap/M49-api-mo-sso.md` (phần "Nguyên tắc &
  phạm vi" tới hết "Test") + đính chính ở trên. Các quyết định đã CHỐT:

  **1. Dependency**: `npm i openid-client` (v6, API function-based: `discovery`,
  `buildAuthorizationUrl`, `authorizationCodeGrant`, `randomState`/`randomNonce`/
  `randomPKCECodeVerifier`/`calculatePKCECodeChallenge`).

  **2. `lib/env.ts`** — thêm vào `serverSchema` (tất cả optional, đúng pattern
  lazy-validate hiện có, validate lúc DÙNG không lúc build):
  ```
  OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET,
  OIDC_ROLE_CLAIM (optional — tên claim chứa role),
  OIDC_DEFAULT_ROLE (optional — validate thuộc ROLES của lib/roles.ts, mặc định 'viewer')
  ```
  `APP_URL` đã có sẵn (optional) — dùng làm `redirect_uri` =
  `${APP_URL}/api/auth/oidc/callback`. `ssoEnabled()` = đủ cả 4 biến bắt buộc
  (`OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET` + `APP_URL`) → true; KHÔNG suy `redirect_uri`
  từ request origin (sau proxy dễ sai).

  **3. `migrations/0059_sso_audit.sql`**: gắn audit trigger M43 cho bảng `users`
  (copy đúng khối `DO $$` cuối `migrations/0053_approvals.sql`, mảng bảng =
  `ARRAY['users']`). Thêm thuần (CREATE TRIGGER, DROP+CREATE idempotent) → đi thẳng
  production. Chạy `npm run gen:erd` cùng PR.
  - Lưu ý audit: lúc SSO callback tạo/sửa `users`, request context (`lib/request-context.ts`)
    chưa có `userId` (chưa đăng nhập) → `audit_log.actor_id` sẽ là `NULL` cho các
    dòng này — đúng bản chất (hệ thống tự tạo qua IdP), không phải lỗi cần sửa.

  **4. `lib/oidc.ts`** (mới):
  ```ts
  export function ssoEnabled(): boolean;
  // Cache Configuration ở module scope (discovery gọi 1 lần, gọi lại nếu lần trước lỗi
  // — KHÔNG cache vĩnh viễn lỗi).
  export async function getOidcConfig(): Promise<Configuration>;
  // Thuần, test được — KHÔNG chạm DB trong hàm này.
  export function resolveSsoUser(claims: {
    email?: string; name?: string; [k: string]: unknown;
  }): { email: string; name: string; roleFromClaim: Role | null } | { error: string };
  //  - email thiếu/rỗng → { error: "IdP không trả email" }.
  //  - email lowercase + trim.
  //  - OIDC_ROLE_CLAIM đặt: đọc claims[claim] (string hoặc string[] — lấy phần tử đầu
  //    khớp ROLES); giá trị lạ → roleFromClaim = null (caller log.warn, giữ role cũ/default).
  // Chạm DB: tìm user theo email; có → UPDATE role nếu roleFromClaim khác null và khác
  // role hiện tại (KHÔNG hạ cấp admin cuối cùng: nếu user là admin duy nhất còn lại và
  // claim đòi hạ → giữ nguyên + log.warn — chống tự khoá hệ thống, cùng mẫu guard M50
  // PR1 vừa thêm cho manageUsers); chưa có → INSERT (name, email,
  // role = roleFromClaim ?? OIDC_DEFAULT_ROLE ?? 'viewer',
  // password_hash = hashPassword(randomBytes(32).toString('hex'))).
  // password_hash NOT NULL + makeToken() nhúng pwFrag từ hash (lib/auth.ts:60-64) — hash
  // ngẫu nhiên vừa thoả ràng buộc vừa để makeToken hoạt động; không ai biết mật khẩu này
  // nên KHÔNG đăng nhập được bằng form (đúng chủ đích — SSO là đường vào duy nhất cho
  // user loại này, admin đặt lại mật khẩu sau nếu cần fallback).
  export async function upsertSsoUser(resolved: {...}): Promise<User>;
  // Rate-limit callback lỗi riêng (đính chính §2) — không export từ lib/ratelimit.ts.
  export async function oidcCallbackBlocked(ip: string): Promise<number>;
  export async function recordOidcCallbackFailure(ip: string): Promise<void>;
  ```
  User mới chưa gán dự án (`user_projects` trống) — đăng nhập được, thấy trạng thái
  "chưa được gán dự án" như user thường admin tạo mà chưa gán (hành vi sẵn có, không
  code thêm).

  **5. Route mới** (`dynamic = "force-dynamic"` cả 3):
  - `GET /api/auth/oidc/status` (public, như `/api/project`) — `{ enabled: boolean }`.
  - `GET /api/auth/oidc/login`: `!ssoEnabled()` → 404; sinh
    `state/nonce/verifier/challenge`; set cookie tạm `xboss_oidc` = JSON
    `{state, nonce, verifier}` (httpOnly, `sameSite:"lax"`, `secure` theo production,
    `path:"/api/auth/oidc"`, `maxAge:600`); redirect 302 tới
    `buildAuthorizationUrl(config, { redirect_uri, scope:"openid email profile", state,
    nonce, code_challenge: challenge, code_challenge_method:"S256" })`.
  - `GET /api/auth/oidc/callback`: `!ssoEnabled()` → 404. Đọc+XOÁ cookie `xboss_oidc`
    ngay (dùng 1 lần); thiếu → redirect `/login?error=oidc_expired`.
    `oidcCallbackBlocked(clientIp)` (copy hàm `clientIp` từ
    `app/api/auth/login/route.ts:9-13`) → vượt → redirect `/login?error=oidc_rate`.
    `authorizationCodeGrant(config, new URL(req.url), { pkceCodeVerifier: verifier,
    expectedState: state, expectedNonce: nonce })` → throw (state/nonce/chữ ký/aud
    sai, IdP trả lỗi) → `recordOidcCallbackFailure` + `log.warn` + redirect
    `/login?error=oidc_failed` (KHÔNG lộ chi tiết lỗi ra query — chỉ vào log).
    `claims = tokens.claims()` → `resolveSsoUser` → lỗi → `recordOidcCallbackFailure`
    + redirect `/login?error=oidc_noemail`. → `upsertSsoUser` → phát cookie phiên
    `makeToken(user.id, user.password_hash)` đúng flags như
    `app/api/auth/login/route.ts:49-55` (`httpOnly, path:"/", maxAge:COOKIE_MAX_AGE,
    sameSite:"lax", secure` theo production) → redirect 302 về `/` **cố định** —
    KHÔNG nhận `returnTo`/`redirect` từ query (chống open-redirect).

  **6. `app/login/page.tsx`**: fetch `/api/auth/oidc/status` khi mount (giống fetch
  `/api/project` sẵn có ở đầu file); `enabled` → hiện nút "Đăng nhập bằng SSO công ty"
  (thẻ `<a href="/api/auth/oidc/login">`, KHÔNG fetch — cần redirect trình duyệt)
  dưới form, phân cách "hoặc". Đọc `?error=oidc_*` từ URL (`useSearchParams` hoặc đọc
  `window.location.search` trong `useEffect`) → thông điệp tiếng Việt cho 4 mã
  (`expired`/`rate`/`failed`/`noemail`). Form mật khẩu giữ nguyên (fallback khi IdP
  hỏng).

  **7. `docs/api-v1.md` KHÔNG cần** (thuộc PR1) — thay vào đó thêm mục biến môi
  trường `OIDC_*` vào `DEPLOY.md` (tuỳ chọn, pattern giống mục VAPID/Google Sheets
  hiện có trong file).

  **8. Test `tests/oidc.test.ts`** (import `tests/setup.ts` đầu tiên):
  - Unit thuần: `resolveSsoUser` (email thiếu, hoa-thường, role claim đúng/lạ/mảng,
    default role khi không set `OIDC_ROLE_CLAIM`).
  - Integration (`TEST_DATABASE_URL`): `upsertSsoUser` tạo mới thoả NOT NULL +
    đăng nhập lại (gọi lần 2 cùng email) không tạo trùng + update role theo claim +
    **không hạ cấp admin cuối cùng** (seed đúng 1 admin, gọi với claim role khác →
    role giữ nguyên).
  - Route: `ssoEnabled()=false` (không set env) → `status.enabled=false`,
    `login`/`callback` trả 404; `callback` thiếu cookie `xboss_oidc` → redirect
    `error=oidc_expired`.
  - **Không tự động hoá được**: flow HTTP thật với 1 IdP — bù bằng xác minh thủ công
    sau khi có IdP (xem "Duyệt cuối" bên dưới), ghi kết quả vào PR description trước
    khi gỡ draft.
  - Thêm file vào lệnh `npm test` trong `package.json`.

- tiêu chí chấp nhận:
  - [ ] `npm run lint` + `npm run typecheck` + `npm test` + `npm run build` xanh;
        `npm run gen:erd` không lệch
  - [ ] Thiếu bất kỳ biến `OIDC_*`/`APP_URL` bắt buộc → nút SSO ẩn, đăng nhập mật
        khẩu không đổi hành vi (test tự động xác nhận)
  - [ ] `lib/auth.ts` **không sửa** — chỉ gọi `makeToken`/`hashPassword`/`COOKIE_MAX_AGE`
        sẵn có; `lib/ratelimit.ts` **không sửa**
  - [ ] Callback không lộ chi tiết lỗi IdP ra query string (chỉ mã `oidc_*` cố định);
        redirect sau login thành công **không** nhận tham số đích từ client
  - [ ] Admin duy nhất còn lại không thể bị hạ role qua claim (test integration xác nhận)
  - [ ] `tests/oidc.test.ts` nằm trong `npm test`

### Sau khi worker xong (coordinator thực hiện)

- [ ] Đối chiếu diff với tiêu chí chấp nhận (chạy lại lint/typecheck/test/build)
- [ ] `reviewer` soát diff (skill `code-review`) — chú ý: (1) cookie `xboss_oidc`
      httpOnly + xoá ngay khi đọc (dùng 1 lần); (2) `state`/`nonce`/PKCE truyền đúng
      chiều vào `authorizationCodeGrant`; (3) không có nhánh nào redirect theo tham
      số client (open-redirect); (4) `oidcCallbackBlocked`/`recordOidcCallbackFailure`
      không đổi hành vi rate-limit login hiện có (file khác, bảng chung nhưng khoá
      khác `login|`/`ip|`); (5) `password_hash` ngẫu nhiên đủ entropy
      (`randomBytes(32)`, không phải chuỗi cố định)
- [ ] Báo cáo về phiên chính: nhánh + commit, kết quả reviewer, quyết định worker tự
      đưa trong ranh giới (nếu có)

### Duyệt cuối (phiên chính thực hiện)

- [ ] Đối chiếu diff với đặc tả + báo cáo coordinator
- [ ] Push nhánh + mở **PR draft** (giữ draft — KHÔNG merge cho tới khi xác minh
      thủ công với 1 IdP thật theo tiêu chí chấp nhận, đúng quyết định người dùng
      2026-07-17)
- [ ] Cập nhật `PROGRESS.md` (mục M49 PR3) ghi rõ trạng thái "chờ xác minh IdP thật
      trước khi merge"
- [ ] Nhắc người dùng: khi có IdP thật (Google Workspace/Microsoft Entra), cấu hình
      `OIDC_*`/`APP_URL` ở môi trường test, chạy thử đăng nhập SSO thật, rồi báo lại
      để gỡ draft và merge
