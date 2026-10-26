# M138 — Củng cố ranh giới proxy và tính nhất quán của cookie

| Thuộc tính       | Giá trị                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| Issue / Goal     | TD-001, TD-004 trong `PROGRESS.md`; yêu cầu “pull và hoàn thiện” ngày 26/10/2026       |
| Spec owner       | Codex — soạn nghiên cứu và đề xuất; chủ repo quyết định phạm vi và topology            |
| State            | **In review**                                                                          |
| Người/ngày duyệt | **Chưa duyệt / Chưa duyệt**                                                            |
| Cập nhật         | 2026-10-26                                                                             |
| Mức rủi ro       | L — ranh giới xác thực, khoá rate-limit và cookie; tách khỏi thay đổi nghiệp vụ/e-sign |

> Chưa được triển khai. Cần **Approved for implementation**, người duyệt, ngày duyệt và đóng
> quyết định topology ở §18. Bản này là đề xuất để review, không cấp quyền sửa VPS hoặc production.

## 1. Problem, vai trò và bằng chứng

Admin cần giới hạn thử đăng nhập hoạt động theo đúng nguồn request; mọi vai trò cần đăng nhập,
2FA, SSO và đăng xuất ổn định. Hiện bốn nơi tự lấy phần tử đầu của `X-Forwarded-For` (XFF),
fallback `X-Real-IP`: `app/api/auth/login/route.ts:25`, `app/api/auth/login/2fa/route.ts:28`,
`app/api/auth/oidc/callback/route.ts:21`, `lib/bao-mat/api-keys.ts:36`. Nếu nguồn header chưa được
proxy chuẩn hoá và app nhận truy cập trực tiếp, client có thể tự chọn khoá rate-limit.

`ecosystem.config.js:92` và `package.json` đang bind `0.0.0.0`; `DEPLOY.md:166` hướng dẫn truy cập
trực tiếp cổng app, HTTPS là tuỳ chọn ở `DEPLOY.md:322`. Đây là bằng chứng cấu hình trong repo,
chưa chứng minh cổng production đang public hoặc nginx đang tin header giả.

Cookie phiên hiện dùng `isSecureCookie(req)`; cookie tạm OIDC dùng Secure khi production
(`app/api/auth/oidc/login/route.ts:38`), đúng đặc tả M49 §“2 route mới”. Logout hết hạn cookie
bằng `maxAge:0` (`app/api/auth/logout/route.ts:8`), chưa ghi rõ `sameSite`/`secure`. Sự khác nhau
này cần contract rõ; không đủ bằng chứng để kết luận logout đang bị khai thác hoặc phải nới
cookie SSO cho HTTP production.

Baseline nghiên cứu: main `0f5cef55`, ngày truy cập 26/10/2026; chưa đo production, chưa đổi code.

## 2. Outcome, metric và guardrail

- Bốn điểm rate-limit dùng cùng một hàm nhận dạng IP, một contract và một bộ ca biên.
- Qua proxy staging đúng contract, thay XFF/X-Real-IP đầu vào không đổi IP được app sử dụng;
  truy cập trực tiếp app từ mạng ngoài không thành công. Cả hai là điều kiện để đóng TD-001.
- Cookie phát/xoá có bảng thuộc tính rõ; đăng xuất thật khiến `/api/auth/me` trả 401 ở lần gọi kế.
- Giữ nguyên ngưỡng, TTL, thời điểm tăng/xoá bộ đếm; 2FA theo tài khoản vẫn hoạt động xuyên IP.
- Giữ policy CSRF, token HMAC, role, org/project scope, SSO MFA, status/body/redirect hiện tại.
- Không migration, dependency, provider trả phí, secret hoặc PII log mới. Hàm IP thuần không I/O.
- Dừng rollout khi sai nhận dạng IP, giả header vượt giới hạn, cookie HTTPS thiếu Secure hoặc
  logout không xoá cookie; một lỗi bảo mật là no-go, không điều chỉnh test để cho qua.

## 3. Nghiên cứu hiện trạng

| Vùng    | Hiện trạng và giới hạn bằng chứng                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login   | `lib/bao-mat/ratelimit.ts`: Postgres, 5 lần sai/15 phút theo IP+email, 20/IP. Không đổi SQL/upsert.                                                  |
| 2FA     | `login/2fa/route.ts`: trần IP 10/15 phút và tài khoản 20/15 phút. Trần tài khoản không dựa header.                                                   |
| OIDC    | Callback dùng IP cho trần lỗi; state/nonce/PKCE, redirect cố định và xoá cookie tạm đã có.                                                           |
| API key | `lib/bao-mat/api-keys.ts`: khoá sai/thiếu/thu hồi giới hạn 30 lần/15 phút/IP; không đổi scope/expiry.                                                |
| CSRF    | `lib/bao-mat/csrf.ts`: thiếu Origin được cho qua có chủ đích; `isStrictSameOrigin` riêng cho route cần chặt. `tests/csrf.test.ts` bảo vệ hành vi cũ. |
| Cookie  | `lib/bao-mat/auth.ts:187`: session Secure khi production và request HTTPS; development không Secure. Không sửa helper này trong M138.                |
| Hạ tầng | Topology thật, firewall, CDN/load balancer, real-ip module và nguồn proto/host chưa được xác minh.                                                   |
| E-sign  | `engineering/esign/sign/route.ts:34` lưu nguyên XFF, khác bốn nơi trên. Tách slice miền sau; không sửa audit IP trong M138.                          |
| Dữ liệu | Không đổi auth/RLS/permissions, bảng, audit trail, tiền, tiến độ, nghiệm thu, SSE/PWA, export/report.                                                |

Nguồn kỹ thuật chính thức, truy cập 26/10/2026:

- [NextRequest](https://nextjs.org/docs/app/api-reference/functions/next-request) ghi nhận bỏ `ip`
  từ v15. [Mã nguồn Next 16.4.2](https://github.com/vercel/next.js/blob/v16.4.2/packages/next/src/server/web/spec-extension/request.ts)
  thể hiện lớp mở rộng Web Request; không cung cấp socket peer qua public API này. **Suy luận
  thiết kế:** CIDR allowlist chạy trong route trên một header khác vẫn không xác thực được
  kết nối proxy. Đưa logic vào `proxy.ts` cũng không tự tạo nguồn socket tin cậy.
- [nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)
  cho phép ghi đè header; `$proxy_add_x_forwarded_for` nối XFF đầu vào với địa chỉ remote.
  Vì vậy lấy phần tử đầu trong chuỗi do cơ chế nối này tạo không đủ xác thực nguồn client.
- [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
  mô tả `Max-Age=0` hết hạn ngay và Secure gắn với HTTPS. Cần kiểm cookie trong browser thật,
  không chỉ nhìn object response trong unit test.

## 4. Phương án

| Phương án                                           | Lợi ích                                                   | Chi phí/rủi ro                                                 | Kết luận                                                |
| --------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Không làm                                           | Không đổi vận hành                                        | Giữ header parsing phân tán; trust boundary chưa rõ            | Chưa đóng TD-001; có thể giữ checkpoint nghiên cứu      |
| A: gom helper, vẫn lấy XFF đầu tiên                 | Diff nhỏ, giảm lặp                                        | Không chống spoof nếu app trực tiếp hoặc proxy nối header      | Không chọn làm biện pháp bảo mật                        |
| B: edge ghi đè + chặn app trực tiếp + helper một IP | Trust boundary có thể kiểm chứng; không cần custom server | Phụ thuộc topology, vận hành và staging; phải được duyệt trước | **Đề xuất chọn**, chờ quyết định D1                     |
| C: custom Node server đọc socket peer rồi xét CIDR  | Biết kết nối transport ở tầng sớm                         | Đổi đường chạy app/PM2, nhiều rủi ro hơn mục tiêu hiện tại     | Ngoài phạm vi; spec kiến trúc riêng nếu B không khả thi |

## 5. Scope / non-goals

Phạm vi đề xuất: contract proxy; helper IP dùng chung cho login, 2FA, OIDC callback, API key;
khai báo nhất quán thuộc tính cookie xoá ở logout/callback; test và hướng dẫn vận hành tương ứng.

Không thay CSRF (kể cả request thiếu Origin), policy HTTP/HTTPS hiện tại, token/role/scope,
ngưỡng rate-limit, logic user/account-disabled, giao diện hoặc payload nghiệp vụ. Không thêm
CIDR hoặc secret “đánh dấu proxy” do client tự gửi. Không tự cấu hình firewall/PM2/nginx thật.

E-sign và mọi audit IP nghiệp vụ nằm ngoài danh sách sửa; muốn dùng helper phải có slice/spec
miền, kiểm retention/semantics và audit riêng. CSP nonce/HSTS không gộp vào M138.

`X-XSS-Protection` được đặt `0` trong lát S độc lập theo [OWASP](https://secure-headers-project.owasp.org/response-headers/#x-xss-protection):
tắt XSS Auditor deprecated, giữ CSP và các header khác,
kiểm response production build; không được dùng việc này để tuyên bố TD-002 đã đóng toàn bộ.

## 6. User journeys và mọi trạng thái

1. Mọi vai trò mở login trên desktop/mobile; tải/chờ mạng/lỗi/sai mật khẩu/thử lại giữ như cũ.
2. Sai liên tiếp qua proxy chạm 429 cùng Retry-After; gửi XFF giả không tạo ngân sách thử mới.
3. Tài khoản 2FA đi qua pending token rồi xác minh; đổi IP không né trần tài khoản.
4. SSO production qua HTTPS: cookie tạm → IdP → callback → cookie phiên → xoá cookie tạm.
   SSO tắt vẫn 404; discovery/token sai vẫn redirect mã lỗi cố định, không lộ dữ liệu IdP.
5. Đăng xuất hết hạn đúng cookie; request lặp lại vẫn `{ok:true}`. Lần `/api/auth/me` kế không có
   cookie trả 401. Cookie xoá không được biến thành cookie phiên rỗng còn sống.
6. Offline giữ trải nghiệm hiện tại, không xếp login/logout vào hàng đợi nghiệp vụ. Khi mất
   response logout, client giữ xử lý lỗi hiện có; retry hết hạn cookie an toàn.
7. Request không được phép vẫn đúng 401/403; không cho phép quyền khác dựa IP. Không thêm UI,
   không đổi focus/keyboard/loading/empty state hoặc mobile touch target.

## 7. Functional và non-functional requirements

**FR-01 — Contract bắt buộc ở edge.** Trước khi app được gọi từ mạng ngoài, proxy cuối cùng
trước app phải ghi đè XFF và X-Real-IP thành **một địa chỉ client giống nhau**; giá trị nguồn
được suy từ transport hoặc upstream đã được xác thực bởi cấu hình topology được owner duyệt.
Không dùng chuỗi XFF đầu vào không kiểm chứng. Đồng thời ghi đè X-Forwarded-Proto/Host bằng
nguồn cấu hình đúng để không tin các header client gửi cho cookie/redirect/origin hiện hữu.

App chỉ nhận kết nối từ proxy/health-check nội bộ được phép: bind loopback/private + firewall
hoặc đường tương đương có bằng chứng cả IPv4/IPv6. Không chỉ đặt header rồi để cổng app public.
Với CDN/LB phía trước nginx, cần D1 xác định tầng nào lấy transport IP và trusted upstream nào;
không mặc định `$remote_addr` là IP người dùng khi nó thực chất là IP CDN.

**FR-02 — Helper thống nhất.** Đề xuất `lib/bao-mat/client-ip.ts`, export
`clientIp(req: {headers: {get(name: string): string | null}}): string`, chạy server Node.
Theo contract B: đọc hai header, trim ngoài, kiểm mỗi giá trị là đúng một IPv4/IPv6; không nhận
list dấu phẩy, hostname, port, bracket, zone ID, giá trị rỗng hoặc chuỗi quá 64 ký tự. Dùng
`node:net.isIP`; không thêm dependency. Chuẩn hoá IPv6 theo biểu diễn hostname WHATWG URL
(bỏ bracket, chữ thường); IPv4-mapped IPv6 quy về IPv4 tương ứng. So sánh sau chuẩn hoá.
Hai header hợp lệ và cùng IP → trả IP chuẩn; thiếu/sai/khác nhau → **`unknown`**.

`unknown` dùng chung các bộ đếm đang có, không rút thăm khoá/ngẫu nhiên, không fallback về
header thứ ba, không throw 500. Đây là phương án phòng thủ khi contract hỏng, có nguy cơ giới
hạn nhầm nhiều người. Không coi nó là hỗ trợ an toàn cho app public trực tiếp: attacker có thể
gửi hai header giống nhau. Mock trực tiếp route không chứng minh chống giả mạo transport.

**FR-03 — Điểm gọi.** Thay đúng bốn bản copy đã liệt kê ở §1 bằng helper; không đổi cách ghép
khoá `totp|`, `totp-acct|`, OIDC hoặc thời điểm gọi bộ đếm, không sửa SQL và account/org flow.
Test cũ dùng IP giả không hợp lệ phải đổi fixture thành IP tài liệu hợp lệ; không bỏ test.

**FR-04 — Bảng cookie giữ policy hiện tại.**

| Cookie/thao tác                                      | HttpOnly | SameSite | Secure                             | Path             | TTL/giá trị                                      |
| ---------------------------------------------------- | -------- | -------- | ---------------------------------- | ---------------- | ------------------------------------------------ |
| Session phát ở login/2FA/password/TOTP/OIDC callback | true     | lax      | `isSecureCookie(req)` hiện tại     | `/`              | Giữ `COOKIE_MAX_AGE`, token và nội dung hiện tại |
| OIDC tạm phát ở login                                | true     | lax      | `NODE_ENV === production` hiện tại | `/api/auth/oidc` | 600 giây; state/nonce/verifier hiện tại          |
| Session xoá ở logout                                 | true     | lax      | `isSecureCookie(req)` hiện tại     | `/`              | Giá trị rỗng, `maxAge:0`                         |
| OIDC tạm xoá ở mọi nhánh callback                    | true     | lax      | `NODE_ENV === production` hiện tại | `/api/auth/oidc` | Giá trị rỗng, `maxAge:0`                         |

Không thêm Domain. Xoá cookie dùng cùng name/path/host như lúc phát. Không thay flags phát
session hoặc giảm Secure của OIDC production để hỗ trợ HTTP. SSO production HTTP tiếp tục
không được công nhận là flow hỗ trợ; muốn thay phải có quyết định bảo mật riêng. Callback xoá
cookie ở nhánh thành công và lỗi; không sửa TTL hoặc state/nonce/PKCE.

**NFR-01:** Helper không DB, DNS, mạng, cache hoặc state toàn cục; input có giới hạn; không tăng
request phụ. **NFR-02:** Không log IP/email/cookie/token/OTP/header raw mới. **NFR-03:** Không đổi
org/project isolation và audit trail. **NFR-04:** Backward compatibility giữ mọi API shape/status
và flow; thay đổi khoá IP chỉ kích hoạt sau contract edge. Không hạ cổng kiểm chứng hiện có.

## 8. Acceptance criteria

| AC    | Given / When / Then                                                                                                                         | Bằng chứng bắt buộc                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| AC-01 | Cho IP IPv4/IPv6 hợp lệ giống nhau ở hai header; gọi helper; nhận đúng IP chuẩn, IPv6 tương đương chung một khoá.                           | Unit table IPv4, IPv6 rút gọn/đầy đủ/chữ hoa và mapped IPv4                                       |
| AC-02 | Cho missing/blank/list/port/bracket/zone/hostname/quá dài/header khác nhau; gọi helper; chỉ nhận `unknown`, không throw.                    | Unit và ca malicious/duplicate header                                                             |
| AC-03 | Cho browser test sau edge staging và XFF/X-Real-IP giả khác nhau; gửi cùng nguồn transport; khoá/bộ đếm giống nhau, đạt 429 đúng ngưỡng cũ. | Integration qua proxy thật + Postgres disposable; control nguồn transport thứ hai có budget riêng |
| AC-04 | Cho host staging; gọi thẳng app từ mạng ngoài qua IPv4/IPv6; không kết nối được; health-check qua đường nội bộ vẫn đạt.                     | Operator ghi topology, cấu hình đã che giá trị nhạy cảm và kết quả kiểm ngoài host                |
| AC-05 | Cho login/2FA/OIDC/API-key fixtures; chạy suite cũ; không đổi threshold, TTL, success/reset và trần 2FA tài khoản.                          | Regression DB theo route, có concurrency đang được suite bảo vệ                                   |
| AC-06 | Cho production HTTPS và development HTTP; phát rồi logout; cookie flags theo §7, cookie biến mất, `/me` là 401.                             | Browser desktop/mobile + kiểm Set-Cookie; logout lặp vẫn 200                                      |
| AC-07 | Cho IdP giả cục bộ miễn phí; SSO success/error/expired; cookie tạm bị xoá đúng path trên mọi nhánh, Secure production giữ true.             | Mock/unit callback + browser HTTPS local; không gọi IdP thật                                      |
| AC-08 | Cho thiếu Origin/cross-origin/strict-origin fixtures; chạy CSRF suite; kết quả giữ baseline.                                                | `tests/csrf.test.ts`, strict-origin và proxy regression hiện hữu                                  |
| AC-09 | Cho user mỗi role/org/project; chạy auth/permission regression; token cũ/quyền/account-disabled/SSO MFA giữ như trước.                      | Suite auth hiện có trên PostgreSQL disposable; không dùng DB thật                                 |
| AC-10 | Cho toàn bộ PR implementation; gate/review đạt; tài liệu và runtime contract không mâu thuẫn.                                               | Checks §15, security review, evidence đúng SHA và phê duyệt D1                                    |

AC-03/04 chưa có evidence thì TD-001 vẫn OPEN, dù helper/unit pass.

## 9. Kiến trúc và điểm chạm code

Luồng đề xuất: client → edge đã chuẩn hoá → app nội bộ → `clientIp` → bộ đếm Postgres hiện có.
Topology CDN/LB chưa chốt là dependency, không phải giả định triển khai sẵn.

| File dự kiến                           | Thay đổi được phép sau approval                                          |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `lib/bao-mat/client-ip.ts`             | Helper thuần với contract FR-02, tier 3, không import nghiệp vụ          |
| `app/api/auth/login/route.ts`          | Import helper thay hàm copy; không đổi login body/status/SQL             |
| `app/api/auth/login/2fa/route.ts`      | Import helper; giữ pending-token/account budget                          |
| `app/api/auth/oidc/callback/route.ts`  | Import helper; thuộc tính xoá cookie tạm theo bảng                       |
| `lib/bao-mat/api-keys.ts`              | Import helper; giữ scope/key hash/expiry/grants                          |
| `app/api/auth/logout/route.ts`         | Nhận request để dùng helper Secure hiện tại khi xoá cookie; giữ response |
| `tests/client-ip.test.ts`              | Unit parsing/normalisation/contract failure                              |
| Tests auth/OIDC/API-key hiện hữu       | Hồi quy và fixture IP hợp lệ; không thay auth rules                      |
| E2E fixture mới cục bộ                 | Edge thật, HTTPS, browser cookie, tài khoản/org cô lập                   |
| `DEPLOY.md`, evidence và `PROGRESS.md` | Contract, bằng chứng, giới hạn và rollback                               |

Không đổi `auth.ts`, `csrf.ts`, `proxy.ts`, `ecosystem.config.js`, workflows, lockfile, migration,
service worker hoặc route e-sign trong PR code dự kiến. Cấu hình edge/firewall thuộc bước vận
hành được owner cho phép riêng; thay bind/PM2 trong repo cần scope triển khai bổ sung trước.

## 10. API contract

Không endpoint mới. Giữ method/body/status/error/redirect của login, 2FA, callback, logout và
API key consumers. 429/Retry-After giữ như hiện tại; invalid/missing proxy metadata chọn khoá
`unknown`, không thêm mã lỗi công khai. IP không bao giờ xác thực user hoặc quyết định quyền.

Không thay getCurrentUser/CAN, SoD, org/project scope, API-key scopes, pagination hoặc timeout.
Không retry password/OTP ở server. Logout idempotent; OIDC replay/state/nonce/PKCE giữ cơ chế cũ.

## 11. Data contract và DDL

**Không DDL hoặc migration; không cấp số migration mới.** Bảng rate-limit, khoá chuỗi và thời
hạn hiện có được giữ. Khoá IP mới có thể khác khi chuẩn hoá IPv6, vì vậy không chuyển dữ liệu
hay reset bộ đếm hàng loạt. Chạy trong cửa sổ ít người; các cửa sổ 15 phút cũ tự hết hạn.

Không sửa lịch sử audit IP, retention, owner, RLS/index/constraint hoặc dữ liệu nghiệp vụ.
Không thêm tiền/ngày cần quy đổi. Evidence ghi ngày giờ Việt Nam UTC+7 và SHA, không sao chép PII.
Không cần verify query DDL/ERD; DB tests phải chứng minh bộ đếm tăng/xoá đúng với schema hiện tại.
Rollback code không backfill DB; chấp nhận khoá cũ/mới tồn tại tới hết TTL, theo dõi lỗi giới hạn.

## 12. Security/privacy/abuse

- Nguy cơ chính là spoof header hoặc đi vòng edge. Chống spoof phải có AC-03 **và** AC-04;
  parser/CIDR lấy từ header không thay thế transport boundary.
- Proxy phía trước edge có thể làm mọi người cùng IP hoặc tin nguồn giả. D1 phải chỉ rõ upstream
  tin cậy và cách loại đầu vào ngoài trust; không tin toàn bộ Internet, không dùng allowlist `*`.
- `unknown` bảo thủ nhưng có thể gây khoá nhầm nhiều người; phải phát hiện trong staging và
  dừng rollout khi contract chưa ổn. Không tự nới threshold hoặc fallback header để làm xanh.
- Cookie Secure dựa proto hiện có chỉ đáng tin sau edge overwrite. Không sửa helper cookie để
  suy luận proxy từ dữ liệu client, không giảm Secure của OIDC production.
- CSRF thiếu Origin giữ nguyên chủ đích; strict route vẫn strict. Mọi đổi CSRF cần spec khác.
- Không PII/header raw, credential, OTP, token hoặc cookie trong log/evidence. Thử giới hạn chỉ
  bằng user giả trên DB disposable. Không fuzz/login sai vào production hoặc gọi provider thật.
- Không chạm audit e-sign; trước slice đó phải kiểm miền, các bên ký và semantics IP lịch sử.

## 13. UX/a11y/content

Không thay page/form/modal/copy; giữ giao diện tiếng Việt và flow bàn phím/mobile. Hiển thị lỗi
429 hiện tại; không đưa “proxy”, “header” hoặc IP vào nội dung người dùng. Browser regressions
login/logout desktop/mobile và axe hiện hữu phải xanh. Không phát sinh export hoặc đổi theme.

## 14. Observability và vận hành

Không thêm telemetry endpoint hoặc schema. Evidence staging ghi số ca pass/fail, phân loại
metadata `valid/unknown` từ fixture, topology đã duyệt, SHA app/config và thời điểm kiểm. Không
ghi IP thật hay cookie. Operator đối chiếu 429/login error từ cơ chế quan sát sẵn có; không bật
ghi body/header. Khi có lỗi, mô tả route/status/category, không serialise request.

Owner vận hành cần xác nhận người chịu trách nhiệm edge/firewall trước rollout; hiện **chưa
chỉ định**. Health-check nội bộ và public smoke không auth không được coi là chứng minh AC-03.

## 15. Test plan

1. Unit helper FR-02/AC-01/02; fixture hợp lệ IPv4/IPv6, mapped, khoảng trắng ngoài, khác header,
   duplicate/list, null, quá dài, invalid URL/port/zone. Kiểm không DNS/I/O, không mutate request.
2. PostgreSQL disposable: `tests/route-auth.test.ts`, `tests/login-2fa-security*.test.ts`,
   `tests/api-keys.test.ts`, `tests/oidc.test.ts`, account-disabled và suite auth liên quan; import
   setup DB trước tiên. Giữ positive/negative controls, account-wide 2FA, concurrency/idempotency.
3. Edge cục bộ thật với hai nguồn transport kiểm được và DB disposable: AC-03. Chỉ thay header
   trên request mock cùng process không đủ; lưu evidence cùng request budget/DB state giả.
4. Browser production build qua HTTPS cục bộ và development HTTP, desktop/mobile: login/logout,
   cookie jar và `/me`, IdP stub cục bộ, OIDC cleanup. Production HTTP phải giữ Secure của cookie
   OIDC; không coi HTTP SSO roundtrip là yêu cầu phải pass. Không cần provider trả phí/secret thật.
5. Hồi quy CSRF/proxy/security/strict-origin và cookie production HTTPS hiện có; giữ axe login
   hiện hữu. PWA/SSE/offline/export không đổi nên chạy regression liên quan, không thêm test giả.
6. Sau targeted checks: `npm run lint`, `npm run typecheck`, `npm run check:sw-exclude`,
   `npm run check:migrations`, `npm test -- --release-gate`, `npm run build`,
   `npm run test:e2e`, cùng `npm run gate` và format check theo repo. Không skip thêm/giảm ngưỡng.
7. Security review API/cookie và logic rate-limit trước PR; agent chính review toàn diff. Tối đa
   ba repair attempts cho cùng failure; còn lỗi thì checkpoint có bằng chứng, không tự duyệt.

Không migration/export/financial UAT mới. UAT login/logout bảy role dùng fixture; Safari/iOS thật
cần owner bố trí nếu nằm trong release gate, không thay bằng Chromium emulation.

## 16. Kế hoạch slice/PR

| Slice      | Outcome                                                | Dependency / route / phạm vi                                                                                                  |
| ---------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| R0         | Nghiên cứu và spec để review                           | Bản này; không code, không approval thay owner                                                                                |
| R1         | Chốt topology và contract edge/HTTPS                   | Owner/operator trả lời D1/D2; bằng chứng cấu hình đã che nhạy cảm; chưa sửa production                                        |
| R2         | Một PR helper IP + bốn điểm gọi + tests                | Chỉ Ready sau spec Approved và contract R1 ổn định; `route:complex` vì auth boundary; không tách worker sửa chung callback    |
| R3         | Cookie cleanup/logout có thuộc tính rõ + browser tests | Sau R2 merge/reload main, hoặc PR độc lập nếu owner duyệt phạm vi riêng; `route:standard`, không cùng lúc sửa callback với R2 |
| R4         | Staging edge và nghiệm thu chống spoof/cookie          | Quyền operator/staging riêng; AC-03/04/06/07; production chỉ sau go/no-go và quyền rõ                                         |
| S riêng    | Đặt X-XSS-Protection `0`, tắt XSS Auditor cũ           | Lát S cấu hình độc lập; không đổi CSP/HSTS; targeted header test + gate                                                       |
| E-sign sau | Đối soát IP trong audit ký số                          | Spec/audit miền riêng, chưa Ready; không nằm trong quyền M138                                                                 |

Trước mỗi PR reload `origin/main`, cập nhật trạng thái và bằng chứng; nếu chốt mục tiêu nhiều PR
thì agent chính lập hồ sơ `docs/goals/` theo AI_DELIVERY_LOOP sau khi scope được duyệt. Contract,
schema/config chung và file callback luôn xử lý tuần tự; worker báo file/checks/risk rõ.

## 17. Rollout/rollback

- **Chuẩn bị:** chốt R1 và approvals; lưu bản cấu hình edge hiện hành đã bảo vệ quyền truy cập;
  không đọc/copy secret vào repo. Không có migration; dùng quy trình backup/restore vận hành
  hiện có, không tuyên bố backup production đã kiểm từ lượt nghiên cứu này.
- **Staging:** dựng topology tương đương, chuẩn hoá header và chặn app trực tiếp trước; chạy
  AC-03/04 rồi code helper/cookie và toàn gate. Ghi mọi layer CDN/LB/proxy, IPv4/IPv6, TLS terminator.
- **Go:** AC bắt buộc xanh, không unknown ngoài fixture cố ý, auth/2FA/SSO/logout đúng, security
  review đóng finding và operator xác nhận. Thiếu topology/evidence thì giữ In review/WAITING.
- **Production:** owner cấp quyền riêng cho cấu hình và phát hành; triển khai trong cửa sổ ít
  người theo runbook đã duyệt. Không reset các bộ đếm hoặc sửa lịch sử để che khác biệt khoá IP.
- **Rollback:** lỗi nhận dạng/429 bất thường hoặc cookie roundtrip → dừng và revert PR app trước.
  Giữ edge overwrite và chặn cổng trực tiếp nếu chúng vẫn đúng; không mở lại public app như
  cách sửa nhanh. Chỉ operator khôi phục cấu hình edge về bản đã biết an toàn khi cấu hình đó
  gây lỗi, kèm đường truy cập nội bộ. Không revert DDL, không replay audit, không xoá dữ liệu.
- Kiểm login/2FA/OIDC/logout và health sau rollback; theo dõi hết cửa sổ rate-limit cũ 15 phút.
  Không gọi rollout/rollback thật trong nhiệm vụ soạn đặc tả.

## 18. Risk/assumption/open decisions

| Mục                                  | Xác minh/giảm thiểu                                                                                                                                  | Owner                                  | Hạn                              | Quyết định                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- | ------------------------------------------------------ |
| **D1 — BLOCKING: topology/trust**    | Có CDN/LB? Proxy nào thấy transport IP? Upstream nào được tin? IPv4/IPv6/firewall/bind nào chặn đi vòng? Cần sơ đồ và chứng cứ staging.              | Chủ repo + operator, chưa chỉ định tên | Trước approval/implementation R2 | **Chưa chốt**; B là đề xuất, không suy từ package.json |
| **D2 — BLOCKING: contract metadata** | Chấp nhận hai header ghi đè một IP giống nhau và `unknown` khi thiếu/sai? Duyệt cả nguồn Proto/Host và HTTP production hiện có; không thêm SSO HTTP. | Chủ repo + security reviewer           | Trước approval                   | **Chưa duyệt**; FR-01/02/04 là đề xuất cụ thể          |
| Nguồn IP thay đổi                    | CDN hoặc IPv6 chuẩn hoá làm đổi khoá; có thể gộp hoặc chia budget trong một cửa sổ. Test nhiều nguồn và positive control, rollout ít người.          | Implementer + reviewer                 | Trước R2 merge                   | Không reset/bù bộ đếm hàng loạt                        |
| Contract hỏng                        | Mọi request có thể vào `unknown` và bị khoá chung; phải có staging gate, không fallback tuỳ tiện.                                                    | Operator                               | Trước rollout                    | No-go nếu metadata thật không hợp lệ                   |
| Scope e-sign                         | Audit IP có ý nghĩa miền và lịch sử riêng; không đồng nhất parsing trong PR auth.                                                                    | Chủ repo + reviewer miền               | Khi mở slice riêng               | Chưa Ready                                             |
| HTTP/SSO                             | Session vẫn tương thích HTTP production theo helper cũ; cookie tạm SSO vẫn Secure production. Không dùng “consistency” để giảm bảo vệ.               | Security reviewer                      | Trước R3                         | Giữ policy hiện tại                                    |
| Nghiên cứu chưa kiểm runtime         | Repo và tài liệu chính thức không chứng minh firewall/proxy production đúng hay sai.                                                                 | Operator                               | Trước đóng TD-001                | Giữ rủi ro có điều kiện; không tuyên bố exploit/đã vá  |

## 19. Approval

- [ ] Product/scope — gồm ranh giới R2/R3 và e-sign riêng.
- [ ] UX/a11y — không đổi UI; regression desktop/mobile có evidence.
- [ ] Architecture/API/data — contract edge/helper và không DDL.
- [ ] Security/RBAC/SoD/audit — IP không cấp quyền; CSRF và cookie policy giữ nguyên.
- [ ] Test/telemetry/rollout/rollback — AC-03/04 có phương pháp kiểm staging thật.
- [ ] Không còn blocking question — D1/D2 hiện chưa đóng.

**Kết luận:** **In review**. Không được triển khai R2/R3 hoặc cấu hình runtime từ bản này.

**Người/ngày duyệt:** **Chưa duyệt / Chưa duyệt**.
