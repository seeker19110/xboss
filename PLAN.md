# PLAN.md — Đợt "nâng tầm dự án" GĐ1: bịt lỗ bảo mật + trung thực hoá dữ liệu

**Cập nhật:** 2026-08-24
**Nguồn:** `docs/audit-2026-08-24-nang-tam.md` (báo cáo audit 4 miền, commit `872697f`)
**Nhánh nền:** `claude/nang-tam-du-an-5yexhe` (đã khớp `origin/main` = `5e42b8d`)

## Bối cảnh — vì sao đợt này

Đợt audit 2026-08-24 kết luận: **lõi nghiệp vụ không hồi quy**, nhưng lớp module `engineering/*`
thêm gần đây (M76–M99) mang **4 lỗ hổng mức Cao** và một loạt vấn đề toàn vẹn dữ liệu, do lớp này
được xây vượt cổng của chính roadmap và chưa từng đi qua checklist `docs/audit.md`.

Người dùng duyệt "triển khai theo hướng tốt nhất" (2026-08-24) và chốt 2 quyết định treo:

- **Module vượt gate:** đóng băng bằng feature flag (đảo ngược được), **không** gỡ code → GĐ2.
- **Bot hiện trường:** đổi sang thông điệp trung thực + đánh dấu thử nghiệm; **không** wire thật
  vào WBS/NCR/vật tư trong đợt này (là tính năng riêng, cần đặc tả sau).

**Phạm vi GĐ1 (kế hoạch này):** V1–V8 — vá 4 lỗ Cao, chặn ghi chéo dự án, trung thực hoá dữ liệu
hiển thị, dọn doc drift. **GĐ2 (kế hoạch sau, không thi hành trong đợt này):** cổng CI
`check:route-perms`/`check:project-scope`, lưới quét axe ~45 route, coverage ratchet, đóng băng
module vượt gate bằng flag.

## Quy ước bắt buộc cho MỌI việc trong kế hoạch này

Worker không thấy hội thoại trước đó — mọi thứ cần biết nằm trong brief của việc đó và các mục
dưới đây.

- **Đọc trước khi sửa:** `CLAUDE.md` (mục Auth, Kiến trúc `lib/` theo miền ADR-0007, Quy ước) và
  `docs/audit.md` §3/§4 (checklist bảo mật + toàn vẹn dữ liệu). Việc chạm `lib/bao-mat/*` bắt buộc
  rà thêm §8 "Vùng rủi ro cao".
- **Ranh giới kiến trúc (ADR-0007/0008):** route handler **chỉ** là ranh giới HTTP (kiểm phiên/
  quyền, đọc tham số, gọi dịch vụ, bọc `NextResponse`); logic nghiệp vụ nằm ở `lib/<miền>/`. Import
  nội bộ luôn dùng alias `@/lib/<miền>/<module>`. Chạy `npm run check:lib-layers` trước khi báo xong.
- **SQL:** luôn qua helper `lib/db` với placeholder `?`, **không nối chuỗi chèn giá trị**.
- **Tiếng Việt:** toàn bộ UI, comment code, commit message. Commit theo conventional prefix
  (`fix:`/`feat:`/`chore:`/`docs:`) + mô tả tiếng Việt.
- **Migration:** số kế tiếp là **`0133`** — nhưng **bắt buộc chạy `ls migrations | sort -V | tail -3`
  ngay trước khi tạo file** để lấy số thật (bài học PR #265/#266 trùng số `0071` chặn CI). Append-only,
  idempotent (`IF NOT EXISTS`). Chạy `npm run gen:erd` cùng PR nếu đổi schema.
- **Test:** file test chạm DB **phải** `import "./setup"` (hoặc `tests/setup.ts`) ở **dòng đầu tiên**.
  Test mới phải thêm vào lệnh `npm test` trong `package.json` nếu runner không tự quét.
- **Cổng trước khi báo xong:** `npm run lint` + `npm run typecheck` + `npm test` + `npm run build`
  xanh. Không có Postgres thì integration test tự skip — ghi rõ trong báo cáo, không coi là pass.
- **Chứng minh test bắt được lỗi cũ:** với mỗi bản vá bảo mật/logic, tạm trả code về bản cũ, chạy
  test mới → phải **đỏ**; khôi phục → **xanh**. Ghi kết quả này vào báo cáo. Không chỉ viết test rồi
  thấy nó xanh là xong.
- **Không mở rộng phạm vi:** không refactor ngoài vùng được giao, không nâng dependency, không đổi
  kiến trúc, không tự thêm module mới.

---

## Việc V1 — Xác thực webhook inbound + chuẩn hoá OTP liên kết (`route: complex`)

**Vá lỗ hổng Cao A1 + A2 + phát hiện Trung B9.** Chạm `lib/bao-mat/*` → vùng rủi ro cao.

### Vấn đề thật (đã xác minh trên code)

1. `app/api/telegram/webhook/route.ts` — POST công khai, **không kiểm secret token nào** (grep toàn
   repo không có `TELEGRAM_WEBHOOK_SECRET`/`Secret-Token`). Ai cũng POST giả tin nhắn được.
2. `lib/ky-thuat/engineering-site-bot.ts:190` — `verifyTelegramLinkOtp` tra
   `WHERE otp_code = ? AND otp_expires_at > CURRENT_TIMESTAMP AND is_verified = false`: **có** kiểm
   hạn nhưng **không gắn `chatId`/`userId`**, không rate-limit, không đếm số lần sai → dò mã 6 số là
   chiếm được binding của **user bất kỳ đang chờ liên kết**.
3. `app/api/zalo/webhook/route.ts:17` — POST công khai không chữ ký;
   `const projectId = Number(body.projectId || 1)` lấy thẳng từ body rồi dùng chính giá trị đó cho
   `withProjectScope` → **RLS bị hợp thức hoá bằng giá trị attacker đưa vào**.
4. `lib/ky-thuat/engineering-zalo-copilot.ts:141` — `verifyZaloLinkOtp` **SELECT `otp_expires_at`
   nhưng không bao giờ so sánh** → OTP hết hạn vẫn verify được. `processIncomingZaloMessage` không
   kiểm `zalo_user_bindings.is_verified`.
5. Cả 2 luồng sinh OTP dùng `ON CONFLICT (id)` trên UUID tự sinh → **không bao giờ conflict** → mỗi
   lần generate thêm 1 dòng binding trùng. OTP lưu **plaintext**.

### Việc phải làm

**(a) Module dùng chung `lib/bao-mat/webhook-inbound.ts` (mới):**

- `xacThucWebhookTelegram(req: NextRequest): boolean` — so sánh header
  `X-Telegram-Bot-Api-Secret-Token` với `process.env.TELEGRAM_WEBHOOK_SECRET` bằng
  `crypto.timingSafeEqual` (bọc try/catch cho độ dài lệch). **Fail-fast**: thiếu biến env →
  `throw` với thông điệp tiếng Việt rõ ràng (cùng pattern `CRON_SECRET`, xem `lib/nen/env.ts` style).
  Route trả **401** khi không khớp.
- `xacThucWebhookZalo(req, rawBody): boolean` — xác thực chữ ký Zalo OA theo `ZALO_OA_SECRET`
  (HMAC-SHA256 của raw body, so `timingSafeEqual`). Thiếu env → throw fail-fast.
- **Ranh giới được phép quyết:** cách đọc raw body cho Zalo (Next App Router cần `req.text()` rồi
  `JSON.parse` thay vì `req.json()` để HMAC đúng byte gốc) — chọn cách tối thiểu, ghi comment lý do.

**(b) Module dùng chung `lib/bao-mat/otp.ts` (mới)** — gom 2 (hiện là 3, tính cả e-Sign ở V2) chỗ tự
chế OTP đang dính 3 kiểu lỗi khác nhau:

- `sinhOtp(): string` — 6 chữ số ngẫu nhiên bằng `crypto.randomInt`.
- `hashOtp(otp: string): string` — SHA-256 hex (không cần bcrypt: OTP sống ngắn, có rate-limit).
- `kiemOtp(otpNhap: string, hashLuu: string | null): boolean` — so `timingSafeEqual` trên hash.
- **Không** tự truy vấn DB — chỉ hàm thuần, để test được không cần Postgres (đặt ở tầng
  `lib/bao-mat/` = tầng 3, chỉ import từ `lib/nen/`).

**(c) Áp vào Telegram:**

- Route kiểm secret token **ngay dòng đầu handler**, trước cả `req.json()`.
- `verifyTelegramLinkOtp(chatId, otpCode)` — thêm tham số `chatId`, điều kiện WHERE phải gồm
  `telegram_chat_id IS NULL OR telegram_chat_id = ?` (chỉ nhận binding chưa gắn chat khác), so OTP
  bằng hash qua `kiemOtp`, và **rate-limit theo chatId**: `hitRateLimit(\`tg_otp:\${chatId}\`, 5, 15)`(chữ ký thật:`hitRateLimit(key: string, max: number, windowMinutes: number): Promise<boolean>`từ`lib/bao-mat/ratelimit.ts`— trả`true` khi **còn được phép**, kiểm lại chiều trả về trước khi dùng).
  Vượt ngưỡng → trả về false, không tra DB.
- Sinh OTP: lưu **hash** vào `otp_code`, upsert theo `user_id` (không phải `id`).

**(d) Áp vào Zalo:**

- Route kiểm chữ ký ngay đầu handler → 401 khi sai.
- **Bỏ hẳn `body.projectId`.** `projectId` **suy từ binding**: tra
  `zalo_user_bindings WHERE zalo_user_id = ? AND is_verified = true` → lấy `project_id` của dòng đó.
  Không có binding verified → trả 403 kèm thông điệp tiếng Việt hướng dẫn liên kết trước, **không**
  xử lý tin nhắn, **không** ghi log message.
- `verifyZaloLinkOtp`: thêm `AND otp_expires_at > CURRENT_TIMESTAMP`, so OTP qua hash, rate-limit
  theo `zaloUserId` như Telegram.
- Sinh OTP: lưu hash, upsert theo `(project_id, zalo_user_id)`.

**(e) Migration `0133_webhook_otp_hardening.sql`** (xác nhận số thật trước):

- `CREATE UNIQUE INDEX IF NOT EXISTS` trên `zalo_user_bindings(project_id, zalo_user_id)` —
  **lưu ý:** dữ liệu hiện có thể đã trùng do bug (e); migration phải **dọn trùng trước** (giữ dòng
  `is_verified = true` nếu có, ngược lại giữ dòng mới nhất theo `created_at`) rồi mới tạo unique index.
  Viết idempotent, chạy lại không lỗi.
- Đây là migration **đụng dữ liệu** (DELETE dòng trùng) → ghi rõ trong PR là **bắt buộc qua staging
  trước** theo DoD `CLAUDE.md`, kiểm trước bằng `npm run db:migrate -- --dry-run`.

**(f) Biến môi trường:** thêm `TELEGRAM_WEBHOOK_SECRET`, `ZALO_OA_SECRET` vào `lib/nen/env.ts`
(danh sách liệt kê) + `.env.example` + mục "Biến môi trường quan trọng" trong `CLAUDE.md`, ghi rõ
thiếu biến → throw fail-fast khi gọi webhook (build vẫn chạy).

### Tiêu chí chấp nhận

- POST vào 2 route webhook **không kèm secret/chữ ký hợp lệ** → 401, không ghi bất kỳ dòng DB nào.
- Zalo: `projectId` trong body bị **bỏ qua hoàn toàn**; user chưa có binding verified → 403, không
  ghi log.
- Dò OTP: quá 5 lần sai trong 15 phút cho cùng chatId/zaloUserId → bị chặn.
- OTP hết hạn (Zalo) → verify thất bại.
- Sinh OTP 2 lần liên tiếp cho cùng user → **1 dòng binding**, không phải 2.
- `tests/webhook-inbound.test.ts` (mới) + mở rộng test OTP: unit thuần cho `otp.ts` và hàm xác thực
  chữ ký (không cần DB); integration cho luồng binding (tự skip khi thiếu `TEST_DATABASE_URL`).
- **Chứng minh test bắt lỗi cũ** theo quy ước chung ở trên.

---

## Việc V2 — Siết quyền ký e-Sign (`route: spec`)

**Vá lỗ hổng Cao A3.** Đặc tả kín, chỉ cần thi hành chính xác.

### Vấn đề thật (đã xác minh trên code)

`app/api/engineering/esign/sign/route.ts:11` gate bằng `CAN.viewEngineeringGraph` — đọc
`lib/bao-mat/auth.ts:359` thấy hàm này trả true cho `admin | pm | engineer | **bch**`, tức **quyền
XEM, bao gồm vai trò chỉ-xem `bch`**, lại dùng để gate hành vi **ký**. Cộng thêm:

- `signatoryId` do client chọn, không ràng buộc gì với tài khoản đang đăng nhập → **1 user ký được
  cả 3 bên** (CĐT/TVGS/Nhà thầu).
- `lib/ky-thuat/engineering-esignature.ts:204` — `if (signatory.otpCode && otpCode)`: chỉ kiểm OTP
  khi client **tự nguyện gửi** trường `otpCode`; bỏ trường đi là qua mặt hoàn toàn.
- Không kiểm `status === 'ready'` (chỉ chặn `'signed'`) → ký sai thứ tự được.
- `projectId` từ body không đối chiếu `visibleProjectIds`.

**Không cần migration:** bảng `engineering_esign_signatories` (`migrations/0117_*.sql:20`) **đã có**
cột `user_id BIGINT REFERENCES users(id)` — hiện đang nullable và không được dùng để kiểm.

### Việc phải làm

1. **Quyền:** thêm `CAN.signEngineeringEsign` vào map `CAN` trong `lib/bao-mat/auth.ts` —
   `(r?: Role) => r === "admin" || r === "pm" || r === "engineer"` (loại `bch` và mọi
   `VIEW_ONLY_ROLES`). Route đổi sang dùng quyền này. **Không** check role rải rác ngoài map `CAN`.
2. **Ràng buộc người ký:** trong `executeSignEnvelope`, sau khi tải signatory:
   - `signatory.user_id == null` → trả lỗi 422 "Người ký chưa được gắn tài khoản hệ thống".
   - `Number(signatory.user_id) !== user.id` → trả lỗi **403** "Bạn không phải người ký của mục này".
   - Hàm nhận `user.id` qua **tham số** (không tự gọi `getCurrentUser()` bên trong — giữ hàm test
     được ngoài phạm vi request, đúng tiền lệ `chotProjectIdChoGhi`).
3. **OTP bắt buộc:** đổi `if (signatory.otpCode && otpCode)` thành: nếu `signatory.otp_code` tồn tại
   thì **bắt buộc** phải có `otpCode` hợp lệ và **còn hạn** (`otp_expires_at > NOW()`), thiếu/sai → 422. So OTP qua `kiemOtp` của `lib/bao-mat/otp.ts` (module do V1 tạo — **nếu V1 chưa tích hợp,
   dùng so sánh `timingSafeEqual` tại chỗ và ghi chú TODO gộp về `otp.ts`; không tự tạo module trùng tên**).
4. **Thứ tự ký:** yêu cầu `signatory.status === 'ready'`; khác → 409 kèm thông điệp tiếng Việt nêu
   trạng thái hiện tại.
5. **Project scope:** `projectId` qua
   `chotProjectIdChoGhi(user, body.projectId, await getCurrentProjectId(user, user.orgId))` từ
   `lib/ha-tang/projects.ts` (chữ ký thật:
   `(user: {id, role}, inputProjectId: unknown, projectHienTai: number) => Promise<{ok:true,projectId}|{ok:false}>`);
   `ok:false` → 403.
6. **Tài liệu:** trong `PROGRESS.md`, **mở lại** nợ "ký số PAdES" — ghi rõ module M84 chưa đạt mức
   "chống chối bỏ" như mô tả, nêu 4 điểm đã vá ở việc này và phần còn thiếu (PAdES thật/USB token/HSM
   vẫn chờ nhu cầu pháp lý, đúng mục "Việc tạm hoãn").

### Tiêu chí chấp nhận

- Vai trò `bch`/`cdt`/`viewer`/`subcon` gọi POST sign → **403**.
- User A cố ký signatory gắn user B → **403**.
- Signatory có `otp_code` mà request **không** gửi `otpCode` → **422** (trước đây: ký thành công).
- Signatory `status='waiting'` → **409**.
- `projectId` trỏ dự án ngoài `visibleProjectIds` → **403**.
- `tests/esign-sign-guard.test.ts` (mới) phủ đủ 5 ca trên; chứng minh test đỏ khi trả về code cũ.

---

## Việc V3 — Phân quyền 14 route engineering ghi dữ liệu (`route: spec`)

**Vá lỗ hổng Cao A4.**

### Vấn đề thật (đã xác minh: phiên chính tự đếm)

14 file trong `app/api/engineering/` có `POST|PATCH|DELETE` mà **không tham chiếu `CAN.` nào**
(chỉ có `getCurrentUser`), tức vai trò chỉ-xem và subcon ghi được:

```
subcon-ai/evaluate            subcon-ai/recommend-shortlist
bim-models/                   bim-models/[id]/link-wbs        bim-models/[id]/simulate-4d
god-tier/bcf/topics           god-tier/point-cloud            god-tier/ai-diagnose
god-tier/clashes              god-tier/models                 god-tier/cnc-export
god-tier/simulate-4d          iot/telemetry                   iot/alerts
```

Hệ quả cụ thể: `viewer`/`cdt` tạo/ghi đè mô hình BIM và gắn `wbs_task_id`; POST `iot/telemetry` giả
số đo → **tự sinh cảnh báo an toàn HSE CRITICAL thật** (`route.ts:111-128`); PATCH `iot/alerts` ack
tắt cảnh báo an toàn; POST `subcon-ai/evaluate` — **thầu phụ tự chấm điểm tín nhiệm của chính mình**
với metrics tự khai từ body (`onTimeRate ?? 90`, `bbntPassRate ?? 95`).

### Việc phải làm

1. **Thêm 4 cặp quyền vào map `CAN`** (`lib/bao-mat/auth.ts`, bám đúng pattern các cặp
   `viewEngineering*`/`manageEngineering*` đã có ở dòng 337–379):
   - `viewEngineeringBim` / `manageEngineeringBim`
   - `viewEngineeringIot` / `manageEngineeringIot`
   - `viewEngineeringSubconAi` / `manageEngineeringSubconAi`
   - `viewEngineeringGodTier` / `manageEngineeringGodTier`

   Quy tắc chung: `view*` = `admin | pm | engineer | bch`; `manage*` = `admin | pm | engineer`
   (**loại toàn bộ `VIEW_ONLY_ROLES` và `subcon`**). Ngoại lệ bắt buộc:
   `manageEngineeringSubconAi` = `admin | pm` (chấm điểm nhà thầu là việc quản lý, **subcon và
   engineer không được tự chấm**).

2. **Áp vào 14 file:** mọi handler `GET` dùng `view*`, mọi `POST|PATCH|DELETE` dùng `manage*`; trả
   **403** kèm thông điệp tiếng Việt khi không đủ quyền, **401** khi chưa đăng nhập (giữ nguyên
   `getCurrentUser` sẵn có). Bám đúng pattern route engineering đã làm đúng (tham chiếu:
   `app/api/engineering/twin/**` hoặc route bất kỳ đang dùng cặp `viewEngineeringTwin`/`manageEngineeringTwin`).

3. **Chặn metrics tự khai của `subcon-ai/evaluate`:** bỏ mọi default kiểu `onTimeRate ?? 90` nhận từ
   body. Metrics phải **tính từ dữ liệu hệ thống**. Nếu nguồn dữ liệu thật chưa sẵn cho một chỉ số
   nào thì **trả `null` + ghi rõ "chưa đủ dữ liệu"**, tuyệt đối **không** thay bằng số mặc định đẹp.
   Đặt logic tính ở `lib/hien-truong/` hoặc `lib/ky-thuat/` theo đúng miền của nguồn dữ liệu (không
   để trong route — ADR-0008).

4. **Kèm 2 sửa nhỏ cùng vùng file (phát hiện Thấp):**
   - `bim-models/route.ts:76-92` — chèn element **từng dòng trong vòng lặp, không transaction, không
     cap số lượng**: đổi sang batch insert (multi-row `VALUES` hoặc `UNNEST`), bọc `withTransaction`,
     cap `elements.length` (đề xuất 10 000) → **422** khi vượt.
   - `iot/telemetry/route.ts:111-128` — alert **không dedup**: trước khi insert, kiểm alert đang mở
     cho cùng `device_id`; hoặc partial unique index `(device_id) WHERE resolved_at IS NULL`. Bám
     đúng cơ chế dedup notification của dự án. Cần migration → dùng số thật, idempotent.

### Tiêu chí chấp nhận

- Chạy lại phép đếm của audit: `for f in $(grep -rln "export async function \(POST\|PATCH\|DELETE\)" app/api/engineering/); do grep -q "CAN\." "$f" || echo "$f"; done`
  → **0 file** (hoặc chỉ còn file có lý do ghi rõ trong báo cáo).
- `viewer`/`cdt`/`subcon` POST vào 14 route → **403**.
- `engineer` POST `subcon-ai/evaluate` → **403** (chỉ `admin`/`pm`).
- `subcon-ai/evaluate` không còn nhận bất kỳ chỉ số nào từ body.
- POST `bim-models` với 20 000 element → **422**; với số hợp lệ mà lỗi giữa chừng → **không** để lại
  model mồ côi.
- Test mới phủ ma trận quyền 7 vai trò cho ít nhất 1 route đại diện mỗi nhóm (bim/iot/subcon-ai/god-tier).

---

## Việc V4 — `projectId` phải lấy từ phiên, không từ body (`route: spec`)

**Vá phát hiện Trung B1.**

### Vấn đề thật

~15 route engineering dùng mẫu `Number(body.projectId || (user as any).projectId || 1)` —
`user.projectId` **không tồn tại** trên kiểu `User` nên biểu thức rơi về **giá trị client gửi**, hoặc
`1`. Nhiều chỗ còn dùng chính giá trị đó cho `withProjectScope` nên RLS không chặn. Trái quy ước ghi
ngay trong `lib/ha-tang/projects.ts:1-3`: _"Route KHÔNG tin project_id client gửi qua body/query"_.
Cùng lớp lỗi đã xảy ra thật với `/api/payment-certs` và `save-drawing` (đã vá đợt trước).

**Danh sách khoanh vùng** (worker tự grep `body.projectId` trong `app/api/engineering/` + `app/api/zalo/`
để lấy danh sách đầy đủ, không tin danh sách này là đủ):
`bidding` (×3), `fidic/claims`, `routing/sleeves`, `queue/tasks/[id]/bridge`, `spatial/annotations` (×2),
`logistics` (×2), `pinnacle/pulse`, `esign` (×2 — **phối hợp V2**), `cashflow/simulate`, `hse-vision/scan`.

### Việc phải làm

1. Thay toàn bộ mẫu trên bằng `chotProjectIdChoGhi(user, body.projectId, projectHienTai)` từ
   `lib/ha-tang/projects.ts` (chữ ký thật ghi ở V2 mục 5), `ok:false` → **403**. Với route **chỉ đọc**,
   dùng `getCurrentProjectId(user, user.orgId)` và bỏ hẳn `body.projectId`.
2. **Không** đụng các route đã đúng; không refactor gì khác trong file.
3. **Mở rộng bất biến thành test cưỡng chế:** dựa trên `tests/cad-project-scope.test.ts` (đã có mẫu
   cho nhóm CAD) và `tests/project-scope-invariant.test.ts`, viết/mở rộng test **thuần fs** quét toàn
   bộ `app/api/engineering/**`: cấm mẫu `body.projectId`/`formData.get("projectId")` trừ khi file đó
   cũng tham chiếu `chotProjectIdChoGhi`. Whitelist phải kèm **lý do từng mục** (đúng tiền lệ
   `tests/org-scope-invariant.test.ts` 24 mục).

### Tiêu chí chấp nhận

- Grep `body.projectId` trong `app/api/engineering/` → mọi kết quả còn lại đều đi qua
  `chotProjectIdChoGhi`, hoặc nằm trong whitelist có lý do.
- User thuộc dự án A gửi `projectId` của dự án B (ngoài `visibleProjectIds`) → **403**, không ghi dòng nào.
- Test bất biến mới **đỏ** nếu thêm lại một route dùng `body.projectId` trần.

---

## Việc V5 — Trung thực hoá dữ liệu hiển thị: bot hiện trường + Smart IPC (`route: standard`)

**Vá phát hiện Trung B2 + B3.** Đây là lỗi **toàn vẹn dữ liệu** dù code "chạy đúng".

### Vấn đề thật (đã xác minh trên code)

**(a) Bot trả lời GIẢ** — `lib/ky-thuat/engineering-site-bot.ts:265,280` và
`lib/ky-thuat/engineering-zalo-copilot.ts:185`:

- `PROGRESS_UPDATE` → _"Hệ thống đã đồng bộ vào WBS"_
- `ISSUE_REPORT` → _"Đã tạo Phiếu NCR… BCH đã nhận thông báo"_
- `QUERY_STOCK` → _"Tồn kho khả dụng 450 đơn vị"_ / _"Hiện còn 180 đơn vị tại Kho Tổng A"_ —
  **số bịa cứng trong code**

Thực tế **chỉ ghi log tin nhắn**, không đụng `tasks`/`ncrs`/`materials`. Kỹ sư ngoài công trường tin
là tiến độ/NCR đã vào hệ thống → mất dữ liệu thật; số tồn kho giả có thể dẫn tới quyết định cấp phát sai.

**(b) Smart IPC (M94)** — `app/api/engineering/smart-ipc/route.ts:51-61` +
`lib/ky-thuat/engineering-smart-ipc.ts:47-120`: toàn bộ `gating` ("BBNT 3 bên", "thử áp IoT", "đối
soát BOQ/kho") lấy từ body với default **pass hết** (`bbntSigned3Parties !== false`);
`grossClaimedVnd` default 500.000.000; tiền tính `parseFloat` + `Math.round(gross * rate)` trên
**float JS** (trái quy ước M45); payload "lệnh chuyển khoản" chứa **số tài khoản hardcode**
`98877665544`.

### Việc phải làm

**(a) Bot — quyết định đã chốt: đổi thông điệp, KHÔNG wire thật trong đợt này.**

- Mọi reply hàm ý "đã ghi vào hệ thống" đổi thành thông điệp trung thực, ví dụ:
  _"Đã ghi nhận yêu cầu cập nhật tiến độ [MÃ] → [X]%. Yêu cầu đang chờ xử lý, **chưa** cập nhật vào
  WBS. Vui lòng cập nhật trên ứng dụng XBoss để ghi nhận chính thức."_
- **Xoá hoàn toàn mọi số liệu bịa** (450/180 đơn vị, "Kho Tổng A", "DWG-M-01/02"). Intent tra cứu
  trả: _"Tính năng tra cứu qua bot đang thử nghiệm, chưa nối dữ liệu thật — vui lòng tra trên ứng dụng."_
- Thêm hậu tố `⚠️ Bot đang ở chế độ thử nghiệm` vào reply của mọi intent chưa nối dữ liệu thật.
- **Không** xoá code, **không** đổi schema log — chỉ đổi nội dung reply + comment giải thích rõ trạng
  thái thử nghiệm ngay đầu 2 file lib.

**(b) Smart IPC:**

- Bỏ mọi default "pass hết": mỗi cổng gating **phải** truy vấn nguồn thật
  (`engineering_esign_envelopes` cho BBNT, log IoT cho thử áp, `boq_items`/kho cho đối soát). Nguồn
  chưa sẵn → cổng đó trả trạng thái **`khong_du_du_lieu`** và **chặn** giải ngân, **không** mặc định pass.
- Bỏ default `grossClaimedVnd = 500_000_000`; thiếu → **422**.
- **Tiền:** mọi tổng/tích làm **trong SQL**; nếu buộc tính ở JS thì cast cột tiền `::text` trong
  SELECT rồi dùng `lib/nen/money.ts` (`parseMoney`/`addMoney`/`mulRate`/`formatVnd` — làm việc trên
  bigint đơn vị đồng×100). **Cấm `parseFloat` + `*` trên tiền.**
- **Xoá số tài khoản hardcode**; nếu payload cần thông tin ngân hàng thì đọc từ dữ liệu nhà thầu
  trong DB, không có thì để trống + ghi rõ "chưa cấu hình".

### Tiêu chí chấp nhận

- Grep toàn repo: **không còn** chuỗi `450 đơn vị`, `180 đơn vị`, `Kho Tổng A`, `98877665544`.
- Không còn reply nào khẳng định đã ghi vào WBS/NCR khi thực tế chỉ ghi log.
- Smart IPC: request thiếu dữ liệu gating → **chặn**, không "pass mặc định".
- Test tiền: một ca chứng minh kết quả tính qua `lib/nen/money.ts` **khác** kết quả `parseFloat` cũ ở
  ca biên (chứng minh bug float là thật), và giá trị mới là đúng.

---

## Việc V6 — CAD client hiển thị đúng lỗi + toast đúng ngữ nghĩa (`route: standard`)

**Vá phát hiện Trung B4 + B6 và 1 phát hiện Thấp.**

### Vấn đề thật (đã xác minh trên code)

1. `app/engineering/chuan-hoa-ban-ve/hooks/useCadSource.ts:157-175` — `runDxfAnalysis` **chỉ** xử lý
   `res.ok` và `401`; mọi mã khác bị bỏ qua hoàn toàn (spinner tắt, không toast, không error state).
   Nghĩa là **409** (nhiều bản vẽ trùng tên — chính contract mới của `tim-ban-ve.ts` vừa vá đợt
   trước) và **413** (quá giới hạn `GIOI_HAN_TEP_CAD`) **không tới được người dùng** → bản vá
   chống-nhầm-bản-vẽ thành ra cụt ở client.
2. `app/components/Toast.tsx:18` — `showToast(message, kind = "success")`; ~10 chỗ trong hooks CAD
   gọi báo lỗi mà **không truyền kind** (`useSmartNaming.ts`, `useCadSource.ts:220`) → thông điệp lỗi
   hiện nền emerald + icon ✓. Màu "nói dối", và `role="status"` cũng không phân biệt cho screen reader.
3. `app/api/engineering/cad/save-drawing/route.ts:178,184` — 2 `catch {}` **rỗng** nuốt lỗi
   (`unlinkSync` dọn bản tạm), trái `docs/audit.md` §7. Đây là 2 catch rỗng **duy nhất** trong `lib/`
   - `app/api/`.

### Việc phải làm

1. `runDxfAnalysis`: thêm nhánh `!res.ok` → đọc `json.error`, hiện `showToast(msg, "error")` **và**
   set error state để UI hiển thị (không chỉ toast thoáng qua). Giữ nguyên nhánh `401 → redirectToLogin()`.
2. **Riêng 409:** response mang danh sách ứng viên bản vẽ — hiện **modal cho người dùng chọn đích
   danh** (tái dùng `app/components/dialogs.tsx`, **không** tạo component mới nếu tránh được), chọn
   xong gọi lại phân tích với `drawingId` cụ thể. Tuyệt đối **không** tự chọn hộ.
3. Grep `showToast(` trong `app/engineering/chuan-hoa-ban-ve/` — mọi nhánh báo lỗi truyền `"error"`.
4. 2 `catch {}` rỗng → thêm `console.error` kèm ngữ cảnh tiếng Việt.
5. **UI theo chuẩn dự án:** dark-first, **không** dùng biến thể `dark:`, **không** hardcode hex; thẻ
   `bg-zinc-900 border border-zinc-800 rounded-xl`; nút `rounded-lg`; nút icon-only có `aria-label`
   tiếng Việt; modal có trạng thái loading/lỗi rõ ràng.

### Tiêu chí chấp nhận

- Server trả 409 → người dùng thấy modal chọn bản vẽ; chọn xong phân tích đúng bản đã chọn.
- Server trả 413 → người dùng thấy thông điệp giới hạn dung lượng kèm hướng dẫn tách bản vẽ.
- Không còn `showToast` báo lỗi nào hiển thị style success.
- Không còn `catch {}` rỗng trong `app/api/engineering/cad/`.

---

## Việc V7 — Tương phản màu: chữ trắng trên nền accent sáng (`route: mechanical`)

**Vá phát hiện Trung B5.** Việc cơ học, bám quy tắc đã tính sẵn — **không** tự tính lại tương phản.

### Vấn đề thật

**57 file** dùng `text-white` trên `bg-{emerald,sky,amber,green,teal,cyan}-600` — nhóm **FAIL** theo
bảng đã tính sẵn ở `docs/audit.md` §13.3 (emerald-600 + trắng = 3,77:1 < 4,5 AA). Nghiêm trọng nhất:
`app/components/ErrorState.tsx:24` — **nút "Thử lại" của màn hình lỗi dùng chung toàn app**.

Vi phạm đúng quy tắc đã chốt trong `app/globals.css:11-18` ("nền -500/-600 sáng phải dùng
`text-on-accent-dark`; -700 trở lên mới dùng trắng").

### Việc phải làm

1. Lấy danh sách thật:
   `grep -rlE 'bg-(emerald|sky|amber|green|teal|cyan)-600[^"]*text-white|text-white[^"]*bg-(emerald|sky|amber|green|teal|cyan)-600' app/ --include=*.tsx`
2. Với **mỗi** chỗ, chọn 1 trong 2 cách (theo `docs/audit.md` §13.3):
   - nâng nền lên `-700` + `text-on-accent` (mặc định an toàn, mọi accent ≥ 5,0:1), **hoặc**
   - giữ nền `-600` + đổi chữ sang `text-on-accent-dark`.
     Chọn cách **giữ nguyên cảm giác thị giác của từng chỗ**; ưu tiên cách (a) cho nút CTA đặc, cách
     (b) cho chip/tab active.
3. **Bắt đầu từ `app/components/ErrorState.tsx`** (phủ toàn app) rồi tới `app/approvals/page.tsx`,
   các tab hub `app/site/_components/`, `app/commercial/_components/`, và 5 panel CAD.
4. **Không** đụng: state hover/idle của icon, code chỉ chạy dev (`NODE_ENV === 'development'`), và
   nhóm accent **PASS** (`blue`/`violet`/`rose`/`red`/`indigo`-600 với chữ trắng đều ≥ 4,7:1 — để nguyên).
5. **Không** đụng lớp `text-zinc-500/600` (399 ứng viên) — đó là **nợ khác đã ghi nhận**, ngoài phạm
   vi việc này.

### Tiêu chí chấp nhận

- Lệnh grep ở mục 1 trả **0 file** (hoặc chỉ còn ca có lý do ghi rõ).
- `npm run lint` + `npm run build` xanh; giao diện không vỡ layout (đổi màu thuần, không đổi cấu trúc).
- Ghi rõ trong báo cáo: số file đã đổi, cách chọn (a)/(b) cho từng nhóm.

---

## Việc V8 — Dọn doc drift + pin SHA + hạ tuyên bố vượt bằng chứng (`route: mechanical`)

**Vá phát hiện Trung B8 + các phát hiện Thấp về tài liệu.** Đây là việc **tài liệu + 1 dòng YAML**,
nhưng quan trọng: lớp lỗi "tài liệu lệch code" là lớp lặp lại nhiều nhất trong lịch sử dự án.

### Việc phải làm

1. **`.github/workflows/pr-policy.yml:16`** — `uses: actions/github-script@v9` là dòng `uses:` **duy
   nhất toàn repo** dùng tag nổi (nghi do Dependabot PR #362 merge 2026-08-23 thay pin SHA khi nâng
   major). Pin lại **SHA đầy đủ** của release v9 mới nhất + comment version, bám đúng định dạng các
   dòng `uses:` khác trong cùng thư mục.
2. **`CLAUDE.md` mục Offline (PWA)** — đang ghi sai 2 điểm, khiến agent/PR sau thiết kế sai giả định:
   - "hàng đợi tick trong **localStorage** (`app/components/offlineQueue.ts`)" → thực tế là
     **IndexedDB** trong thư mục `app/components/offlineQueue/` (M58 PR2, 3 loại op: tick/photo/diary).
   - "API GET **network-first**" → thực tế `public/sw.js` là **stale-while-revalidate** (chính file
     sw.js dòng 1 tự ghi đúng).
3. **`docs/audit.md` §6** — bỏ chú thích lỗi thời _"(Chưa có script `test:coverage`/ngưỡng CI cứng)"_:
   script **đã có** trong `package.json` và mốc ratchet **đã đo** (87,12% lines — xem `PROGRESS.md`).
   Sửa câu đó trỏ về mốc thật.
4. **Hạ 2 tuyên bố vượt bằng chứng** — `docs/ops/release-manifest-v1.0.md` ("v1.0.0 Product
   Complete") và `docs/ops/engineering-os-manifest-v1.0.md` ("Vision Complete… Production Ready"):
   - Đổi trạng thái thành **draft/dự thảo chưa đạt gate**, thêm mục "Điều kiện chưa đạt" liệt kê:
     chưa có traffic thật từ MEPF-Agents; `0089`/`0091` chờ staging; C0→C6 chưa thi hành; UAT người
     thật chưa diễn ra.
   - Sửa số migration sai (**manifest ghi 93, thực tế 132** — xác nhận lại bằng `ls migrations | wc -l`).
   - **Không xoá file**, không đổi kết luận kỹ thuật khác — chỉ hạ nhãn trạng thái + nêu điều kiện
     còn thiếu, đúng luật spec C0 ("không đánh dấu xong chỉ dựa trên tài liệu; phải có bằng chứng
     command/CI/DB").
5. **`app/api/engineering/queue/upload/route.ts`** — route multipart **duy nhất** thiếu
   `isContentTooLarge` chặn sớm (29 route khác đều có, quy ước PR #205): thêm check header
   `content-length` ở đầu handler, bám đúng pattern route multipart khác.

### Tiêu chí chấp nhận

- `grep -n "uses:" .github/workflows/*.yml | grep -vE "[0-9a-f]{40}"` → **rỗng**.
- `CLAUDE.md` mô tả đúng IndexedDB + stale-while-revalidate.
- 2 manifest không còn tự tuyên bố "Complete"; số migration khớp thực tế.
- `npm run lint` xanh (prettier hook sẽ format lại markdown — bình thường).

---

## Thứ tự thi hành & phụ thuộc

- **Chạy song song được ngay (worktree riêng mỗi việc):** V1, V2, V5, V6, V7, V8.
- **V3 trước V4** — cả hai chạm nhiều file trong `app/api/engineering/`; V3 thêm quyền, V4 đổi
  `projectId`. Chạy tuần tự để tránh xung đột nặng; nếu coordinator thấy giao file ít thì có thể song
  song nhưng phải tích hợp V3 trước.
- **V2 tham chiếu `lib/bao-mat/otp.ts` của V1** — V2 có lối thoát ghi rõ trong brief nếu V1 chưa xong,
  **không chặn**.
- **Không việc nào được phép sửa file của việc khác.** Vướng thì dừng, ghi vào báo cáo.

## Việc reviewer

Sau khi mỗi worker báo xong, gọi `reviewer` soát diff (skill `code-review`). Ưu tiên soát kỹ V1, V2,
V3, V4 (đều là vùng rủi ro cao theo `docs/audit.md` §8). Lỗi reviewer tìm ra phải vá **trước** khi
tích hợp, không tin báo cáo worker suông.

## Báo cáo về phiên chính

Coordinator tổng hợp: việc nào xong/không xong, tiêu chí chấp nhận nào đạt/không đạt, lỗi reviewer
bắt được, migration thực tế đã dùng số nào, và mọi chỗ worker vướng đặc tả sai/thiếu (dừng việc đó,
**không tự chế đặc tả**).

## Ngoài phạm vi đợt này (GĐ2 — không thi hành)

Cổng CI `check:route-perms` + `check:project-scope`; rule lint cấm `text-white` trên nền accent sáng;
spec axe "lưới quét" ~45 route chưa phủ; coverage ratchet thành cổng CI; đóng băng module vượt gate
bằng feature flag; retention cho 2 bảng log webhook; idempotency-key cho ảnh offline; loại
`/api/tasks/version` khỏi cache SW.
