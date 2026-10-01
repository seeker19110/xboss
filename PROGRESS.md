# PROGRESS — XBoss

## 2026-10-01 — tích hợp ECC (Everything Claude Code) vào cấu hình agent (PR #555)

Nghiên cứu [ECC](https://github.com/affaan-m/ECC) v2.2.2 (harness phổ biến nhất cho Claude Code)
và tích hợp tối đa theo yêu cầu người dùng — quyết định + lý do + đánh đổi ở
[ADR-0012](docs/adr/0012-tich-hop-ecc.md). Điểm then chốt: phiên cloud **không nạp plugin** bật qua
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
- `.gitignore` đổi `.claude/` → danh sách cho phép (trước đây file mới trong `.claude/` bị bỏ qua âm
  thầm); prettier nay quét `.claude/` nên format lại các file agent/README/settings cũ.

Nợ/đề xuất: CLAUDE.md 262 dòng (Claude Code khuyến nghị < 200) — có thể chuyển các mục chỉ đúng
cho một vùng file sang `.claude/rules/xboss/*`, cần người dùng duyệt. Theo dõi chi phí ngữ cảnh của
lớp ECC bằng `/ecc-context-budget`; gỡ bớt qua manifest nếu cần.

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
