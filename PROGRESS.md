# PROGRESS — XBoss

## 2026-10-03 — a11y: Modal có tên truy cập + gỡ fixme axe 5 trang

- `Modal` (`app/components/dialogs.tsx`): `role="dialog" aria-modal` chuyển từ overlay xuống panel; có
  `aria-labelledby` tự gắn vào tiêu đề h1/h2/h3/`[data-modal-title]` đầu tiên, hoặc prop `ariaLabel`
  tường minh (drawer sidebar mobile ở `AppHeader.tsx` dùng "Menu điều hướng"). Rà mọi nơi gọi `<Modal>`:
  chỉ drawer này thiếu tiêu đề, còn lại đều đã có heading. Không đổi focus/Escape/Tab-trap/khoá scroll.
- Gỡ `test.fixme` axe bằng cách sửa trang: `/engineering/{bidding-matrix,cashflow,esign}`,
  `/mepf-process`, `/work-fronts/[floor]` (label/aria-label cho input/select, badge theo công thức Chip,
  nút `bg-*-700 text-on-accent`, chữ phụ `text-zinc-400`). `/schedule` vẫn fixme (flaky chưa rõ gốc).
- Test: `e2e/authed/modal-a11y.spec.ts` (2 modal thật), `luoi-quet-axe.spec.ts` (+4 trang assert thật,
  chi tiết tầng hết fixme). Chạy desktop + mobile: 43 passed.

## 2026-10-03 — PR #544 (thu hẹp): vá bảo mật xác thực và cách ly tổ chức

Đưa PR #544 (nháp từ 27/09, chưa từng chạy CI) lên `main` mới. Chạy thật trên PostgreSQL thì
23 ca test đỏ, review `audit-bao-mat` + `audit-logic` tìm thêm lỗi chặn merge (chi tiết:
[báo cáo audit bảo mật](docs/ops/security-audit-2026-09-27.md) mục "Review tích hợp 2026-10-03").
Theo quyết định chủ dự án 2026-10-03, **thu hẹp** PR thay vì đưa cutover membership D01 lên
ngay (merge vào main là tự deploy production).

**Giữ trong PR:** 2FA setup/confirm/disable trong transaction + `FOR UPDATE`, setup 409 khi đã bật
(gộp với trần dò mã theo tài khoản của #545, bộ đếm ngoài transaction); API key ràng buộc org lúc
cấp và lúc dùng; token traffic nội bộ HMAC tách mục đích, đích cấu hình tin cậy, cấm redirect;
`role_permissions` theo org (`migrations/0158_role_permissions_org_scope.sql`, chỉ DDL) + snapshot
quyền theo request, `CAN` từ chối khi chưa nạp snapshot; admin chỉ thấy dự án cùng tổ chức; bỏ
fallback "dự án 1" ở đường ghi (`chotProjectIdChoGhi` → 404 thống nhất ở 9 route); webhook/push
đúng tenant + chặn SSRF; tên file an toàn trong zip QC.

**Sửa thêm lúc tích hợp:** (1) chọn dự án giữ mặc định "dự án đầu trong quyền" khi cookie
thiếu/sai — bản gốc trả null mà ~86 route coi null là "không lọc" ⇒ lộ dữ liệu xuyên tổ chức;
`user_projects` rỗng toàn hệ = thấy mọi dự án **cùng tổ chức**; (2) override quyền cũ trỏ dự án
org khác bị bỏ qua + log thay vì throw (bản gốc làm mọi user của org lỗi 500); (3) ghi traffic
ở `proxy.ts` lỗi mềm — cấu hình sai không còn làm hỏng mọi `/api`; (4) báo giá thầu kiểm gói
thầu thuộc đúng dự án (trước gắn được vào gói của dự án khác nếu biết UUID); (5) log cho các
nhánh bỏ im lặng ở webhook/push. Test hồi quy mới đỏ trên code cũ: override lệch org
(`permissions-org`), gói thầu chéo dự án (`route-eng-du-bao`). Helper test
`tests/helpers/ngu-canh-quyen.ts` dựng ngữ cảnh quyền như `getCurrentUser` cho test gọi service.

**Nợ / để đợt sau (S01/S02 QUALITY-FINAL-1):** cutover "membership rỗng không mở quyền" (cần
membership dry-run production + chuyển ~86 route coi dự án null là "không lọc" — mẫu này có
từ trước PR, vẫn lộ dữ liệu cho non-admin chưa được gán khi hệ đã cấu hình gán và cho admin
của tổ chức chưa có dự án nào — cả hai có sẵn trên main); `getCurrentUser`
thêm ~5 lượt DB mỗi request (đo trước khi lên tải lớn); `cron/sync-sheets` còn `org_id ?? 1`;
`sendPushToAll` gửi mọi org. **[Người dùng]** trước deploy chạy 2 truy vấn chỉ-đọc trong báo cáo
(override lệch org, webhook delivery cũ đang chờ).

## 2026-10-03 — verifier DR chỉ-đọc, không tự migration (PR #537)

Đưa PR #537 (mở từ 25/09, CI đỏ) lên `main` mới và làm xanh. `npm run audit:verify-dr` nay
dùng connection riêng tới bản sao (`DR_VERIFY_DATABASE_URL` + `DR_VERIFY_EXPECTED_DATABASE` +
`DR_VERIFY_EXPECTED_USER`, chặn đích trùng `DATABASE_URL`/`MIGRATE_DATABASE_URL`), mọi phép
kiểm trong một transaction `REPEATABLE READ READ ONLY` rồi `ROLLBACK`, không đi qua `lib/db`
nên không bao giờ kích auto-migration; kết quả PASS/FAIL/NOT_RUN (audit rỗng là NOT_RUN, exit
≠ 0), đối chiếu migration cả thiếu lẫn thừa, output ghi rõ `completeDrVerified=false`.
`verifyAuditChain` nhận reader tuỳ chọn, caller cũ giữ nguyên. Chi tiết:
[đặc tả](docs/nang-cap/AUDIT-SMALL-DR-READONLY.md). Lúc tích hợp: format lại
`scripts/lib/dr-readonly.ts` (nguyên nhân CI static đỏ), gỡ test tạm `audit-dr-format.test.ts`
(trùng `format:check`). Không migration. **[Người dùng]:** chạy verifier cần cấp 3 biến
`DR_VERIFY_*` trỏ bản sao đã restore; phần còn lại của S14/A6 (manifest, PITR, RPO/RTO) chưa làm.

## 2026-10-01 — tích hợp ECC (Everything Claude Code) vào cấu hình agent (PR #555)

Nghiên cứu [ECC](https://github.com/affaan-m/ECC) v2.2.2 (harness phổ biến nhất cho Claude Code)
và tích hợp tối đa theo yêu cầu người dùng — quyết định + lý do + đánh đổi ở
[ADR-0013](docs/adr/0013-tich-hop-ecc.md). Điểm then chốt: phiên cloud **không nạp plugin** bật qua
`.claude/settings.json` của repo → chọn **vendor có ghim commit** thay vì cài plugin `ecc@ecc`.

- **Lớp ECC vendor** (`.claude/ecc/manifest.json` → `npm run ecc:vendor`): 24 agent, 56 skill,
  19 command, 22 rule (`common` + `typescript`/`web`/`react` theo `paths`), tiền tố `ecc-`, khoá
  sha256 (`.claude/ecc/lock.json`, `tests/ecc-vendor.test.ts`). Không vendor mã thực thi của ECC.
- **Lớp thích nghi XBoss**: `.claude/rules/00-uu-tien-ecc.md` (15 điểm ECC bị ghi đè: node:test,
  ratchet coverage, raw SQL, format API, UI token, commit tiếng Việt, cấm `npx` gói ngoài…); rules path-scoped
  `.claude/rules/xboss/` (migrations, API, UI, test, tiến độ-nghiệm thu, tài chính).
- **Hook mới (bash, có test `tests/claude-hooks.test.ts`)**: `protect-config` (deny sửa migration đã
  có trên origin/main + sửa tay vendor; ask khi sửa cấu hình cổng), `risk-zone-gate` (GateGuard cho
  vùng `docs/audit.md` §8, bản máy đọc `.claude/hooks/risk-zones.txt`), `pre-push-gate` (PROGRESS.md
  - trùng số migration — `check-progress-freshness.ts` thêm chế độ `--base`), `stop-static-checks`
    (prettier/eslint/cổng `check:*` theo file đổi trước khi dừng lượt).
- **Agent/skill XBoss**: `audit-bao-mat`/`audit-logic`/`audit-ui` (3 trụ `docs/audit.md`); `/gate`
  (`npm run gate` đọc thẳng job `static` của `ci.yml` — trước đây `/review` nhắc `/gate` nhưng chưa
  có), `/hoc`, `/ecc`. Coordinator thêm hợp đồng hoàn tất khi uỷ thác, truy hồi lặp ≤3 vòng, review
  đa góc nhìn song song; `/review` gọi audit theo file đổi; CLAUDE.md thêm "Định tuyến ECC & audit".
- Gộp với PR #554 (OpenCodeReview, ra main trong lúc PR này mở): ADR đánh số **0013** vì #554 đã
  dùng 0012; giữ cách `.gitignore`/`.prettierignore` của #554 (prettier bỏ qua `.claude/`, lớp vendor
  khoá bằng sha256); `/review` chạy lượt OCR → `code-review` → audit đa góc nhìn. Rules
  `.claude/rules/xboss/*` (nạp khi VIẾT code) bổ sung cho `.opencodereview/rules/*` (dùng khi REVIEW).

Nợ/đề xuất: CLAUDE.md 262 dòng (Claude Code khuyến nghị < 200) — có thể chuyển các mục chỉ đúng
cho một vùng file sang `.claude/rules/xboss/*`, cần người dùng duyệt. Theo dõi chi phí ngữ cảnh của
lớp ECC bằng `/ecc-context-budget`; gỡ bớt qua manifest nếu cần.

## 2026-10-01 — tích hợp OpenCodeReview: luật review AI theo đường dẫn (PR #554)

Nghiên cứu [alibaba/open-code-review](https://github.com/alibaba/open-code-review) (CLI `ocr`, ghim
`1.12.11`): OCR làm phần tất định (chọn file, gắn luật theo glob đường dẫn), LLM làm phần đọc
hiểu. Người dùng chốt: chạy cả trong Claude Code (delegation, không API key) lẫn CI (mỗi PR, chỉ
góp ý). Quyết định + ngữ nghĩa OCR đã kiểm từ mã nguồn (khớp-đầu-tiên-thắng, chữ thường, brace
không lồng; mặc định bỏ qua `*.test.ts`/`*.spec.ts` và mọi file trong `.gitignore`, không review Markdown;
trên `pull_request` action đọc luật từ merge ref của chính PR): ADR-0012.

- `docs/audit.md` §3–§8 + `TRAPS.md` đúc thành 20 mảnh checklist `.opencodereview/rules/*.md` +
  `manifest.json` 26 mục có thứ tự; `npm run gen:ocr-rules` ghép ra `.opencodereview/rule.json`
  (một mục ghép nhiều mảnh — route tài chính nhận cả checklist tài chính lẫn route API).
- `tests/ocr-rules.test.ts`: rule.json khớp bản sinh, 41 đường dẫn vùng rủi ro cao giải đúng
  mục luật (giả lập ngữ nghĩa OCR; đối chiếu `ocr rules check` thật: 41/41 khớp), đường dẫn trong
  luật còn tồn tại, phiên bản ghim khớp giữa `package.json` và workflow.
- Claude Code: lệnh `/ocr-review`; `/review` + agent `reviewer` thêm lượt luật XBoss trước
  `code-review`; `CLAUDE.md`/`docs/audit.md` trỏ tới `.opencodereview/`.
- CI `ocr-review.yml`: review mỗi PR, comment tiếng Việt, luôn xanh, tự bỏ qua khi thiếu secret.
- Review (agent `reviewer` — lần chạy thật đầu tiên của lượt luật OCR): giả lập glob khớp
  `ocr rules check` trên toàn bộ 1590 file tracked (0 lệch). Đã sửa: tài liệu ghi nhầm "action đọc
  luật từ nhánh base" (thật ra merge ref của PR); `timeout-minutes: 25` ở bước OCR để quá giờ không làm đỏ
  job; `background` chỉ còn tiêu đề (body nằm trong dấu vân tay checkpoint → mỗi lần sửa body review
  lại cả PR); `app/api/v1/payment-certs` thiếu luật tài chính + test canh mọi route import
  `@/lib/tai-chinh/` phải nhận luật đó; chuẩn hoá CRLF khi ghép mảnh; `.gitignore` thu hẹp từ cả `.claude/`
  còn `.claude/worktrees/` + `settings.local.json` (dòng cũ làm hook/`settings.json` vô hình với OCR
  và lint-staged không stage lại được file đã track trong `.claude/`; `.prettierignore` thêm
  `.claude/` để giữ hành vi định dạng cũ); `/ocr-review` + `reviewer`
  ghi rõ OCR không review Markdown nên lệnh/agent `.claude/**/*.md` phải tự soát.

**[Người dùng]** Bật CI: thêm secret `OCR_LLM_URL` (vd `https://api.anthropic.com`),
`OCR_LLM_AUTH_TOKEN`, biến `OCR_LLM_MODEL` (Settings → Secrets and variables → Actions). Không
migration, không đổi code ứng dụng.

## 2026-10-01 — audit lỗi logic & toàn vẹn dữ liệu

Baseline `3d087ae`. Rà theo `docs/audit.md` §4 + vùng rủi ro §8 (nghiệm thu, engine phê duyệt
M46, IPC, kho, import). Bộ test đầy đủ trên PostgreSQL thật xanh ở baseline (239 file, 3842 ca),
nên mọi lỗi dưới đây nằm ngoài vùng test phủ; từng lỗi được tái hiện qua route handler thật
trước khi sửa. Chi tiết, số đo và truy vấn rà dữ liệu cũ:
[audit logic](docs/ops/audit-logic-2026-10-01.md).

**Lỗi thật đã sửa:** (F1) bật flow duyệt nghiệm thu task M46 là không ai nghiệm thu được — route
mở request với người bấm là người tạo rồi tự duyệt luôn → SoD 403 + rollback mọi lượt; vai trò
bước kỹ sư/CĐT cũng bị `CAN.approve` chặn. Theo quyết định chủ dự án: `task_acceptance` miễn
SoD, có request đang chờ thì engine quyết quyền. (F2) duyệt tầng ghi đè `approval_source` của
task đã duyệt riêng → huỷ tầng hạ luôn task đó. (F5) lập được đợt IPC mới khi đợt trước còn
nháp/trình → gợi ý KL bỏ qua đợt đó, **trả trùng tiền** (60 KL ra bill 80); nay 409, khoá hợp
đồng. (F6) thêm/copy cột lưới vào task đã nghiệm thu → `nghiem_thu` với % < 1; nay 409. (F8)
import Excel đè % thấp lên task đã nghiệm thu; nay giữ nguyên + cảnh báo. Kèm mức thấp: sổ kho
`nhap_kho` ghi `qty_after` sai cột (F7), hạn bảo hành tràn cuối tháng 31/01+1 → 03/03 (F3),
`progress: null` âm thầm thành 0% (F4).

Test hồi quy mới `tests/route-nghiem-thu-flow.test.ts`, `tests/import-nghiem-thu.test.ts` + ca
thêm ở `route-nghiem-thu-bat-bien`, `route-tai-chinh`, `route-mua-sam`, `warranty`; đã gỡ tạm
bản vá để xác nhận các ca mới đỏ trên code cũ. Sau sửa: 241 file · 3858 ca pass · 0 fail
(`--release-gate`, PostgreSQL sạch); lint/typecheck/build + cổng tĩnh xanh. Không migration. **[Người dùng]:** chạy 4 truy
vấn chỉ-đọc trong tài liệu chi tiết trên production để rà dữ liệu đã hỏng trước bản vá.

Nợ ghi nhận (chưa sửa): báo cáo ngày/tuần cron cộng mọi dự án nhưng mang tên dự án đầu (cần
chốt nghiệp vụ đa dự án); deadlock hiếm ở tick lô chồng nhau; nhật ký trạng thái PO có thể ghi
trùng khi nhập kho đồng thời.

## 2026-10-01 — đóng nợ ô nhập < 16px trên điện thoại (iOS tự phóng to)

Tiếp đợt audit layout bên dưới (PR #551 đã merge). Quét tĩnh còn 444 ô `<input>/<select>/
<textarea>` < 16px ở 76 file — phần lớn trong modal/form ẩn nên lượt quét trình duyệt trước không
thấy. Thay mẫu `text-base sm:text-*` sửa từng ô bằng một quy tắc toàn cục trong `app/globals.css`:
dưới breakpoint `sm`, ô gõ/ô chọn tối thiểu 16px (ngoài `@layer` nên thắng class Tailwind; bỏ qua
ô text-lg trở lên; desktop giữ nguyên cỡ gọn). Đo bản production: mobile 85 trang, 568 ô hiện sẵn +
188 ô trong 34 modal → 0 ô < 16px; desktop `/users` vẫn 14px. `e2e/authed/input-zoom-mobile.spec.ts`
thêm 9 trang nhiều form + ca đo ô trong modal (29/29 qua cục bộ). Không migration.

## 2026-10-01 — audit layout & UI/UX khung dùng chung

Baseline `987d73e`. Rà theo `docs/audit.md` §5 (UI/UX & a11y) + phần layout §7 bằng
ground-truth: build production + PostgreSQL tạm, Playwright + axe quét 85 route tĩnh × light/
darkblue × desktop/mobile (thêm thẻ `wcag22aa`), đo riêng tràn ngang ở 360/393px. Chi tiết,
bảng phát hiện L1–L16 và báo cáo mẫu §12: [audit layout & UI/UX](docs/ops/audit-layout-uiux-2026-10-01.md).

**Lỗi thật đã sửa (khung dùng chung):** thanh hành động cố định dưới đáy che 45–61px nội dung
cuối ở 27 trang `bottomActions` (chừa chỗ bằng `body:has(.app-bottombar)`, bỏ `BottomBarSpacer`);
cả trang cuộn ngang trên điện thoại ở 13 trang (tới 842px trên màn 393px — topbar bị nút trang
đẩy tràn, chuông/tài khoản ra ngoài màn hình; `SystemFilter`/select không co; bảng báo cáo tràn
khỏi tờ giấy làm chữ 1,01:1 ở darkblue); tiêu đề hub xén cụt ở 360px; viền focus 1,8:1 ở theme
sáng (token `--focus-ring`); ô nhập dưới 16px ở component dùng chung kể cả trang đăng nhập (iOS tự
phóng to); nút "đang online" 20px; `target-size` nút sắp xếp `SpreadsheetGrid`; `aria-label` trên
`<div>` của `PageSkeleton`. Kèm: `prefers-reduced-motion` toàn cục, `Modal` trả focus khi đóng,
tab `HubShell` đi bằng phím mũi tên (bỏ tooltip hứa phím tắt Alt+N không tồn tại), tiêu đề topbar
là `<h1>` (70/85 trang trước đó không có h1).

**Cổng:** `check:ui-ux` đỏ trên `main` (27 `transition-all`) → xanh, thêm `check:ui-ux-guard`
vào CI. Spec hồi quy mới `e2e/authed/khung-layout.spec.ts`; `input-zoom-mobile` đo thêm `<select>`
và 5 trang; `/engineering` chuyển từ fixme sang assert thật trong `luoi-quet-axe`.

**Kèm vá phụ thuộc:** CI `npm audit` đỏ do advisory critical mới GHSA-vcvr-r3jv-pc5j (RCE trong
`next/og` ImageResponse, `next` 16.2.0–16.3.5 — không do đợt này, `main` cũng dính) → nâng `next` +
`eslint-config-next` lên 16.3.8 (`npm audit` 0 lỗ hổng; lint/typecheck/build + E2E khói xanh).

Nợ còn lại (các trang engineering/mepf-process đã fixme, `Modal` chưa
có `aria-labelledby`, PWA safe-area cần kiểm trên iPhone thật): xem tài liệu chi tiết. Không
migration, không thao tác production.

## 2026-09-27 — audit tấn công toàn diện + vá brute-force 2FA phân tán

Baseline `f38a10e` trên nhánh `claude/security-audit-patch-uyogfj`. Rà theo `docs/audit.md`
§3 (Bảo mật) và §8 (Vùng rủi ro cao) trên toàn bộ bề mặt: lõi auth/session token
(`lib/bao-mat/auth.ts`, `session-token.ts` — HMAC 7 phần, timing-safe, thu hồi phiên qua
`session_version`), CSRF same-origin ở `proxy.ts` phủ mọi request mutating, SQLi (100% qua
placeholder `?`, cổng `check:db-params`), cách ly tenant (RLS project đã "khoá cửa" 0077, RLS
org 0080 còn nhánh chuyển tiếp có chủ đích do auth đọc `users` trước khi có org context),
đối xứng phân quyền per-handler (cổng `check:route-perms` — 383 route, xanh), API key
`/api/v1/*` (sha256 + scope + rate-limit), OIDC (openid-client verify state/nonce/PKCE,
redirect cố định), path traversal (`lib/nen/storage.ts`), SSRF webhook (chặn IP nội bộ
IPv4/IPv6/IPv4-mapped, pin IP tầng connect chống DNS rebinding, `redirect: "manual"`),
security headers/CSP (`frame-ancestors 'none'`), money math (bigint exact), `recompute.ts`
(cap 0.99, AVG trong SQL, `FOR UPDATE`). `npm audit` 0 lỗ hổng; không có `.env` bị track.
Kết luận: không có lỗ hổng Cao/Nghiêm trọng — codebase đã qua nhiều đợt audit, invariant
được cổng CI canh tự động.

**Phát hiện Trung bình đã vá:** `POST /api/auth/login/2fa` chỉ giới hạn dò mã TOTP THEO IP
(`totp|<ip>`, 10/15 phút). Vì bước 1 (mật khẩu đúng) trả pending token mà KHÔNG tính là
"đăng nhập sai", kẻ tấn công đã có mật khẩu có thể xin pending token không giới hạn rồi rải
mã đoán qua nhiều IP để né trần theo IP (TOTP window ±1 step ⇒ ~3/10^6 mỗi lần) — làm suy
yếu chính lớp 2FA khi mật khẩu đã lộ. Vá theo khuyến nghị OWASP: thêm trần THEO TÀI KHOẢN
(`totp-acct|<uid>`, 20/15 phút; uid lấy từ pending token đã ký HMAC nên không giả mạo/đặt lại
bộ đếm tài khoản khác) — chặn tổng số lần thử xuyên mọi IP. Bổ sung, tối thiểu, tái dùng
`hitRateLimit` sẵn có; đến bước này đã cần mật khẩu đúng nên không mở thêm bề mặt DoS. Có
test hồi quy trong `tests/totp.test.ts` chứng minh 429 xuyên IP (mỗi lần thử 1 IP riêng, trần
IP không bao giờ chạm).

Kiểm cục bộ: lint + typecheck (toàn dự án) xanh; `check:route-perms`/`check:project-scope`/
`check:db-params` xanh; `npm audit` sạch. Test `tests/totp.test.ts`: 13 ca unit pass, các ca
integration (gồm ca mới) skip cục bộ do thiếu `TEST_DATABASE_URL` — cần CI PostgreSQL chạy
thật trên HEAD (đã thử dựng Postgres 16 cục bộ nhưng không cấp được quyền đăng nhập DB mà
không nới lỏng `pg_hba`, nên để CI xác nhận). Không migration, không thao tác production.

## 2026-09-27 — ghi giao dịch vật tư nhất quán khi cập nhật đồng thời

Baseline `e7f4c6f7` trên `origin/main` sau PR #542. `POST /api/materials/:id/transactions`
nay khóa dòng vật tư trong transaction, lấy số dư ngay trước lần cập nhật, rồi ghi
`materials.qty_used` và `material_transactions` cùng commit/rollback. Có test hồi quy
8 request đồng thời, kiểm số dư cuối, delta mỗi giao dịch và chuỗi `qty_after`.

Kiểm cục bộ: format, lint, typecheck, check:sw-exclude, check:migrations,
check:project-scope, check:db-params và build đạt. Máy không có PostgreSQL disposable;
73 ca của file test liên quan bị skip cục bộ, cần CI PostgreSQL chạy thật trên đúng HEAD.
PR #543. Không migration hoặc thao tác production. Chưa đóng Goal DoD.

## 2026-09-27 — chặn BOQ map liên kết task khác dự án

Baseline `0cd54980` trên `origin/main`; slice hẹp theo A1-FR06 của QUALITY-FINAL-1.
`PUT /api/boq/:id/map` nay chỉ nhận task có lineage task → package → sheet → tower
cùng `project_id` với dòng BOQ đang sửa. Trường hợp task ngoài dự án trả 422 như
task không tồn tại và giữ nguyên map hợp lệ trước đó. Có test hồi quy trên DB disposable.

Kiểm cục bộ: format, lint, typecheck, check:sw-exclude, check:migrations và build đạt.
CI commit `e2e43a59` đã qua test PostgreSQL, coverage, build, static và 4/4 E2E;
PR #542 auto-merge squash vào `main` tại `e7f4c6f7`. Không migration, không thao tác production.
Slice này không đóng toàn bộ A1–A6 hay Goal DoD; các thay đổi audit cũ chưa đối chiếu với
`main` mới vẫn được giữ riêng để xử lý theo vòng tiếp theo.

## 2026-09-25 — đưa bốn bản vá nhỏ độc lập lên PR

Baseline: `381b06899b3eb5d9e1b2c99b167d51cc24419732`. Theo yêu cầu triển khai các việc
nhỏ song song và QUALITY-FINAL-1, đã chuẩn bị bốn bản vá độc lập: kiểm ID chọn dự án trước
ép kiểu; kiểm cấu trúc JSON login; no-store cho auth/me; khóa flush trước await và đánh thức
batch offline. Không thay schema, money.ts, session-token.ts, sw.js hoặc store.ts.

Bốn nhóm test chạy đồng thời bằng bốn process Node: 69 pass, 0 fail, 0 skip. Sáu mutation
đều bị test phát hiện; code sau đó đã khôi phục và chạy lại. Typecheck chỉ các test mới
với TypeScript 5.8.3 đạt; không thay cho full typecheck TypeScript của repo.
Test chạy source thật trong VM với biên Next/React/storage được giả lập. Không có test
PostgreSQL, browser, full formatter/lint/build/E2E hoặc CI của bản vá mới tại checkpoint này.
Chủ dự án yêu cầu commit và tạo PR ngày 2026-09-25. Bốn nhóm được commit riêng,
checkpoint tích hợp sau cùng trên nhánh `fix/audit-small-round2-20260925`, đích `main`.
Đã đối chiếu lại baseline, checksum của 14 file và chạy lại đủ 69 test trước commit.
Chưa merge/deploy; CI/review phải xác nhận đúng HEAD. Không sửa gate để lấy xanh.

Không đóng toàn bộ S00/A1/A2 hoặc 54 AC. Khóa flush chỉ trong cùng tab; ownership, vault,
receipt server, retry 4xx và xử lý logout/legacy còn thuộc các slice được đặc tả riêng.
HTTP no-store không xóa private cache/SW cũ. Không có thay đổi dữ liệu production.

Chi tiết và điều kiện tích hợp: [bàn giao bản vá nhỏ](docs/ops/audit-small-round2-2026-09-25.md).

## 2026-09-25 — chốt đặc tả chất lượng cao, thi hành sau

Chủ dự án yêu cầu “chốt theo phương án chất lượng cao nhất”. Bộ đặc tả
[QUALITY-FINAL-1](docs/nang-cap/AUDIT-2026-09-25/README.md) ghi quyết định D01–D09,
API/DDL, đối chiếu tĩnh nguồn trọng yếu, kế hoạch S00–S16 và 54 tiêu chí nghiệm thu.
State đặc tả: Approved for implementation; đợt này chỉ sửa tài liệu, chưa code A1–A6.
Không tự merge, deploy, chạy DB production, đổi dữ liệu/quyền người dùng hoặc mua dịch vụ.

Baseline đã xác minh: main 833691815fdc7e96bb72975d86bd6902a412b259.
PR529 đã merge b29bb9de4b8d723b273ba790065c06cc6e3719f0;
PR530 đã merge833691815fdc7e96bb72975d86bd6902a412b259.
Các ghi chú chờ merge ở các mục lịch sử bên dưới không còn là trạng thái hiện tại.

Chốt scope/index/cache quyền theo org; không cold-start allow. Vault draft mã hóa theo
resource manifest, logout giữ ciphertext; shared-safe15 phút và field-personal8 giờ chỉ
qua device approval. Money exact, quantity float có đường chuyển đổi/provenance;
IPC giữ SUM rồi round tổng và chính sách cảnh báo vượt khối lượng, không hard-cap tự đặt.
Snapshot/acknowledgement/concurrency theo đúng flow. Reporting dùng project_id thật của
payment_bills và kiểm tất cả parent, không mất khoản chưa phân loại.

Phục hồi thiết kế: PITR35 ngày, RPO5 phút/RTO60 phút; runtime production không DDL qua HTTP.
Các ngưỡng mới là target cần chứng minh, không SLA đã đo. Chưa tạo lịch backup/automation.
54 AC còn NOT_RUN cho phần chưa implementation; S00 còn inventory đầy đủ từng miền,
catalog disposable và benchmark thật. Không gọi source mapping tĩnh là audit toàn repo xong.

Chi tiết: [Approval](docs/nang-cap/AUDIT-2026-09-25/APPROVAL.md),
[Source map](docs/nang-cap/AUDIT-2026-09-25/SOURCE-MAP.md),
[Data contracts](docs/nang-cap/AUDIT-2026-09-25/DATA-CONTRACTS.md),
[Goal](docs/goals/audit-2026-09-25.md).
Kiểm CI của bản tài liệu ghi ở PR đúng HEAD; không lấy CI đợt trước thay bằng chứng bản mới.

## 2026-09-25 — audit, đợt 1: tài khoản và phạm vi dự án

Trạng thái: đã triển khai code trên nhánh sửa lỗi; chưa xác nhận phát hành production.
Nền: `a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3`.

- Bỏ seed người dùng trong HTTP login/me; helper demo chặn production.
- Thêm bootstrap admin tường minh và reset admin không in mật khẩu/không nâng quyền.
- E2E seed tài khoản riêng trước login, không trông chờ production tự tạo người dùng.
- Chi phí bắt buộc có dự án hợp lệ và transaction có project scope.
- Chọn dự án dùng chính sách đọc kiểm cả tổ chức trước khi đặt cookie.
- Bổ sung test hồi quy route/helper và test PostgreSQL bootstrap/cách ly tổ chức.

Kiểm cục bộ: 27 test route/helper pass, 0 fail, 0 skip; kiểm cú pháp TypeScript.
Năm thay đổi cố ý gây lỗi đều bị test phát hiện, sau đó đã khôi phục code.
CI tại `af7bbc8`: build, PostgreSQL, coverage và cả 4 nhóm E2E đã thành công.
Các bản sau chỉ sửa hạ tầng test: tên biến VM theo lint và kiểu ProcessEnv trong E2E setup.
Toàn bộ cổng phải qua trên HEAD mới trước merge; không lấy kết quả SHA cũ thay nghiệm thu HEAD.
Giao thức login/2FA giữ nguyên như nền, chỉ bỏ seed. Reset giữ mọi bộ đếm chống brute-force.
Không thay đổi hoặc bỏ qua cấu hình CI; không sửa dữ liệu, tài khoản hay cấu hình production.

Chi tiết, giới hạn kiểm chứng và chuyển đổi vận hành:
[Audit 2026-09-25](docs/ops/audit-2026-09-25.md).

## Lịch sử trước đợt này

Toàn bộ PROGRESS cũ (1.472.932 byte) được giữ nguyên nội dung tại
[PROGRESS-before-2026-09-25](docs/archive/PROGRESS-before-2026-09-25.md).
Git blob lưu trữ: `c5516b4dfa6e23e44f2fee3229934aa394310509`.
Đây là lưu trữ lịch sử, không đánh dấu lại các hạng mục cũ thành chưa hoàn thành.
Các liên kết tương đối trong bản lịch sử được viết theo vị trí gốc; có thể xem bản tại commit
`a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3` để giữ ngữ cảnh liên kết ban đầu.

## Những rủi ro audit vẫn mở

Cache/offline đa tài khoản và dự án; thống nhất toàn bộ helper đọc/ghi; số học tiền xuyên
SQL/JS/API; KPI portfolio và truy vấn tổng hợp; kiểm chứng restore và chuỗi nghiệm thu–thanh toán.
Không coi đợt 1 là hoàn thành toàn bộ kế hoạch cải tiến.
