# PLAN.md — mẫu kế hoạch của phiên chính (opusplan · Fable 5)

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, rồi giao **nguyên văn** cho
> `coordinator` (Opus · low) thi hành — coordinator dispatch từng việc theo nhãn `route:`
> (khớp bảng định tuyến trong `CLAUDE.md` mục **Lập kế hoạch → điều phối → thi hành**),
> theo dõi, gọi reviewer, tích hợp và báo cáo lại; phiên chính duyệt cuối.
> **Luật cứng:** việc nào chưa có đặc tả chi tiết → KHÔNG ghi vào kế hoạch với đặc tả
> tự chế; dừng lại, hỏi người dùng bằng `AskUserQuestion`, chốt xong mới lập kế hoạch.
> Kế hoạch phải tự chứa — coordinator và worker không thấy hội thoại của phiên chính.
>
> **⚠ Trước khi giao số migration mới cho bất kỳ việc nào: `ls migrations | sort -V |
> tail -5` để lấy số thật mới nhất — ĐỪNG suy đoán/copy số từ kế hoạch cũ.** Hiện tại
> (lúc lập kế hoạch này) `main` dừng ở `0074`, nhưng có **PR draft đang mở** dùng
> `0075`/`0076` (task_photos_hash, session_version — xem mục "Đã rà trước" bên dưới) —
> số kế tiếp thật sự lúc code có thể đã là `0075`/`0076`/`0077`... tuỳ PR nào merge
> trước. Việc duy nhất trong kế hoạch này cần migration mới (việc 8, có điều kiện) phải
> tự kiểm lại đúng lúc code, không hardcode số từ file này.

---

## Kế hoạch: Đóng nợ kỹ thuật còn mở trong `PROGRESS.md` (2026-07-19, đợt hẹn 3h45)

### Bối cảnh & mục tiêu

Người dùng yêu cầu xử lý **toàn bộ** nợ kỹ thuật còn mở trong mục "Nợ kỹ thuật" của
`PROGRESS.md`, chấp thuận trước toàn bộ theo khuyến nghị của Claude — không cần hỏi lại.

**Đã rà trước khi lập kế hoạch này (LUẬT bắt buộc):** `git fetch origin` xong,
`origin/main` = `c5e76e6` = HEAD nhánh làm việc hiện tại — đồng bộ. Có **11 PR draft
đang mở song song** từ một phiên khác (#275–#285, cùng base `c5e76e6`, tất cả đang chờ
CI) thuộc đợt "nâng cấp chuyên nghiệp hoá V1–V9" + M58 PR3 + M59 PR1. Các PR này đã
**đóng sẵn** các mục nợ sau — **KHÔNG lặp lại trong kế hoạch này**:

- #278 (V4): `deploy.yml` chuyển gate `workflow_run` → đóng nợ dòng 972 (deploy gate).
- #281 (V7): thêm spec axe cho 14 trang (bao trùm cả 5 trang liệt kê ở dòng 978).
- #282 (V8): `npm run test:coverage` + mốc baseline → đóng nợ dòng 979 (coverage).

Coordinator **không cần** đụng vào các PR #275–#285 — để nguyên, không rebase, không sửa,
không chờ CI của chúng. Nếu khi tích hợp việc trong kế hoạch này phát sinh xung đột file
với 1 trong các PR đó (không nên xảy ra — đã kiểm không trùng file), dừng việc đó lại và
báo cáo (không tự ý resolve theo hướng đoán).

**Việc ngoài phạm vi kế hoạch này (không giao ai — lý do ghi rõ):**

- Dòng 936: Ký số PAdES/USB token/HSM — ngoài khả năng web app thuần, chờ nhu cầu pháp lý.
- Dòng 942: Sentry `SENTRY_DSN` production — thao tác vận hành của người dùng, không phải code.
- Dòng 971 (M62 **PR2** — migration "khoá cửa" RLS): có điều kiện tiên quyết
  `[Người dùng]` phải đổi `DATABASE_URL` production sang role `xboss_app` (NOBYPASSRLS)
  + theo dõi log sạch ~1 tuần **trước khi** làm PR2. Không thể thực hiện trong đợt này.
  Chỉ làm **PR1** của M62 (xem việc 7 dưới).

Không có việc nào trong kế hoạch này chắc chắn cần migration mới, trừ việc 8 (có điều
kiện, chỉ khi số đo thật cho thấy cần index) — xem cảnh báo số migration ở đầu file.

### Việc

#### 1. Sửa comment sai số trong `migrations/0072_material_tx_idempotency.sql`

- `route:` `mechanical`
- agent: `mechanical-worker`
- nhánh: `claude/debt-fix-0072-comment` (base `origin/main`)
- đặc tả: dòng 1 của `migrations/0072_material_tx_idempotency.sql` hiện ghi nhầm tên file
  `0071_material_tx_idempotency.sql` (sự cố đổi số 0071→0072 ngày 2026-07-18 chưa cập
  nhật comment). Sửa thành đúng `0072_material_tx_idempotency.sql`. Chỉ sửa 1 dòng
  comment, không đổi nội dung SQL.
- tiêu chí chấp nhận: comment header khớp đúng tên file thật; không đổi hành vi migration
  (idempotent như cũ); `npm run db:migrate -- --dry-run` không báo lỗi.

#### 2. Doc drift `CLAUDE.md:54` — số file test cứng đã lỗi thời

- `route:` `mechanical`
- agent: `mechanical-worker`
- nhánh: `claude/debt-fix-claudemd-testcount` (base `origin/main`)
- đặc tả: dòng 54 `CLAUDE.md` hiện ghi `npm test # node:test qua tsx — 46 file trong
  tests/` — con số 46 đã lỗi thời (thực tế 105 file lúc viết mục nợ này, sẽ còn tăng
  tiếp qua các PR khác đang mở song song). Sửa thành diễn đạt **không hardcode số tuyệt
  đối** (tự lỗi thời theo thời gian) — đổi thành: `npm test             # node:test qua
  tsx — toàn bộ file *.test.ts trong tests/`.
- tiêu chí chấp nhận: dòng 54 không còn số file cứng; không sửa gì khác trong file.

#### 3. `vercel.json` bổ sung 4 cron còn thiếu

- `route:` `mechanical`
- agent: `mechanical-worker`
- nhánh: `claude/debt-fix-vercel-crons` (base `origin/main`)
- đặc tả: `vercel.json` hiện chỉ khai 2/6 cron job (`daily-report`, `deliver-webhooks`).
  Bổ sung đúng 4 cron còn thiếu, lịch chạy đã chốt sẵn (khớp comment trong từng route +
  `DEPLOY.md`/`CLAUDE.md`, không tự suy đoán):
  - `/api/cron/sync-sheets` — `"0 * * * *"` (mỗi giờ, đúng ví dụ crontab trong `DEPLOY.md` dòng 238).
  - `/api/cron/refresh-views` — `"*/15 * * * *"` (mỗi 15 phút, đúng comment trong
    `app/api/cron/refresh-views/route.ts` dòng 11).
  - `/api/cron/sync-integrations` — `"0 * * * *"` (mỗi giờ, cùng nhịp `sync-sheets` —
    chưa có lịch riêng nào được ghi trong tài liệu, chọn cùng nhịp vì cùng tính chất
    đồng bộ dữ liệu ngoài).
  - `/api/cron/weekly-report` — `"0 1 * * 1"` (sáng thứ Hai, đúng mô tả trong
    `CLAUDE.md` mục Dashboard & báo cáo "gọi bởi cron sáng thứ Hai", cùng giờ với
    `daily-report` 1h sáng cho nhất quán).
  Giữ nguyên 2 cron đã có, chỉ thêm object mới vào mảng `crons`.
- tiêu chí chấp nhận: `vercel.json` có đủ 6 cron; JSON hợp lệ (`node -e
  "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` không lỗi); không sửa
  file khác.

#### 4. `requireApiKey` — rate-limit khi API key sai/không hợp lệ

- `route:` `standard`
- agent: `standard-worker`
- nhánh: `claude/debt-fix-apikey-ratelimit` (base `origin/main`)
- đặc tả:

  **Bối cảnh:** `lib/api-keys.ts::requireApiKey()` (dòng 48-72) hiện chỉ rate-limit
  **sau khi** key đã verify thành công (`hitRateLimit(\`api:${auth.keyId}\`, 120, 1)`
  dòng 60) — nhánh key sai/thiếu (dòng 52-54, trả 401 ngay) hoàn toàn không bị giới
  hạn, cho phép brute-force dò key không giới hạn số lần (rủi ro DoS nhẹ, không rò dữ
  liệu vì hash so khớp UNIQUE, nhưng nên vá theo đúng khuyến nghị).

  **Cách vá** (tái dùng nguyên `hitRateLimit` từ `lib/ratelimit.ts` — pattern đã dùng ở
  dòng 60 cùng file, KHÔNG viết cơ chế mới):

  1. Thêm hàm `clientIp(req: NextRequest): string` cục bộ trong `lib/api-keys.ts` —
     copy nguyên logic đã có ở `app/api/auth/login/route.ts` dòng 19-23 (đọc
     `x-forwarded-for` lấy phần tử đầu, fallback `x-real-ip`, fallback `"unknown"`).
     Đây là pattern đã lặp lại 3 lần trong codebase (`login/route.ts`,
     `login/2fa/route.ts`, `oidc/callback/route.ts`) — copy tiếp là đúng quy ước hiện
     tại của dự án, không tái cấu trúc thành helper dùng chung (ngoài phạm vi việc này).
  2. Trong `requireApiKey()`, **trước** dòng `const auth = await verifyApiKey(...)`:
     gọi `hitRateLimit(\`apikey-fail:${clientIp(req)}\`, 30, 15)` (30 lần thử sai/15
     phút/IP — cùng độ lớn với rate-limit login `MAX_PER_IP=20/15 phút` nhưng nới hơn
     một chút vì đây là API key cho tích hợp máy-máy, không phải form người dùng gõ
     tay) — nếu đã vượt, trả ngay `429` kèm `Retry-After: 900` và **KHÔNG gọi
     `verifyApiKey`** (chặn sớm, tiết kiệm round-trip DB tra key).
  3. Chỉ đếm khi **thực sự sai** — nếu `verifyApiKey` trả về hợp lệ (`auth` khác
     `null`), không cần làm gì thêm (đã đếm ở bước 2 trước khi biết đúng/sai — chấp
     nhận đếm cả request hợp lệ vào cùng bộ đếm IP, vì mục tiêu là giới hạn tốc độ gọi
     endpoint xác thực theo IP, không phải phân biệt đúng/sai như rate-limit login).
     **KHÔNG** làm phức tạp thêm bằng cách chỉ đếm khi sai (đặc tả `hitRateLimit` là
     đếm-trước-chặn-sau, đã có tiền lệ dùng y hệt cho `api:${keyId}` ở dòng 60 — giữ
     nhất quán).
  4. Thông điệp lỗi tiếng Việt, theo đúng format các lỗi khác trong file: `{ error:
     "Vượt giới hạn thử API key (30 lần/15 phút theo IP)" }`.

- test: thêm ca trong `tests/api-keys.test.ts` nếu file đã tồn tại (kiểm bằng
  `ls tests/api-keys.test.ts`), nếu chưa có thì tạo mới theo mẫu test tích hợp DB thật
  (import `tests/setup.ts` đầu tiên) — gọi `requireApiKey` liên tiếp >30 lần với key rác
  trong 1 IP giả lập (`headers: { "x-forwarded-for": "1.2.3.4" }`), xác nhận từ lần thứ
  31 trả `Response` với `status === 429`.
- tiêu chí chấp nhận: gọi route `/api/v1/*` bất kỳ với `Authorization: Bearer` sai liên
  tục >30 lần/15 phút từ cùng IP → nhận `429`; request hợp lệ từ IP khác không bị ảnh
  hưởng; `npm run lint`/`typecheck`/`test`/`build` xanh.

#### 5. Chuẩn hoá cộng/nhân tiền qua `lib/money.ts` — 3 điểm chạm

- `route:` `spec`
- agent: `spec-executor`
- nhánh: `claude/debt-fix-money-float` (base `origin/main`)
- đặc tả:

  **Bối cảnh:** CLAUDE.md mục Quy ước/Tiền tệ cấm cộng/nhân tiền trên JS float trực
  tiếp — khi buộc phải tính tiếp ở JS, phải đưa qua `lib/money.ts`
  (`parseMoney`/`addMoney`/`moneyToNumber`, số học bigint đơn vị đồng×100). 3 điểm chạm
  hiện dùng `reduce`/`+` JS thô trên giá trị tiền đã lấy từ SQL (qua `listContracts()`/
  `costSummary()` — các hàm này trả `number` do parser NUMERIC dùng `parseFloat`, xem
  `lib/db/index.ts`). Tác động thực tế thấp (VND nguyên, tổng dự án < 2^53 nên double
  vẫn chính xác) — đây là nợ chuẩn hoá theo quy ước, KHÔNG phải sửa lỗi tính sai. Vá cả
  3 điểm theo đúng mẫu dưới, KHÔNG động vào SQL/kiểu trả về của `listContracts`/
  `costSummary` (đó là thay đổi lớn hơn, ngoài phạm vi việc `[Thấp]` này).

  **Mẫu chuyển đổi chung**: thay `a.reduce((s, c) => s + X, 0)` bằng:
  ```ts
  import { parseMoney, addMoney, moneyToNumber } from "@/lib/money";
  // ...
  const total = moneyToNumber(addMoney(...a.map((c) => parseMoney(X))));
  ```
  `parseMoney` nhận cả `number` lẫn `string` — với giá trị đã là JS `number` (trường hợp
  của cả 3 điểm chạm dưới), gọi thẳng `parseMoney(n)` (không cần ép `.toString()`).

  **1. `lib/finance.ts::receivables()` (dòng 39-42):**
  ```ts
  export async function receivables(projectId: number): Promise<number> {
    const contracts = await listContracts("nhan_thau", projectId);
    return moneyToNumber(
      addMoney(...contracts.map((c) => parseMoney(c.value + c.addendaTotal - c.paid))),
    );
  }
  ```
  Giữ nguyên phép trừ trong `c.value + c.addendaTotal - c.paid` trước khi đưa vào
  `parseMoney` từng dòng hợp đồng (không tách 3 mảng `addMoney` riêng — đơn giản hơn,
  đúng ngữ nghĩa "mỗi hợp đồng 1 giá trị net rồi cộng dồn").

  **2. `lib/finance.ts::payables()` (dòng 47-62):** áp dụng đúng mẫu cho vòng `for`
  hiện có — thay `total += c.value + c.addendaTotal - c.paid` bằng gom vào mảng rồi
  `addMoney` 1 lần cuối (cùng cách làm với `receivables`), và `total += Number(poRow?.total
  ?? 0)` (dòng PO) cộng thêm vào **sau khi** đã quy đổi phần hợp đồng qua `moneyToNumber`
  — dòng PO đã là kết quả `SUM` thật trong SQL (đúng quy ước sẵn), không cần qua
  `lib/money.ts` lần nữa, chỉ cộng thường ở bước cuối.

  **3. `lib/cost.ts::costTotals()` (dòng 176-189):** thay `reduce` gộp 3 trường
  (`budget`/`committed`/`actual`) bằng 3 lần `addMoney`/`moneyToNumber` riêng (mỗi
  trường 1 mảng từ `rows.map(r => parseMoney(r.budget))` v.v.), giữ nguyên shape trả về
  `{ budget, committed, actual }`.

  **4. `lib/subcontractors.ts::subcontractorDebt()` (dòng 210-219):** thay 2 dòng
  `reduce` (`contractValue`, `paid`) bằng `moneyToNumber(addMoney(...mine.map(c =>
  parseMoney(...))))` tương ứng; `outstanding: contractValue - paid` giữ nguyên (phép
  trừ 2 số đã quy đổi về `number` — không cần qua `lib/money.ts` lần nữa vì chỉ là 1
  phép trừ đơn, không tích luỹ sai số).

- test: chạy `npm test` các file test hiện có chạm 3 hàm này (tìm bằng `grep -rl
  "receivables\|payables\|costTotals\|subcontractorDebt" tests/`) — không sửa test nào
  trừ khi số liệu kỳ vọng lệch do làm tròn khác (rất khó xảy ra vì `parseMoney`/
  `addMoney`/`moneyToNumber` cho kết quả toán học giống hệt cộng float ở quy mô VND
  dự án, chỉ khác đường tính). Nếu có lệch, kiểm tra kỹ trước khi sửa expected value
  (không chỉnh test để né lỗi thật).
- tiêu chí chấp nhận: 3 hàm không còn phép `+`/`reduce` cộng dồn tiền trực tiếp trên
  JS `number` (chỉ còn phép trừ đơn `a - b` ở bước cuối, không tích luỹ); output số
  giống hệt trước khi sửa với cùng dữ liệu (so sánh qua test hiện có); `npm run
  lint`/`typecheck`/`test`/`build` xanh.

#### 6. M63 — chống SSRF DNS rebinding cho webhook (pin IP lúc gửi)

- `route:` `spec`
- agent: `spec-executor`
- nhánh: `claude/debt-fix-m63-webhook-ssrf` (base `origin/main`)
- đặc tả: **đọc nguyên văn `docs/nang-cap/M63-webhook-ssrf-dns-pinning.md`** (đã có sẵn
  trong repo, đầy đủ chi tiết — schema/API không đổi, chỉ sửa `lib/webhooks.ts`). Thi
  hành đúng theo mục "Điểm chạm code" + "Test" + "Tiêu chí chấp nhận" trong file đó,
  KHÔNG tự quyết định khác đi (mọi đánh đổi đã chốt sẵn trong mục "Quyết định thiết kế"
  của tài liệu — không thêm allowlist domain, không đổi `validateWebhookUrl`, dùng
  `Agent` từ `undici` tạo module-level).
- reviewer **bắt buộc** soát diff kỹ (`lib/webhooks.ts` là hạ tầng gửi dữ liệu ra ngoài,
  đúng khuyến nghị cuối tài liệu M63).
- tiêu chí chấp nhận: theo đúng mục "Tiêu chí chấp nhận" trong
  `docs/nang-cap/M63-webhook-ssrf-dns-pinning.md`.

#### 7. M62 PR1 — `withProjectScope` đọc-ghi cho 3 route RLS còn thiếu

- `route:` `spec`
- agent: `spec-executor`
- nhánh: `claude/debt-fix-m62-pr1-withprojectscope` (base `origin/main`)
- đặc tả: **đọc nguyên văn `docs/nang-cap/M62-rls-khoa-cua.md` — CHỈ làm mục "PR1"**
  (mở rộng `withProjectScope` với `opts.readOnly`, bọc `app/api/notifications/route.ts`
  GET + `app/api/payments/bills/route.ts` GET + `app/api/payments/floors/route.ts`
  GET). **TUYỆT ĐỐI KHÔNG làm "PR2"** (migration "khoá cửa" bỏ nhánh thiếu-ngữ-cảnh) —
  PR2 có điều kiện tiên quyết `[Người dùng]` đổi role DB production + theo dõi log 1
  tuần, chưa hội đủ điều kiện. Thi hành đúng theo mục "PR1" + "Test PR1" + "Tiêu chí
  chấp nhận PR1" trong tài liệu, không tự quyết khác (quyết định đã chốt: bọc CẢ route
  `notifications` trong 1 transaction, không tách từng khối; `payments/bills`/
  `payments/floors` dùng `withProjectScope("*")` — khai báo tường minh cố ý xuyên dự
  án, KHÔNG đổi thành lọc theo `projectId` thật).
- reviewer **bắt buộc** soát diff kỹ (route tài chính + RLS — vùng rủi ro cao theo
  `docs/audit.md`).
- tiêu chí chấp nhận: theo đúng mục "Tiêu chí chấp nhận PR1" trong tài liệu M62. **Khi
  báo cáo, coordinator phải nói rõ: đây mới là PR1/2 của M62 — PR2 còn lại chờ người
  dùng đổi role DB production, KHÔNG được coi nợ M62 là đã đóng hẳn.**

#### 8. Đo hiệu năng `COALESCE(t.end_date, wp.end_date)` ở `/api/dashboard` + `/api/notifications`

- `route:` `standard`
- agent: `standard-worker`
- nhánh: `claude/debt-investigate-coalesce-perf` (base `origin/main`)
- đặc tả:

  **Bối cảnh:** nghi vấn hiệu năng chưa có số đo thật — biểu thức
  `COALESCE(t.end_date, wp.end_date)` xuất hiện trong `app/api/dashboard/route.ts` và
  `app/api/notifications/route.ts` (tìm bằng `grep -rn "COALESCE(t.end_date"`), có thể
  ngăn Postgres dùng index thường trên `end_date` (biểu thức không phải cột trần).
  Route này chạy on-fetch mỗi lần mở app — đáng để đo trước khi quyết định vá.

  **Việc cần làm (đúng thứ tự, KHÔNG tự sửa khi chưa có số đo):**

  1. Dựng Postgres 16 cục bộ (cluster đã có sẵn trong môi trường — kiểm bằng
     `pg_lsclusters`, `pg_ctlcluster 16 main start` nếu đang `down`), tạo DB test, chạy
     `npm run db:migrate` áp đủ schema (dùng `TEST_DATABASE_URL` trỏ vào DB test này).
  2. Sinh dữ liệu quy mô đủ lớn để thấy khác biệt thật (gợi ý: ít nhất 5.000–10.000
     dòng `tasks` trải trên nhiều `work_packages`/`sheet_types`/`towers` — có thể viết
     script tạm 1 lần hoặc dùng `INSERT ... SELECT generate_series` trực tiếp qua
     `psql`, không cần giữ lại script sau khi đo nếu chỉ dùng 1 lần, không commit script
     dùng-1-lần vào `scripts/`).
  3. Chạy `EXPLAIN ANALYZE` trực tiếp (qua `psql`) cho đúng câu SQL thật lấy từ 2 route
     trên (copy nguyên văn từ code, thay `?` bằng giá trị mẫu) — ghi lại thời gian thực
     thi, có/không dùng index, có seq scan lớn hay không.
  4. **Ra quyết định dựa trên số đo:**
     - Nếu `EXPLAIN ANALYZE` cho thấy seq scan chậm rõ rệt trên bảng lớn do biểu thức
       `COALESCE` chặn index → thêm 1 migration mới (`CREATE INDEX ... ON tasks
       (COALESCE(end_date, ...))` — cần kiểm biểu thức đúng theo từng route, có thể
       khác nhau giữa `tasks`/`work_packages`; **lấy đúng số migration kế tiếp thật lúc
       code** bằng `ls migrations | sort -V | tail -5`, không dùng số đoán từ kế hoạch
       này) và đo lại `EXPLAIN ANALYZE` xác nhận cải thiện thật (không thêm index rồi
       không verify).
     - Nếu số đo cho thấy không có vấn đề thật ở quy mô dữ liệu hợp lý (project MEP
       thực tế của XBoss — vài nghìn task, không phải triệu dòng) → **không sửa gì**,
       chỉ ghi lại số đo + kết luận vào `PROGRESS.md` để đóng nợ bằng "đã đo, không cần
       vá" (đây cũng là một kết cục hợp lệ, đúng tinh thần "không tự sửa khi chưa có số
       đo" của mục nợ).
  5. Dù kết quả là "cần vá" hay "không cần vá", đều phải **ghi rõ số đo thật** (thời
     gian `EXPLAIN ANALYZE`, số dòng dữ liệu test) vào `PROGRESS.md` khi đóng nợ — không
     kết luận suông không có bằng chứng.

- tiêu chí chấp nhận: có số đo `EXPLAIN ANALYZE` thật ghi lại trong PROGRESS.md; nếu có
  vá (thêm index) thì migration mới thuần tuý (`CREATE INDEX IF NOT EXISTS`, không đụng
  dữ liệu — được đi thẳng production theo DoD) + đo lại xác nhận cải thiện; `npm run
  lint`/`typecheck`/`test`/`build` xanh nếu có sửa code/migration.

### Điều phối

- Tất cả 8 việc **độc lập file** (không việc nào sửa chung 1 file với việc khác trong
  kế hoạch này) — coordinator có thể dispatch song song toàn bộ qua 8 worktree riêng,
  base đều `origin/main` mới nhất (`git fetch origin` trước khi tạo worktree).
- Việc 6 và việc 7 đụng vùng rủi ro cao (`docs/audit.md`) — **bắt buộc** gọi `reviewer`
  soát diff trước khi tích hợp, dù các việc khác coordinator có thể tự quyết định mức độ
  review cần thiết.
- Sau khi từng việc merge xong: cập nhật `PROGRESS.md` mục "Nợ kỹ thuật" — **gỡ đúng
  mục đã đóng ra khỏi danh sách trong CÙNG PR** (bài học đã ghi nhận ở dòng 894 — đừng
  lặp lại lỗi để sót tài liệu lệch code). Việc 7 (M62 PR1) chỉ **cập nhật mô tả** mục
  M62 (đánh dấu PR1 xong, PR2 còn chờ người dùng) — KHÔNG gỡ hẳn khỏi danh sách nợ.
- Báo cáo tổng hợp cuối cùng về phiên chính: liệt kê việc nào đã merge, việc nào còn
  vướng gì (nếu có), và nhắc lại rõ 3 mục KHÔNG thuộc phạm vi đợt này (ký số PAdES,
  Sentry production, M62 PR2) vẫn đang chờ người dùng/nhu cầu phát sinh.
