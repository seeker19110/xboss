# Báo cáo audit toàn diện "nâng tầm dự án" — 2026-08-24

> Đợt audit theo `docs/audit.md` §2 mục **"Audit nâng cấp chuyên nghiệp hoá"** — 4 miền chạy song
> song (A bảo mật+logic, B UI/UX+vận hành, C hiệu năng+CI/CD, D chiến lược sản phẩm).
> Nhánh `claude/nang-tam-du-an-5yexhe` · base `5e42b8d` (khớp `origin/main`).
>
> **Đây là báo cáo, chưa sửa gì** — đúng nguyên tắc §1 "audit = ĐỌC + BÁO CÁO trước, SỬA sau".
> Mọi phát hiện mức Cao trong báo cáo này đã được **phiên chính xác minh lại độc lập** trên code
> thật (không chỉ tin báo cáo của subagent).

## Cổng tự động

| Cổng                       | Kết quả                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `npm run lint`             | ✅                                                              |
| `npm run typecheck`        | ✅                                                              |
| `npm test`                 | ✅ 1146 ca — 760 pass, **0 fail**, 386 skip (không có Postgres) |
| `npm run check:lib-layers` | ✅ 188 file, 12 miền, 8 cạnh chéo, không chu trình (ADR-0007)   |
| `npm run build`            | ✅                                                              |
| `npm audit`                | ✅ 0 vulnerabilities (mọi mức, sau `npm ci` sạch)               |
| `npm run check:dead-code`  | ✅ 1233/1233 file reachable (nhưng 532 export mồ côi)           |

> Lưu ý môi trường: lần chạy đầu đỏ toàn bộ do `node_modules` cài hỏng (thiếu symlink `.bin/next`),
> **không phải lỗi code** — đã `rm -rf node_modules && npm ci` rồi chạy lại mới ra kết quả trên.

## Kết luận một dòng

Phần **lõi nghiệp vụ cũ không hồi quy** (recompute, nghiệm thu, tài chính, vật tư, RLS, cookie,
cron, rate-limit đều còn nguyên bất biến). Toàn bộ rủi ro nghiêm trọng tập trung ở **lớp module
`engineering/*` thêm gần đây (M76–M99)** — lớp được xây nhanh, vượt cổng của chính roadmap, và
chưa từng đi qua checklist `docs/audit.md`.

---

## Phần I — Phát hiện chặn (🔴 Cao)

Cả 4 mục đều thuộc nhóm module engineering mới, đều `[AI]` tự sửa được.

### A1. Webhook Telegram công khai — không xác thực + brute-force OTP liên kết tài khoản

- **File:** `app/api/telegram/webhook/route.ts` · `lib/ky-thuat/engineering-site-bot.ts:190`
- **Xác minh:** grep toàn repo **không có** `TELEGRAM_WEBHOOK_SECRET`/`Secret-Token` nào; route
  `POST` đọc thẳng `body.message` không kiểm gì. `verifyTelegramLinkOtp` tra
  `WHERE otp_code = ? AND otp_expires_at > CURRENT_TIMESTAMP AND is_verified = false` — **có** kiểm
  hạn, nhưng **không gắn `chatId`/`userId` cụ thể**, không rate-limit, không đếm số lần sai.
- **Hệ quả:** bất kỳ ai POST lặp mã 6 số (tối đa 10⁶ lần trong cửa sổ OTP còn hạn) sẽ chiếm được
  binding Telegram của **user bất kỳ đang chờ liên kết**, giả danh kỹ sư đó; kèm spam ghi
  `telegram_bot_message_logs` không giới hạn từ nguồn công khai.
- **Sửa:** đặt `TELEGRAM_WEBHOOK_SECRET` khi `setWebhook` + so `safeEqual` header ngay đầu route
  (fail-fast khi thiếu env, cùng pattern `CRON_SECRET`); OTP gắn chatId + rate-limit qua
  `hitRateLimit` sẵn có; lưu OTP dạng hash.

### A2. Webhook Zalo công khai — ghi chéo dự án theo `projectId` client tự chọn

- **File:** `app/api/zalo/webhook/route.ts:17` · `lib/ky-thuat/engineering-zalo-copilot.ts:141`
- **Xác minh:** route không chữ ký/secret; `const projectId = Number(body.projectId || 1)` lấy
  thẳng từ body rồi dùng chính giá trị đó cho `withProjectScope` — tức **RLS bị hợp thức hoá bằng
  giá trị attacker đưa vào**. `processIncomingZaloMessage` không kiểm
  `zalo_user_bindings.is_verified`. Thêm nữa `verifyZaloLinkOtp` **SELECT `otp_expires_at` nhưng
  không bao giờ so sánh** → OTP hết hạn vẫn verify được.
- **Hệ quả:** bơm bản ghi giả "hành động hiện trường đã dispatch" vào **mọi** dự án, DoS đầy DB,
  làm bẩn dấu vết audit.
- **Sửa:** xác thực chữ ký Zalo OA; bắt buộc binding verified; `projectId` **suy từ binding**,
  không nhận từ body; thêm `AND otp_expires_at > CURRENT_TIMESTAMP` vào verify.

### A3. Module e-Sign "PKI chống chối bỏ" (M84) — ký thay được mọi bên, OTP bypass được

- **File:** `app/api/engineering/esign/sign/route.ts:11` · `lib/ky-thuat/engineering-esignature.ts:204`
- **Xác minh:** quyền ký gate bằng `CAN.viewEngineeringGraph` — đọc `lib/bao-mat/auth.ts:359` thấy
  hàm này trả true cho `admin | pm | engineer | **bch**`, tức **quyền XEM, gồm cả vai trò
  chỉ-xem** `bch`, lại dùng để gate hành vi **ký**. Cộng thêm: `signatoryId` do client chọn, không
  có ràng buộc nào giữa signatory (CĐT/TVGS/Nhà thầu) với tài khoản đang đăng nhập → 1 user ký
  được cả 3 bên; `if (signatory.otpCode && otpCode)` — chỉ kiểm OTP khi client **tự nguyện gửi**,
  bỏ trường đi là qua mặt hoàn toàn; không kiểm `status === 'ready'`.
- **Hệ quả:** "chứng thư kiểm toán chống chối bỏ" sinh ra **không có giá trị pháp lý lẫn kỹ
  thuật**. ⚠️ Nợ "ký số PAdES" đang ghi là _đã đóng_ bởi M84 — **phải mở lại**.
- **Sửa:** bảng signatories thêm `user_id` bắt buộc, chỉ cho ký signatory gắn `user.id`; OTP bắt
  buộc khi tồn tại; kiểm `status='ready'`; `projectId` qua `chotProjectIdChoGhi`.

### A4. 14 file route engineering ghi dữ liệu không kiểm quyền (vai trò chỉ-xem/subcon ghi được)

- **Xác minh (phiên chính tự đếm):** duyệt mọi file trong `app/api/engineering/` có
  `POST|PATCH|DELETE` mà **không tham chiếu `CAN.` nào** → **14 file**:
  `subcon-ai/{evaluate,recommend-shortlist}`, `bim-models/{,[id]/link-wbs,[id]/simulate-4d}`,
  `god-tier/{bcf/topics,point-cloud,ai-diagnose,clashes,models,cnc-export,simulate-4d}`,
  `iot/{telemetry,alerts}`.
- **Hệ quả cụ thể:** `viewer`/`cdt` tạo/ghi đè mô hình BIM và gắn `wbs_task_id`; POST
  `iot/telemetry` giả số đo → **tự sinh cảnh báo an toàn HSE CRITICAL thật**; PATCH `iot/alerts`
  ack tắt cảnh báo an toàn; POST `subcon-ai/evaluate` — **thầu phụ tự chấm điểm tín nhiệm của
  chính mình** với metrics tự khai từ body (`onTimeRate ?? 90`).
- **Sửa:** áp cặp `viewEngineering*`/`manageEngineering*` (pattern có sẵn `lib/bao-mat/auth.ts:340-379`);
  metrics subcon-ai phải tính từ dữ liệu hệ thống (BBNT/NCR/HSE thật), không nhận từ body.

---

## Phần II — Phát hiện quan trọng (🟡 Trung)

| #   | Phát hiện                                                                                                                                                                                                            | File                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| B1  | **~15 route engineering nhận `projectId` từ body** thay vì phiên (`Number(body.projectId \|\| user.projectId \|\| 1)` — `user.projectId` không tồn tại) → ghi chéo dự án                                             | `engineering/{bidding,fidic/claims,routing/sleeves,spatial,logistics,esign,cashflow,hse-vision}` |
| B2  | **Bot hiện trường trả lời GIẢ**: "Hệ thống đã đồng bộ vào WBS", "Đã tạo Phiếu NCR", tồn kho **bịa cứng** ("450 đơn vị", "180 đơn vị tại Kho Tổng A") — thực tế chỉ ghi log, không đụng `tasks`/`ncrs`/`materials`    | `engineering-site-bot.ts:265,280` · `engineering-zalo-copilot.ts:185`                            |
| B3  | **Smart IPC (M94)**: 4 "cổng thẩm định giải ngân" tự khai từ body (default pass hết), tiền tính `parseFloat` + `Math.round` trên **float JS** (trái M45), số tài khoản ngân hàng **hardcode**                        | `engineering/smart-ipc/route.ts:51` · `engineering-smart-ipc.ts:47`                              |
| B4  | **Client nuốt im lặng 409/413** của `parse-dxf` — chỉ xử lý `res.ok` và `401`; bản vá chống-nhầm-bản-vẽ (409 kèm danh sách ứng viên) và giới hạn 150MB (413) **không tới được người dùng**, spinner tắt không báo gì | `chuan-hoa-ban-ve/hooks/useCadSource.ts:157-175`                                                 |
| B5  | **57 file** dùng `text-white` trên `bg-{emerald,sky,amber,green,teal,cyan}-600` — nhóm **FAIL** theo bảng §13.3 (emerald-600 = 3,77:1), gồm cả **`ErrorState.tsx` nút "Thử lại" dùng chung toàn app**                | `app/components/ErrorState.tsx:24` + 56 file khác                                                |
| B6  | **Toast báo LỖI hiển thị style THÀNH CÔNG** — `showToast` mặc định `kind = "success"`, ~10 chỗ trong hooks CAD gọi báo lỗi không truyền kind → nền xanh + icon ✓ cho thông điệp lỗi                                  | `Toast.tsx:18` · `useSmartNaming.ts` · `useCadSource.ts:220`                                     |
| B7  | **~35 trang `app/engineering/*` + hub `site`/`commercial` chưa có spec axe nào** — trùng đúng nơi tập trung vi phạm màu ở B5 (không ngẫu nhiên: chưa có trọng tài)                                                   | `e2e/authed/`                                                                                    |
| B8  | **`pr-policy.yml` dùng tag nổi `actions/github-script@v9`** thay vì pin SHA — dòng `uses:` duy nhất toàn repo lọt lưới (nghi do Dependabot PR #362 merge 2026-08-23)                                                 | `.github/workflows/pr-policy.yml:16`                                                             |
| B9  | **OTP liên kết**: bản ghi binding trùng lặp (`ON CONFLICT (id)` trên UUID tự sinh → không bao giờ conflict), OTP lưu plaintext                                                                                       | `engineering-zalo-copilot.ts:111` · `engineering-site-bot.ts:151`                                |

## Phần III — Phát hiện nhỏ (🟢 Thấp)

- `POST /api/engineering/bim-models` — chèn element **từng dòng trong vòng lặp, không transaction,
  không cap số lượng** (mô hình BIM thật hàng chục nghìn phần tử → hàng nghìn round-trip + model mồ
  côi nếu fail giữa chừng).
- `POST /api/engineering/queue/upload` — route multipart **duy nhất** thiếu `isContentTooLarge`
  chặn sớm (29 route khác đều có, quy ước PR #205).
- IoT alerts **không dedup** — mỗi reading vượt ngưỡng chèn 1 alert mới (thiết bị đo mỗi phút →
  hàng nghìn alert trùng), trái quy ước partial unique index của dự án.
- 2 `catch {}` **rỗng** nuốt lỗi (`save-drawing/route.ts:178,184`) — 2 catch rỗng duy nhất trong
  `lib/` + `app/api/`.
- Retry **ảnh** offline không idempotent (POST, khác `tick`/`diary_note` đã idempotent) → mạng rớt
  sau khi server đã lưu = ảnh trùng.
- SW stale-while-revalidate phủ cả `/api/tasks/version` → fallback poll trễ thêm 1 chu kỳ (10–20s
  thay vì 10s). _(CACHE v13 không cần bump — `git diff public/sw.js` = 0 dòng, không phải lỗi.)_
- Vùng chạm nút icon CAD Studio ~26px (< 40px §5), dùng `title` thay `aria-label`.
- Doc drift: `CLAUDE.md` mục Offline nói "localStorage `offlineQueue.ts`" + "network-first" — thực
  tế **IndexedDB** `offlineQueue/` (M58 PR2) + **stale-while-revalidate**. Agent/PR sau đọc sẽ
  thiết kế sai giả định cache.
- Doc drift: `docs/audit.md` §6 vẫn ghi "(chưa có script `test:coverage`)" — script đã có và đã đo
  mốc (87,12% lines).
- `lighthouse-ci.yml` chạy `npx --yes @lhci/cli@0.15.x` — dải version nổi tải lúc runtime, ngoài
  tầm lockfile/`npm audit`/Dependabot.

---

## Phần IV — Vấn đề nền tảng: tuyên bố vượt bằng chứng

Miền D phát hiện mâu thuẫn **nghiêm trọng hơn mọi bug đơn lẻ ở trên**:

- `docs/ops/release-manifest-v1.0.md` tuyên bố **"v1.0.0 Product Complete"** và
  `docs/ops/engineering-os-manifest-v1.0.md` tuyên bố **"Vision Complete (OS-1→OS-5), Production
  Ready"** — trong khi `PROGRESS.md` ghi rõ: **chưa có traffic thật nào từ MEPF-Agents**, migration
  `0089`/`0091` **còn chờ staging**, roadmap C0→C6 **"chờ duyệt, chưa code"**, UAT người thật chưa
  diễn ra.
- Manifest ghi "93 migration" — thực tế **132**. Chính manifest đã trôi.
- Spec C0 tự đặt luật: _"Không đánh dấu nợ 'đã xong' chỉ dựa trên tài liệu; phải có bằng chứng
  command/CI/DB"_ — hai manifest trên vi phạm đúng luật đó.
- Code OS-phase **đã viết vượt gate**: `app/engineering/{autonomy,twin,predictions,graph}` +
  M65–M96 (`god-tier-studio`, `quantum-hub`, `swarm`, `nextgen-apex`…) tới
  `migrations/0129_god_tier_cad_bim_apex_integration.sql`. Riêng `/engineering/autonomy` tồn tại dù
  OS-4 đòi **phê duyệt riêng từng workflow A3+** từ người dùng.

Và Phần I ở trên chính là **hoá đơn** của việc đó: 4 lỗ hổng Cao đều nằm gọn trong lớp module được
xây vượt gate, chưa từng qua checklist audit.

> **Khoảng cách lớn nhất của XBoss hiện tại không phải thiếu tính năng — mà là thừa tuyên bố và
> thiếu kiểm chứng.** "Nâng tầm" đúng nghĩa lúc này là **hợp nhất – kiểm chứng – vận hành thật**
> những gì đã xây, không phải xây thêm tầng mới.

---

## Phần V — Lộ trình nâng tầm đề xuất

### Đợt 1 — "Bịt lỗ + nói thật" (cỡ S–M, ưu tiên cao nhất, code được ngay)

| Việc                                                                                | Route đề xuất             |
| ----------------------------------------------------------------------------------- | ------------------------- |
| Vá 4 lỗ hổng Cao (A1–A4): webhook Telegram/Zalo, e-Sign, 14 route thiếu quyền       | `complex` / `spec`        |
| `projectId` phải từ phiên cho ~15 route engineering (B1)                            | `spec`                    |
| Bot không được trả dữ liệu bịa (B2) — wire thật hoặc đổi thông điệp + cờ thử nghiệm | cần người dùng chốt hướng |
| Hạ 2 manifest "Complete" về đúng trạng thái có bằng chứng                           | `mechanical`              |
| Đóng băng module vượt gate bằng feature flag (hạ tầng có sẵn)                       | cần người dùng chốt       |
| Doc drift: `CLAUDE.md` offline, `docs/audit.md` §6, pin SHA `pr-policy.yml`         | `mechanical`              |

### Đợt 2 — "Cổng máy thay checklist người" (cỡ S–M, chặn tái phát)

Lớp lỗi "route mới quên kiểm quyền" đã lặp ≥3 đợt audit và lần này lặp thêm 14 file; lớp
"`text-white` trên nền sáng" lặp lần ≥3 (54b3e03 → ee8fce1 → 57 file còn sót). **Checklist con
người không giữ nổi tốc độ thêm module hiện tại** → biến chúng thành cổng CI:

1. `check:route-perms` — mọi handler ghi trong `app/api/**` phải tham chiếu `CAN.*`/`canTouchTask` (allowlist có lý do).
2. `check:project-scope` — cấm `body.projectId` trừ khi qua `chotProjectIdChoGhi`.
3. Rule lint cấm `text-white` cùng `bg-{accent}-500/600` (whitelist nhóm PASS).
4. Spec axe "lưới quét" tham số hoá phủ ~45 route còn thiếu (B7).
5. Coverage ratchet thành cổng CI mềm (script + mốc 87,12% đã có).
6. Khung xác thực webhook inbound dùng chung + chuẩn hoá OTP dùng chung (3 chỗ tự chế, 3 kiểu lỗi khác nhau).

### Đợt 3 — "Chạy thật" (cỡ M–L, cần ops/người dùng)

Dựng staging → chạy `0089`/`0091`/`0092` → production; backfill ngày Excel + đối soát counts/dates/
progress với file AVIO gốc; restore drill có evidence; load harness theo SLO C4; bật `SENTRY_DSN`;
hoàn tất OpenAPI ENG-5; rồi mới tới UAT 7 vai trò → tag `v1.0.0` **thật**.

### KHÔNG nên làm bây giờ

1. **Không viết thêm module `engineering/*`/OS-phase nào** — ngược nguyên tắc #10 (ENG-0) và #7
   (roadmap); chưa có 1 request thật nào từ MEPF-Agents; A3+ đòi phê duyệt tường minh.
2. **Không làm C2 pilot** — chặn cứng bởi repo MEPF-Agents + owner phía họ.
3. **Không thêm hạ tầng mới** (graph/vector DB, event bus, ORM) — ngược ADR-0001/0002/0007; Postgres
   chưa hề bị tải thật thách thức (`EXPLAIN` 25k task ~14ms).
4. **Không nâng major deps M60** (TS 7, ESLint 10, Node 26) — hoãn có chủ đích, điều kiện chưa đạt.
5. **Không bật SSO OIDC production** — chờ xác minh tay với IdP thật.
6. **Không tuyên bố thêm mốc "Complete" nào bằng tài liệu** trước khi có bằng chứng CI/DB/UAT.

---

## Phân loại việc

- **[AI] tự làm được:** toàn bộ Phần I, II, III + đợt 1 và đợt 2 của lộ trình.
- **[Người dùng] cần quyết định:** số phận nhóm module M65–M96 (đóng băng bằng flag / gỡ / hoàn
  thiện thật); hướng xử lý bot hiện trường (wire thật vs đánh dấu thử nghiệm); có mở đợt sửa ngay
  hay không.
- **[Người dùng] cần thao tác ngoài code:** cấp `SENTRY_DSN`, dựng staging + chạy migration đụng dữ
  liệu, quyền VPS (RAM/swap), runner Windows có license AutoCAD 2026 cho M99 PR3.

**KẾT LUẬN: Cần xử lý** — 4 phát hiện Cao chưa vá, tất cả nằm trong lớp module engineering mới.
Phần lõi nghiệp vụ (tiến độ/nghiệm thu/tài chính/vật tư/RLS) **không hồi quy**.
