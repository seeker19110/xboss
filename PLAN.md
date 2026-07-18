# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.

---

## Kế hoạch: M56 PR2 — Chính sách bắt buộc 2FA theo vai trò

### Bối cảnh & mục tiêu

Người dùng chọn chạy **M56 PR2** tiếp theo (bỏ qua M53/M57 đang chờ ở vị trí đầu hàng
đợi — `docs/nang-cap/README.md`). M56 PR1 (TOTP nền, PR #237) đã merge vào `main`: user
tự bật/tắt 2FA ở `/account`, login 2 bước khi đã bật. PR2 đóng nốt phần "bắt buộc theo
vai trò" (`docs/nang-cap/M56-2fa-totp.md` mục PR2) — hiện tại **không ai bị bắt buộc**,
2FA hoàn toàn tự nguyện.

Đặc tả gốc (dòng 48-51 file trên) chỉ ghi 2 câu ngắn, thiếu điểm chạm code cụ thể —
**phần dưới đây là đặc tả đầy đủ do phiên chính bổ sung sau khi đọc code thật**
(`lib/auth.ts`, `proxy.ts`, `lib/totp.ts`, `app/lib/me.ts`, `migrations/0060_code_lists.sql`,
tất cả 4 call site `makeToken(...)`) — **đặc tả trong file này thắng** nếu lệch với
`M56-2fa-totp.md` (file gốc viết trước, chưa đối chiếu code).

### Quyết định kiến trúc đã chốt (không phải việc worker tự quyết)

Yêu cầu cứng của PR2: "role bắt buộc mà chưa bật → 403 mọi API trừ whitelist
setup/logout" — tức là **chặn ở tầng API, không chỉ UI**, và phải chặn được **mọi** trong
số ~107 route hiện có mà **không sửa từng route** (bất khả thi trong 1 PR, và trái
nguyên tắc "diff nhỏ"). Sau khi đọc code, chọn cơ chế sau:

1. **Nhúng cờ `must2fa` (0/1) ngay trong token phiên đã ký** (`lib/auth.ts::makeToken`),
   tính **tại thời điểm phát hành token** (login xong bước cuối) từ:
   `mustSetup2fa = requiredRoles.has(user.role) && !user.totp_enabled_at`.
   - `requiredRoles` đọc từ `code_lists` domain **`require_2fa_roles`** (bảng có sẵn từ
     M52 PR1, `migrations/0060_code_lists.sql` — **không cần migration mới**): mỗi vai
     trò là 1 dòng `code=<role>`, `active=true` nghĩa là vai trò đó bị bắt buộc. Domain
     rỗng (mặc định, chưa admin nào thêm dòng) → không ai bị bắt buộc, **hành vi y hệt
     trước PR2**. Dùng `getList("require_2fa_roles", { includeInactive: false })`
     (`lib/code-lists.ts`, cache sẵn theo watermark — không cần cache mới).
   - Payload token đổi từ `${userId}.${exp}.${pwFrag}.${sig}` (hiện tại, xem
     `lib/auth.ts:64-69`) thành `${userId}.${exp}.${pwFrag}.${flag}.${sig}` (`flag` là
     `"0"`/`"1"`, nằm TRONG phần được ký nên không thể giả mạo bằng cách sửa cookie tay).
     Đổi chữ ký `makeToken(userId, passwordHash, mustSetup2fa: boolean)` — **bắt buộc
     tham số thứ 3, không optional**, để không quên truyền ở bất kỳ call site nào.
   - **4 call site hiện tại phải sửa cả 4** (đã grep xác nhận đủ, không có chỗ nào khác):
     `app/api/auth/login/route.ts:69` (luồng không có 2FA — tính `mustSetup2fa` ngay tại
     đây), `app/api/auth/login/2fa/route.ts:80` (sau khi verify TOTP/recovery đúng —
     lúc này `totp_enabled_at` chắc chắn có giá trị nên `mustSetup2fa` luôn `false`, viết
     rõ trong code thay vì gọi lại `requiredRoles`), `app/api/auth/password/route.ts:30`
     (đổi mật khẩu — giữ nguyên trạng thái `mustSetup2fa` của phiên đang có, đọc lại từ
     user hiện tại), `app/api/auth/oidc/callback/route.ts:93` (SSO — **luôn `false`**,
     ghi rõ comment: 2FA theo vai trò chỉ áp cho tài khoản mật khẩu, SSO đã đẩy MFA về
     IdP, đúng phạm vi "Không làm" của `M56-2fa-totp.md` dòng 3).
   - `parseToken` (`lib/auth.ts:70-84`) trả thêm `mustSetup2fa: boolean` từ phần `flag`.
   - `app/api/auth/totp/confirm/route.ts` (PR1, xác nhận bật 2FA thành công): sau khi set
     `totp_enabled_at`, **phát lại cookie ngay** (`res.cookies.set(COOKIE, makeToken(...,
false), ...)`) để user được mở khoá tức thì, không phải đăng xuất/đăng nhập lại —
     đọc kỹ route hiện tại trước khi thêm dòng này (không đổi response body hiện có).
   - **Chấp nhận rõ**: admin bật yêu cầu 2FA cho 1 role SAU KHI user đã có phiên đăng
     nhập → phiên đó chỉ bị khoá ở **lần đăng nhập tiếp theo** (đúng nghĩa đen đặc tả
     "sau login bị chặn"), không hồi tố phiên đang mở. Ghi chú này vào comment code, đủ
     rõ để không bị coi là bug.

2. **Chặn ở middleware (`proxy.ts`), một điểm chạm duy nhất cho toàn bộ `/api/*`**
   (matcher đã có sẵn, xem file hiện tại) — không sửa route nào trong 107 route hiện có.
   - `proxy.ts` hiện chạy Edge Runtime (không import được `lib/db`/`node:crypto` qua
     `next/headers`). **Việc đầu tiên của worker**: kiểm tra bằng cách thử
     `export const runtime = "nodejs"` trong `proxy.ts` (Next.js Node Middleware — kiểm
     tra ổn định ở Next 16.2 đang dùng, xem CHANGELOG/release notes nếu cần thêm cờ
     `experimental.nodeMiddleware` trong `next.config.ts`). Nếu chạy được: middleware có
     thể gọi thẳng `parseToken`/hàm ký (thuần `node:crypto`, không đụng `next/headers` —
     xác nhận `lib/auth.ts` các hàm `sign`/`parseToken`/`makeToken` không import gì từ
     `next/headers`, chỉ dùng ở `getCurrentUser()` — có thể tách nếu cần để import an
     toàn vào `proxy.ts`) để verify chữ ký + đọc `mustSetup2fa` trực tiếp từ cookie
     `req.cookies.get(COOKIE)?.value`, KHÔNG cần query DB trong middleware.
   - Nếu Node Middleware không khả dụng trong bản Next hiện tại (kiểm tra thật, không
     đoán): **phương án dự phòng được phép** (ranh giới quyết định của route `complex`)
     — giữ Edge Runtime, forward thêm header `x-pathname` (giống cách `x-request-id`
     đang forward, xem `proxy.ts` hiện tại) để route handler biết path hiện tại, và làm
     phần verify/chặn ngay trong `getCurrentUser()` (`lib/auth.ts`) thay vì middleware —
     chấp nhận khi đó **status trả về là 401 (không phải 403)** cho các route ngoài
     whitelist (vì phải tái dùng đúng nhánh `if (!user) return 401` sẵn có ở mọi route,
     không sửa từng route) — nêu rõ trong báo cáo nếu phải dùng phương án này, phiên
     chính sẽ quyết định có chấp nhận lệch đặc tả (403→401) hay không lúc duyệt cuối.
   - **Whitelist path được đi qua dù `mustSetup2fa=true`** (áp dụng bất kể phương án nào
     ở trên): `GET/POST /api/auth/*` (toàn bộ nhóm — gồm `login`, `login/2fa`, `logout`,
     `me`, `totp/setup`, `totp/confirm`, và endpoint `DELETE /api/auth/totp` để user có
     đường tắt/đổi ý — đọc kỹ, KHÔNG whitelist rộng hơn nhóm `/api/auth/*`). Mọi path
     khác (kể cả `/api/users/:id` PATCH mà admin dùng để tắt hộ 2FA — admin không bị khoá
     trừ khi chính admin đó cũng thuộc role bắt buộc và chưa bật, trường hợp hiếm, chấp
     nhận) → 403 (hoặc 401 theo phương án dự phòng) kèm JSON
     `{ error: "Cần bật xác thực 2 lớp trước khi tiếp tục", code: "2fa_required" }`.

3. **Client**: `app/lib/me.ts::fetchMe()` (điểm chạm DUY NHẤT — mọi trang gọi hàm này để
   lấy user hiện tại, xem file hiện tại dòng 9-22) — khi response có `code === "2fa_required"`
   (đọc từ body JSON thay vì chỉ status), gọi hàm mới `redirectTo2faSetup()` (viết cạnh
   `redirectToLogin()` trong cùng file, KHÔNG xoá cache offline/service worker như
   `redirectToLogin` vì đây vẫn là phiên hợp lệ) thay vì `redirectToLogin()` — điều
   hướng `window.location.href = "/account?require2fa=1"`.
   - `app/account/page.tsx` (đọc file hiện tại trước khi sửa): khi query
     `require2fa=1`, hiện banner cố định phía trên "Bạn cần bật xác thực 2 lớp để tiếp
     tục sử dụng hệ thống" + **ẩn toàn bộ phần khác của trang, chỉ để lại khối "Xác thực
     2 lớp" (PR1 đã có) và nút "Đăng xuất"** (đúng đặc tả "chỉ cho vào /account phần
     setup + logout"). Sau khi `confirm` thành công (PR1 flow đã có), tự bỏ banner + cho
     xem lại toàn trang (không cần reload — state cục bộ).

### Việc

#### 1. M56 PR2 — Bắt buộc 2FA theo vai trò

- route: `complex` — chạm `lib/auth.ts` (vùng rủi ro cao theo `docs/audit.md`) +
  `proxy.ts` (đường chạy MỌI request API) + quyết định kiến trúc Node Middleware vs
  fallback Edge; ranh giới được quyết: chọn được phương án middleware nào trong 2 phương
  án đã nêu ở trên (phải thử Node Middleware trước, chỉ rơi về fallback nếu xác nhận
  không chạy được — không được bỏ qua bước thử vì "sợ rủi ro"), tên biến/hàm nội bộ,
  cách viết whitelist (mảng/regex, miễn đúng phạm vi `/api/auth/*`). **Không được tự
  quyết**: domain `code_lists` phải là `require_2fa_roles`; whitelist không được rộng
  hơn `/api/auth/*`; SSO (`oidc/callback`) luôn `mustSetup2fa=false`; JSON code lỗi phải
  đúng `"2fa_required"` (client cứng chuỗi này).
- nhánh: `claude/feat-m56-pr2-bat-buoc-2fa`
- đọc trước: `docs/nang-cap/M56-2fa-totp.md` mục PR2 + toàn bộ mục "Quyết định kiến trúc
  đã chốt" ở trên (đầy đủ hơn, thắng nếu lệch) + `lib/auth.ts`/`proxy.ts`/`lib/totp.ts`/
  `app/lib/me.ts`/`app/account/page.tsx`/`lib/code-lists.ts` hiện tại (đọc thật, không
  đoán theo mô tả trong kế hoạch này — kế hoạch có thể lệch vài dòng so với code tại
  thời điểm code do đã có commit mới).
- việc:
  - `lib/code-lists.ts`/admin UI `app/admin/code-lists/page.tsx`: thêm domain
    `require_2fa_roles` vào mảng `DOMAINS` hiện có (dòng ~14-21) với nhãn "Bắt buộc 2FA
    theo vai trò" — **không cần migration, không cần seed** (domain rỗng là trạng thái
    hợp lệ = không ai bị bắt buộc). Cân nhắc: `code` của mỗi dòng trong domain này nên
    là giá trị `Role` (`admin`/`pm`/.../`viewer`, xem `lib/roles.ts::ROLES`) — modal
    "Thêm mã" hiện có (component chung) cho nhập `code`/`label` tự do; nếu cần ràng buộc
    `code` chỉ được là 1 trong 7 role hợp lệ, thêm validate nhỏ ở API
    `POST /api/admin/code-lists` khi `domain === "require_2fa_roles"` (đọc route đó
    trước khi sửa, không đổi hành vi domain khác).
  - `lib/auth.ts`: đổi `makeToken`/`parseToken` như mục 1 ở trên; hàm mới
    `requiredRoles(): Promise<Set<Role>>` (đọc `code_lists`) + `computeMustSetup2fa(role,
totpEnabledAt): boolean` (thuần, test được riêng).
  - 4 call site `makeToken` (liệt kê đủ ở trên) — sửa cả 4.
  - `app/api/auth/totp/confirm/route.ts`: phát lại cookie `mustSetup2fa=false` sau khi
    bật 2FA thành công.
  - `proxy.ts` + (nếu cần) `next.config.ts`: cơ chế chặn theo mục 2 ở trên — thử Node
    Middleware trước, ghi rõ trong báo cáo nếu phải rơi về fallback + lý do (log lỗi cụ
    thể gặp phải).
  - `app/lib/me.ts`: `redirectTo2faSetup()` mới + nhánh gọi nó trong `fetchMe()`.
  - `app/account/page.tsx`: banner + ẩn nội dung khi `require2fa=1`, đọc file hiện tại
    để giữ đúng cấu trúc PR1 (khối "Xác thực 2 lớp" đã có).
- test:
  - `tests/totp.test.ts` (mở rộng file PR1 có sẵn, không tạo file mới) hoặc file mới
    `tests/require-2fa.test.ts` (worker tự quyết, ưu tiên gộp vào file cũ nếu không phá
    vỡ cấu trúc test hiện có): `computeMustSetup2fa` đủ biên (role có/không trong danh
    sách × đã/chưa bật 2FA); integration — login route thật với 1 role bị bắt buộc +
    chưa bật 2FA → cookie phiên có `mustSetup2fa=1`, gọi 1 API ngoài whitelist (vd
    `/api/tasks`) → 403 (hoặc 401 nếu rơi fallback) đúng `code: "2fa_required"`; gọi
    `/api/auth/me`/`/api/auth/logout`/`/api/auth/totp/*` → KHÔNG bị chặn; role không
    trong danh sách bắt buộc → không ảnh hưởng gì (tất cả API cũ vẫn chạy như trước
    PR2); sau `totp/confirm` thành công → gọi lại API ngoài whitelist thành công ngay
    (không cần đăng nhập lại); SSO login (`oidc/callback`) → không bao giờ bị khoá dù
    role thuộc danh sách bắt buộc.
  - **Bất biến tương thích quan trọng nhất**: domain `require_2fa_roles` rỗng (trạng
    thái mặc định, DB hiện tại chưa ai thêm dòng) → toàn bộ test cũ (auth, mọi route
    khác) xanh không sửa, không có API nào bị 403 mới xuất hiện.
  - Verify thật (không chỉ tin test): dựng `npm run dev` + Postgres thật, thêm 1 dòng
    `require_2fa_roles` cho role `engineer` qua UI admin, đăng xuất/đăng nhập lại bằng
    tài khoản `engineer` demo chưa bật 2FA → xác nhận bị chặn đúng ở API + `/account`
    hiện banner + trang khác không dùng được; bật 2FA xong → dùng lại bình thường ngay.
- tiêu chí chấp nhận:
  - Domain rỗng → hành vi y hệt trước PR2 (test cũ + verify tay).
  - Role bắt buộc + chưa bật 2FA → mọi API ngoài `/api/auth/*` bị chặn (403 hoặc 401,
    ghi rõ trong báo cáo phương án nào được dùng); `/api/auth/*` không bị chặn.
  - SSO không bao giờ bị khoá bởi cơ chế này.
  - `npm run lint`/`npm run typecheck`/`npm run build` xanh; test liên quan xanh; không
    có test cũ nào đỏ do đổi `makeToken`/`parseToken`.

---

### Thứ tự & phụ thuộc

Chỉ 1 việc, không phụ thuộc gì khác — dispatch ngay sau khi đồng bộ `origin/main`
(`git fetch origin` — kiểm tra không có PR M53/M57/M52 nào mới merge sau lần quét gần
nhất trước khi tạo nhánh).

### Sau khi worker xong (coordinator thực hiện)

- Đối chiếu kết quả với tiêu chí chấp nhận; chạy lại `npm run lint`/`npm run typecheck`/
  test liên quan độc lập với báo cáo worker.
- Gọi `reviewer` soát diff — **đặc biệt chú ý**: (1) `lib/auth.ts`/`proxy.ts` là vùng rủi
  ro cao (`docs/audit.md`) — xác nhận `flag` trong token thực sự nằm trong phần được ký
  (không thể giả mạo bằng cách sửa cookie tay, tự thử 1 lần: đổi thủ công 1 ký tự `flag`
  trong cookie base64/hex rồi gọi API xem có bị từ chối chữ ký không); (2) whitelist
  không bị worker mở rộng quá `/api/auth/*`; (3) SSO thực sự luôn `mustSetup2fa=false`;
  (4) nếu worker dùng phương án Node Middleware — xác nhận không phá vỡ `x-request-id`/
  traffic ingest hiện có trong `proxy.ts` (đọc file gốc, diff phải giữ nguyên phần đó).
- Nếu worker báo phải dùng phương án dự phòng (401 thay 403) — ghi rõ trong báo cáo tổng
  hợp để phiên chính quyết định lúc duyệt cuối, KHÔNG tự ý coi là đạt tiêu chí.
- Báo cáo tổng hợp về phiên chính: trạng thái, nhánh + commit, kết quả reviewer, quyết
  định worker tự đưa ra (phương án middleware nào, cấu trúc whitelist), và điểm vướng.

### Duyệt cuối (phiên chính thực hiện)

- [ ] Đối chiếu diff với đặc tả trong file này + `docs/nang-cap/M56-2fa-totp.md` mục PR2
- [ ] Xác nhận domain `require_2fa_roles` rỗng → không đổi hành vi gì (tự kiểm 1 API bất
      kỳ với tài khoản demo hiện có)
- [ ] Tự thao tác thử luồng thật: bật bắt buộc cho 1 role → đăng nhập role đó (chưa bật
      2FA) → bị chặn đúng chỗ → bật 2FA xong → dùng lại bình thường
- [ ] Nếu worker dùng phương án dự phòng (401 thay 403) — quyết định chấp nhận hay yêu
      cầu làm lại bằng Node Middleware
- [ ] Cập nhật `PROGRESS.md` (thêm mục M56 PR2 xong) + `docs/nang-cap/README.md` (đánh
      dấu M56 hoàn tất cả 2 PR, việc kế tiếp theo hàng đợi là M53‖M57 PR1 hoặc M61 tuỳ
      người dùng chọn)
- [ ] Push nhánh + mở PR draft theo template
