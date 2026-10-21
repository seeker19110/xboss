---
title: Blueprint dự án — backlog SHOULD/MAY
kind: blueprint-backlog
scale: L
generated: 2026-10-22
---

# Blueprint dự án — backlog SHOULD/MAY

> Sinh cùng blueprint chính bởi `xt.py compose` ngày 2026-10-22, quy mô **L** (ADR-0012). Mục ở đây không
> chặn verdict; làm khi còn ngân sách. Trạng thái như blueprint chính: `[x]` đạt kèm bằng chứng · `[~]` miễn
> trừ ghi `— Miễn: <lý do>` / `— Không áp dụng: <điều kiện>`. Đổi quy mô thì ghép lại: mục chuyển file theo ID.

| Mức    | Số mục |
| ------ | ------ |
| SHOULD | 639    |

### Cấu hình, biến môi trường và bí mật

Nguồn khung: [`01-baseline/configuration-and-secrets.md`](.xtemplates/framework/01-baseline/configuration-and-secrets.md)

- [ ] `BASE-CFG-011` **SHOULD** Cấu hình theo môi trường **không nhóm** thành bộ `development/test/production` cố định; mỗi deploy (review app, staging, prod, máy dev) tự khai biến riêng từ cùng schema. → Kiểm: không có file `config/<env>.json` chứa giá trị theo deploy; cùng image chạy ở staging và prod chỉ khác env. · Nguồn: 12-factor III, V (build/release/run)
- [ ] `BASE-CFG-012` **SHOULD** Tài liệu cấu hình sinh từ schema (bảng biến: tên, kiểu, bắt buộc, mặc định, mô tả) để không lệch; thay schema mà không cập nhật `.env.example`/docs → CI đỏ. → Kiểm: script sinh `docs/CONFIG.md` chạy trong CI, `git diff --exit-code`. · Nguồn: P5
- [ ] `BASE-CFG-014` **SHOULD** Cấu hình **hiệu lực** (effective config, đã che bí mật) được ghi log một lần lúc khởi động và/hoặc xuất qua lệnh `--print-config` để chẩn đoán. → Kiểm: log khởi động có bản ghi `config.loaded` với các khoá và nguồn (env/file/default). · Nguồn: clig.dev; P10

### Đúng dữ liệu: thời gian, tiền, đơn vị, mã hoá ký tự, ca biên

Nguồn khung: [`01-baseline/data-correctness.md`](.xtemplates/framework/01-baseline/data-correctness.md)

- [ ] `BASE-DATA-011` **SHOULD** Mỗi nhánh logic nghiệp vụ phức tạp (tính giá, phân trang, lịch, quyền) có ≥ 1 test **ca biên**: rỗng, một, nhiều, giá trị cực, off-by-one, ký tự Unicode/emoji, đồng thời. → Kiểm: review checklist + coverage nhánh; cách test ở [`../14-testing-quality/unit-and-logic-edge-cases.md`](.xtemplates/framework/14-testing-quality/unit-and-logic-edge-cases.md). · Nguồn: khung cũ `quality-supplements.md` N2 §6
- [ ] `BASE-DATA-012` **SHOULD** Độ dài chuỗi giới hạn theo **ký tự Unicode (code point/grapheme)** nơi người dùng thấy, theo **byte** nơi lưu trữ; hai giới hạn được ghi rõ (tên Nhật 4 ký tự = 12 byte UTF-8). → Kiểm: test chuỗi có emoji/tiếng Việt đạt giới hạn ký tự nhưng vượt byte được xử lý đúng (không cắt giữa ký tự). · Nguồn: W3C i18n (personal names); UAX #15
- [ ] `BASE-DATA-014` **SHOULD** Dữ liệu từ nguồn ngoài (import CSV/Excel, API đối tác, output LLM) đi qua cùng schema validate như input người dùng; lỗi từng dòng được báo cáo, không làm hỏng cả batch im lặng. → Kiểm: test import file có 1 dòng lỗi → báo cáo dòng đó, các dòng khác xử lý theo chính sách đã khai báo. · Nguồn: P6; catalog 23 §4.5 (ranh giới tin cậy với output model)

### Phụ thuộc: lockfile, cập nhật, license, lỗ hổng

Nguồn khung: [`01-baseline/dependencies.md`](.xtemplates/framework/01-baseline/dependencies.md)

- [ ] `BASE-DEP-010` **SHOULD** Phụ thuộc không dùng được **gỡ** định kỳ; dependency trùng vai (hai thư viện HTTP, hai thư viện ngày) bị cấm trừ khi có lý do. → Kiểm: `knip`/`depcheck` (JS), `deptry` (Python), `go mod tidy && git diff --exit-code`, `cargo machete` = 0 gói thừa trong CI. · Nguồn: [`../14-testing-quality/static-analysis-and-code-quality.md`](.xtemplates/framework/14-testing-quality/static-analysis-and-code-quality.md)
- [ ] `BASE-DEP-011` **SHOULD** Phụ thuộc có **kiểm tra toàn vẹn** khi cài: npm `integrity` trong lockfile, pip `--require-hashes`, `go.sum` + `GOSUMDB`, Cargo checksum; registry riêng cấu hình tường minh, không "fallback" ra public khi gói nội bộ không có (dependency confusion). → Kiểm: `.npmrc`/`pip.conf`/`GOPRIVATE` khai báo scope nội bộ; tên gói nội bộ được đăng ký giữ chỗ trên registry public hoặc dùng scope riêng. · Nguồn: pip secure installs; Go modules (`GOSUMDB`, `GOPRIVATE`)
- [ ] `BASE-DEP-012` **SHOULD** Cập nhật **major** đi PR riêng do người duyệt, có ghi chú breaking từ CHANGELOG upstream và test đầy đủ; không gom major vào nhóm tự merge. → Kiểm: cấu hình bot có `ignore: update-types: ["version-update:semver-major"]` hoặc nhóm riêng; PR major có nhãn và review. · Nguồn: Dependabot `groups`/`ignore`; catalog 23 §2.5
- [ ] `BASE-DEP-013` **SHOULD** Bản phát hành gói công khai (npm/PyPI/crates/NuGet) dùng **trusted publishing/OIDC** + 2FA bắt buộc trên tài khoản registry; token dài hạn không nằm trong CI. → Kiểm: workflow publish có `id-token: write`, không có `NPM_TOKEN`/`PYPI_TOKEN` tĩnh; cấu hình registry bật 2FA. · Nguồn: [`../12-security/supply-chain.md`](.xtemplates/framework/12-security/supply-chain.md)
- [ ] `BASE-DEP-014` **SHOULD** Có **danh sách phụ thuộc có chủ** (ít nhất SBOM sinh tự động CycloneDX/SPDX mỗi bản phát hành) để trả lời "có dùng gói X phiên bản Y không" trong vài phút khi có CVE. → Kiểm: artefact `sbom.cdx.json`/`sbom.spdx.json` kèm mỗi release (syft 1.54.x). · Nguồn: [`../12-security/supply-chain.md`](.xtemplates/framework/12-security/supply-chain.md)
- [ ] `BASE-DEP-015` **SHOULD** Cài phụ thuộc trong CI có **cache theo hash lockfile** để nhanh nhưng không bao giờ cache thay cho lockfile (cache hỏng → cài lại, không đổi kết quả). → Kiểm: `actions/cache`/`setup-*` `cache-dependency-path` trỏ lockfile; job vẫn xanh khi xoá cache. · Nguồn: [`quality-gates.md`](.xtemplates/framework/01-baseline/quality-gates.md) BASE-GATE-011

### Tài liệu tối thiểu (README · runbook · ADR · CHANGELOG)

Nguồn khung: [`01-baseline/documentation-minimum.md`](.xtemplates/framework/01-baseline/documentation-minimum.md)

- [ ] `BASE-DOC-009` **SHOULD** Tài liệu phân loại theo Diátaxis: `docs/tutorials/`, `docs/how-to/`, `docs/reference/`, `docs/explanation/` (hoặc nhãn tương đương trong mục lục); mỗi trang thuộc một loại. → Kiểm: mục lục `docs/README.md` gắn loại cho mỗi trang. · Nguồn: Diátaxis
- [ ] `BASE-DOC-010` **SHOULD** Mỗi trang tài liệu có `updated: YYYY-MM-DD` (frontmatter) và/hoặc mốc phiên bản áp dụng; trang quá 12 tháng không cập nhật được đánh dấu "cần rà". → Kiểm: script liệt kê trang có `updated` cũ hơn 365 ngày, xuất cảnh báo trong CI. · Nguồn: [`../10-workflow/documentation-workflow.md`](.xtemplates/framework/10-workflow/documentation-workflow.md)
- [ ] `BASE-DOC-011` **SHOULD** Thay đổi hành vi người dùng thấy, cấu hình, API hay lệnh vận hành phải **đi kèm cập nhật tài liệu trong cùng PR**; PR template có ô "Docs". → Kiểm: CI cảnh báo khi diff chạm `src/**/api|cli|config` mà không chạm `docs/**|README.md|CHANGELOG.md` (trừ nhãn `no-docs` có lý do). · Nguồn: Docs as Code (Write the Docs)
- [ ] `BASE-DOC-012` **SHOULD** Markdown qua lint (heading tuần tự, không link trần, code fence có ngôn ngữ) và định dạng thống nhất để máy (và agent) đọc chính xác. → Kiểm: `markdownlint-cli2 "**/*.md"` 0 lỗi trong CI. · Nguồn: catalog 16 §2 ("markdown sạch")
- [ ] `BASE-DOC-013` **SHOULD** Sơ đồ kiến trúc tối thiểu C4 mức 1 (hệ thống + người dùng + hệ ngoài) dạng text commit cùng mã. → Kiểm: `docs/architecture/*.md` có block `mermaid`/PlantUML render được trong CI. · Nguồn: lifecycle.md G4; C4 model
- [ ] `BASE-DOC-014` **SHOULD** Tài liệu không chứa bí mật, dữ liệu người dùng thật, hay thông tin nội bộ nhạy cảm (IP nội bộ, tên máy chủ) dù repo riêng tư. → Kiểm: gitleaks quét `docs/`; review checklist. · Nguồn: OWASP Logging CS (data to exclude) áp cho tài liệu
- [ ] `BASE-DOC-017` **SHOULD** Mọi con số công bố (README, ghi chú phát hành, trang giới thiệu: hiệu năng, độ chính xác, benchmark) trỏ tới **file kết quả đã commit** kèm điều kiện đo (phần cứng, phiên bản, cỡ mẫu); có test so con số trong tài liệu với file đó, lệch thì CI đỏ. → Kiểm: test kiểu `test_readme_numbers.py` chạy trong CI. · Nguồn: `seeker19110/stored` 17 §2c.2 (AnyJev: `tests/test_readme_numbers.py` kiểm bảng README khớp JSON đã commit; đọc 2026-10-16)
- [ ] `BASE-DOC-018` **SHOULD** `docs/limitations.md` (hoặc mục "Giới hạn đã biết" trong README) ghi điều sản phẩm **không làm** và khi nào số liệu hết đúng; cập nhật khi đổi hành vi. → Kiểm: file tồn tại và README link tới nó. · Nguồn: `seeker19110/stored` 17 §2c.3 (AnyJev `docs/limitations.md`), 21 §10b (`SECURITY.md` tự khai giới hạn rõ); đọc 2026-10-16

### Xử lý lỗi và ghi log có cấu trúc

Nguồn khung: [`01-baseline/errors-and-logging.md`](.xtemplates/framework/01-baseline/errors-and-logging.md)

- [ ] `BASE-ERR-012` **SHOULD** Lỗi nghiệp vụ có **mã ổn định** (enum/`type` URI) và thông điệp người dùng có thể dịch; mã không đổi khi đổi câu chữ. → Kiểm: bảng mã lỗi trong tài liệu/`errors.ts`/`errors.py`; test snapshot mã lỗi. · Nguồn: RFC 9457 §3.1
- [ ] `BASE-ERR-013` **SHOULD** Retry theo nguyên tắc của [`ARC-RES-002`](.xtemplates/framework/05-architecture/resilience-and-scalability.md) (chỉ lỗi tạm, chỉ thao tác idempotent, backoff mũ + jitter, trần số lần) áp cho **mọi loại phần mềm**, kể cả client mobile/desktop, CLI, SDK nằm ngoài phạm vi module đó; số mặc định phía dịch vụ ở `BE-REL-003`, job ở `BE-JOB-003`. → Kiểm: test: lỗi 400 không retry; lỗi 503 retry ≤ N lần rồi bỏ cuộc với lỗi tổng hợp. · Nguồn: [`ARC-RES-002`](.xtemplates/framework/05-architecture/resilience-and-scalability.md); catalog 21 §8 (outbox, `outcome_unknown`)
- [ ] `BASE-ERR-014` **SHOULD** CLI/batch: exit code 0 = thành công, ≠ 0 = thất bại, mã khác nhau cho lớp lỗi chính; thông điệp lỗi gợi ý cách sửa; kết quả ra stdout, chẩn đoán ra stderr. → Kiểm: test chạy lệnh với input sai → exit ≠ 0, stderr có gợi ý, stdout rỗng. · Nguồn: clig.dev (Errors, Output)
- [ ] `BASE-ERR-015` **SHOULD** Mức log cấu hình được qua biến môi trường (`LOG_LEVEL`) mà không build lại; mặc định prod `INFO`, dev `DEBUG`; `DEBUG` không bao giờ bật ở prod kèm payload đầy đủ. → Kiểm: khởi động với `LOG_LEVEL=debug` thấy bản ghi DEBUG; cấu hình prod ghi `INFO`. · Nguồn: 12-factor III
- [ ] `BASE-ERR-016` **SHOULD** Log có **ngân sách**: không log trong vòng lặp nóng ở mức ≥ INFO, không log payload > 1 KB mặc định, có sampling cho sự kiện lặp; disk/chi phí không bị cạn vì log. → Kiểm: test tải → tốc độ log < ngưỡng (vd 100 dòng/s/instance) ghi trong RUNBOOK. · Nguồn: OWASP Logging CS (resource exhaustion)
- [ ] `BASE-ERR-017` **SHOULD** Thời gian trong log và trong hệ thống là **UTC**; đồng hồ máy chủ đồng bộ NTP; thời gian hiển thị cho người mới đổi múi giờ. → Kiểm: mẫu log có hậu tố `Z`; chi tiết ở [`../18-cross-cutting/units-time-and-money.md`](.xtemplates/framework/18-cross-cutting/units-time-and-money.md). · Nguồn: RFC 3339

### Cổng chất lượng tối thiểu (lint · format · type · test · CI)

Nguồn khung: [`01-baseline/quality-gates.md`](.xtemplates/framework/01-baseline/quality-gates.md)

- [ ] `BASE-GATE-011` **SHOULD** Thời gian từ push đến kết quả cổng CI < 10 phút cho PR thông thường; cache phụ thuộc theo hash lockfile; job nặng (E2E, load) tách job riêng không chặn vòng lặp nhanh. → Kiểm: thời lượng job `quality` trung bình 30 ngày (`gh run list --json durationMs`) < 600 s. · Nguồn: DORA (lead time for changes)
- [ ] `BASE-GATE-012` **SHOULD** Test flaky được phát hiện (chạy lại tự động chỉ với test gắn nhãn flaky), cách ly khỏi cổng và có issue theo dõi; không dùng `retries` toàn cục để che. → Kiểm: cấu hình test runner chỉ retry theo nhãn; danh sách flaky trong repo có ngày và owner. · Nguồn: Google Testing Blog, "Flaky Tests at Google" (2016-05-27)
- [ ] `BASE-GATE-013` **SHOULD** Coverage dùng **ratchet**: không thấp hơn nhánh mặc định; file loại trừ phải ghi lý do. → Kiểm: CI so sánh `coverage.json` với baseline lưu trong repo/artefact; giảm = đỏ. · Nguồn: catalog 23 §2.5 (coverage ratchet)
- [ ] `BASE-GATE-014` **SHOULD** Kết quả cổng xuất ở định dạng máy đọc (JUnit XML, SARIF, JSON) và lưu làm artefact ≥ 30 ngày để làm bằng chứng (P1). → Kiểm: workflow có `upload-artifact` cho báo cáo test/lint; blueprint tick trỏ tới run id. · Nguồn: P1 (principles.md); evidence-and-sources.md §2
- [ ] `BASE-GATE-015` **SHOULD** Hook cục bộ tự cài sau khi clone (`prepare` script, `lefthook install` trong postinstall, hoặc hướng dẫn một dòng trong README) để cổng tầng 2 không phụ thuộc trí nhớ. → Kiểm: clone mới + cài phụ thuộc → `.git/hooks/pre-commit` tồn tại. · Nguồn: khung cũ "ba tầng phòng thủ"
- [ ] `BASE-GATE-016` **SHOULD** Cổng có **ngân sách**: lint/format/typecheck tổng < 60 s trên máy dev cho thay đổi thường (dùng cache, chỉ chạy file thay đổi ở hook). → Kiểm: đo `time` chạy hook trên commit mẫu; ghi vào README DX. · Nguồn: [`../18-cross-cutting/developer-experience.md`](.xtemplates/framework/18-cross-cutting/developer-experience.md)

### Repo, phiên bản và lịch sử thay đổi

Nguồn khung: [`01-baseline/repo-and-versioning.md`](.xtemplates/framework/01-baseline/repo-and-versioning.md)

- [ ] `BASE-REPO-010` **SHOULD** Thay đổi gây **breaking** phải xuất hiện ở ba nơi nhất quán: commit `!`/`BREAKING CHANGE:`, mục CHANGELOG, và bump MAJOR (SemVer) hoặc ghi chú deprecation (CalVer). → Kiểm: test CI so khớp: có commit `!` kể từ tag trước ⇒ phiên bản mới có MAJOR tăng. · Nguồn: Conventional Commits FAQ; SemVer 2.0.0 §8
- [ ] `BASE-REPO-011` **SHOULD** `README.md` ở gốc nêu một dòng mô tả, cách chạy, cách test, và trỏ tới `CHANGELOG.md`, `LICENSE`, tài liệu; nội dung tối thiểu theo [`documentation-minimum.md`](.xtemplates/framework/01-baseline/documentation-minimum.md). → Kiểm: script kiểm tồn tại các heading bắt buộc trong README. · Nguồn: OpenSSF Badge `documentation_basics`
- [ ] `BASE-REPO-012` **SHOULD** Commit nhỏ, một thay đổi logic mỗi commit; PR < ~400 dòng thay đổi trừ khi là sinh mã/đổi tên hàng loạt (ghi rõ trong mô tả PR). → Kiểm: CI cảnh báo khi `git diff --shortstat base..head` vượt ngưỡng đã đặt trong repo. · Nguồn: P8 (principles.md)
- [ ] `BASE-REPO-014` **SHOULD** File lớn/nhị phân (model, media, dataset) không commit thẳng; dùng Git LFS hoặc kho artefact có địa chỉ và checksum trong repo. → Kiểm: hook chặn file > ngưỡng (vd 1 MB) không thuộc `.gitattributes` `filter=lfs`; `git lfs ls-files` liệt kê file lớn. · Nguồn: Scorecard Binary-Artifacts
- [ ] `BASE-REPO-015` **SHOULD** Ghi `CODEOWNERS` (hoặc tương đương) cho vùng mã nhạy cảm (auth, thanh toán, migration, CI) để review bắt buộc đúng người. → Kiểm: file `.github/CODEOWNERS` tồn tại và hợp lệ (GitHub báo lỗi cú pháp ở tab Code owners). · Nguồn: GitHub CODEOWNERS

### Bảo mật tối thiểu cho mọi phần mềm

Nguồn khung: [`01-baseline/security-minimum.md`](.xtemplates/framework/01-baseline/security-minimum.md)

- [ ] `BASE-SEC-014` **SHOULD** SAST chạy trong CI cho **mọi loại phần mềm**, kể cả loại ngoài phạm vi appsec web (CLI, thư viện, mobile, desktop, game, nhúng): CodeQL/Semgrep hoặc analyzer ngôn ngữ (bandit, gosec, clippy, Roslyn); dịch vụ web/API theo cổng chặn merge của [`SEC-WEB-015`](.xtemplates/framework/12-security/appsec-web.md). → Kiểm: workflow SAST tồn tại, kết quả SARIF upload; 0 phát hiện mở ≥ medium sau giai đoạn baseline. · Nguồn: OpenSSF Badge `static_analysis_common_vulnerabilities`; Scorecard SAST
- [ ] `BASE-SEC-015` **SHOULD** Nội dung từ bên ngoài (web, file, email, issue, output LLM/tool) là **dữ liệu, không phải chỉ thị**; không bao giờ `eval`/`exec` chuỗi từ input; prompt không phải cơ chế bảo mật. → Kiểm: grep không có `eval(`, `new Function(`, `exec(` trên input; với hệ có AI, cổng ở [`../12-security/ai-security.md`](.xtemplates/framework/12-security/ai-security.md). · Nguồn: evidence-and-sources.md luật 13; OWASP Top 10 for LLM Applications 2026 LLM01 (xem [`../12-security/ai-security.md`](.xtemplates/framework/12-security/ai-security.md))
- [ ] `BASE-SEC-016` **SHOULD** Giới hạn tài nguyên trên mọi đầu vào: kích thước body/file, số phần tử, độ sâu JSON, thời gian xử lý, tốc độ request (rate limit) để không bị cạn tài nguyên. → Kiểm: cấu hình giới hạn tồn tại (vd body 2 MB); test gửi payload vượt ngưỡng nhận 413/429. · Nguồn: ASVS 5.0 V2, V4; catalog 23 §8.1
- [ ] `BASE-SEC-017` **SHOULD** Tải công cụ/binary trong build và CI phải khớp checksum đã ghi trong repo; cấm `curl | sh`. → Kiểm: script tải có `sha256sum -c`; grep workflow/Dockerfile không có `curl .* | (ba)?sh`. · Nguồn: catalog 12 §3d, 23 §2.5; [`../12-security/supply-chain.md`](.xtemplates/framework/12-security/supply-chain.md)
- [ ] `BASE-SEC-018` **SHOULD** Có `security.txt` tại `/.well-known/security.txt` (dịch vụ công khai) với `Contact` và `Expires` < 1 năm. → Kiểm: `curl -s https://<host>/.well-known/security.txt` trả 200, có hai trường bắt buộc. · Nguồn: RFC 9116 §2

### Tiêu chuẩn tiếp cận (WCAG 2.2, EN 301 549, Section 508)

Nguồn khung: [`04-standards/accessibility-standards.md`](.xtemplates/framework/04-standards/accessibility-standards.md)

- [ ] `STD-A11Y-008` **SHOULD** Mobile native dùng công cụ nền tảng (Accessibility Inspector/Accessibility Scanner) và đối chiếu WCAG2ICT. → Kiểm: báo cáo scan lưu trong artifact release.
- [ ] `STD-A11Y-009` **SHOULD** Lint tĩnh a11y bật trong CI (`eslint-plugin-jsx-a11y`, `eslint-plugin-vuejs-accessibility`, hoặc tương đương). → Kiểm: tên plugin xuất hiện trong config lint và job lint chạy.
- [ ] `STD-A11Y-010` **SHOULD** Điểm Lighthouse Accessibility ≥ 0.9 trên các URL chính (chỉ là chỉ báo, không thay bảng SC). → Kiểm: `lighthouserc` assertion `categories:accessibility` `minScore: 0.9`.
- [ ] `STD-A11Y-011` **SHOULD** Bảng tuân thủ được rà lại ở mỗi bản phát hành lớn hoặc ≤ 12 tháng. → Kiểm: trường `verified_at` trong file tuân thủ, script cảnh báo khi > 365 ngày.

### Chuẩn API & web (OpenAPI 3.1, RFC 9457, OAuth 2.1, OIDC, JSON Schema, HTTP)

Nguồn khung: [`04-standards/api-and-web-standards.md`](.xtemplates/framework/04-standards/api-and-web-standards.md)

- [ ] `STD-API-009` **SHOULD** Payload được ký/hash (webhook, audit) canonical hoá theo RFC 8785 trước khi ký. → Kiểm: test với vector mẫu của RFC 8785 ra đúng chuỗi.
- [ ] `STD-API-010` **SHOULD** Header cache (`Cache-Control`, `ETag`/`Last-Modified`) theo RFC 9111 cho GET có thể cache; test 304. → Kiểm: test gửi `If-None-Match` nhận 304.
- [ ] `STD-API-011` **SHOULD** Biên (edge/LB) bật HTTP/2 hoặc HTTP/3. → Kiểm: `curl -sI --http2 https://<domain>` dòng đầu `HTTP/2`.
- [ ] `STD-API-012` **SHOULD** Tài liệu/hợp đồng viện dẫn RFC đã công bố (RFC 6749, 7636) và ghi rõ OAuth 2.1 là draft kèm số draft. → Kiểm: `grep -rn "OAuth 2.1" docs/ | grep -v draft` không khớp.
- [ ] `STD-API-013` **SHOULD** Fuzz API theo spec (Schemathesis) trong CI nightly, 0 lỗi 5xx. → Kiểm: `schemathesis run openapi.yaml --checks all` báo cáo 0 failure.

### Chuẩn dữ liệu & quyền riêng tư (ISO 27701, GDPR, PDPL VN, NIST Privacy)

Nguồn khung: [`04-standards/data-privacy-standards.md`](.xtemplates/framework/04-standards/data-privacy-standards.md)

- [ ] `STD-PRIV-009` **SHOULD** Thông báo quyền riêng tư công khai, có phiên bản trong repo và khớp phiên bản đang phục vụ. → Kiểm: `curl -s https://<domain>/privacy` chứa `version:` trùng hash/ngày trong `docs/legal/privacy-notice.md`.
- [ ] `STD-PRIV-010` **SHOULD** Khách hàng Mỹ: profile NIST Privacy Framework 1.0 (Identify/Govern/Control/Communicate/Protect) có bảng ánh xạ. → Kiểm: `docs/compliance/nist-pf-profile.md` tồn tại.
- [ ] `STD-PRIV-011` **SHOULD** Rà lại bảng văn bản luật ≤ 6 tháng, ghi "ngày xác minh" và văn bản sửa đổi/thay thế. → Kiểm: script cảnh báo khi `verified_at` > 180 ngày.

### Chuẩn quy trình & chất lượng (ISO 25010, SemVer, Conventional Commits, SLSA, SBOM, DORA)

Nguồn khung: [`04-standards/process-and-quality-standards.md`](.xtemplates/framework/04-standards/process-and-quality-standards.md)

- [ ] `STD-PROC-010` **SHOULD** Nhánh chính chỉ nhận squash merge với tiêu đề PR dạng conventional (một PR = một commit). → Kiểm: ruleset/branch protection `squash` only (`.github/rulesets/main.json`).
- [ ] `STD-PROC-011` **SHOULD** Thư viện/SDK công khai công bố chính sách hỗ trợ phiên bản (major cũ được vá bao lâu) trong README. → Kiểm: mục "Versioning"/"Support policy" tồn tại.
- [ ] `STD-PROC-012` **SHOULD** Deployment rework rate (DORA 2025) được đếm từ PR/hotfix gắn nhãn `rework` để phát hiện tự động hoá tạo việc làm lại. → Kiểm: truy vấn PR nhãn `rework` trong dashboard DORA.

### Tiêu chuẩn bảo mật (OWASP ASVS/MASVS/Top 10, NIST SSDF, CIS, ISO 27001)

Nguồn khung: [`04-standards/security-standards.md`](.xtemplates/framework/04-standards/security-standards.md)

- [ ] `STD-SEC-010` **SHOULD** Không dùng ASVS "Bleeding Edge"/`latest` làm mục tiêu; ghim bản release. → Kiểm: `grep -iE "bleeding|latest" docs/compliance/asvs-map.md` không khớp.
- [ ] `STD-SEC-011` **SHOULD** Sản phẩm có LLM/agent/MCP ánh xạ thêm OWASP LLM Top 10 2026, Agentic Top 10 và MCP Top 10 (beta) theo [`ai-standards.md`](.xtemplates/framework/04-standards/ai-standards.md) và [`../12-security/ai-security.md`](.xtemplates/framework/12-security/ai-security.md). → Kiểm: `docs/compliance/ai-threats.md` tồn tại khi `PROJECT.md` khai báo có LLM.
- [ ] `STD-SEC-012` **SHOULD** Bảng phiên bản chuẩn trong repo có cột "ngày xác minh" và được rà lại ≤ 6 tháng. → Kiểm: script so ngày xác minh với ngày hiện tại, cảnh báo khi > 180 ngày.

### Chọn kiểu kiến trúc: monolith · modular · microservices · serverless · event-driven

Nguồn khung: [`05-architecture/architecture-styles.md`](.xtemplates/framework/05-architecture/architecture-styles.md)

- [ ] `ARC-STYLE-009` **SHOULD** Mỗi dịch vụ/module có đúng một đội sở hữu, ghi trong `CODEOWNERS`. → Kiểm: mọi thư mục dịch vụ khớp ≥ 1 dòng `CODEOWNERS`; PR tự gán reviewer. · Nguồn: catalog 23 §4 (CODEOWNERS/`pr-policy`)
- [ ] `ARC-STYLE-010` **SHOULD** Thành phần serverless có handler idempotent (nền tảng gọi lại ít nhất một lần) và giới hạn đồng thời cấu hình tường minh. → Kiểm: test gọi handler 2 lần cùng event → một tác động; IaC khai báo `reserved_concurrency`/tương đương. · Nguồn: [`integration-patterns.md`](.xtemplates/framework/05-architecture/integration-patterns.md) ARC-INT-001
- [ ] `ARC-STYLE-011` **SHOULD** Serverless chỉ dùng khi đã đo cold start và chi phí ở tải thật; kết nối CSDL qua pool/proxy chứ không mở trực tiếp mỗi lần gọi. → Kiểm: báo cáo đo p95 cold start và ước tính chi phí/tháng trong ADR; cấu hình pool (xem [`../09-database/indexing-and-query-performance.md`](.xtemplates/framework/09-database/indexing-and-query-performance.md)). · Nguồn: evidence-and-sources §2
- [ ] `ARC-STYLE-012` **SHOULD** Code dùng chung giữa các dịch vụ đóng gói thành thư viện có phiên bản semver; không dùng chung CSDL làm "thư viện". → Kiểm: `package.json`/`pyproject.toml`/`go.mod` của mỗi dịch vụ trỏ phiên bản thư viện nội bộ; không có hai dịch vụ cùng connection string. · Nguồn: 12-factor II
- [ ] `ARC-STYLE-013` **SHOULD** Dự án có sẵn hiện đại hoá bằng strangler fig: một cổng vào duy nhất, chuyển dần từng năng lực, có bảng tiến độ năng lực đã chuyển. → Kiểm: `docs/architecture/strangler-progress.md` liệt kê năng lực + trạng thái + ngày. · Nguồn: [`../00-method/lifecycle.md`](.xtemplates/framework/00-method/lifecycle.md) quy tắc 5 (brownfield)
- [ ] `ARC-STYLE-014` **SHOULD** Kiến trúc đích (nếu khác bản đang chạy) được tách thành hồ sơ riêng kèm điều kiện chuyển; tài liệu nói rõ "đang áp dụng" vs "đích". → Kiểm: mục kiến trúc trong `PROJECT.md`/ADR có hai nhãn đó và danh sách điều kiện chuyển. · Nguồn: khung cũ ADR-0003 (`git show 1b80fe4:docs/adr/0003-thu-hep-ve-boi-canh-cuc-bo.md`)

### Ranh giới, module hoá, C4, hexagonal, luật phụ thuộc

Nguồn khung: [`05-architecture/boundaries-and-modularity.md`](.xtemplates/framework/05-architecture/boundaries-and-modularity.md)

- [ ] `ARC-MOD-009` **SHOULD** Mỗi module có `README.md` nêu trách nhiệm, API công khai, module nó được phép phụ thuộc. → Kiểm: `find src -maxdepth 2 -name README.md` phủ 100% module; nội dung có 3 heading đó. · Nguồn: [`../01-baseline/documentation-minimum.md`](.xtemplates/framework/01-baseline/documentation-minimum.md)
- [ ] `ARC-MOD-010` **SHOULD** Luật phụ thuộc mô tả **lớp** (api → application → domain ← infra) bằng contract `layers`/`layeredArchitecture()`, không chỉ liệt kê cặp cấm. → Kiểm: file cấu hình có khai báo lớp theo thứ tự; test kiến trúc đỏ khi thêm import ngược chiều (thử bằng mutation thủ công một lần, ghi vào PR). · Nguồn: import-linter `layers` · ArchUnit `layeredArchitecture()`
- [ ] `ARC-MOD-011` **SHOULD** Kiểm luật phụ thuộc chạy ở pre-commit (chỉ file đổi) và CI (toàn bộ). → Kiểm: `.pre-commit-config.yaml`/`lint-staged` có lệnh depcruise/lint-imports; workflow CI có job tương ứng. · Nguồn: [`../10-workflow/ci-cd-pipeline.md`](.xtemplates/framework/10-workflow/ci-cd-pipeline.md)
- [ ] `ARC-MOD-012` **SHOULD** Sinh sơ đồ phụ thuộc thực tế từ mã (dependency-cruiser `--output-type dot`, `pydeps`, ArchUnit report) và đính kèm PR thay đổi kiến trúc. → Kiểm: artifact CI `deps.svg` tồn tại cho PR có nhãn `architecture`. · Nguồn: catalog 16 §2d (code knowledge graph trước vòng sửa lớn)
- [ ] `ARC-MOD-013` **SHOULD** Hợp đồng giữa module (DTO/event) định nghĩa một nơi và sinh kiểu ra các phía (schema → type), không sao chép tay. → Kiểm: kiểu ở phía consumer được sinh từ file schema (OpenAPI/JSON Schema/protobuf) qua lệnh trong CI; diff sinh = 0. · Nguồn: P5 một nguồn sự thật
- [ ] `ARC-MOD-014` **SHOULD** Trước vòng refactor lớn, dựng bản đồ mã (code map/graph) có nhãn EXTRACTED/INFERRED để agent/người không đoán cấu trúc. → Kiểm: `docs/architecture/CODEMAP.md` hoặc graph file sinh bằng công cụ, ngày sinh ≤ 30 ngày. · Nguồn: catalog 16 §2b–2d · [`../18-cross-cutting/docs-for-ai-agents.md`](.xtemplates/framework/18-cross-cutting/docs-for-ai-agents.md)

### Quyết định kiến trúc (ADR) và quản trị thay đổi kiến trúc

Nguồn khung: [`05-architecture/decision-records.md`](.xtemplates/framework/05-architecture/decision-records.md)

- [ ] `ARC-ADR-010` **SHOULD** Mỗi ADR có mục Confirmation nêu hàng rào máy kiểm (luật phụ thuộc, test, hook, mục blueprint) hoặc ghi "chưa có hàng rào — nợ". → Kiểm: heading "Confirmation"/"Xác nhận" có trong ADR; nợ ghi vào `PROGRESS.md`. · Nguồn: MADR 4.0.0 (Confirmation)
- [ ] `ARC-ADR-011` **SHOULD** ADR có mục "Điều kiện đọc lại" (trigger) và chủ sở hữu theo dõi. → Kiểm: heading tồn tại; điều kiện kiểm được (sự kiện/ngưỡng), không mơ hồ. · Nguồn: khung cũ ADR-0003 (điều kiện đọc lại)
- [ ] `ARC-ADR-012` **SHOULD** Khi ADR mô tả hiện trạng repo, dẫn SHA/commit và file đã đọc; khi hiện trạng mâu thuẫn tài liệu, ghi bảng "giả định vs thực tế". → Kiểm: ADR có SHA 7+ ký tự hoặc link commit; bảng đối chiếu khi có mâu thuẫn. · Nguồn: khung cũ ADR-0003 (bảng ADR-0002 giả định vs thực tế)
- [ ] `ARC-ADR-013` **SHOULD** `AGENTS.md`/`CLAUDE.md` của dự án yêu cầu đọc `docs/adr/` trước khi đề xuất thay đổi kiến trúc; bài học kiến trúc từ sự cố/post-mortem thành ADR. → Kiểm: grep `docs/adr` trong `AGENTS.md`; post-mortem SEV1/2 có mục "ADR phát sinh" (xem [`../15-operations/incident-response.md`](.xtemplates/framework/15-operations/incident-response.md)). · Nguồn: P12 · catalog 23 §4.3 (`/hoc`)
- [ ] `ARC-ADR-014` **SHOULD** ADR ngắn: tối đa ~2 trang; chi tiết kỹ thuật dài đặt ở spec/tài liệu và link. → Kiểm: `wc -l` ≤ ngưỡng đội chọn (ghi trong `docs/adr/README.md`); lint cảnh báo. · Nguồn: MADR (minimal/full template)
- [ ] `ARC-ADR-015` **SHOULD** Liên kết trong ADR (nội bộ + ngoài) được kiểm hỏng định kỳ. → Kiểm: `lychee docs/adr` (0.24.2, Apache-2.0/MIT) hoặc `scripts/check-links.py` trong CI. · Nguồn: [`../10-workflow/documentation-workflow.md`](.xtemplates/framework/10-workflow/documentation-workflow.md)

### Tích hợp: đồng bộ/bất đồng bộ, idempotency, outbox, saga, webhook

Nguồn khung: [`05-architecture/integration-patterns.md`](.xtemplates/framework/05-architecture/integration-patterns.md)

- [ ] `ARC-INT-014` **SHOULD** Outbox relay giám sát được: tuổi bản ghi chưa gửi lâu nhất và số bản ghi tồn là metric có cảnh báo. → Kiểm: metric `outbox_oldest_unpublished_seconds` tồn tại; cảnh báo cấu hình. · Nguồn: P10
- [ ] `ARC-INT-015` **SHOULD** Thông điệp không chứa dữ liệu nhạy cảm thô; chỉ id + trường tối thiểu, consumer tra cứu thêm khi cần. → Kiểm: schema sự kiện không có trường PII/bí mật (lint schema theo danh sách cấm). · Nguồn: [`../09-database/sensitive-data-and-access.md`](.xtemplates/framework/09-database/sensitive-data-and-access.md)
- [ ] `ARC-INT-016` **SHOULD** Luồng chạy dài/có chờ người dùng durable execution hoặc máy trạng thái bền (bảng + bước idempotent) thay vì giữ trạng thái trong bộ nhớ tiến trình. → Kiểm: test giết tiến trình giữa luồng → luồng tiếp tục đúng bước sau khi khởi động lại. · Nguồn: catalog 21 §5
- [ ] `ARC-INT-017` **SHOULD** Hợp đồng API đồng bộ có OpenAPI/proto commit trong repo, breaking change phát hiện bằng công cụ diff. → Kiểm: job CI chạy diff hợp đồng (vd `oasdiff`/`buf breaking` — phiên bản theo lockfile) và đỏ khi breaking không có phiên bản mới. · Nguồn: [`../08-backend/api-design.md`](.xtemplates/framework/08-backend/api-design.md)
- [ ] `ARC-INT-018` **SHOULD** Có runbook "đối chiếu" (reconcile) định kỳ giữa hệ mình và đối tác cho giao dịch tiền/đơn hàng; chênh lệch → cảnh báo. → Kiểm: job đối chiếu chạy theo lịch, báo cáo lưu; test giả lập lệch → cảnh báo. · Nguồn: catalog 21 §8
- [ ] `ARC-INT-019` **SHOULD** Thời hạn ngừng (deprecation) của phiên bản hợp đồng cũ công bố trong tài liệu + header `Deprecation`/`Sunset`; có metric lượng dùng phiên bản cũ. → Kiểm: tài liệu có bảng phiên bản + ngày; metric theo phiên bản. · Nguồn: [`../08-backend/api-design.md`](.xtemplates/framework/08-backend/api-design.md)

### Độ bền và mở rộng: timeout, retry, circuit breaker, stateless, cache, hàng đợi

Nguồn khung: [`05-architecture/resilience-and-scalability.md`](.xtemplates/framework/05-architecture/resilience-and-scalability.md)

- [ ] `ARC-RES-012` **SHOULD** Timeout đặt theo số đo: p99/p99.9 độ trễ phụ thuộc + đệm mạng, ghi nguồn số đo trong cấu hình/ADR. → Kiểm: comment/tài liệu cạnh giá trị timeout dẫn tới dashboard/báo cáo đo. · Nguồn: AWS Builders' Library
- [ ] `ARC-RES-013` **SHOULD** Lời gọi theo lô/song song có giới hạn đồng thời (semaphore) tới mỗi phụ thuộc; không `Promise.all` không giới hạn trên danh sách lớn. → Kiểm: lint/grep pattern fan-out không giới hạn; cấu hình `concurrency` cho worker/HTTP client. · Nguồn: Azure Bulkhead
- [ ] `ARC-RES-014` **SHOULD** Job định kỳ có jitter/độ lệch theo host để tránh "đồng hồ cùng kêu" tạo đỉnh tải. → Kiểm: cấu hình cron có jitter hoặc phân phối phút; dashboard không thấy đỉnh đồng bộ. · Nguồn: AWS Builders' Library (jitter cho timer)
- [ ] `ARC-RES-015` **SHOULD** Cache phân tán và hàng đợi là backing service gắn qua URL cấu hình, thay được không sửa code. → Kiểm: client khởi tạo từ `REDIS_URL`/`QUEUE_URL`; test chạy với Valkey và Redis cùng xanh (nếu cần tránh khoá giấy phép). · Nguồn: 12-factor IV
- [ ] `ARC-RES-016` **SHOULD** Hệ có kiểm thử chèn lỗi (fault injection) cho ≥ 3 kiểu: độ trễ, mất kết nối, lỗi 5xx — chạy định kỳ hoặc trước phát hành lớn. → Kiểm: kịch bản toxiproxy/chaos trong `tests/resilience/`, kết quả lưu. · Nguồn: catalog 09 §1 (production-readiness)
- [ ] `ARC-RES-017` **SHOULD** Tải vào từ client có rate limit theo chủ thể và được hàng đợi/worker tiêu thụ theo năng lực đã đo; năng lực ghi trong tài liệu kèm ngày đo. → Kiểm: báo cáo k6/Locust (xem [`../14-testing-quality/performance-and-load.md`](.xtemplates/framework/14-testing-quality/performance-and-load.md)) nêu RPS tối đa; cấu hình autoscale dựa trên số đó. · Nguồn: 12-factor VIII

### Tiếp cận (a11y) theo WCAG 2.2 AA và nền tảng mobile

Nguồn khung: [`06-design-ux/accessibility.md`](.xtemplates/framework/06-design-ux/accessibility.md)

- [ ] `UX-A11Y-019` **SHOULD** Thông báo động (lỗi, thành công, cập nhật) đi qua live region: `role="status"`/`aria-live="polite"` cho thường, `role="alert"` cho khẩn; không chuyển focus bằng alert. → Kiểm: E2E kiểm `[role=status]` chứa thông điệp sau hành động. · Nguồn: WAI-ARIA APG Alert; WAI tutorial Forms
- [ ] `UX-A11Y-020` **SHOULD** Có liên kết "Bỏ qua tới nội dung chính" là phần tử focus đầu tiên. → Kiểm: E2E Tab lần đầu → phần tử có text "Bỏ qua". · Nguồn: WCAG 2.2 SC 2.4.1
- [ ] `UX-A11Y-021` **SHOULD** Cơ chế trợ giúp (liên hệ, chat, FAQ) ở cùng vị trí tương đối trên mọi trang. → Kiểm: E2E kiểm selector trợ giúp xuất hiện cùng vị trí trên 3 trang. · Nguồn: WCAG 2.2 SC 3.2.6
- [ ] `UX-A11Y-022` **SHOULD** Component tuỳ chỉnh (tab, menu, combobox) bám đúng pattern WAI-ARIA APG: role/state/keyboard đầy đủ. → Kiểm: story có `play` test phím mũi tên/Home/End; axe rule `aria-*`. · Nguồn: WAI-ARIA APG
- [ ] `UX-A11Y-023` **SHOULD** Chuyển động tôn trọng `prefers-reduced-motion` (chi tiết ở [`motion-and-visual-quality.md`](.xtemplates/framework/06-design-ux/motion-and-visual-quality.md)). → Kiểm: `emulateMedia({ reducedMotion: 'reduce' })` → không animation dịch chuyển lớn.
- [ ] `UX-A11Y-024` **SHOULD** Không dùng `tabindex > 0`; thứ tự DOM = thứ tự đọc = thứ tự nhìn. → Kiểm: lint `no-positive-tabindex`; axe `tabindex`.
- [ ] `UX-A11Y-025` **SHOULD** Lỗi form liên kết với ô nhập (`aria-describedby`, `aria-invalid`), focus về ô lỗi đầu tiên (chi tiết ở [`../07-frontend/forms-and-validation.md`](.xtemplates/framework/07-frontend/forms-and-validation.md)). → Kiểm: E2E submit form lỗi → `document.activeElement` là ô lỗi đầu.
- [ ] `UX-A11Y-028` **SHOULD** Điều khiển đạt tương phản ≥ 3:1 (biên/icon) và chữ ≥ 4.5:1 ở các trạng thái **hover, focus-visible, active, selected**, ở **cả hai theme** (bổ sung cho `UX-A11Y-002` vốn kiểm trạng thái mặc định); trạng thái disabled được WCAG miễn. → Kiểm: Playwright `hover()`/`focus()` từng story/component rồi tính tỷ lệ từ computed style (màu chữ/viền so nền hiệu dụng) cho mỗi trạng thái × theme; dưới ngưỡng → đỏ. · Nguồn: WCAG 2.2 SC 1.4.3, 1.4.11; `seeker19110/stored` 06 §7d.2 (XIAS: README ghi "52/52" nhưng một ô harness đạt 2,92:1 < 3:1, chạy lại 49/52; đọc 2026-10-16)

### UX cho tính năng AI: minh bạch, streaming, xác nhận, sửa sai

Nguồn khung: [`06-design-ux/ai-ux.md`](.xtemplates/framework/06-design-ux/ai-ux.md)

- [ ] `UX-AI-010` **SHOULD** Giới hạn năng lực được nói trước ("có thể sai, hãy kiểm tra thông tin quan trọng") đặt gần output, không chỉ trong onboarding. → Kiểm: chuỗi cảnh báo xuất hiện trên màn hình kết quả (snapshot). · Nguồn: HAX G1–G2
- [ ] `UX-AI-011` **SHOULD** Khi dựa trên tài liệu/nguồn (RAG), mỗi khẳng định quan trọng có trích dẫn bấm được tới đoạn gốc; "không tìm thấy" là câu trả lời hợp lệ. → Kiểm: E2E hỏi câu ngoài tài liệu → trả lời "không có trong tài liệu" thay vì bịa; message có `sources[]`. · Nguồn: [`../13-ai-engineering/rag-and-knowledge.md`](.xtemplates/framework/13-ai-engineering/rag-and-knowledge.md)
- [ ] `UX-AI-012` **SHOULD** Hiển thị mức tin cậy/phạm vi chỉ khi có cơ sở (đánh giá hiệu chuẩn); nếu không, dùng nhãn định tính + khuyến nghị kiểm tra. → Kiểm: eval ghi calibration; UI không hiển thị % khi chưa có.
- [ ] `UX-AI-013` **SHOULD** Streaming tiếp cận được: vùng kết quả `aria-busy="true"` khi đang stream, công bố một lần khi xong (`role="status"`), không đọc từng token. → Kiểm: E2E kiểm thuộc tính `aria-busy` đổi true→false; axe không vi phạm. · Nguồn: WAI-ARIA APG Alert; [`accessibility.md`](.xtemplates/framework/06-design-ux/accessibility.md)
- [ ] `UX-AI-014` **SHOULD** Chỉ báo thời gian chờ: hiển thị "đang suy nghĩ/đang tìm" trước token đầu; nếu > 10 s có tiến độ bước (tool đang gọi) và nút Dừng. → Kiểm: E2E throttle → chỉ báo xuất hiện trước chunk đầu. · Nguồn: [`ui-states-and-feedback.md`](.xtemplates/framework/06-design-ux/ui-states-and-feedback.md)
- [ ] `UX-AI-015` **SHOULD** Tính năng AI tắt được (toàn cục hoặc theo tính năng) và sản phẩm vẫn dùng được khi tắt. → Kiểm: E2E với cờ `ai.enabled=false` → luồng chính vẫn xanh. · Nguồn: HAX G17
- [ ] `UX-AI-016` **SHOULD** Hiển thị chi phí/giới hạn sử dụng (lượt, token, tiền) khi người dùng trả tiền theo mức dùng; cảnh báo trước khi hết. → Kiểm: E2E tài khoản gần hạn mức thấy cảnh báo; không bị chặn đột ngột. · Nguồn: [`../13-ai-engineering/observability-and-cost.md`](.xtemplates/framework/13-ai-engineering/observability-and-cost.md)
- [ ] `UX-AI-017` **SHOULD** Không dark pattern với AI: không tự bật tính năng AI thu dữ liệu, không ẩn nút tắt, không "giả tiến độ" khi mô hình chưa chạy. → Kiểm: checklist dark-pattern trong PR (xem [`content-and-microcopy.md`](.xtemplates/framework/06-design-ux/content-and-microcopy.md)).
- [ ] `UX-AI-018` **SHOULD** Thay đổi hành vi mô hình (đổi phiên bản, đổi prompt hệ thống) được thông báo cho người dùng khi ảnh hưởng kết quả. → Kiểm: changelog trong sản phẩm có mục AI; test eval trước khi đổi. · Nguồn: HAX G18

### Nội dung, microcopy, ngôn ngữ, tiếng Việt có dấu

Nguồn khung: [`06-design-ux/content-and-microcopy.md`](.xtemplates/framework/06-design-ux/content-and-microcopy.md)

- [ ] `UX-CONTENT-009` **SHOULD** Chính tả tiếng Việt được kiểm tự động trên file message. → Kiểm: `cspell --locale vi "messages/**/*.json"` 0 lỗi (từ riêng thêm vào `cspell.json`).
- [ ] `UX-CONTENT-010` **SHOULD** Giọng nhất quán: câu ngắn, chủ động, ngôi "bạn"; không viết hoa toàn bộ, không dấu chấm than dồn dập, không biệt ngữ kỹ thuật trên UI người dùng cuối. → Kiểm: hướng dẫn giọng trong `docs/CONTENT-STYLE.md`; review PR có checklist; script cảnh báo chuỗi toàn chữ hoa > 3 từ.
- [ ] `UX-CONTENT-011` **SHOULD** Microcopy trạng thái rỗng/lỗi/thành công có hướng dẫn hành động tiếp theo (xem [`ui-states-and-feedback.md`](.xtemplates/framework/06-design-ux/ui-states-and-feedback.md)). → Kiểm: story Empty/Error có nút hành động với nhãn động từ.
- [ ] `UX-CONTENT-012` **SHOULD** Văn bản pháp lý/đồng ý viết dễ hiểu, tách khỏi điều khoản dài; nút đồng ý và từ chối ngang nhau về độ nổi bật. → Kiểm: ảnh snapshot banner đồng ý: hai nút cùng kích thước/kiểu; không nút nào bị ẩn dưới "Tuỳ chọn". · Nguồn: DSA Art. 25; [`../16-compliance-privacy/consent-and-user-rights.md`](.xtemplates/framework/16-compliance-privacy/consent-and-user-rights.md)
- [ ] `UX-CONTENT-013` **SHOULD** Cắt chuỗi dài bằng CSS (`text-overflow`, `line-clamp`) kèm tooltip/tiêu đề đầy đủ; không cắt bằng `substring` làm vỡ ký tự tổ hợp. → Kiểm: grep `.substring(0,|.slice(0,` trên chuỗi hiển thị = 0 hoặc dùng `Intl.Segmenter`.
- [ ] `UX-CONTENT-014` **SHOULD** Nhập liệu tiếng Việt qua IME (Telex/VNI): validate/tìm kiếm chỉ chạy sau `compositionend` hoặc khi `event.isComposing === false`. → Kiểm: test đơn vị/E2E gõ chuỗi có composition không gây lỗi "ký tự không hợp lệ" giữa chừng. · Nguồn: MDN `compositionstart`
- [ ] `UX-CONTENT-015` **SHOULD** Ngày, số, tiền, đơn vị hiển thị theo locale (`vi-VN`: 1.234.567 ₫, 13/10/2026) qua `Intl`; logic tiền tệ theo [`../18-cross-cutting/units-time-and-money.md`](.xtemplates/framework/18-cross-cutting/units-time-and-money.md). → Kiểm: test snapshot format với locale `vi-VN` và `en-US`.
- [ ] `UX-CONTENT-016` **SHOULD** Nội dung do AI tạo được gắn nhãn rõ trong microcopy (xem [`ai-ux.md`](.xtemplates/framework/06-design-ux/ai-ux.md)). → Kiểm: chuỗi nhãn nằm trong file message với key `ai.generatedLabel`.

### Trực quan hoá dữ liệu (biểu đồ, KPI, readout)

Nguồn khung: [`06-design-ux/data-visualization.md`](.xtemplates/framework/06-design-ux/data-visualization.md)

- [ ] `UX-VIZ-003` **SHOULD** Cột/thanh bắt đầu từ 0 (trục cắt chỉ cho đường/điểm và ghi rõ trên trục); đơn vị ghi ở trục hoặc nhãn; số định dạng theo locale (`vi-VN`) khi hiển thị; tiền là **số nguyên** ở dữ liệu, chỉ định dạng ở lớp hiển thị. Quy tắc tiền/đơn vị: [`XC-UNITS-005`](.xtemplates/framework/18-cross-cutting/units-time-and-money.md), [`XC-UNITS-009`](.xtemplates/framework/18-cross-cutting/units-time-and-money.md); định dạng locale: [`UX-CONTENT-015`](.xtemplates/framework/06-design-ux/content-and-microcopy.md). → Kiểm: test cấu hình trục của biểu đồ cột có `min = 0`; snapshot định dạng `vi-VN`; test hàm vẽ nhận tiền là số nguyên (không float). · Nguồn: `seeker19110/stored` 06 §7, §7b.2; đọc 2026-10-16

### Design system, token, typography, spacing, theme sáng/tối

Nguồn khung: [`06-design-ux/design-system-and-tokens.md`](.xtemplates/framework/06-design-ux/design-system-and-tokens.md)

- [ ] `UX-DS-008` **SHOULD** Theo lựa chọn hệ điều hành khi người dùng chưa tự chọn (`@media (prefers-color-scheme)` + `:root:not([data-theme])`). → Kiểm: Playwright `emulateMedia({ colorScheme: 'dark' })` → nền tối khi chưa có lựa chọn lưu. · Nguồn: MDN `prefers-color-scheme`
- [ ] `UX-DS-009` **SHOULD** Đặt `<meta name="color-scheme" content="light dark">` và `color-scheme` trên `:root` để form control, scrollbar, nền mặc định của trình duyệt khớp theme. → Kiểm: grep `color-scheme` trong layout gốc và `theme.css`. · Nguồn: MDN `prefers-color-scheme` (mục embedded elements)
- [ ] `UX-DS-010` **SHOULD** Tên token mô tả **vai trò**, không mô tả giá trị (`color.text.danger`, không `color.red`). → Kiểm: script lint tên token theo regex `^(color|space|font|radius|shadow|motion)\.[a-z-]+(\.[a-z-]+)+$` và danh sách từ cấm (`red|blue|dark|light`) ở tầng semantic.
- [ ] `UX-DS-011` **SHOULD** Viền focus (`--ring`) là token riêng, tương phản ≥ 3:1 với nền ở cả hai theme. → Kiểm: `check:contrast` có cặp `ring/background`. · Nguồn: WCAG 2.2 SC 1.4.11, 2.4.7
- [ ] `UX-DS-012` **SHOULD** Trạng thái (success/warning/danger/info) có đủ bộ token nền + chữ + viền; không truyền tải ý nghĩa chỉ bằng màu (kèm icon/chữ). → Kiểm: review Storybook story `Status`; axe rule `color-contrast` không vi phạm. · Nguồn: WCAG 2.2 SC 1.4.1
- [ ] `UX-DS-013` **SHOULD** Mỗi component dùng chung có story trong Storybook với đủ biến thể và cả hai theme (toolbar đổi `data-theme`). → Kiểm: `storybook build` xanh; số story ≥ số component trong `src/components/ui`.
- [ ] `UX-DS-014` **SHOULD** Thay đổi token đi qua PR riêng, có ảnh trước/sau (visual regression) và ghi `CHANGELOG`. → Kiểm: PR đổi `tokens/` phải kèm cập nhật snapshot ảnh (CI fail nếu snapshot lệch chưa duyệt).
- [ ] `UX-DS-015` **SHOULD** Token sinh cho mobile native (Swift/Kotlin/Compose) từ cùng file gốc; không có hằng màu viết tay trong mã native. → Kiểm: grep `UIColor(red:|Color(0x` ngoài thư mục sinh = 0.

### Chuyển động, hình ảnh, chống 'AI slop', kiểm bằng máy

Nguồn khung: [`06-design-ux/motion-and-visual-quality.md`](.xtemplates/framework/06-design-ux/motion-and-visual-quality.md)

- [ ] `UX-VISUAL-009` **SHOULD** Kiểm hai theme ở zoom 400% (và ảnh chụp ở zoom 4×) cho màn hình chính: không chữ tàng hình, không viền mất, biểu đồ đọc được. → Kiểm: Playwright `deviceScaleFactor: 4` + `data-theme` dark/light chụp ảnh so baseline. · Nguồn: catalog 06 §7 (verify ở zoom 4×, cả hai theme)
- [ ] `UX-VISUAL-010` **SHOULD** Một bộ icon duy nhất, cùng stroke/size, nạp theo cây (tree-shake), `aria-hidden` khi trang trí. → Kiểm: `package.json` chỉ một thư viện icon; knip không báo icon thừa.
- [ ] `UX-VISUAL-011` **SHOULD** Không có trope "AI slop" trong bảng trên; section hero có nội dung thật (số liệu, ảnh sản phẩm) thay vì khẩu hiệu chung. → Kiểm: script `check:ui-ux-guard` (grep gradient ngoài token, `transition: all`, emoji, `backdrop-filter` > ngưỡng) = 0; review ảnh hero trong PR.
- [ ] `UX-VISUAL-012` **SHOULD** Mật độ thông tin vừa: tối đa một màu nhấn trên một màn hình, bóng/bo góc theo 3–4 bậc token. → Kiểm: `check:contrast` + grep `box-shadow` ngoài token = 0; review mật độ bằng checklist "xoá trước".
- [ ] `UX-VISUAL-013` **SHOULD** Chuyển trang/animation không làm giảm INP: không chặn main thread > 50 ms khi animation chạy. → Kiểm: Lighthouse TBT, DevTools Performance recording trên luồng chính; web-vitals INP p75 ≤ 200 ms (xem [`../07-frontend/performance-web-vitals.md`](.xtemplates/framework/07-frontend/performance-web-vitals.md)).
- [ ] `UX-VISUAL-014` **SHOULD** Mobile native tôn trọng Reduce Motion của hệ (`UIAccessibility.isReduceMotionEnabled`, `Settings.Global.ANIMATOR_DURATION_SCALE`). → Kiểm: UI test bật Reduce Motion → không parallax/zoom. · Nguồn: Apple HIG Accessibility
- [ ] `UX-VISUAL-015` **SHOULD** Ảnh có `width`/`height` hoặc `aspect-ratio` để không gây CLS; LCP image không lazy. → Kiểm: Lighthouse `unsized-images` = 0; CLS ≤ 0.1.

### Responsive, mobile-first, vùng chạm, bố cục

Nguồn khung: [`06-design-ux/responsive-and-mobile-first.md`](.xtemplates/framework/06-design-ux/responsive-and-mobile-first.md)

- [ ] `UX-RESP-011` **SHOULD** CSS viết mobile-first: style mặc định cho màn nhỏ, `@media (min-width)`/`@container (min-width)`; không `max-width` chồng chéo. → Kiểm: stylelint `media-feature-range-notation` + rule cấm `max-width` trong media (hoặc quy ước review); tỉ lệ `min-width`/`max-width` trong CSS ≥ 90%.
- [ ] `UX-RESP-012` **SHOULD** Breakpoint và cột lưới là token (`--bp-md`, `--grid-cols`) dùng chung JS/CSS; không số lẻ trong component. → Kiểm: grep `@media \(min-width: \d+px\)` ngoài file token = 0 (dùng biến/`@custom-media` hoặc theme của framework).
- [ ] `UX-RESP-013` **SHOULD** Component dùng container query khi phải thích nghi với vùng chứa (sidebar vs main). → Kiểm: component thẻ/danh sách có `container-type`; story hiển thị ở 2 bề rộng container. · Nguồn: MDN Container queries
- [ ] `UX-RESP-014` **SHOULD** Cỡ chữ input ≥ 16 px trên mobile để iOS Safari không tự zoom (hành vi quan sát được, không có tài liệu chính thức — kiểm bằng thiết bị). → Kiểm: computed `font-size` của `input, select, textarea` trên project mobile ≥ 16 px.
- [ ] `UX-RESP-015` **SHOULD** Nội dung quan trọng và hành động chính nằm trong vùng ngón cái (nửa dưới màn hình) trên mobile; thanh hành động cố định dưới cùng cho form dài. → Kiểm: review wireframe mobile; E2E: nút gửi chính có `boundingBox.y + height <= viewport.height` khi ở cuối form.
- [ ] `UX-RESP-016` **SHOULD** Xoay màn hình (dọc/ngang) không mất trạng thái, không khoá hướng trừ khi thiết yếu (game, video). → Kiểm: E2E đổi viewport 390×844 ↔ 844×390 giữa chừng form → dữ liệu còn. · Nguồn: WCAG 2.2 SC 1.3.4
- [ ] `UX-RESP-017` **SHOULD** Chữ phóng 200% (zoom hoặc Dynamic Type/font scale) không cắt, không chồng; dùng `rem`/`em` cho cỡ chữ và khoảng cách liên quan chữ. → Kiểm: E2E đặt `font-size` gốc 200% → không phần tử `overflow` bị cắt (`scrollHeight > clientHeight` với `overflow: hidden`); native test với font scale lớn nhất. · Nguồn: WCAG 2.2 SC 1.4.4; Apple HIG Accessibility (≥ 200%)
- [ ] `UX-RESP-018` **SHOULD** Ảnh có `srcset`/`sizes` hoặc component ảnh của framework để mobile không tải ảnh desktop. → Kiểm: Lighthouse audit `uses-responsive-images` không có cảnh báo (chi tiết ở [`../07-frontend/performance-web-vitals.md`](.xtemplates/framework/07-frontend/performance-web-vitals.md)).

### Bốn trạng thái UI, phản hồi, lỗi, loading, rỗng

Nguồn khung: [`06-design-ux/ui-states-and-feedback.md`](.xtemplates/framework/06-design-ux/ui-states-and-feedback.md)

- [ ] `UX-STATE-012` **SHOULD** Dùng "hoàn tác" (toast có nút Hoàn tác + xoá mềm) thay cho hộp xác nhận với hành động đảo ngược được. → Kiểm: E2E xoá mục → bấm Hoàn tác → mục trở lại; API xoá mềm có `deleted_at`.
- [ ] `UX-STATE-013` **SHOULD** Khi refetch nền, giữ dữ liệu cũ hiển thị và chỉ báo nhỏ ("Đang cập nhật"), không thay bằng skeleton. → Kiểm: E2E thay đổi tab/focus lại → không thấy skeleton, thấy chỉ báo nhỏ.
- [ ] `UX-STATE-014` **SHOULD** Toast chỉ dành cho thông báo không cần hành động; lỗi cần hành động hiển thị cố định đến khi người dùng xử lý. → Kiểm: review: không có toast chứa nút "Sửa" cho lỗi field; toast lỗi không tự biến mất. · Nguồn: WAI-ARIA APG Alert (không tự biến mất)
- [ ] `UX-STATE-015` **SHOULD** Trạng thái offline/mất kết nối được phát hiện và báo; hành động xếp hàng hoặc chặn có giải thích. → Kiểm: Playwright `context.setOffline(true)` → banner offline; thao tác ghi hiện thông báo thay vì lỗi lạ.
- [ ] `UX-STATE-016` **SHOULD** Tác vụ dài chạy nền (export, import, xử lý AI) có trạng thái theo dõi được sau khi rời trang (job id, thông báo khi xong). → Kiểm: E2E tạo job → điều hướng → quay lại thấy tiến độ/kết quả (xem [`../08-backend/background-jobs-and-queues.md`](.xtemplates/framework/08-backend/background-jobs-and-queues.md)).
- [ ] `UX-STATE-017` **SHOULD** Lỗi được phân loại và ánh xạ sang thông điệp người dùng ở một nơi (bảng mã lỗi → microcopy), không viết tay rải rác. → Kiểm: file `src/lib/error-messages.ts` (hoặc tương đương) là nguồn duy nhất; grep chuỗi "Đã xảy ra lỗi" ngoài file = 0.
- [ ] `UX-STATE-018` **SHOULD** Thanh tiến độ phản ánh tiến độ thật (bước/phần trăm từ server), không giả lập chạy đến 90% rồi dừng. → Kiểm: review nguồn giá trị progressbar đến từ API/stream.
- [ ] `UX-STATE-019` **SHOULD** Trạng thái thành công rõ ràng sau hành động (chuyển trang, thông điệp, cập nhật danh sách) trong cùng một bước. → Kiểm: E2E sau tạo mới: mục mới xuất hiện trong danh sách hoặc có thông báo thành công.

### Build, tooling, lint/format/type, env công khai

Nguồn khung: [`07-frontend/build-and-tooling.md`](.xtemplates/framework/07-frontend/build-and-tooling.md)

- [ ] `FE-BUILD-011` **SHOULD** Pre-commit chỉ chạy trên file staged (lint/format/typecheck nhanh) < 10 s; pre-push chạy test liên quan. → Kiểm: `lefthook.yml` có `{staged_files}`; đo thời gian hook.
- [ ] `FE-BUILD-012` **SHOULD** Cấu hình tool chain nằm ở file (không trong `package.json` scripts dài); script đặt tên chuẩn: `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `test:e2e`, `check:*` — và khai báo trong `xt.yaml`/tài liệu để agent chạy đúng. → Kiểm: `package.json` có đủ script; `xt.yaml` trỏ tới. · Nguồn: [`../18-cross-cutting/docs-for-ai-agents.md`](.xtemplates/framework/18-cross-cutting/docs-for-ai-agents.md)
- [ ] `FE-BUILD-013` **SHOULD** Trùng lặp mã ≤ ngưỡng dự án (jscpd) và theo dõi không tăng. → Kiểm: `jscpd --threshold <n>` trong CI.
- [ ] `FE-BUILD-014` **SHOULD** Dependency cập nhật tự động theo nhóm (Renovate/Dependabot), ghim exact cho tool chain; major update có PR riêng chạy đủ cổng. → Kiểm: file cấu hình bot; `package.json` tool chain không `^` (xem [`../12-security/supply-chain.md`](.xtemplates/framework/12-security/supply-chain.md)).
- [ ] `FE-BUILD-015` **SHOULD** Monorepo: task graph (Turborepo/Nx) với cache theo input, `affected` cho CI; mỗi package có `typecheck`/`lint` riêng (xem hồ sơ monorepo). → Kiểm: `turbo run build --filter=...[origin/main]` chạy trong CI.
- [ ] `FE-BUILD-016` **SHOULD** Lint a11y, security, query bật trong bộ rule (jsx-a11y hoặc Biome `a11y`; `react/no-danger`; `@tanstack/eslint-plugin-query`). → Kiểm: cấu hình lint liệt kê plugin; 0 vi phạm.
- [ ] `FE-BUILD-017` **SHOULD** Telemetry của tool chain tắt hoặc có ý thức (Next `NEXT_TELEMETRY_DISABLED=1`, Storybook `disableTelemetry`, Turbo `TURBO_TELEMETRY_DISABLED`) trong CI và máy dev. → Kiểm: biến env trong CI/`.env.example`; cấu hình Storybook. · Nguồn: [`../00-method/evidence-and-sources.md`](.xtemplates/framework/00-method/evidence-and-sources.md) luật 7

### Bảo mật phía client: XSS, CSP, token, storage, dependency

Nguồn khung: [`07-frontend/client-security.md`](.xtemplates/framework/07-frontend/client-security.md)

- [ ] `FE-SEC-013` **SHOULD** Nội dung AI/Markdown render thành element (không qua HTML string) hoặc qua DOMPurify với allowlist hẹp; link ngoài hiện domain, `rel="noopener noreferrer"`, mở tab mới có cảnh báo khi domain lạ. → Kiểm: test fixture output độc; E2E link ngoài có domain hiển thị. · Nguồn: [`../06-design-ux/ai-ux.md`](.xtemplates/framework/06-design-ux/ai-ux.md)
- [ ] `FE-SEC-014` **SHOULD** Không gửi PII/token cho analytics, error tracker, RUM; scrub trước khi gửi (`beforeSend`). → Kiểm: test `beforeSend` loại `email|phone|token`; review payload mẫu. · Nguồn: [`../16-compliance-privacy/privacy-by-design.md`](.xtemplates/framework/16-compliance-privacy/privacy-by-design.md)
- [ ] `FE-SEC-015` **SHOULD** Dữ liệu nhạy cảm không vào URL (query/hash), không vào `console`, không vào `window.name`/`localStorage` log. → Kiểm: grep `console.log` ở production build = 0 (minifier `drop_console` hoặc lint); E2E URL sau luồng chính không chứa `token|otp|password`.
- [ ] `FE-SEC-017` **SHOULD** Mobile/desktop shell (WebView/Electron/Tauri): tắt `nodeIntegration`, bật `contextIsolation`/sandbox; WebView chỉ tải origin allowlist; deep link validate. → Kiểm: cấu hình shell có các cờ; test deep link lạ bị từ chối. · Nguồn: hồ sơ desktop/mobile tương ứng
- [ ] `FE-SEC-018` **SHOULD** Header phụ trợ phía client do server đặt và kiểm: `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` tắt API không dùng, `X-Content-Type-Options: nosniff` (danh sách đầy đủ ở appsec-web). → Kiểm: test header trong CI smoke.

### Form, validation, lỗi, a11y form, upload

Nguồn khung: [`07-frontend/forms-and-validation.md`](.xtemplates/framework/07-frontend/forms-and-validation.md)

- [ ] `FE-FORM-012` **SHOULD** Validate theo nhịp: on blur cho ô, on submit toàn form, on change chỉ sau khi ô đã lỗi; không báo lỗi khi đang gõ dấu (IME: chờ `compositionend`/`isComposing`). → Kiểm: test gõ "Việt" qua composition events → không lỗi giữa chừng; cấu hình `mode: 'onBlur', reValidateMode: 'onChange'` (RHF) hoặc tương đương. · Nguồn: MDN `compositionstart`
- [ ] `FE-FORM-013` **SHOULD** Chuẩn hoá đầu vào ở lớp biên: trim, NFC, số điện thoại/tiền theo [`../18-cross-cutting/units-time-and-money.md`](.xtemplates/framework/18-cross-cutting/units-time-and-money.md); không chuẩn hoá mật khẩu. → Kiểm: schema có `.transform(normalizeNFC)` cho text; test "Việt" NFD → NFC.
- [ ] `FE-FORM-014` **SHOULD** Cảnh báo rời trang khi có thay đổi chưa lưu (`beforeunload` + chặn điều hướng SPA), bỏ cảnh báo sau khi lưu thành công. → Kiểm: E2E sửa ô → điều hướng → dialog xác nhận; sau lưu → không dialog.
- [ ] `FE-FORM-015` **SHOULD** Lỗi server theo field ánh xạ về đúng ô (mã lỗi → key field) thay vì một thông điệp chung; lỗi không thuộc field hiện ở tóm tắt. → Kiểm: test response 422 `{ errors: { email: 'EMAIL_TAKEN' } }` → lỗi hiện dưới ô email với microcopy từ bảng mã.
- [ ] `FE-FORM-016` **SHOULD** Ô bắt buộc đánh dấu nhất quán (chữ "bắt buộc" hoặc chú thích dấu *), `required`/`aria-required`; ô tuỳ chọn ít hơn ô bắt buộc (chỉ hỏi cái cần). → Kiểm: axe không vi phạm; review số ô form đăng ký ≤ ngưỡng dự án.
- [ ] `FE-FORM-017` **SHOULD** Thành phần form tuỳ chỉnh (select, date picker, combobox) dùng component headless đã test a11y hoặc native `<select>`/`<input type=date>` khi đủ. → Kiểm: story có test bàn phím; axe không vi phạm (xem [`../06-design-ux/accessibility.md`](.xtemplates/framework/06-design-ux/accessibility.md)).
- [ ] `FE-FORM-018` **SHOULD** Form hoạt động không JS (progressive enhancement) cho luồng cốt lõi khi dùng server action/`<form action>`. → Kiểm: E2E `javaScriptEnabled: false` submit form đăng nhập/liên hệ thành công.
- [ ] `FE-FORM-019` **SHOULD** Test schema bao phủ ca biên: rỗng, khoảng trắng, Unicode, độ dài tối đa, số âm/0, ngày biên, email lạ; dùng property-based test khi phù hợp. → Kiểm: Vitest + fast-check cho schema chính; coverage nhánh schema ≥ ngưỡng dự án (xem [`../14-testing-quality/unit-and-logic-edge-cases.md`](.xtemplates/framework/14-testing-quality/unit-and-logic-edge-cases.md)).

### Kiểm thử frontend: component, visual, E2E, a11y

Nguồn khung: [`07-frontend/frontend-testing.md`](.xtemplates/framework/07-frontend/frontend-testing.md)

- [ ] `FE-TEST-010` **SHOULD** Component test chạy trong trình duyệt thật (Vitest browser mode/Storybook test) cho component phụ thuộc layout/CSS/scroll/focus; jsdom chỉ cho logic render đơn giản. → Kiểm: `vitest.config` có project `browser`; component dialog/menu/virtual list nằm trong project đó.
- [ ] `FE-TEST-011` **SHOULD** E2E dùng `storageState` tái sử dụng phiên đăng nhập (setup project), không đăng nhập qua UI ở mọi test. → Kiểm: `globalSetup`/project `setup` tạo `storageState`; thời gian E2E giảm (so sánh job).
- [ ] `FE-TEST-012` **SHOULD** CI E2E: cache trình duyệt theo lockfile, `workers` cố định (vd 4), shard khi > ngưỡng thời gian, artifact trace/video chỉ khi thất bại. → Kiểm: workflow có cache `~/.cache/ms-playwright` key `hashFiles(lockfile)`; `workers: process.env.CI ? 4 : undefined`. · Nguồn: catalog 23 (Playwright CI 4 worker, cache)
- [ ] `FE-TEST-013` **SHOULD** Test trạng thái lỗi/rỗng/offline cho component dữ liệu (xem [`../06-design-ux/ui-states-and-feedback.md`](.xtemplates/framework/06-design-ux/ui-states-and-feedback.md)). → Kiểm: mỗi component dữ liệu có test 4 trạng thái.
- [ ] `FE-TEST-014` **SHOULD** Test bàn phím cho component tương tác (Tab/Enter/Esc/mũi tên) và `prefers-reduced-motion`. → Kiểm: story `play` dùng `userEvent.keyboard`; E2E `emulateMedia`.
- [ ] `FE-TEST-015` **SHOULD** Snapshot DOM/HTML hạn chế (chỉ cho markup ổn định nhỏ); không snapshot cả trang. → Kiểm: số file `.snap` > N dòng bị lint chặn; review.
- [ ] `FE-TEST-016` **SHOULD** Kiểm hợp đồng API client ↔ server (schema/OpenAPI) để mock không trôi khỏi thật. → Kiểm: test MSW handler validate bằng schema dùng chung; xem [`../14-testing-quality/integration-and-contract.md`](.xtemplates/framework/14-testing-quality/integration-and-contract.md).
- [ ] `FE-TEST-017` **SHOULD** Thời gian chạy test có ngân sách: unit/component < vài phút, E2E luồng chính < 10–15 phút trên CI; vượt → shard/tối ưu, không xoá test. → Kiểm: metric thời gian job theo PR; cảnh báo khi vượt.

### Hiệu năng: Core Web Vitals, bundle, ảnh, font, ngân sách

Nguồn khung: [`07-frontend/performance-web-vitals.md`](.xtemplates/framework/07-frontend/performance-web-vitals.md)

- [ ] `FE-PERF-012` **SHOULD** TTFB p75 ≤ 800 ms trang chính (TTFB thường ~40% LCP): cache/CDN cho HTML công khai, không redirect chuỗi, không query cache-busting. → Kiểm: RUM TTFB p75; `curl -w '%{time_starttransfer}'` từ 2 khu vực; Lighthouse `server-response-time`. · Nguồn: web.dev Optimize LCP (TTFB subpart)
- [ ] `FE-PERF-013` **SHOULD** `preconnect` tới origin bên thứ ba cần sớm (≤ 2–3), `preload` tài nguyên LCP chỉ khi không thấy được trong HTML (CSS background). → Kiểm: Lighthouse `uses-rel-preconnect`; số `<link rel=preload>` ≤ 4 (tránh preload tràn). · Nguồn: web.dev Optimize LCP
- [ ] `FE-PERF-014` **SHOULD** Không long task > 50 ms trong luồng chính khi tương tác; hydrate chọn lọc; tính toán nặng vào Web Worker; danh sách dài virtualize. → Kiểm: DevTools Performance trace cho 3 tương tác chính; Lighthouse TBT ≤ ngưỡng; RUM INP attribution chỉ ra phần tử/script gây chậm.
- [ ] `FE-PERF-015` **SHOULD** Fallback font có `size-adjust`/metric override để swap không gây CLS. → Kiểm: CLS lab trên trang chữ nhiều ≤ 0,05; `@font-face` fallback có `size-adjust` (công cụ `fontaine` 1.0.1 hoặc `@capsizecss/core` 4.1.3 sinh). · Nguồn: MDN `font-display`
- [ ] `FE-PERF-016` **SHOULD** Dependency được tỉa định kỳ: không gói thừa, không hai thư viện cùng việc (2 bộ icon, 2 date lib). → Kiểm: `knip` 6.41.0 0 unused; bundle analyzer không có bản sao thư viện (duplicate).
- [ ] `FE-PERF-017` **SHOULD** Bộ nhớ đệm HTTP cho asset bất biến: tên file có hash + `Cache-Control: public, max-age=31536000, immutable`; HTML không cache lâu. → Kiểm: `curl -I` asset có header trên; HTML `no-cache`/`s-maxage` ngắn. · Nguồn: MDN HTTP Caching
- [ ] `FE-PERF-018` **SHOULD** Đo trên điều kiện thật: Lighthouse mobile preset (throttle 4G/CPU chậm); RUM phân đoạn theo thiết bị và kết nối. → Kiểm: `lighthouserc` không tắt throttling; dashboard có chiều `effectiveType`.

### Render (SSR/SSG/CSR/ISR), routing, hydration

Nguồn khung: [`07-frontend/rendering-and-routing.md`](.xtemplates/framework/07-frontend/rendering-and-routing.md)

- [ ] `FE-RENDER-011` **SHOULD** Phần đọc dữ liệu động đặt sâu trong cây (ở lá) để khung tĩnh lớn nhất; `await params/cookies` không ở layout gốc. → Kiểm: review; Next: dev overlay không báo blocking ở layout. · Nguồn: Next.js Caching ("Maximizing the static shell")
- [ ] `FE-RENDER-012` **SHOULD** Cache/ISR có cơ chế vô hiệu khi dữ liệu đổi (tag/path revalidate hoặc webhook) thay vì chỉ TTL dài. → Kiểm: test cập nhật dữ liệu → gọi revalidate → GET tiếp theo thấy dữ liệu mới. · Nguồn: [`../08-backend/caching.md`](.xtemplates/framework/08-backend/caching.md)
- [ ] `FE-RENDER-013` **SHOULD** Prefetch route/dữ liệu cho liên kết trong viewport hoặc khi hover/focus, có giới hạn trên mạng chậm (`saveData`, `effectiveType`). → Kiểm: E2E thấy request prefetch khi link vào viewport; không prefetch khi `connection.saveData`.
- [ ] `FE-RENDER-014` **SHOULD** Chuyển trang giữ focus/scroll đúng: focus vào tiêu đề trang mới hoặc vùng nội dung; scroll về đầu khi route mới, giữ khi back. → Kiểm: E2E sau điều hướng SPA, `document.activeElement` nằm trong `main`; `history.scrollRestoration` xử lý. · Nguồn: [`../06-design-ux/accessibility.md`](.xtemplates/framework/06-design-ux/accessibility.md)
- [ ] `FE-RENDER-015` **SHOULD** Component chỉ chạy client (`'use client'`, `onMount`, `ssr: false`) giới hạn ở lá cây; server component/SSR là mặc định. → Kiểm: tỉ lệ file có `'use client'` trong `app/` được theo dõi (script), không tăng không lý do.
- [ ] `FE-RENDER-016` **SHOULD** Redirect/rewrite và trailing slash/canonical thống nhất một nơi (config framework hoặc CDN), không rải trong component. → Kiểm: grep `router.push('/old` ngoài file cấu hình redirect = 0; `curl -I` URL cũ → 301 tới canonical.

### State, data fetching, cache phía client, đồng bộ server

Nguồn khung: [`07-frontend/state-and-data-fetching.md`](.xtemplates/framework/07-frontend/state-and-data-fetching.md)

- [ ] `FE-STATE-010` **SHOULD** `staleTime` đặt theo loại dữ liệu (tham chiếu: phút/giờ; giao dịch: ngắn), không giữ mặc định 0 cho mọi query. → Kiểm: `QueryClient` có `defaultOptions.queries.staleTime` và ghi chú; review query nóng có override. · Nguồn: TanStack Query Important Defaults
- [ ] `FE-STATE-011` **SHOULD** Dữ liệu suy ra không lưu trong state; tính bằng `useMemo`/computed/selector. → Kiểm: review store: không trường `total` tính được từ `items`; test selector.
- [ ] `FE-STATE-012` **SHOULD** Store toàn cục có ≤ một vài slice rõ tên; mỗi slice có test; không đặt server data vào store. → Kiểm: grep `setItems(data)` sau `useQuery` = 0; số slice liệt kê trong `docs/STATE.md`.
- [ ] `FE-STATE-013` **SHOULD** Danh sách dài dùng phân trang/infinite query có `getNextPageParam` và virtualization khi > vài trăm hàng. → Kiểm: E2E cuộn danh sách 1 000 mục không > N node DOM (ngưỡng dự án); Lighthouse `dom-size` không cảnh báo.
- [ ] `FE-STATE-014` **SHOULD** Offline/mất mạng: query dùng cache cũ + chỉ báo; mutation xếp hàng hoặc báo rõ; `networkMode` cấu hình có chủ đích. → Kiểm: Playwright `setOffline(true)` → không lỗi lạ; khôi phục mạng → tự refetch (`refetchOnReconnect`).
- [ ] `FE-STATE-015` **SHOULD** Realtime cập nhật cache query (`setQueryData`/invalidate theo sự kiện) thay vì duy trì bản sao riêng. → Kiểm: review handler WebSocket gọi `queryClient`; test sự kiện → UI cập nhật.
- [ ] `FE-STATE-016` **SHOULD** Prefetch dữ liệu cho route kế tiếp (hover/viewport) và dehydrate từ server vào client (SSR) để tránh fetch kép. → Kiểm: E2E lần render đầu không có request trùng dữ liệu đã có trong HTML; `HydrationBoundary`/tương đương dùng.
- [ ] `FE-STATE-017` **SHOULD** Dữ liệu từ API được validate ở biên (schema) trước khi vào cache (xem [`forms-and-validation.md`](.xtemplates/framework/07-frontend/forms-and-validation.md) cho schema dùng chung). → Kiểm: client API parse response bằng schema; test response sai kiểu → `AppError` thay vì crash. · Nguồn: P6

### Thiết kế API: REST/GraphQL/gRPC, lỗi RFC 9457, phân trang, versioning, OpenAPI

Nguồn khung: [`08-backend/api-design.md`](.xtemplates/framework/08-backend/api-design.md)

- [ ] `BE-API-014` **SHOULD** Tài nguyên có `ETag`; cập nhật dùng `If-Match` → 412 khi xung đột (chống lost update); GET có `If-None-Match` → 304. → Kiểm: test hai client cập nhật cùng bản ghi với ETag cũ → 412. · Nguồn: RFC 9110 §13, RFC 6585 §3
- [ ] `BE-API-015` **SHOULD** Đặt tên và hình dạng nhất quán: tài nguyên danh từ số nhiều, trường `snake_case` hoặc `camelCase` thống nhất toàn API, thời gian ISO 8601 UTC, tiền là chuỗi số nguyên đơn vị nhỏ nhất + mã tiền tệ (xem [`../18-cross-cutting/units-time-and-money.md`](.xtemplates/framework/18-cross-cutting/units-time-and-money.md)). → Kiểm: rule Spectral tuỳ chỉnh về casing/format chạy trong CI.
- [ ] `BE-API-016` **SHOULD** Có test contract (consumer-driven hoặc so khớp spec) cho mỗi client nội bộ; chi tiết [`../14-testing-quality/integration-and-contract.md`](.xtemplates/framework/14-testing-quality/integration-and-contract.md). → Kiểm: job contract test trong CI.
- [ ] `BE-API-017` **SHOULD** Trường mở rộng/đầu vào không biết: server bỏ qua trường lạ có kiểm soát (hoặc từ chối rõ ràng) và ghi trong spec (`additionalProperties`); không cho phép mass assignment vào trường nhạy cảm (`role`, `is_admin`). → Kiểm: test gửi `is_admin: true` vào endpoint sửa hồ sơ → bị bỏ qua/400. · Nguồn: ASVS 5.0 V2
- [ ] `BE-API-018` **SHOULD** CORS: chỉ origin cụ thể, không `*` trên endpoint có xác thực; header bảo mật (`Cache-Control: no-store` cho dữ liệu người dùng, `X-Content-Type-Options: nosniff`). → Kiểm: test preflight từ origin lạ → không có `Access-Control-Allow-Origin`. · Nguồn: OWASP REST Security Cheat Sheet
- [ ] `BE-API-019` **SHOULD** Tài liệu API sinh từ spec (Redoc/Scalar/Swagger UI) và publish theo môi trường; ví dụ request/response trong spec chạy được. → Kiểm: job build docs từ spec; ví dụ validate qua `spectral`/`redocly lint`.
- [ ] `BE-API-020` **SHOULD** Lọc/sắp xếp có danh sách trường cho phép (allowlist), không nhận biểu thức tuỳ ý từ client. → Kiểm: test `sort=password` hoặc `filter=(evil)` → 400.

### Xác thực, phiên, token, phân quyền (RBAC/ABAC), đa yếu tố

Nguồn khung: [`08-backend/authn-authz.md`](.xtemplates/framework/08-backend/authn-authz.md)

- [ ] `BE-AUTH-017` **SHOULD** Thông báo cho người dùng qua kênh ngoài (email) khi: đăng nhập từ thiết bị mới, đổi mật khẩu/email/MFA, nhiều lần đăng nhập thất bại. → Kiểm: test đổi mật khẩu → có email trong outbox test. · Nguồn: OWASP MFA Cheat Sheet
- [ ] `BE-AUTH-018` **SHOULD** Multi-tenant: `tenant_id` nằm trong mọi bảng dữ liệu nghiệp vụ và mọi truy vấn; tốt nhất thực thi bằng RLS/policy ở DB; test chéo tenant tự động. → Kiểm: test đăng nhập tenant A truy vấn bản ghi tenant B → rỗng; xem [`../09-database/sensitive-data-and-access.md`](.xtemplates/framework/09-database/sensitive-data-and-access.md).
- [ ] `BE-AUTH-020` **SHOULD** Nâng cấp hash cũ khi người dùng đăng nhập (rehash nếu tham số thấp hơn mục tiêu); kế hoạch loại bỏ hash legacy có ngày. → Kiểm: test đăng nhập với hash tham số cũ → hash được ghi lại với tham số mới. · Nguồn: OWASP Password Storage Cheat Sheet

### Job nền, hàng đợi, lịch, idempotency, retry, DLQ

Nguồn khung: [`08-backend/background-jobs-and-queues.md`](.xtemplates/framework/08-backend/background-jobs-and-queues.md)

- [ ] `BE-JOB-013` **SHOULD** Tách hàng đợi theo mức ưu tiên/độ trễ chấp nhận (vd `critical`, `default`, `bulk`) để job nặng không chặn job quan trọng; worker pool riêng cho job dài. → Kiểm: cấu hình ≥ 2 hàng đợi với worker riêng khi có job > 30 giây.
- [ ] `BE-JOB-014` **SHOULD** Job dài chia bước có checkpoint (tiến độ lưu DB) để chạy lại từ bước đã xong; job batch chia lô theo kích thước cố định. → Kiểm: test kill giữa chừng → chạy lại tiếp từ checkpoint.
- [ ] `BE-JOB-015` **SHOULD** Mọi job ghi log có cấu trúc với `job_id`, `job_type`, `attempt`, `duration_ms`, kết quả; `trace_id` lan truyền từ request sinh job. → Kiểm: log mẫu có đủ trường; xem [`../01-baseline/errors-and-logging.md`](.xtemplates/framework/01-baseline/errors-and-logging.md).
- [ ] `BE-JOB-016` **SHOULD** Phiên bản payload (`v`) và handler tương thích ngược khi deploy: worker mới xử lý được job cũ còn trong hàng đợi, và ngược lại trong thời gian rolling. → Kiểm: test handler với payload phiên bản trước.
- [ ] `BE-JOB-017` **SHOULD** Broker/DB hàng đợi có persistence và backup: Redis bật AOF (`appendfsync everysec` hoặc chặt hơn) khi là hàng đợi chính; hàng đợi DB nằm trong backup thường. → Kiểm: cấu hình Redis `appendonly yes`; xem [`../09-database/backup-and-recovery.md`](.xtemplates/framework/09-database/backup-and-recovery.md).
- [ ] `BE-JOB-018` **SHOULD** Có công cụ vận hành: xem DLQ, retry một/nhiều job, huỷ job, tạm dừng hàng đợi — có kiểm quyền và audit log. → Kiểm: lệnh/UI tồn tại; thao tác ghi log.

### Cache: tầng, key, TTL, vô hiệu hoá, stampede

Nguồn khung: [`08-backend/caching.md`](.xtemplates/framework/08-backend/caching.md)

- [ ] `BE-CACHE-012` **SHOULD** Dùng `ETag`/`Last-Modified` + `If-None-Match` → 304 cho API đọc nhiều; ETag tính từ nội dung hoặc `updated_at` + version. → Kiểm: test gọi lần hai với ETag → 304 không body. · Nguồn: RFC 9110 §13
- [ ] `BE-CACHE-013` **SHOULD** `stale-while-revalidate` / `stale-if-error` cho nội dung công khai chấp nhận cũ vài phút để giảm tail latency và chịu lỗi nguồn. → Kiểm: header có directive; test nguồn trả 503 → CDN vẫn 200 bản cũ. · Nguồn: RFC 5861
- [ ] `BE-CACHE-014` **SHOULD** TTL có jitter (±10–20%) để các key nạp cùng lúc không hết hạn cùng lúc. → Kiểm: hàm tính TTL có jitter, có unit test.
- [ ] `BE-CACHE-015` **SHOULD** In-memory cache có giới hạn kích thước (LRU/LFU) và không giữ tham chiếu tới object lớn; dọn khi deploy. → Kiểm: cấu hình `max` entries; test bộ nhớ không tăng vô hạn.
- [ ] `BE-CACHE-016` **SHOULD** Prewarm cache cho key nóng khi deploy/khởi động hoặc dùng rolling deploy để tránh "cold start storm". → Kiểm: script warm-up hoặc tài liệu chiến lược deploy ([`../15-operations/deployment-strategies.md`](.xtemplates/framework/15-operations/deployment-strategies.md)).
- [ ] `BE-CACHE-017` **SHOULD** Không lưu bí mật/PII thô trong cache; nếu buộc phải, mã hoá và TTL ngắn, tuân [`../09-database/sensitive-data-and-access.md`](.xtemplates/framework/09-database/sensitive-data-and-access.md). → Kiểm: review key/value mẫu; quét dump cache test không chứa PII.

### File, upload, lưu trữ đối tượng, xử lý ảnh/video, quét

Nguồn khung: [`08-backend/files-and-media.md`](.xtemplates/framework/08-backend/files-and-media.md)

- [ ] `BE-FILE-014` **SHOULD** Presigned upload có chính sách ràng buộc: key do server quyết, `content-length-range`, `Content-Type` cố định, hết hạn ≤ 15 phút; sau upload client gọi "confirm" để server xác minh object tồn tại + kích thước + magic bytes rồi mới tạo bản ghi `ready`. → Kiểm: test upload key khác chính sách → 403; test confirm với object không tồn tại → 404.
- [ ] `BE-FILE-015` **SHOULD** Sinh bản dẫn xuất (thumbnail, WebP/AVIF, nhiều kích thước) bất đồng bộ, đặt tên theo hash nội dung + tham số; phục vụ qua CDN với cache dài. → Kiểm: key dẫn xuất chứa hash; `Cache-Control` theo [`caching.md`](.xtemplates/framework/08-backend/caching.md).
- [ ] `BE-FILE-016` **SHOULD** Khử trùng theo hash: cùng SHA-256 → tham chiếu lại object (dedupe) khi chính sách cho phép; hash cũng dùng để đối chiếu toàn vẹn khi khôi phục. → Kiểm: test upload cùng file 2 lần → 1 object, 2 bản ghi.
- [ ] `BE-FILE-017` **SHOULD** Giới hạn tốc độ và hạn mức upload theo người dùng/tenant (số file/ngày, tổng dung lượng) để chống lạm dụng và kiểm soát chi phí. → Kiểm: test vượt hạn mức → 429/403; dashboard dung lượng theo tenant.
- [ ] `BE-FILE-018` **SHOULD** Tải xuống file lớn dùng streaming/`Range` (206) hoặc redirect tới presigned URL; không buffer toàn bộ file trong RAM app. → Kiểm: test `Range: bytes=0-99` → 206; profile RAM khi tải 1 GB.

### Tích hợp bên thứ ba, webhook vào/ra, chữ ký, replay

Nguồn khung: [`08-backend/integrations-and-webhooks.md`](.xtemplates/framework/08-backend/integrations-and-webhooks.md)

- [ ] `BE-INT-015` **SHOULD** Test: unit với fake adapter; contract test record/replay (VCR/nock/respx) cập nhật có chủ đích; smoke trên sandbox vendor ở staging; không gọi vendor thật trong CI. → Kiểm: CI không có network tới domain vendor (allowlist egress); cassette có ngày ghi.
- [ ] `BE-INT-016` **SHOULD** Xử lý sự kiện theo **trạng thái cuối** (so `updated_at`/version) thay vì theo thứ tự đến; sự kiện cũ hơn trạng thái hiện có → bỏ qua có log. → Kiểm: test sự kiện cũ đến sau → không ghi đè.
- [ ] `BE-INT-017` **SHOULD** Nhật ký tích hợp (request/response rút gọn, đã che PII/secret) lưu đủ để debug và đối soát, retention theo chính sách. → Kiểm: mẫu log có `vendor`, `operation`, `external_id`, `duration_ms`, không chứa token.
- [ ] `BE-INT-018` **SHOULD** Egress allowlist: dịch vụ chỉ được gọi ra các domain vendor đã khai báo; agent/LLM tool gọi ra ngoài đi qua gateway có allowlist. → Kiểm: cấu hình network policy/proxy; xem [`../12-security/infrastructure-and-network.md`](.xtemplates/framework/12-security/infrastructure-and-network.md).

### Realtime: WebSocket, SSE, pub/sub, streaming

Nguồn khung: [`08-backend/realtime-and-streaming.md`](.xtemplates/framework/08-backend/realtime-and-streaming.md)

- [ ] `BE-RT-014` **SHOULD** Thông điệp có `type` + `version` + `id`; client bỏ qua type lạ; thay đổi tương thích ngược theo [`api-design.md`](.xtemplates/framework/08-backend/api-design.md). → Kiểm: test client nhận type lạ → không crash.
- [ ] `BE-RT-015` **SHOULD** Nén WebSocket (`permessage-deflate`) chỉ bật có chủ đích với `no_context_takeover`/`max_window_bits` để giới hạn RAM mỗi kết nối. → Kiểm: cấu hình thư viện; đo RSS với 10k kết nối. · Nguồn: RFC 7692 §7.1
- [ ] `BE-RT-016` **SHOULD** SSE qua HTTP/2 (hoặc giới hạn 1 EventSource/tab + SharedWorker) để tránh trần kết nối HTTP/1.1 mỗi origin của trình duyệt. → Kiểm: server/CDN bật HTTP/2; tài liệu client. · Nguồn: WHATWG HTML Server-sent events (ghi chú giới hạn kết nối)
- [ ] `BE-RT-017` **SHOULD** Thứ tự và khử trùng: sự kiện có số thứ tự tăng dần theo kênh; client bỏ qua ID đã thấy; server không bảo đảm đúng-một-lần nên handler idempotent. → Kiểm: test replay trùng ID → không xử lý lại.
- [ ] `BE-RT-018` **SHOULD** Test tải kết nối sống (k6 WebSocket/SSE): N kết nối × tốc độ thông điệp mục tiêu, đo RAM/CPU/latency trước khi ra mắt. → Kiểm: báo cáo trong [`../14-testing-quality/performance-and-load.md`](.xtemplates/framework/14-testing-quality/performance-and-load.md).

### Độ tin cậy: timeout, retry, graceful shutdown, health, rate limit

Nguồn khung: [`08-backend/reliability-and-errors.md`](.xtemplates/framework/08-backend/reliability-and-errors.md)

- [ ] `BE-REL-014` **SHOULD** Pool kết nối DB có `max` phù hợp (theo CPU DB và số instance), `idleTimeout`, kiểm kết nối trước dùng; `statement_timeout`/`lock_timeout` ở DB cho truy vấn web. → Kiểm: cấu hình có giá trị; xem [`../09-database/indexing-and-query-performance.md`](.xtemplates/framework/09-database/indexing-and-query-performance.md).
- [ ] `BE-REL-015` **SHOULD** Hedged/parallel request chỉ cho đọc idempotent có p99 cao, có trần tỉ lệ (vd ≤ 5%). → Kiểm: cấu hình trần; metric hedge ratio.
- [ ] `BE-REL-016` **SHOULD** Dependency gọi ra ngoài có metric latency/lỗi/timeout theo đích và cảnh báo; log lỗi kèm `trace_id`. → Kiểm: dashboard theo dependency ([`../15-operations/observability.md`](.xtemplates/framework/15-operations/observability.md)).
- [ ] `BE-REL-017` **SHOULD** Diễn tập hỏng (chaos nhẹ) định kỳ ở staging: tắt DB/cache/dịch vụ ngoài, tăng latency, SIGTERM giữa tải; ghi kết quả. → Kiểm: báo cáo diễn tập trong `docs/ops/` có ngày.
- [ ] `BE-REL-018` **SHOULD** Rate limit riêng chặt hơn cho endpoint xác thực, quên mật khẩu, gửi OTP/SMS (chống brute-force và tốn tiền). → Kiểm: cấu hình ngưỡng theo route; xem [`authn-authz.md`](.xtemplates/framework/08-backend/authn-authz.md).

### Sao lưu, khôi phục, PITR, diễn tập, RPO/RTO

Nguồn khung: [`09-database/backup-and-recovery.md`](.xtemplates/framework/09-database/backup-and-recovery.md)

- [ ] `DB-BACKUP-010` **SHOULD** Cấu hình (`postgresql.conf`, `pg_hba.conf`), extension, khoá mã hoá/bí mật cần cho restore được sao lưu/quản lý riêng và nằm trong kịch bản diễn tập. → Kiểm: IaC/secret manager chứa chúng; runbook restore liệt kê và diễn tập có bước lấy lại. · Nguồn: PostgreSQL 18 §25.3.7 (config không trong WAL)
- [ ] `DB-BACKUP-011` **SHOULD** Backup logic (`pg_dump -Fc` hoặc `-Fd -j n`) bổ sung để di chuyển/khôi phục từng bảng và sang major khác; restore bằng `pg_restore` thử trên CI định kỳ. → Kiểm: job tuần `pg_dump` → `pg_restore` vào CSDL rỗng exit 0. · Nguồn: PostgreSQL 18 pg_dump/pg_restore
- [ ] `DB-BACKUP-012` **SHOULD** Runbook khôi phục có bước-lệnh cụ thể, người được uỷ quyền, cách xác nhận dữ liệu, cách thông báo; được cập nhật sau mỗi diễn tập. → Kiểm: `docs/ops/runbooks/restore-db.md` (mẫu [`../templates/RUNBOOK.md`](.xtemplates/framework/templates/RUNBOOK.md)) có ngày cập nhật ≤ lần diễn tập gần nhất. · Nguồn: [`../15-operations/incident-response.md`](.xtemplates/framework/15-operations/incident-response.md)
- [ ] `DB-BACKUP-013` **SHOULD** Dung lượng và thời gian backup/restore là metric; cảnh báo khi tăng bất thường hoặc `pg_wal` phình do archive hỏng. → Kiểm: dashboard kích thước backup, `pg_stat_archiver`, dung lượng `pg_wal`. · Nguồn: PostgreSQL 18 §25.3 (pg_wal đầy → PANIC)
- [ ] `DB-BACKUP-014` **SHOULD** SQLite: snapshot bằng Backup API/`VACUUM INTO`, không copy file đang mở; đích tải lên có phiên bản. → Kiểm: mã backup dùng API; test restore file snapshot mở được và `PRAGMA integrity_check` = ok. · Nguồn: SQLite backup.html, lang_vacuum.html
- [ ] `DB-BACKUP-015` **SHOULD** MySQL: binlog bật với lưu giữ ≥ RPO, full backup định kỳ, diễn tập `mysqlbinlog --stop-datetime`. → Kiểm: `SHOW VARIABLES LIKE 'log_bin'` = ON; `binlog_expire_logs_seconds` ≥ chu kỳ full; bản ghi diễn tập. · Nguồn: MySQL 8.4 §9.5 Point-in-Time Recovery

### Mô hình dữ liệu, chuẩn hoá, khoá, kiểu dữ liệu, soft-delete, audit

Nguồn khung: [`09-database/data-modeling.md`](.xtemplates/framework/09-database/data-modeling.md)

- [ ] `DB-MODEL-010` **SHOULD** Mô hình dữ liệu có từ điển dữ liệu: mỗi bảng/cột quan trọng có mô tả (`COMMENT ON`) và phân loại nhạy cảm (public/internal/PII/secret). → Kiểm: `COMMENT` phủ ≥ 90% bảng; cột PII gắn nhãn (comment hoặc bảng phân loại) — dùng ở [`sensitive-data-and-access.md`](.xtemplates/framework/09-database/sensitive-data-and-access.md). · Nguồn: OWASP ASVS 5.0 V14.1.1 (phân loại dữ liệu nhạy cảm)
- [ ] `DB-MODEL-011` **SHOULD** Dùng `text` + `CHECK` thay `varchar(n)` tuỳ tiện; mã định danh ngoài (mã đơn, số hoá đơn) có `UNIQUE` và định dạng `CHECK` regex. → Kiểm: lint schema; test chèn mã sai định dạng bị từ chối. · Nguồn: P6
- [ ] `DB-MODEL-012` **SHOULD** Phi chuẩn hoá (cột tổng, cache đếm, JSONB) có ghi lý do trong comment/ADR và có job/trigger đồng bộ + test "tính lại từ nguồn = giá trị cache". → Kiểm: test đối chiếu; comment trên cột. · Nguồn: P5
- [ ] `DB-MODEL-013` **SHOULD** Trạng thái nghiệp vụ (đơn hàng, thanh toán) là máy trạng thái: bảng/CHECK liệt kê trạng thái, chuyển trạng thái kiểm ở một hàm/service duy nhất, lịch sử chuyển được ghi. → Kiểm: test chuyển trạng thái không hợp lệ bị từ chối; bảng `*_status_history`. · Nguồn: [`../01-baseline/data-correctness.md`](.xtemplates/framework/01-baseline/data-correctness.md)
- [ ] `DB-MODEL-014` **SHOULD** Cột JSONB có `CHECK` kiểu/khoá bắt buộc và GIN index khi truy vấn theo nội dung; schema JSON của cột commit trong repo. → Kiểm: `contracts/db/<table>.<col>.schema.json`; test chèn JSON sai bị từ chối. · Nguồn: PostgreSQL 18 JSON types
- [ ] `DB-MODEL-015` **SHOULD** Bảng lớn theo thời gian (log, sự kiện, đo lường) phân vùng theo khoảng (range) ngay từ đầu khi dự kiến vượt bộ nhớ máy chủ; có chính sách xoá/lưu trữ phân vùng cũ. → Kiểm: `\d+` cho thấy partitioned table; job detach/drop phân vùng theo lịch. · Nguồn: PostgreSQL 18 §5.12 (partition khi bảng > RAM; vài nghìn partition là trần hợp lý)
- [ ] `DB-MODEL-016` **SHOULD** Cột văn bản so sánh không phân biệt dấu/hoa thường (tên, email) có chiến lược rõ: `citext`, hoặc index trên `lower(f_unaccent(col))` với `f_unaccent` là hàm bọc **IMMUTABLE** gọi `public.unaccent('public.unaccent'::regdictionary, $1)` — `unaccent()` của extension là STABLE nên PostgreSQL từ chối nó trực tiếp trong index biểu thức và cột generated (xem [`search-and-vector.md`](.xtemplates/framework/09-database/search-and-vector.md)). → Kiểm: migration tạo index biểu thức chạy được trên Postgres thật; test tìm "Nguyễn" khớp "nguyen" nếu nghiệp vụ yêu cầu. · Nguồn: [`search-and-vector.md`](.xtemplates/framework/09-database/search-and-vector.md)
- [ ] `DB-MODEL-017` **SHOULD** Dùng identity thay `serial`; sequence không được giả định liên tục (gap là bình thường); số thứ tự nghiệp vụ liên tục (hoá đơn) sinh bằng bảng đếm có khoá. → Kiểm: grep `serial` trong migration mới = 0; test số hoá đơn liên tục dưới đồng thời. · Nguồn: PostgreSQL 18 §5.3 Identity Columns

### Index, truy vấn, N+1, EXPLAIN, pool kết nối

Nguồn khung: [`09-database/indexing-and-query-performance.md`](.xtemplates/framework/09-database/indexing-and-query-performance.md)

- [ ] `DB-PERF-010` **SHOULD** Index composite thiết kế theo truy vấn: cột `=` trước, cột khoảng/sắp xếp sau; không tạo index trùng/tiền tố của index khác. → Kiểm: script liệt kê index dư thừa (tiền tố của index khác) và index chưa dùng (`pg_stat_user_indexes.idx_scan = 0` sau N ngày) → ticket gỡ. · Nguồn: PostgreSQL 18 §11.3 Multicolumn Indexes
- [ ] `DB-PERF-011` **SHOULD** Dùng partial index cho tập con nóng (ví dụ `WHERE status = 'pending'`, `WHERE deleted_at IS NULL`) và covering index (`INCLUDE`) cho truy vấn chỉ đọc vài cột. → Kiểm: EXPLAIN cho thấy `Index Only Scan`/index partial được dùng; `Heap Fetches` thấp. · Nguồn: PostgreSQL 18 CREATE INDEX (partial, INCLUDE)
- [ ] `DB-PERF-012` **SHOULD** PgBouncer transaction mode: ứng dụng không dựa vào trạng thái phiên (`SET` không `LOCAL`, `LISTEN`, prepared statement cấp SQL); `max_prepared_statements` cấu hình; sau migration đổi kiểu chạy `RECONNECT`. → Kiểm: test suite chạy qua PgBouncer transaction mode xanh; runbook migration có bước `RECONNECT`. · Nguồn: PgBouncer config (pool_mode, max_prepared_statements, "cached plan must not change result type")
- [ ] `DB-PERF-013` **SHOULD** Đọc nặng/báo cáo chạy trên replica hoặc bảng tổng hợp; ứng dụng phân luồng read/write tường minh. → Kiểm: cấu hình `READ_REPLICA_URL`; truy vấn báo cáo gắn nhãn read-only. · Nguồn: [`../05-architecture/resilience-and-scalability.md`](.xtemplates/framework/05-architecture/resilience-and-scalability.md)
- [ ] `DB-PERF-014` **SHOULD** Dữ liệu test hiệu năng có kích thước gần production (ẩn danh hoá) vì plan đổi theo kích thước; EXPLAIN trên bảng nhỏ không chứng minh gì. → Kiểm: môi trường perf có bảng lớn tương đương; báo cáo nêu số dòng. · Nguồn: PostgreSQL 18 §14.1 (small tables không đại diện) · [`../14-testing-quality/test-data-and-fixtures.md`](.xtemplates/framework/14-testing-quality/test-data-and-fixtures.md)
- [ ] `DB-PERF-015` **SHOULD** Nạp dữ liệu lớn dùng `COPY`, tạo index sau khi nạp, `ANALYZE` sau cùng. → Kiểm: script import dùng COPY; `ANALYZE` ở cuối. · Nguồn: PostgreSQL 18 §14.4 Populating a Database
- [ ] `DB-PERF-016` **SHOULD** Bảng rất lớn theo thời gian: BRIN hoặc phân vùng theo khoảng, giữ số phân vùng trong mức planner xử lý tốt. → Kiểm: `EXPLAIN` cho thấy partition pruning; số phân vùng ghi trong tài liệu. · Nguồn: PostgreSQL 18 §5.12 Partitioning
- [ ] `DB-PERF-017` **SHOULD** Transaction ngắn: không gọi mạng/LLM/chờ người dùng trong transaction; thời gian transaction là metric. → Kiểm: lint/review; metric `pg_stat_activity` idle in transaction gần 0. · Nguồn: PostgreSQL 18 §13.2 (tránh idle in transaction) · [`transactions-and-consistency.md`](.xtemplates/framework/09-database/transactions-and-consistency.md)

### Migration có phiên bản, lũy đẳng, đường lùi, expand/contract

Nguồn khung: [`09-database/migrations.md`](.xtemplates/framework/09-database/migrations.md)

- [ ] `DB-MIG-013` **SHOULD** Lint migration tự động (squawk/eugene/Atlas lint) trong pre-commit và CI với bộ rule đã chọn ghi ở repo. → Kiểm: `.squawk.toml`/cấu hình commit; job CI chạy. · Nguồn: squawk docs
- [ ] `DB-MIG-014` **SHOULD** Tên file migration có timestamp + mô tả (`20261013120000_add_orders_tenant_id.sql`); CI chặn hai migration cùng số/trùng timestamp từ hai nhánh. → Kiểm: script kiểm trùng số (như `pre-push-gate.sh` xboss). · Nguồn: catalog 23 §4.3 (`pre-push-gate.sh` trùng số migration)
- [ ] `DB-MIG-015` **SHOULD** Thêm cột có `DEFAULT` không volatile (PostgreSQL 11+ không rewrite); tránh `DEFAULT now()`-kiểu volatile trên bảng lớn trong một bước. → Kiểm: squawk rule `adding-field-with-default`; review. · Nguồn: PostgreSQL 18 ALTER TABLE Notes
- [ ] `DB-MIG-016` **SHOULD** MySQL: DDL chỉ rõ `ALGORITHM=INSTANT|INPLACE, LOCK=NONE`; thất bại nếu không hỗ trợ thay vì âm thầm COPY. → Kiểm: lint grep ALTER TABLE thiếu `ALGORITHM`; CI chạy trên MySQL cùng major. · Nguồn: MySQL 8.4 Online DDL
- [ ] `DB-MIG-017` **SHOULD** Seed/fixture tách khỏi migration (migration không chứa dữ liệu mẫu); dữ liệu tham chiếu bắt buộc (bảng tra cứu) là migration dữ liệu lũy đẳng. → Kiểm: thư mục `seeds/` riêng; migration dữ liệu dùng upsert. · Nguồn: [`../14-testing-quality/test-data-and-fixtures.md`](.xtemplates/framework/14-testing-quality/test-data-and-fixtures.md)
- [ ] `DB-MIG-018` **SHOULD** Diễn tập lùi trên staging cho mỗi phát hành chạm schema; kết quả ghi trong PR/ghi chú phát hành. → Kiểm: ghi chú phát hành có mục "đã thử lùi: <ngày, môi trường>". · Nguồn: P8

### Tìm kiếm toàn văn, vector, hybrid, phân trang kết quả

Nguồn khung: [`09-database/search-and-vector.md`](.xtemplates/framework/09-database/search-and-vector.md)

- [ ] `DB-SEARCH-010` **SHOULD** Hybrid: kết hợp FTS/BM25 và vector bằng RRF (hoặc normalization + combination ở OpenSearch), rerank cross-encoder cho top-k nhỏ; bật/tắt từng tầng được để đo đóng góp. → Kiểm: cấu hình có cờ `hybrid.enabled`, `rerank.enabled`; eval DB-SEARCH-006 chạy 3 biến thể. · Nguồn: pgvector README (hybrid search + RRF/cross-encoder) · OpenSearch hybrid query · catalog 10 §3b
- [ ] `DB-SEARCH-011` **SHOULD** Phân trang kết quả xếp hạng bằng `search_after`/keyset `(score, id)` và giới hạn độ sâu; không `OFFSET` sâu trên truy vấn vector/FTS. → Kiểm: hợp đồng API có cursor; test trang sâu bị từ chối hoặc giới hạn; OpenSearch `pagination_depth` ≤ `max_result_window`. · Nguồn: OpenSearch hybrid query (`pagination_depth`) · DB-PERF-009
- [ ] `DB-SEARCH-012` **SHOULD** Độ trễ đồng bộ index (CSDL → index) là metric có cảnh báo; giao diện ghi rõ khi dữ liệu có thể trễ. → Kiểm: metric `search_index_lag_seconds`; cảnh báo; test đo độ trễ trong tích hợp. · Nguồn: ARC-INT-014
- [ ] `DB-SEARCH-013` **SHOULD** Index chỉ chứa trường cần hiển thị/lọc; PII không vào index trừ khi có cùng kiểm soát (RLS/ACL/mã hoá). → Kiểm: schema index/`searchableAttributes` so với `data_catalog` (DB-SEC-018). · Nguồn: [`sensitive-data-and-access.md`](.xtemplates/framework/09-database/sensitive-data-and-access.md)
- [ ] `DB-SEARCH-014` **SHOULD** Truy vấn người dùng được chuẩn hoá qua `plainto_tsquery`/`websearch_to_tsquery` (không `to_tsquery` với chuỗi thô) để tránh lỗi cú pháp/injection cú pháp. → Kiểm: grep `to_tsquery(` với input người dùng = 0; test ký tự đặc biệt không gây lỗi 500. · Nguồn: PostgreSQL 18 §12.3 Controlling Text Search
- [ ] `DB-SEARCH-015` **SHOULD** Nạp/tái embed theo lô với giới hạn đồng thời và ngân sách chi phí (API embedding tính tiền); kết quả cache theo hash nội dung để không embed lại. → Kiểm: bảng `embedding_cache(content_hash, model, vector)`; test nội dung không đổi → 0 lần gọi API. · Nguồn: catalog 23 (render cache SHA-256; gọi lại = 0 khi cache hợp lệ)
- [ ] `DB-SEARCH-016` **SHOULD** Giấy phép của engine tìm kiếm được ghi trong ADR/bảng phụ thuộc: OpenSearch Apache-2.0; Meilisearch MIT; Elasticsearch AGPL/SSPL/ELv2; Redis Search theo tri-license Redis 8. → Kiểm: `docs/adr/*` hoặc SBOM/bảng license có mục này (xem [`../16-compliance-privacy/licensing-and-ip.md`](.xtemplates/framework/16-compliance-privacy/licensing-and-ip.md)). · Nguồn: LICENSE của từng dự án (Nguồn)

### Dữ liệu nhạy cảm: mã hoá, RLS, quyền tối thiểu, mặt nạ, xoá

Nguồn khung: [`09-database/sensitive-data-and-access.md`](.xtemplates/framework/09-database/sensitive-data-and-access.md)

- [ ] `DB-SEC-013` **SHOULD** Máy chủ CSDL cứng hoá theo CIS Benchmark (PostgreSQL 18 v1.0.0) hoặc checklist tương đương của nền tảng managed; sai lệch có lý do. → Kiểm: báo cáo quét (script CIS/`pgdsat` — phiên bản chưa xác minh) lưu trong `docs/ops/`; ngoại lệ ghi rõ. · Nguồn: CIS PostgreSQL Benchmark
- [ ] `DB-SEC-014` **SHOULD** Mặt nạ động theo vai trò: nhân viên hỗ trợ chỉ thấy phần cần (4 số cuối, email che) qua view; quyền cấp trên view, không trên bảng. → Kiểm: `GRANT SELECT ON v_customers_support TO support`; `\dp customers` không có quyền cho `support`; test hiển thị đã che. · Nguồn: ASVS 5.0 V14
- [ ] `DB-SEC-015` **SHOULD** Tra cứu trên cột mã hoá qua cột HMAC có khoá; không SHA thuần cho dữ liệu entropy thấp. → Kiểm: cột `email_hmac`; khoá HMAC từ KMS; không có `sha256(email)` trong code. · Nguồn: [`../12-security/appsec-web.md`](.xtemplates/framework/12-security/appsec-web.md)
- [ ] `DB-SEC-016` **SHOULD** Schema `public`: thu hồi `CREATE` khỏi `PUBLIC` (mặc định từ PostgreSQL 15) và không cấp quyền mặc định rộng; `ALTER DEFAULT PRIVILEGES` cho vai trò đọc báo cáo. → Kiểm: `\dn+ public` không có `C` cho PUBLIC; vai trò `reporting` chỉ SELECT. · Nguồn: PostgreSQL 18 §5.8 Privileges
- [ ] `DB-SEC-017` **SHOULD** Policy RLS đơn giản, dùng cột có index; đo chi phí (EXPLAIN) trên bảng lớn; hàm trong policy không đánh dấu `LEAKPROOF` tuỳ tiện. → Kiểm: EXPLAIN truy vấn chính dưới RLS dùng index `tenant_id`; grep `LEAKPROOF` có lý do. · Nguồn: PostgreSQL 18 CREATE POLICY (LEAKPROOF)
- [ ] `DB-SEC-018` **SHOULD** Dữ liệu nhạy cảm không vào cache/search index/log/sự kiện dưới dạng plaintext trừ khi có cùng kiểm soát; search index chỉ giữ trường cần. → Kiểm: schema sự kiện/index không có cột lớp PII (lint theo `data_catalog`); ARC-INT-015. · Nguồn: ASVS 5.0 V14.2.2

### Giao dịch, cô lập, khoá, idempotency, tính nhất quán

Nguồn khung: [`09-database/transactions-and-consistency.md`](.xtemplates/framework/09-database/transactions-and-consistency.md)

- [ ] `DB-TX-011` **SHOULD** Mức cô lập mặc định của ứng dụng ghi tường minh trong cấu hình kết nối/ORM và tài liệu; ngoại lệ theo use case ghi lý do. → Kiểm: `default_transaction_isolation` theo vai trò hoặc cấu hình ORM; `docs/db/transactions.md` liệt kê use case → mức. · Nguồn: PostgreSQL 18 §13.2
- [ ] `DB-TX-012` **SHOULD** Ràng buộc cần thoả ở cuối transaction khai báo `DEFERRABLE INITIALLY DEFERRED` thay vì tắt ràng buộc. → Kiểm: schema; grep không có `SET CONSTRAINTS ALL DEFERRED` tuỳ tiện hoặc `DISABLE TRIGGER`. · Nguồn: PostgreSQL 18 SET CONSTRAINTS
- [ ] `DB-TX-013` **SHOULD** Giao dịch chỉ đọc khai báo `READ ONLY` (và `DEFERRABLE` dưới Serializable) để không bị huỷ và có thể chạy trên replica. → Kiểm: helper đọc dùng `READ ONLY`; replica nhận truy vấn báo cáo. · Nguồn: PostgreSQL 18 §13.2.3
- [ ] `DB-TX-014` **SHOULD** Optimistic locking (cột `version`/`updated_at` trong `WHERE`) cho sửa bản ghi từ giao diện; xung đột trả 409 với dữ liệu hiện tại. → Kiểm: test hai người sửa cùng bản ghi → người sau nhận 409; `UPDATE … WHERE version = ?` ảnh hưởng 0 dòng → lỗi. · Nguồn: [`../08-backend/api-design.md`](.xtemplates/framework/08-backend/api-design.md)
- [ ] `DB-TX-015` **SHOULD** MySQL: hiểu gap/next-key lock của `REPEATABLE READ`; luồng chèn nhiều đồng thời cân nhắc `READ COMMITTED` theo phiên có lý do; deadlock cũng retry. → Kiểm: cấu hình mức cô lập theo use case; test deadlock → retry. · Nguồn: MySQL 8.4 InnoDB isolation levels
- [ ] `DB-TX-016` **SHOULD** Nhất quán cuối giữa CSDL và hệ ngoài (search index, cache, dịch vụ khác) đi qua outbox + đối chiếu; thời gian trễ là metric. → Kiểm: ARC-INT-003/014; metric độ trễ index. · Nguồn: [`../05-architecture/integration-patterns.md`](.xtemplates/framework/05-architecture/integration-patterns.md)

### CI/CD: job gate, required check, cache, bảo mật pipeline

Nguồn khung: [`10-workflow/ci-cd-pipeline.md`](.xtemplates/framework/10-workflow/ci-cd-pipeline.md)

- [ ] `WF-CI-016` **SHOULD** Lint workflow: actionlint + zizmor chạy trong CI trên `.github/workflows/**`; CODEOWNERS yêu cầu review thay đổi workflow. → Kiểm: job tồn tại; CODEOWNERS có `/.github/`. · Nguồn: GitHub Security hardening (CODEOWNERS cho workflows)
- [ ] `WF-CI-017` **SHOULD** Monorepo: path filter/affected graph để chỉ chạy phần đổi, nhưng `quality` vẫn tổng hợp; job bỏ qua báo `skipped` được `quality` chấp nhận có điều kiện. → Kiểm: `quality` xử lý `needs.*.result in ['success','skipped']` theo quy tắc rõ.
- [ ] `WF-CI-018` **SHOULD** Test flaky: retry có trần (vd 2) **kèm** ghi nhận và ticket; không retry vô hạn để che lỗi; theo dõi tỉ lệ flaky. → Kiểm: cấu hình retries ≤ 2; dashboard flaky; xem [`../14-testing-quality/test-strategy.md`](.xtemplates/framework/14-testing-quality/test-strategy.md).
- [ ] `WF-CI-019` **SHOULD** Báo cáo/log test upload làm artefact (retention ngắn, vd 7 ngày); không upload secrets/dump. → Kiểm: `upload-artifact` với `retention-days`; không có `.env` trong artefact.
- [ ] `WF-CI-020` **SHOULD** Fitness function cho chính CI: script kiểm `permissions` có mặt, không `write-all`, mọi `uses:` ghim SHA, job gate không `continue-on-error`, required check ↔ job khớp. → Kiểm: `xt.py ci-check` exit 0 trong cổng `lint` (bản có sẵn của khung; required check ↔ job do `protection-guard`); test thay đổi xấu → đỏ. · Nguồn: catalog 23 §3.3

### Code review: người + AI, checklist, SLA, ranh giới

Nguồn khung: [`10-workflow/code-review.md`](.xtemplates/framework/10-workflow/code-review.md)

- [ ] `WF-REVIEW-012` **SHOULD** Nhận xét gắn mức `blocker`/`should`/`nit` và nêu cách sửa; review tập trung đúng/an toàn/đơn giản trước, phong cách để máy (formatter). → Kiểm: hướng dẫn review trong `CONTRIBUTING.md`; mẫu comment.
- [ ] `WF-REVIEW-013` **SHOULD** Luật review máy đọc theo đường dẫn (vd migration phải idempotent, API phải gọi `validateAuth`, đổi prompt phải kèm golden snapshot) nằm trong repo và chạy như reviewer tự động góp ý. → Kiểm: `.opencodereview/rule.json` hoặc Semgrep rule theo glob; CI chỉ góp ý, không chặn. · Nguồn: catalog 23 §4.1, §4.3 (open-code-review, first-match-wins)
- [ ] `WF-REVIEW-014` **SHOULD** Đo và xem lại hàng tháng: thời gian chờ review p50/p95, số PR mở > 24h, tỉ lệ PR qua cổng lần đầu (`first_pass_gate_rate`), số lỗi lọt sau merge; hành động khi p95 > 48h. → Kiểm: báo cáo tháng trong `docs/ops/` hoặc dashboard. · Nguồn: DORA metrics (change lead time)
- [ ] `WF-REVIEW-015` **SHOULD** Reviewer chạy thật: checkout nhánh/preview env và bấm luồng chính cho thay đổi UI/luồng người dùng; ghi lại đã chạy gì. → Kiểm: comment review có "đã chạy: …"; preview URL trong PR ([`environments-and-config.md`](.xtemplates/framework/10-workflow/environments-and-config.md)).
- [ ] `WF-REVIEW-016` **SHOULD** Bài học lặp ≥ 2 lần từ review → hàng rào mới (lint rule, test, hook, mục checklist), không chỉ nhắc miệng (P12). → Kiểm: `TRAPS.md`/CHANGELOG ghi hàng rào mới kèm link PR gốc.
- [ ] `WF-REVIEW-019` **SHOULD** PR template có mục bắt buộc **"Hỗ trợ AI"**: phần nào do AI sinh, phần nào người đã tự kiểm và kiểm thế nào, phần nào chỉ AI kiểm; không cần (và theo [`XC-DOCAI-005`](.xtemplates/framework/18-cross-cutting/docs-for-ai-agents.md) không ghi) tên model/phiên. → Kiểm: `pull_request_template.md` có mục; `pr-policy` job kiểm mục không rỗng. · Nguồn: `seeker19110/stored` 13 §6d (PR template của Homebrew/BrewUI)
- [ ] `WF-REVIEW-020` **SHOULD** PR `fix:` có mục **"Rà cùng khuôn"** trong body: lệnh `rg`/Semgrep đã chạy để tìm cùng mẫu lỗi ở nơi khác, số chỗ trùng tìm thấy, cách xử lý từng chỗ (sửa trong PR / issue / không áp dụng kèm lý do); lỗi lặp còn ghi hàng rào mới theo `WF-REVIEW-016`. → Kiểm: `pr-policy` cảnh báo (không chặn) khi PR `fix:` thiếu mục hoặc mục rỗng. · Nguồn: `seeker19110/stored` 23 §4.5 (Sales-Hunter: template `TRAPS.md` cứng có mục "rà cả họ"; đọc 2026-10-16)

### Tài liệu sống: ADR, runbook, docs-as-code, tươi bằng máy

Nguồn khung: [`10-workflow/documentation-workflow.md`](.xtemplates/framework/10-workflow/documentation-workflow.md)

- [ ] `WF-DOC-012` **SHOULD** Đính chính giữ dấu vết: nội dung sai sửa kèm "đính chính ngày …", không xoá lịch sử; số liệu/phiên bản kèm ngày xác minh. → Kiểm: grep "đính chính" tồn tại khi có sửa số liệu; lint phiên bản thiếu ngày trong `docs/` (regex `v\d+\.\d+` không kèm `20\d\d-`). · Nguồn: `evidence-and-sources.md` §1 luật 4, 12
- [ ] `WF-DOC-013` **SHOULD** Diagram dạng text (Mermaid/D2/PlantUML) trong repo, render trong CI; C4 mức 1–2 cho kiến trúc, cập nhật cùng ADR. → Kiểm: file `.mmd`/`.d2` render không lỗi; không PNG không có nguồn text.
- [ ] `WF-DOC-015` **SHOULD** Mỗi thư mục tài liệu có `README.md` chỉ mục (file → nội dung → đọc khi nào); tài liệu không được link từ đâu → cảnh báo mồ côi. → Kiểm: script tìm `.md` không có inbound link.
- [ ] `WF-DOC-016` **SHOULD** Bàn giao phiên/người (handover) ghi vào `PROGRESS.md` mục "Bàn giao": đang dở gì, bước tiếp theo, lệnh để tiếp tục, cái gì chưa xác minh. → Kiểm: mục "Bàn giao" không rỗng khi có việc dở ([`team-and-wip.md`](.xtemplates/framework/10-workflow/team-and-wip.md)); định dạng và độ tươi theo [`LOOP-HARNESS-004`](.xtemplates/framework/11-autonomous-loop/harness-files.md)/[`005`](.xtemplates/framework/11-autonomous-loop/harness-files.md).

### Môi trường dev/staging/prod, cấu hình, secrets theo môi trường

Nguồn khung: [`10-workflow/environments-and-config.md`](.xtemplates/framework/10-workflow/environments-and-config.md)

- [ ] `WF-ENV-014` **SHOULD** Local dev: một lệnh dựng (`make dev`/`docker compose up`/devcontainer), `.env.example` đủ để chạy, seed dữ liệu mẫu; không cần tài khoản cloud để chạy luồng chính. → Kiểm: onboarding mới chạy được app ≤ 30 phút theo [`../18-cross-cutting/developer-experience.md`](.xtemplates/framework/18-cross-cutting/developer-experience.md).
- [ ] `WF-ENV-016` **SHOULD** Cấu hình có thể reload nóng chỉ cho giá trị thiết kế để reload (flag, ngưỡng); phần còn lại cần restart có kiểm soát; không đọc env mỗi request. → Kiểm: module env parse một lần; flag qua provider.
- [ ] `WF-ENV-017` **SHOULD** Môi trường ghi rõ trong mọi log/metric (`env=staging`) và banner UI ở non-prod để tránh thao tác nhầm. → Kiểm: log có trường `env`; UI non-prod có badge.

### Git, nhánh, commit, PR nhỏ, lịch sử sạch

Nguồn khung: [`10-workflow/git-and-branching.md`](.xtemplates/framework/10-workflow/git-and-branching.md)

- [ ] `WF-GIT-013` **SHOULD** Tên nhánh `type/mô-tả-ngắn` (`feat/`, `fix/`, `chore/`, `docs/`), có mã issue/spec khi có; ruleset `branch_name_pattern` nếu cần. → Kiểm: regex trong ruleset hoặc hook.
- [ ] `WF-GIT-014` **SHOULD** PR template có: mục tiêu, link spec/issue, cách xác minh (lệnh + kết quả), rủi ro/rollback, checklist DoD; PR `feat` link spec đã duyệt ([`spec-driven-development.md`](.xtemplates/framework/10-workflow/spec-driven-development.md)). → Kiểm: `.github/pull_request_template.md` tồn tại; `pr-policy` job kiểm mục bắt buộc.
- [ ] `WF-GIT-015` **SHOULD** Lịch sử tuyến tính: `required_linear_history` bật; `git pull --rebase` mặc định cho nhánh cá nhân. → Kiểm: ruleset có rule; `git config pull.rebase true` trong hướng dẫn onboarding.
- [ ] `WF-GIT-016` **SHOULD** Monorepo: CODEOWNERS theo thư mục; CI chỉ chạy phần bị ảnh hưởng (affected) nhưng cổng `quality` vẫn là một required check gom. → Kiểm: workflow dùng path filter/affected; không thêm required check rời cho job con.
- [ ] `WF-GIT-017` **SHOULD** Dependabot/Renovate gom nhóm (`groups`/`multi-ecosystem-groups`), lịch tuần, `open-pull-requests-limit` phù hợp WIP cap ([`team-and-wip.md`](.xtemplates/framework/10-workflow/team-and-wip.md)); bản vá bảo mật tách riêng. → Kiểm: `dependabot.yml` có `groups` và limit; xem [`../01-baseline/dependencies.md`](.xtemplates/framework/01-baseline/dependencies.md). · Nguồn: Dependabot options reference

### Phát hành, SemVer, CHANGELOG, tag, rollback

Nguồn khung: [`10-workflow/release-and-versioning.md`](.xtemplates/framework/10-workflow/release-and-versioning.md)

- [ ] `WF-REL-012` **SHOULD** Release notes cho người dùng (từ [`../templates/RELEASE-NOTES.md`](.xtemplates/framework/templates/RELEASE-NOTES.md)) tách khỏi CHANGELOG kỹ thuật khi có người dùng ngoài đội; ngôn ngữ của người dùng. → Kiểm: file/notes đính kèm release.
- [ ] `WF-REL-013` **SHOULD** PR bot (Dependabot/Renovate) gắn nhãn `no-changelog`/`chore` để không làm nhiễu CHANGELOG; cập nhật dependency bảo mật ghi mục Security. → Kiểm: cấu hình release-please `changelog-sections`/nhãn.
- [ ] `WF-REL-014` **SHOULD** Feature flag cho thay đổi rủi ro: deploy tắt, bật dần theo phần trăm/tenant, có kill switch; dọn flag sau khi ổn định (hạn ≤ 2 chu kỳ phát hành). → Kiểm: danh sách flag có ngày tạo/hạn dọn ([`environments-and-config.md`](.xtemplates/framework/10-workflow/environments-and-config.md)).
- [ ] `WF-REL-015` **SHOULD** Thư viện: public API khai báo rõ (docs/`exports`), test tương thích API (API extractor/`go vet`/`abi` check) trong CI; 0.y.z nói rõ "chưa ổn định". → Kiểm: job API-compat; README có mục stability.
- [ ] `WF-REL-016` **SHOULD** Đo DORA cho phát hành: deployment frequency, change lead time, change fail rate, failed deployment recovery time, rework rate — xem lại theo quý. → Kiểm: dashboard/báo cáo quý trong `docs/ops/`. · Nguồn: DORA metrics

### Spec-driven: spec là hợp đồng, tiêu chí chấp nhận, truy vết

Nguồn khung: [`10-workflow/spec-driven-development.md`](.xtemplates/framework/10-workflow/spec-driven-development.md)

- [ ] `WF-SDD-011` **SHOULD** "Sprint contract" cho agent: trước mỗi lát, generator đề xuất phạm vi + cách xác minh, evaluator/người duyệt; cầu nối giữa spec cao cấp và việc kiểm được. → Kiểm: PLAN task có mục "cách xác minh" được duyệt trước khi code. · Nguồn: Anthropic harness design (catalog 21 §2.2)
- [ ] `WF-SDD-012` **SHOULD** Spec có mục "Bằng chứng hoàn thành" điền sau khi xong: link PR, CI run, test AC, demo/preview; `status: implemented` chỉ khi mục này đủ. → Kiểm: lint: `implemented` mà thiếu link PR/CI → đỏ. · Nguồn: P1
- [ ] `WF-SDD-013` **SHOULD** Bug lặp ≥ 3 lần cùng chỗ hoặc sửa vòng thứ 4 → dừng sửa code, mở lại spec (thường spec sai), ghi ADR/TRAPS. → Kiểm: `fix:` PR thứ 3 cùng module trong 30 ngày → nhãn `spec-review`. · Nguồn: khung cũ spec §B6.3 (rework cap 3), catalog 23 §2.6
- [ ] `WF-SDD-014` **SHOULD** Spec viết ngắn, một tính năng một file, ≤ ~300 dòng; lớn hơn → tách epic thành spec con có phụ thuộc. → Kiểm: lint độ dài; spec lớn có mục "Spec con".
- [ ] `WF-SDD-015` **SHOULD** Dùng công cụ SDD có ghim phiên bản (Spec Kit `specify-cli` / OpenSpec) hoặc skill `/research` + template của khung; không trộn hai quy trình trong một repo. → Kiểm: ADR chọn công cụ; lockfile/phiên bản ghi.

### Đội, WIP, định nghĩa sẵn sàng/hoàn thành, bàn giao

Nguồn khung: [`10-workflow/team-and-wip.md`](.xtemplates/framework/10-workflow/team-and-wip.md)

- [ ] `WF-TEAM-011` **SHOULD** Dependabot/Renovate gom thành ≤ 1 PR/tuần/nhóm để không lấp WIP cap; bản vá bảo mật tách riêng và ưu tiên FIFO đặc biệt (nhãn `security`). → Kiểm: `dependabot.yml` có `groups` + `open-pull-requests-limit` ≤ cap/2. · Nguồn: catalog 23 §2.5 (13 PR Dependabot lấp cap)
- [ ] `WF-TEAM-012` **SHOULD** Việc chia nhỏ ≤ 1–2 ngày công, lát dọc có giá trị kiểm được (INVEST); việc > 1 tuần → tách trước khi Ready. → Kiểm: PLAN task có ước lượng; task > 2 ngày phải có task con. · Nguồn: DORA Working in small batches
- [ ] `WF-TEAM-013` **SHOULD** Người + agent: agent nhận việc có DoR, làm trong worktree/nhánh riêng, không tự merge, không tự nâng quyền; người giữ cổng merge và các điểm dừng bắt buộc. → Kiểm: `AGENTS.md` ghi; ruleset không cho token bot merge; xem [`../11-autonomous-loop/stop-points-and-escalation.md`](.xtemplates/framework/11-autonomous-loop/stop-points-and-escalation.md). · Nguồn: catalog 23 §4.5 (T0–T4, subagent không tự nâng tier)
- [ ] `WF-TEAM-014` **SHOULD** Quy ước giao tiếp: async-first, quyết định ghi vào issue/ADR/PROGRESS (không chỉ chat); thuật ngữ trong glossary; ngôn ngữ tài liệu thống nhất. → Kiểm: quyết định kỹ thuật tìm được trong repo (ADR/issue) không phải chỉ trong chat.
- [ ] `WF-TEAM-015` **SHOULD** Retro/nhìn lại mỗi 2–4 tuần với đầu ra là ≥ 1 hàng rào máy hoặc thay đổi quy ước có PR (P12); không retro chỉ để nói. → Kiểm: biên bản retro link PR hành động.
- [ ] `WF-TEAM-016` **SHOULD** Lịch trực/escalation khi có production: ai được gọi, trong bao lâu, kênh nào; agent cron chỉ đề xuất, không hành động đối ngoại khi không có người. → Kiểm: `docs/ops/ONCALL.md` hoặc mục trong runbook; routine prompt ghi "chỉ đề xuất". · Nguồn: catalog 21 §10 (routine chỉ đề xuất)

### Ngân sách context/token, compaction, bàn giao phiên

Nguồn khung: [`11-autonomous-loop/context-and-token-budget.md`](.xtemplates/framework/11-autonomous-loop/context-and-token-budget.md)

- [ ] `LOOP-CTX-009` **SHOULD** Đặt PreCompact hook ghi checkpoint (task hiện tại, lệnh vừa chạy, lỗi đang xử lý) trước khi nén, SessionStart(compact) nạp lại; hook luôn exit 0 (exit 2 chặn nén). → Kiểm: `.claude/settings.json` có `PreCompact` → `pre-compact.sh` → `xt.py loop checkpoint`; sau nén `loop status` có dòng "checkpoint trước nén"; test `test_pre_compact_*`. · Nguồn: Claude Code hooks docs (PreCompact/SessionStart `source: compact`, xác minh 2026-10-15)
- [ ] `LOOP-CTX-010` **SHOULD** Việc đọc dài (tài liệu, repo lạ, log CI) giao subagent `researcher`; phiên chính nhận tóm tắt có đường dẫn/URL. · Nguồn: [`orchestration-and-subagents.md`](.xtemplates/framework/11-autonomous-loop/orchestration-and-subagents.md)
- [ ] `LOOP-CTX-011` **SHOULD** Prompt hệ thống/luật/tool schema đứng trước và ổn định; nội dung biến đổi append phía sau để tận dụng prompt cache; đo `cache_read_input_tokens` > 0 trước khi tin cache có tác dụng. · Nguồn: [`../13-ai-engineering/llm-app-foundations.md`](.xtemplates/framework/13-ai-engineering/llm-app-foundations.md)
- [ ] `LOOP-CTX-013` **SHOULD** Skill/tài liệu khung nạp theo tầng (progressive disclosure): chỉ `description` thường trực, nội dung khi gọi; SKILL.md < 500 dòng. · Nguồn: Agent Skills spec
- [ ] `LOOP-CTX-014` **SHOULD** Mức suy nghĩ (`MAX_THINKING_TOKENS`/effort) đặt theo loại task: thấp cho cơ học (format, rename, boilerplate), cao cho thiết kế/debug khó; ghi trong PLAN khi khác mặc định.
- [ ] `LOOP-CTX-018` **SHOULD** Autopilot chạy một phiên tới `done`/`done-pending-human` (`loop init --single-session`): xong một mảng → gate → commit → cập nhật PROGRESS rồi làm tiếp trong cùng phiên; trạng thái trên đĩa đủ để phiên chết bất ngờ vẫn "tiếp tục" được. → Kiểm: `state.json` `single_session: true`; số phiên của một PLAN = 1 trừ khi `budget`/phiên chết. · Nguồn: ADR-0009
- [ ] `LOOP-CTX-019` **SHOULD** Ước lượng token mỗi task khi lập PLAN, nhân 1.5 dự phòng, để đặt `--max-budget-usd`/`--hours`; tổng vượt ngân sách → thu hẹp phạm vi PLAN theo tiêu chí chất lượng cuối (ghi `D-NNN`), không chia phiên; nâng ngân sách tiền là việc của người. → Kiểm: PLAN có dòng ước lượng; D-NNN cho phần cắt. · Nguồn: stored 21 §10, ADR-0008, ADR-0009
- [ ] `LOOP-CTX-020` **SHOULD** Autopilot chạy ở chế độ quyền không hỏi (`claude --permission-mode auto`; `bypassPermissions` chỉ trong container dùng một lần; `dontAsk` cho headless) — bật bằng cờ hoặc settings người dùng vì settings dự án bị bỏ qua; hook `deny` vẫn chặn. → Kiểm: `.autopilot/state.json` `permission_mode` (Stop hook ghi) ∉ {`default`, `plan`, `acceptEdits`}; Stop hook nhắc khi vi phạm. · Nguồn: Claude Code permission modes + hooks docs (`permission_mode` trong input Stop, xác minh 2026-10-15), ADR-0009

### Phản hồi về khung từ dự án đích

Nguồn khung: [`11-autonomous-loop/framework-feedback.md`](.xtemplates/framework/11-autonomous-loop/framework-feedback.md)

- [ ] `LOOP-FB-001` **SHOULD** Lỗi do khung (công cụ, hook, mục checklist, tài liệu) gặp trong dự án được ghi bằng `xt.py feedback add` ngay khi sửa xong, cùng commit với bản sửa: triệu chứng, cách khắc phục, bước tái hiện tối thiểu nếu có. → Kiểm: `docs/xtemplates-feedback/FB-*.md` có commit trùng commit sửa; `xt.py feedback list` liệt kê. · Nguồn: ADR-0010
- [ ] `LOOP-FB-002` **SHOULD** Trước khi bàn giao phiên hoặc phát hành, chạy `xt.py feedback collect` để gom MUST bị miễn và lý do autopilot bị chặn (không tạo trùng). → Kiểm: lệnh exit 0 trong báo cáo cuối; mỗi `[~]` MUST trong blueprint có FB `mien-tru` tương ứng. · Nguồn: ADR-0010
- [ ] `LOOP-FB-004` **SHOULD** Dự án đích muốn khung kéo phản hồi về thì đăng ký repo (`owner/repo`) trong `docs/ops/TARGETS.md` của repo khung, hoặc báo tay qua issue template "Phản hồi từ dự án đích". → Kiểm: repo có trong `TARGETS.md` hoặc có issue nhãn `feedback`. · Nguồn: ADR-0010
- [ ] `LOOP-FB-005` **SHOULD** Routine hằng tuần đọc `.xtemplates/VERSION` (nhãn `<VERSION> (<git sha>)`) của mỗi đích trong `docs/ops/TARGETS.md` và ghi vào REPORT bảng **"đích × bản khung × số tuần chậm"** (so với bản khung hiện hành); đích chậm hơn 1 minor hoặc quá 4 tuần thì nêu rõ trong REPORT kèm đề xuất chạy lại `install.py`. Không cần đổi mã `xt.py`. → Kiểm: `docs/ops/feedback/REPORT-<ngày>.md` có bảng này, mỗi repo trong `TARGETS.md` một dòng. · Nguồn: `seeker19110/stored` 23 §4.2, §8 (X-Scanner adopt trước #287 nên thiếu `auto-complete-guard.sh`: drift khung ↔ đích; đọc 2026-10-16)

### File harness: PLAN · PROGRESS · BLUEPRINT · evidence · state

Nguồn khung: [`11-autonomous-loop/harness-files.md`](.xtemplates/framework/11-autonomous-loop/harness-files.md)

- [ ] `LOOP-HARNESS-013` **SHOULD** Bẫy đã mắc thật ghi vào `TRAPS.md` theo mẫu triệu chứng → nguyên nhân → cách rà → chốt chặn → ngày/PR; `fix:` lặp lại phải trỏ tới mục TRAPS. → Kiểm: PR `fix:` có link `TRAPS.md#...` khi lỗi tái phát. · Nguồn: stored 23 §2.4
- [ ] `LOOP-HARNESS-014` **SHOULD** Danh sách tính năng dạng máy đọc (`features.json` hoặc PLAN) chỉ cho phép agent đổi trường trạng thái, không xoá/sửa tiêu chí. → Kiểm: CI diff: số task không giảm; tiêu chí không đổi ngoài cột trạng thái. · Nguồn: Anthropic harness 2025-11-26
- [ ] `LOOP-HARNESS-015` **SHOULD** Bằng chứng chạy thật của mỗi mốc (đầu ra lệnh, ảnh, báo cáo) lưu `docs/bang-chung/<ngày>/`, tách khỏi tuyên bố trong README. → Kiểm: thư mục tồn tại cho mỗi G7; README trỏ tới.
- [ ] `LOOP-HARNESS-018` **SHOULD** Hook **không** có biến môi trường tắt riêng (biến tắt guard = nới hàng rào, agent tự đặt được); tắt có chủ đích dùng cơ chế của harness mà người thấy (Claude Code: `"disableAllHooks": true` ở settings người dùng). Mọi hook fail-open về luồng khi stdin rỗng/không phải JSON hoặc thiếu công cụ (jq/python). → Kiểm: hook không đọc biến kiểu `*_DISABLE*`/`*_SKIP_HOOK*`; `tests/` chạy từng hook với stdin rỗng và rác → exit 0, không ra quyết định chặn; guard Bash hỏi người khi lệnh mở phiên agent bỏ qua hook (Claude Code: `--bare`, `--safe-mode`, `--settings`, `--setting-sources`, `--restricted`, `CLAUDE_CODE_SIMPLE`/`CLAUDE_CODE_SAFE_MODE`, chuỗi `disableAllHooks`). · Nguồn: Claude Code docs _Hooks_ (`disableAllHooks`) và _CLI reference_ (cờ/biến bỏ qua hook), đọc 2026-10-15
- [ ] `LOOP-HARNESS-019` **SHOULD** Công cụ memory ngoài cho coding agent (agentmemory, claude-mem…) chỉ dùng để **tra cứu**, không thay `PROGRESS.md`/`TRAPS.md`/`PLAN.md`; tắt chèn tự động đầu phiên ở repo nhạy cảm, bind loopback, bật lọc bí mật trước khi lưu. → Kiểm: cấu hình công cụ (`auto-inject` tắt, bind `127.0.0.1`); `PROGRESS.md` vẫn qua `xt.py progress-check`. · Nguồn: `seeker19110/stored` 10 §4b (agentmemory)
- [ ] `LOOP-HARNESS-020` **SHOULD** Mỗi lần chạy autopilot bắt đầu bằng audit khung đã cài và sửa phần an toàn trước khi lập kế hoạch: hook bắt buộc (SessionStart · PreCompact · PreToolUse · Stop) có trong settings và file hook (kể cả file chúng nạp) tồn tại, đúng cú pháp; `CLAUDE.md` import `AGENTS.md`; `xt.yaml` đủ khoá; `.autopilot/` bị gitignore; state không hỏng; khung `validate` xanh. Hook thiếu fail-open nên **không tự lộ** — chỉ máy kiểm mới thấy. Sửa tự động chỉ phần đảo ngược được; hook/settings là điểm dừng, để người cài lại. → Kiểm: `xt.py doctor --fix` exit 0 trước `loop init` (`loop init` cảnh báo trên stderr khi còn lỗi). · Nguồn: `scripts/xt.py` (`doctor_findings`), `.claude/hooks/_lib.sh` (fail-open) — đọc 2026-10-15
- [ ] `LOOP-HARNESS-021` **SHOULD** Bổ sung cho `LOOP-HARNESS-019` khi dùng công cụ memory ngoài: (1) chỉ bật **một** công cụ (engram, claude-mem, agentmemory… cùng hook SessionStart/UserPromptSubmit và cùng chèn context mỗi lượt); (2) kho memory nằm **ngoài repo**, quyền chỉ chủ sở hữu, coi là dữ liệu nhạy cảm vì có công cụ lưu **nguyên văn prompt**; nội dung nhạy cảm bọc thẻ loại trừ của công cụ (vd `<private>…</private>`); (3) tính năng đồng bộ memory **vào repo** (vd `engram sync` ghi `.engram/`) tắt ở repo công khai, ở repo riêng thì thư mục đó phải qua quét bí mật trước commit. → Kiểm: `xt.py doctor` không có cảnh báo `memory` (đếm công cụ memory theo tên trong `enabledPlugins` cấp người dùng/dự án/cục bộ và MCP server ở `~/.claude.json` + `.mcp.json`, ≤ 1; `.engram/` không nằm trong git); `stat -c %a` thư mục kho memory = `700`; repo riêng: gitleaks quét `.engram/` = 0 phát hiện. · Nguồn: `seeker19110/stored` 10 §4c (engram: hook lưu prompt cục bộ và chèn chỉ thị mỗi lượt, Git Sync ghi `.engram/` vào repo, `<private>` lọc hai tầng)
- [ ] `LOOP-HARNESS-022` **SHOULD** Phiên autopilot không người trực chạy trong sandbox mức hệ điều hành của host (ghi giới hạn trong workspace, mạng chặn mặc định + allowlist registry/git) hoặc trong devcontainer/VM có egress allowlist; guard hook không phải sandbox (chỉ thấy lệnh qua tool, không chặn tiến trình con hay mạng). Nâng thành **MUST@L** khi phiên chạy không người trực với quyền ghi và mạng. Tên khoá cấu hình sandbox cụ thể của Claude Code: (chưa xác minh) — đọc tài liệu hiện hành, không đoán tên. → Kiểm: từ trong phiên chạy `curl` tới domain ngoài allowlist → bị chặn; ghi lệnh + output làm bằng chứng (`loop record`); thử ghi ngoài workspace → bị từ chối. · Nguồn: stored 11 §3/§3b (`anthropics/sandbox-runtime`: Seatbelt/bubblewrap, proxy allowlist)

### Thiết kế vòng lặp: 4 con số, tiêu chí dừng máy kiểm, bằng chứng

Nguồn khung: [`11-autonomous-loop/loop-design.md`](.xtemplates/framework/11-autonomous-loop/loop-design.md)

- [ ] `LOOP-DESIGN-011` **SHOULD** Lỗi lần 2 cùng bước → đổi cách tiếp cận và ghi vào `PROGRESS.md` trước khi thử lại; không sửa máy móc lần 3. → Kiểm: `PROGRESS.md` mục Quyết định có dòng "đổi cách" trước evidence lần 3. · Nguồn: stored 23 §6.1
- [ ] `LOOP-DESIGN-012` **SHOULD** Prefix prompt ổn định để tận dụng cache: chỉ nối thêm, không sửa đầu hội thoại, không chèn timestamp vào system prompt. → Kiểm: `usage.cache_read_input_tokens > 0` ở lượt thứ hai trở đi (headless `--output-format json`).
- [ ] `LOOP-DESIGN-013` **SHOULD** Người sinh và người chấm tách nhau: lệnh Gate do code chạy, reviewer không đọc lời giải thích của agent viết code. → Kiểm: `reviewer` subagent chỉ nhận diff + SPEC; Gate là lệnh trong `xt.yaml`, không phải prompt.
- [ ] `LOOP-DESIGN-014` **SHOULD** Ghi ngày tạo và giả định về model vào harness; xét lại hàng rào khi đổi model hoặc sau 90 ngày. → Kiểm: `.claude/settings.json` hoặc `docs/adr/` có ADR harness kèm ngày; lịch xét lại trong `PROGRESS.md`. · Nguồn: Anthropic harness design 2026-03-24
- [ ] `LOOP-DESIGN-015` **SHOULD** Ngân sách có circuit breaker 3 nấc: cảnh báo 80 %, thu hẹp 90 % (không nhận task mới), dừng 100 %. → Kiểm: `hook-stop` reason hiện `vòng N/M`; `PROGRESS.md` ghi bàn giao khi `N ≥ 0.8·M`. · Nguồn: stored 21 §8
- [ ] `LOOP-DESIGN-016` **SHOULD** Đo DORA baseline (lead time, change failure rate, lỗi lọt) trước khi bật tự trị để có số so sánh. → Kiểm: file baseline trong `docs/ops/` có ngày và 4 chỉ số. · Nguồn: stored 21 §8
- [ ] `LOOP-DESIGN-019` **SHOULD** Vòng bảo trì (G8 → task mới) kích hoạt bằng ngưỡng tất định, không bằng model đọc log: script so chỉ số (tỉ lệ fail CI, 5xx sau deploy…) với baseline; quyền agent tăng theo độ lệch — 1σ chỉ ghi log, 2σ chẩn đoán read-only, 3σ chỉ được mở PR/issue hoặc chạy runbook đã duyệt trước; kết quả thành task/SPEC mới và đi qua cổng như mọi task. → Kiểm: file bậc có version (vd `docs/ops/bands.yaml`) ghi baseline + allowlist tool từng bậc, không bậc nào có quyền merge/deploy; log mỗi lần gọi có thời điểm, bậc, kết quả triage. · Nguồn: Anthropic AI-native SDLC playbook (2026-08-21) stage 6
- [ ] `LOOP-DESIGN-020` **SHOULD** Mỗi lát dọc chạy được (một task hoặc nhóm task PLAN có Gate xanh) là một nhánh + một PR nhỏ tách từ nhánh đích mới nhất, mở ngay khi Gate của lát xanh — không dồn "PR cuối"; lát phụ thuộc PR chưa merge thì nhánh chồng lên nhánh đó, merge theo FIFO (`LOOP-ORCH-013`); sau khi PR đáy merge: đổi đích PR chồng về nhánh mặc định (`gh pr edit <N> --base main` hoặc API), `git fetch origin main && git merge origin/main` vào nhánh chồng (squash để lại commit trùng của lát đáy; merge, không rebase/force-push), push, chạy lại `merge-check` — PR còn nhắm nhánh khác nhánh mặc định thì `merge-check` trả `wait`; PR đã mở được `xt.py merge-check` quyết mỗi vòng và tự merge bằng lệnh ghim head khi verdict `merge` (`LOOP-STOP-022`), làn chuẩn để người; ở `merge_autonomy: L3` (mặc định) mở PR xong bật auto-merge ngay (`gh pr merge <N> --auto --squash` hoặc MCP `enable_pr_auto_merge`), trừ PR chồng — bật sau khi nó đổi đích về nhánh mặc định (ADR-0015; `delete_branch_on_merge` bật thì GitHub tự đổi đích) — và PR `merge-check` báo `hard` (ngoại lệ cứng, người merge — ADR-0016). → Kiểm: số PR đã mở ≈ số lát trong `PLAN.md`; mỗi PR ≤ 1 lát (diff chỉ chạm file của task đó); log có `merge-check` trước mỗi merge. · Nguồn: ADR-0014 của repo khung; [`../00-method/lifecycle.md`](.xtemplates/framework/00-method/lifecycle.md) G6
- [ ] `LOOP-DESIGN-021` **SHOULD** Task chạm UI do agent làm: Gate gồm lệnh chụp ảnh các màn đã đổi (≥ 320 px và desktop, hai theme), lưu vào evidence gắn commit SHA; trước khi xem ảnh agent ghi kỳ vọng và falsifier (điều kiện mà nếu thấy thì kết luận sai); báo cáo tách `measured` và `unmeasured`, nhận định của agent khi nhìn ảnh mang nhãn `asserted-not-measured` và không thay được test; đổi baseline visual (`*-snapshots/`, `__snapshots__/`) phải kèm ảnh trước/sau và được người hoặc reviewer khác model duyệt. → Kiểm: Gate trong PLAN chạy lệnh chụp (vd Playwright `toHaveScreenshot`) và ảnh nằm trong evidence theo SHA; báo cáo cuối có hai mục `measured`/`unmeasured`; PR đổi `*-snapshots/` có ảnh trước/sau và review khác model. · Nguồn: stored 06 §7d.3 (hook Stop buộc ghi UNMEASURED), 22 §0/§5.2 (không claim xong khi chưa re-render; contact sheet), 23 §6.1 (thang assert → preview → screenshot sau khi viết kỳ vọng và falsifier)

### Điều phối: subagent, worktree, song song, không lồng

Nguồn khung: [`11-autonomous-loop/orchestration-and-subagents.md`](.xtemplates/framework/11-autonomous-loop/orchestration-and-subagents.md)

- [ ] `LOOP-ORCH-010` **SHOULD** Dùng mô hình nhánh A (một nhánh, task = commit) mặc định; chỉ chuyển sang worktree (`isolation: worktree`) khi task độc lập file và cần ≥ 2 executor đồng thời. · Nguồn: stored 23 §4.5
- [ ] `LOOP-ORCH-011` **SHOULD** Subagent trả báo cáo ≤ 25 dòng theo khuôn: đã làm · lệnh + exit code · còn treo · đề xuất; không trả transcript dài về phiên chính.
- [ ] `LOOP-ORCH-012` **SHOULD** Việc đọc dài (tài liệu, log, repo lạ) giao `researcher` để giữ context phiên chính; phiên chính chỉ nhận tóm tắt có URL/đường dẫn. · Nguồn: [`context-and-token-budget.md`](.xtemplates/framework/11-autonomous-loop/context-and-token-budget.md)
- [ ] `LOOP-ORCH-013` **SHOULD** Nhiều PR mở cùng lúc merge theo FIFO (tạo trước merge trước), cập nhật nhánh sau với `main` rồi mới merge tiếp. · Nguồn: [`../10-workflow/git-and-branching.md`](.xtemplates/framework/10-workflow/git-and-branching.md)
- [ ] `LOOP-ORCH-014` **SHOULD** Subagent thất bại 2 lần cùng task → phiên chính đổi cách tiếp cận hoặc chia nhỏ task, không giao lại nguyên văn; lần 3 → hỏi người. · Nguồn: stored 23 §4.5
- [ ] `LOOP-ORCH-015` **SHOULD** Khi cần đa dạng phương án (thiết kế, cách sửa bug khó), chạy ≥ 2 subagent **ngữ cảnh tách biệt** rồi phiên chính so sánh; chỉ cho việc mở, vì tốn ~5–10× chi phí. · Nguồn: stored 21 §6

### Agent tự sửa CI/review: giới hạn, cấm, bằng chứng

Nguồn khung: [`11-autonomous-loop/self-healing-ci.md`](.xtemplates/framework/11-autonomous-loop/self-healing-ci.md)

- [ ] `LOOP-CI-012` **SHOULD** Test nghi flake: agent ghi bằng chứng (run đỏ và xanh trên cùng commit) và mở issue; việc gắn `@flaky`/cách ly khỏi cổng là nới cổng nên đi qua người duyệt (`loop defer`), không tự làm trong vòng tự động; không retry nhiều lần trong CI để che. → Kiểm: issue có hai run ID cùng SHA; commit thêm `@flaky` có người duyệt PR. · Nguồn: [`../14-testing-quality/test-strategy.md`](.xtemplates/framework/14-testing-quality/test-strategy.md) (`QA-STRAT-009`)
- [ ] `LOOP-CI-013` **SHOULD** Sửa lint/format đi commit riêng `style:`; sửa logic đi commit `fix:` để review tách bạch.
- [ ] `LOOP-CI-014` **SHOULD** Kiểm `system/init` của phiên headless: `plugin_errors`/`mcp_server_errors` không rỗng → fail job sớm thay vì chạy thiếu cổng. · Nguồn: Claude Code headless docs
- [ ] `LOOP-CI-015` **SHOULD** Pin mọi action/CLI trong workflow theo SHA hoặc phiên bản khoá; agent không tự nâng. · Nguồn: [`../12-security/supply-chain.md`](.xtemplates/framework/12-security/supply-chain.md)
- [ ] `LOOP-CI-016` **SHOULD** Sau khi PR merge, agent quay về `main`, xoá nhánh đã merge, cập nhật `PROGRESS.md` với SHA merge.

### Điểm dừng bắt buộc, mức tin cậy T0–T4, leo thang

Nguồn khung: [`11-autonomous-loop/stop-points-and-escalation.md`](.xtemplates/framework/11-autonomous-loop/stop-points-and-escalation.md)

- [ ] `LOOP-STOP-011` **SHOULD** Lỗi lần 2 cùng bước → đổi cách tiếp cận trước khi thử lại; ghi vào PROGRESS mục Quyết định. → Kiểm: evidence lần 2 và 3 có `cmd`/diff khác nhau; PROGRESS có dòng "đổi cách". · Nguồn: stored 23 §6.1
- [ ] `LOOP-STOP-012` **SHOULD** Người giữ review mẫu ≥ 10 % PR ở mọi mức tự chủ để hiệu chuẩn niềm tin vào reviewer máy. → Kiểm: báo cáo tháng có tỉ lệ review mẫu. · Nguồn: spec cũ §B10
- [ ] `LOOP-STOP-013` **SHOULD** Lần đầu sửa file trong vùng rủi ro (`risk-zones.txt`) trong phiên → hook yêu cầu nêu 4 dữ kiện (mục đích, test phủ, rollback, ảnh hưởng) rồi mới cho sửa. → Kiểm: hook `risk-zone-gate` trả `deny` lần 1 kèm 4 câu hỏi, lần 2 cho qua. · Nguồn: stored 23 §4.3
- [ ] `LOOP-STOP-014` **SHOULD** Routine/cron không người trực chỉ **đề xuất** hành động đối ngoại (mở issue/PR nháp), không gửi/đăng/merge. → Kiểm: workflow lịch không có `contents: write` trừ job tách riêng tạo PR nháp. · Nguồn: stored 21 §10
- [ ] `LOOP-STOP-015` **SHOULD** Lý do `loop block` đủ để người quyết trong một lần đọc: ngữ cảnh, 2–3 lựa chọn, đề xuất, hệ quả. → Kiểm: `blocked_reason` ≥ 3 câu hoặc trỏ tới mục PROGRESS.
- [ ] `LOOP-STOP-019` **SHOULD** Báo cáo cuối việc/bàn giao liệt kê các `D-NNN` mới trong kỳ để người xem lại; người đổi ý → quyết định mới ghi "thay D-NNN", không sửa mục cũ. → Kiểm: báo cáo cuối/PR có dòng "Quyết định tự duyệt: D-…"; `git log -p docs/autopilot/DECISIONS.md` chỉ thêm dòng. · Nguồn: ADR-0008
- [ ] `LOOP-STOP-020` **SHOULD** Phương án cần thông tin/tài khoản/khoá chỉ chủ dự án có → chọn phương án tự host chạy được trong repo (giấy phép OSI) và ghi đề xuất dịch vụ cho lúc chạy thật bằng `loop decide --prod`; không dừng xin khoá khi phát triển. → Kiểm: `docker compose up` (hoặc lệnh `xt.yaml`) chạy đủ phụ thuộc không cần khoá ngoài; `GO-NO-GO.md` liệt kê mọi dòng "Khi chạy thật" của `DECISIONS.md`. · Nguồn: ADR-0008
- [ ] `LOOP-STOP-021` **SHOULD** Việc cần người (điểm dừng về hành động) **không chặn cả vòng**: `xt.py loop defer --task <T-NNN|ID blueprint> --reason …` rồi làm việc độc lập khác; `loop block` chỉ khi mọi việc còn lại phụ thuộc nó; hết việc tự làm được → verdict `done-pending-human`, người xử lý gom một lần rồi `loop resume`. → Kiểm: `state.json.deferred` có lý do; `loop status` liệt kê "chờ người"; test `test_defer_status_hook_stop_and_resume_flow`. · Nguồn: ADR-0009
- [ ] `LOOP-STOP-022` **SHOULD** Thời điểm merge PR đã mở do máy quyết: `xt.py merge-check [--pr N]` đọc PR qua REST (`gh api`, chạy được cả ở phiên chặn GraphQL; review: lần mới nhất của mỗi người, `mergeable_state` BLOCKED → `human`) (trạng thái, nháp, xung đột, CI, review, tụt sau nhánh đích, file, nhãn) → `merge` · `wait` · `update` · `fix` · `human` · `closed`; agent làm đúng bước `next` (merge bằng lệnh ghim head: `gh pr merge --match-head-commit`, hoặc khi phiên chặn GraphQL `gh api -X PUT repos/{owner}/{repo}/pulls/N/merge -f sha=…` / tool MCP `merge_pull_request` có `expectedHeadSha`; dưới L3 không bật auto-merge của GitHub — không ghim được head; ở L3 mở PR là bật auto-merge (`gh pr merge --auto`/MCP `enable_pr_auto_merge`, trừ PR chồng và PR có `hard` — ADR-0015, ADR-0016); `update` = `gh pr update-branch`, `wait` = chạy lại sau, `human` = báo người kèm lý do). Không có check CI nào xanh → `human`. → Kiểm: `xt.py merge-check --json` có trong log trước mỗi lệnh merge; guard chỉ `allow` khi verdict `merge`, head khớp và (MCP) repo khớp. · Nguồn: ADR-0013, ADR-0014 của repo khung

### Bảo mật AI: prompt injection, tool allowlist, OWASP LLM/ASI/MCP

Nguồn khung: [`12-security/ai-security.md`](.xtemplates/framework/12-security/ai-security.md)

- [ ] `SEC-AI-020` **SHOULD** Chính sách mới cho tool/egress chạy chế độ **log-only** trước khi enforce để đo false positive; chuyển enforce khi có số liệu. → Kiểm: cờ `mode: log|enforce` theo policy; dashboard số lần chặn. · Nguồn: catalog stored 12 §4 quy tắc 3
- [ ] `SEC-AI-021` **SHOULD** Plugin/MCP server không được đưa tool ra ngoài sandbox của host; MCP stdio chạy với quyền của sandbox, không quyền người dùng. → Kiểm: cấu hình MCP server chạy trong container/runsc; test server cố đọc `~/.ssh` → chặn. · Nguồn: catalog stored 12 §4 quy tắc 7; MCP09
- [ ] `SEC-AI-022` **SHOULD** Agent chỉ được **thêm** policy chặt hơn, không gỡ; tool tự lên lịch (cron/routine) phải qua ASK. → Kiểm: API policy không có endpoint xoá cho identity agent; hook `ask` cho `create_trigger`/lịch. · Nguồn: catalog stored 01 §3f (mẫu mặc định tốt)
- [ ] `SEC-AI-023` **SHOULD** Phát hiện trôi hành vi: baseline số tool call/phiên, tool lạ, giờ lạ, tỷ lệ bị chặn; vượt → cảnh báo và tạm dừng phiên bản agent. → Kiểm: metric + alert cấu hình; diễn tập 1 lần. · Nguồn: ASI10; khung cũ spec C7-FR-07
- [ ] `SEC-AI-024` **SHOULD** Agent nhận agent khác (A2A) xác thực bằng scheme đã khai (OAuth2/OIDC/mTLS), Agent Card ký số khi có; output agent khác coi như nội dung ngoài. → Kiểm: cấu hình security scheme; test message không chữ ký → từ chối. · Nguồn: ASI07; [`../13-ai-engineering/protocols-mcp-a2a.md`](.xtemplates/framework/13-ai-engineering/protocols-mcp-a2a.md)

### AppSec web/API: injection, XSS, CSRF, SSRF, IDOR, header, CSP

Nguồn khung: [`12-security/appsec-web.md`](.xtemplates/framework/12-security/appsec-web.md)

- [ ] `SEC-WEB-017` **SHOULD** Redirect sau login/logout chỉ tới đường dẫn tương đối hoặc allowlist host; không `redirect(request.GET['next'])` thô. → Kiểm: test `?next=https://evil.example` → về trang mặc định. · Nguồn: ASVS 5.0 V3 (open redirect)
- [ ] `SEC-WEB-018` **SHOULD** Phân trang/lọc có giới hạn trên (`limit` tối đa, độ sâu lọc) để tránh cạn tài nguyên; truy vấn nặng có timeout. → Kiểm: test `limit=1000000` → bị cắt về tối đa; timeout CSDL cấu hình. · Nguồn: API Top 10 2023 API4
- [ ] `SEC-WEB-019` **SHOULD** Có inventory API (OpenAPI) sinh từ code hoặc kiểm khớp code; endpoint không có trong spec hoặc endpoint debug/cũ không được phục vụ ở production. → Kiểm: test so route runtime với spec; route `/debug`, `/v0` = 0 ở production. · Nguồn: API Top 10 2023 API9; [`../08-backend/api-design.md`](.xtemplates/framework/08-backend/api-design.md)
- [ ] `SEC-WEB-020` **SHOULD** Phản hồi từ API bên thứ ba được validate như đầu vào người dùng (schema, kích thước, timeout), không tin "vì là đối tác". → Kiểm: client wrapper có schema + timeout; test với phản hồi dị dạng. · Nguồn: API Top 10 2023 API10
- [ ] `SEC-WEB-021` **SHOULD** HTML/SVG do người dùng tải lên được phục vụ từ origin riêng (sandbox domain) hoặc với `Content-Disposition: attachment`. → Kiểm: cấu hình storage/CDN; test tải `.svg` → không chạy script trên origin chính. · Nguồn: OWASP File Upload CS
- [ ] `SEC-WEB-022` **SHOULD** Có test bảo mật tự viết cho luồng chính (quyền theo route, CSRF, header) chạy cùng bộ test thường — không chỉ dựa vào scanner. → Kiểm: thư mục `tests/security/` tồn tại, chạy trong job test. · Nguồn: ASVS 5.0 (xác minh bằng test); P9
- [ ] `SEC-WEB-023` **SHOULD** Cookie phiên: `Secure`, `HttpOnly`, `SameSite`, prefix `__Host-` khi có thể (chi tiết vòng đời phiên ở [`../08-backend/authn-authz.md`](.xtemplates/framework/08-backend/authn-authz.md)). → Kiểm: test đọc `Set-Cookie`. · Nguồn: ASVS 5.0 V7

### Hạ tầng & mạng: least privilege, egress, TLS, sandbox, container

Nguồn khung: [`12-security/infrastructure-and-network.md`](.xtemplates/framework/12-security/infrastructure-and-network.md)

- [ ] `SEC-INFRA-018` **SHOULD** Telemetry/crash report của tool và dịch vụ tự host **tắt mặc định** hoặc opt-in tường minh; không gửi URL/task/code ra ngoài. → Kiểm: cấu hình env (`DO_NOT_TRACK=1`, `*_TELEMETRY_DISABLED=1`) trong image/compose; egress allowlist chặn domain telemetry. · Nguồn: catalog stored 11 §1c, 12 §3i
- [ ] `SEC-INFRA-019` **SHOULD** OS/host tự động vá bảo mật (unattended-upgrades/managed node image) và reboot theo cửa sổ; node image tái tạo (immutable) thay vì vá tại chỗ khi dùng K8s/ASG. → Kiểm: cấu hình auto-update; tuổi image node < 30 ngày. · Nguồn: CIS Benchmark OS
- [ ] `SEC-INFRA-020` **SHOULD** DNS cho egress đi qua resolver kiểm soát được (log + chặn domain độc), không DoH tự do từ container. → Kiểm: `resolv.conf` trỏ resolver nội bộ; firewall chặn 53/853/DoH ra ngoài. · Nguồn: NIST SP 800-207
- [ ] `SEC-INFRA-021` **SHOULD** Môi trường staging cách ly tài khoản/dự án cloud riêng với production; không chia sẻ IAM/role/kho bí mật. → Kiểm: hai account/project id khác nhau trong IaC; không cross-account role từ staging sang prod. · Nguồn: [`../10-workflow/environments-and-config.md`](.xtemplates/framework/10-workflow/environments-and-config.md)
- [ ] `SEC-INFRA-022` **SHOULD** Có kiểm thử thoát sandbox/escalation cơ bản trong CI cho môi trường chạy agent (đọc file ngoài workspace, gọi metadata, gọi domain ngoài allowlist, fork bomb bị giới hạn). → Kiểm: bộ test `tests/sandbox/` chạy trong job riêng, mọi ca bị chặn. · Nguồn: OWASP ASI05; khung cũ spec C2-FR-08

### Log bảo mật, audit trail, phát hiện, ứng phó

Nguồn khung: [`12-security/logging-audit-and-incident.md`](.xtemplates/framework/12-security/logging-audit-and-incident.md)

- [ ] `SEC-LOG-015` **SHOULD** Sự kiện bảo mật dùng mức severity riêng/ nhãn `security=true` để lọc và route; không trộn vào `info` chung. → Kiểm: schema có trường `category: security`; query `category=security` trả đúng. · Nguồn: OWASP Logging CS
- [ ] `SEC-LOG-016` **SHOULD** Có dashboard bảo mật tối thiểu: đăng nhập thất bại, 403, hành động admin, export, alert đang mở, finding scanner theo thời gian. → Kiểm: dashboard tồn tại trong IaC/JSON commit; ảnh chụp trong GO/NO-GO. · Nguồn: P10
- [ ] `SEC-LOG-017` **SHOULD** Log ở client (mobile/desktop/browser) không chứa PII/token và không gửi về server mặc định; crash report có che. → Kiểm: cấu hình SDK crash (scrub) + test. · Nguồn: OWASP Logging CS; [`../07-frontend/client-security.md`](.xtemplates/framework/07-frontend/client-security.md)
- [ ] `SEC-LOG-018` **SHOULD** Rà định kỳ (hàng quý) danh sách sự kiện bảo mật so với tính năng mới (route/tool mới có sự kiện chưa?) và so với threat model. → Kiểm: biên bản rà quý; script liệt kê route/tool thiếu `event`. · Nguồn: [`threat-modeling.md`](.xtemplates/framework/12-security/threat-modeling.md); P12

### Quản lý bí mật: lưu, xoay, quét, phạm vi

Nguồn khung: [`12-security/secrets-management.md`](.xtemplates/framework/12-security/secrets-management.md)

- [ ] `SEC-SECRET-015` **SHOULD** Dùng TruffleHog (hoặc tính năng xác minh tương đương) định kỳ để biết khoá lộ còn sống hay đã thu hồi. → Kiểm: job tuần `trufflehog git file://. --only-verified`; kết quả lưu artifact. · Nguồn: TruffleHog docs
- [ ] `SEC-SECRET-016` **SHOULD** Bật secret scanning + push protection của nền tảng git (GitHub/GitLab) nếu có; coi là lớp phụ, không thay gitleaks. → Kiểm: cài đặt repo bật; thử push chuỗi test → bị chặn. · Nguồn: GitHub docs secret scanning
- [ ] `SEC-SECRET-017` **SHOULD** Bí mật cho AI agent được broker thay thế tại egress (proxy/vault agent); model và transcript không chứa giá trị. → Kiểm: grep transcript/trace mẫu = 0 khoá; cấu hình proxy. · Nguồn: khung cũ spec C5-FR-03; OWASP MCP Top 10 MCP01
- [ ] `SEC-SECRET-018` **SHOULD** Mã hoá at-rest cho secret của orchestrator (etcd encryption, sealed state) và state IaC chứa output nhạy cảm. → Kiểm: `EncryptionConfiguration` của cluster; backend state IaC mã hoá + ACL (xem [`../15-operations/infrastructure-as-code.md`](.xtemplates/framework/15-operations/infrastructure-as-code.md)). · Nguồn: NIST SP 800-190 §4; Terraform docs (state chứa secret)
- [ ] `SEC-SECRET-019` **SHOULD** Webhook nhận từ bên ngoài có secret HMAC riêng cho từng đối tác và so sánh hằng thời gian. → Kiểm: test chữ ký sai → 401; dùng `hmac.compare_digest`/`crypto.timingSafeEqual`. · Nguồn: [`../08-backend/integrations-and-webhooks.md`](.xtemplates/framework/08-backend/integrations-and-webhooks.md)
- [ ] `SEC-SECRET-022` **SHOULD** Secret trong cấu hình tích hợp do người dùng/tenant nhập (webhook, SMTP, ngân hàng, kênh thông báo) là **write-only**: API chỉ trả placeholder đã che (`has_secret: true`/`••••`), không bao giờ trả giá trị; khi request đổi host/URL/đích mà vẫn giữ placeholder thì server bỏ secret cũ và trả 422 buộc nhập lại, để người sửa được cấu hình không chuyển secret đã lưu sang đích do mình kiểm soát. → Kiểm: test PATCH đổi URL webhook (hoặc host SMTP) giữ nguyên placeholder → 422 và secret cũ không còn được dùng cho đích mới; GET không chứa giá trị secret. · Nguồn: `seeker19110/stored` 12 §3k (CHANGELOG v0.3.15 của ARTEX: vá lỗi che credential bị bypass — đổi địa chỉ giữ nguyên credential làm rò khoá; đọc 2026-10-16)

### Chuỗi cung ứng: ghim, SBOM, chữ ký, SLSA, Scorecard, Dependabot

Nguồn khung: [`12-security/supply-chain.md`](.xtemplates/framework/12-security/supply-chain.md)

- [ ] `SEC-SUPPLY-018` **SHOULD** Dependabot/Renovate bật cho **mọi** hệ sinh thái trong repo (npm/pip/go/docker/github-actions), gom nhóm minor+patch, giới hạn PR mở theo WIP cap, bỏ qua major (xử lý có kế hoạch). → Kiểm: `dependabot.yml` có đủ `package-ecosystem` theo file manifest tồn tại; `groups` + `open-pull-requests-limit` đặt rõ. · Nguồn: GitHub Dependabot options reference; catalog stored 23 §2.5
- [ ] `SEC-SUPPLY-019` **SHOULD** Workflow CI qua policy-as-code (conftest với rule Rego: ghim SHA, permissions, không `curl|sh`, không `continue-on-error` ở job cổng). → Kiểm: `conftest test .github/workflows -p policy/ci` trong CI; rule có test riêng. · Nguồn: catalog stored 12 §3 (OPA/conftest), 23 §3.3 (fitness function cho CI)
- [ ] `SEC-SUPPLY-020` **SHOULD** Tự đo Scorecard cho repo của mình theo lịch và giữ điểm không giảm. → Kiểm: `ossf/scorecard-action` tuần, kết quả lên code-scanning; ngưỡng tổng ≥ 7 (đội tự chọn, ghi ADR). · Nguồn: OpenSSF Scorecard
- [ ] `SEC-SUPPLY-021` **SHOULD** Package tự phát hành (npm/PyPI/crates) bật provenance/trusted publishing qua OIDC; không dùng token tĩnh dài hạn. → Kiểm: `npm publish --provenance`/PyPI trusted publisher cấu hình; registry hiển thị provenance. · Nguồn: SLSA; npm/PyPI docs (chưa fetch lại 2026-10-13)
- [ ] `SEC-SUPPLY-022` **SHOULD** Runner CI tự host (nếu có) là ephemeral, không chạy job từ fork, không mount docker socket. → Kiểm: cấu hình runner `--ephemeral`; chính sách repo không cho fork dùng self-hosted runner. · Nguồn: GitHub Actions hardening (self-hosted runners)
- [ ] `SEC-SUPPLY-025` **SHOULD** Đánh giá dependency/skill/tool trên **repo gốc**, không trên bản mirror hay fork: chủ repo khớp đường dẫn module (`go.mod`, `package.json` `repository`, trang registry) và tác giả commit; sao/fork của mirror không phải tín hiệu chất lượng (repo gốc có thể đã bị gỡ vì lạm dụng). → Kiểm: mục "Đánh giá" trong PR thêm dependency ghi URL repo gốc + bằng chứng khớp (dòng `module`/`repository`). · Nguồn: `seeker19110/stored` 12 §3k (ARTEX, mirror Hinln/ARTEX)
- [ ] `SEC-SUPPLY-026` **SHOULD** Số commit, số sao và bảng thống kê trong README không dùng làm bằng chứng "còn bảo trì": đọc lịch sử thật (`git log --format='%an %s'`), loại commit bot/tự động ghi timestamp, xem ngày commit người viết gần nhất và lịch sử advisory/gỡ bỏ; tool dual-use đã có lạm dụng thật hoặc bị tác giả rút về thì không đưa vào dự án. → Kiểm: mục "Đánh giá" ghi số commit người viết trong 12 tháng (lệnh + kết quả) và kết quả tra advisory. · Nguồn: `seeker19110/stored` 12 §3j (s4ntrx: 5.340/5.571 commit là bot), 12 §3k

### Threat model (STRIDE), tài sản, ranh giới tin cậy, biện pháp

Nguồn khung: [`12-security/threat-modeling.md`](.xtemplates/framework/12-security/threat-modeling.md)

- [ ] `SEC-TM-009` **SHOULD** Threat model được review bởi người không viết thiết kế (hoặc agent reviewer khác model với tác giả) trước cổng G4. → Kiểm: PR threat model có ≥ 1 approval khác tác giả. · Nguồn: OWASP Threat Modeling CS §"Did we do a good enough job"
- [ ] `SEC-TM-010` **SHOULD** Có mục "Giả định tin cậy" liệt kê thứ hệ thống tin mà không kiểm (vd CSDL quản lý của cloud, OS của người dùng) để lộ rõ điểm mù. → Kiểm: mục tồn tại, ≥ 3 giả định. · Nguồn: NIST SP 800-207 (không tin theo vị trí mạng)
- [ ] `SEC-TM-011` **SHOULD** Hệ có AI: thêm hàng cho từng ASI01–10 (OWASP Agentic 2026) với trạng thái áp dụng/N/A. → Kiểm: bảng ánh xạ ASI trong threat model; chi tiết biện pháp ở `SEC-AI-*`. · Nguồn: OWASP Top 10 Agentic 2026
- [ ] `SEC-TM-012` **SHOULD** Có attack tree cho 1–3 tài sản quý nhất (tiền, dữ liệu nhạy cảm, khoá ký) khi dự án ≥ M. → Kiểm: mục Attack tree với ≥ 1 cây, lá cây trỏ biện pháp. · Nguồn: OWASP Threat Modeling CS (attack trees)
- [ ] `SEC-TM-013` **SHOULD** Mỗi sự cố bảo mật (SEV1–2) hoặc lỗ hổng tìm thấy ở production được đối chiếu lại threat model: thiếu hàng → thêm hàng + hàng rào mới. → Kiểm: post-mortem có mục "Threat model đã dự đoán? có/không"; commit cập nhật threat model liên kết từ post-mortem. · Nguồn: P12; [`../15-operations/incident-response.md`](.xtemplates/framework/15-operations/incident-response.md)
- [ ] `SEC-TM-014` **SHOULD** Threat model là code: lưu Markdown/JSON trong repo, đổi qua PR, có CODEOWNERS là người phụ trách bảo mật. → Kiểm: `CODEOWNERS` có dòng cho `docs/THREAT-MODEL.md`. · Nguồn: NIST SSDF PO.3

### Coverage ratchet, mutation test, chất lượng test

Nguồn khung: [`14-testing-quality/coverage-and-mutation.md`](.xtemplates/framework/14-testing-quality/coverage-and-mutation.md)

- [ ] `QA-COV-009` **SHOULD** Per-file threshold cho vùng critical (vd `perFile` hoặc glob `src/domain/**: 100`) thay vì chỉ tổng. → Kiểm: cấu hình glob thresholds trong Vitest hoặc `[tool.coverage.report] fail_under` theo gói.
- [ ] `QA-COV-010` **SHOULD** Thời gian mutation ở PR ≤ 10 phút nhờ incremental + chỉ file đổi; nightly đầy đủ. → Kiểm: log thời gian; cấu hình `--incremental`/`mutate` theo `git diff`.
- [ ] `QA-COV-011` **SHOULD** Báo cáo mutation/coverage dạng SARIF/HTML upload artifact; xu hướng theo thời gian ghi `docs/ops/quality-trend.csv`. → Kiểm: artifact + file CSV cập nhật mỗi tuần.
- [ ] `QA-COV-012` **SHOULD** Test chậm (> 1 s unit) được liệt kê và tối ưu hoặc chuyển tầng. → Kiểm: `pytest --durations=10`/Vitest `--reporter=verbose` + ngưỡng cảnh báo.
- [ ] `QA-COV-013` **SHOULD** Tỷ lệ test/logic được theo dõi khi dùng agent viết code: agent không được xoá/skip test để qua cổng; feature list chỉ đổi pass/fail. → Kiểm: CI đỏ khi PR xoá file test mà không có nhãn `test-removal` + lý do. · Nguồn: research AI agent §3 (harness: agent không xoá test)

### E2E & a11y: Playwright/axe, mobile, flaky, trace

Nguồn khung: [`14-testing-quality/e2e-and-accessibility.md`](.xtemplates/framework/14-testing-quality/e2e-and-accessibility.md)

- [ ] `QA-E2E-012` **SHOULD** Cache trình duyệt Playwright theo lockfile; cài `--with-deps` chỉ khi cache miss. → Kiểm: workflow cache `~/.cache/ms-playwright` key `hashFiles('**/package-lock.json')` (đo −29s, catalog 23 §2.5).
- [ ] `QA-E2E-013` **SHOULD** Thời gian suite E2E ở PR ≤ 10 phút; phần còn lại chạy nightly. → Kiểm: log thời gian job; tag `@nightly`.
- [ ] `QA-E2E-014` **SHOULD** Test trạng thái UI: rỗng, tải, lỗi, thành công cho màn hình chính (chặn API bằng `route` để ép trạng thái). → Kiểm: spec có 4 ca `empty|loading|error|success` cho mỗi màn `@smoke`. · Nguồn: [`../06-design-ux/ui-states-and-feedback.md`](.xtemplates/framework/06-design-ux/ui-states-and-feedback.md)
- [ ] `QA-E2E-015` **SHOULD** Kiểm theme: luồng chính chạy ở cả dark và light, axe kiểm tương phản ở cả hai. → Kiểm: project hoặc fixture `colorScheme: 'dark'|'light'`.
- [ ] `QA-E2E-016` **SHOULD** Kiểm `prefers-reduced-motion`: animation lớn tắt khi emulate. → Kiểm: test `page.emulateMedia({reducedMotion: 'reduce'})` assert không có transition dài.
- [ ] `QA-E2E-017` **SHOULD** Visual regression chỉ cho component ổn định (design system), ngưỡng diff ghi rõ, review ảnh như code. → Kiểm: `toHaveScreenshot` với `maxDiffPixelRatio` ghi trong config.

### Integration & contract test: DB thật, API contract, Pact, testcontainers

Nguồn khung: [`14-testing-quality/integration-and-contract.md`](.xtemplates/framework/14-testing-quality/integration-and-contract.md)

- [ ] `QA-INT-013` **SHOULD** Thời gian integration suite ≤ 10 phút; container tái dùng giữa test (một container cho cả suite, dữ liệu cách ly). → Kiểm: log thời gian job; cấu hình `reuse`/fixture scope `session`.
- [ ] `QA-INT-014` **SHOULD** Test truy vấn: kế hoạch thực thi của truy vấn nóng không full-scan (`EXPLAIN`) trên dữ liệu seed đủ lớn. → Kiểm: test assert `EXPLAIN` không chứa `Seq Scan` trên bảng > N hàng; xem [`../09-database/indexing-and-query-performance.md`](.xtemplates/framework/09-database/indexing-and-query-performance.md).
- [ ] `QA-INT-015` **SHOULD** Cấu hình/biến môi trường được validate khi khởi động và có test khởi động thiếu biến → fail nhanh. → Kiểm: test bỏ `DATABASE_URL` → tiến trình thoát mã ≠ 0 kèm thông báo rõ.
- [ ] `QA-INT-016` **SHOULD** Smoke test tích hợp sau deploy (health, DB, queue, 1 giao dịch đọc) chạy tự động. → Kiểm: `run_smoke.sh` tồn tại và được gọi trong pipeline deploy.
- [ ] `QA-INT-017` **SHOULD** Contract test cho sự kiện: schema sự kiện đăng ký trong registry, kiểm tương thích backward trước khi publish. → Kiểm: job `schema-compat` exit 0.
- [ ] `QA-INT-020` **SHOULD** Khi cài đặt một chuẩn có bộ test hoặc test vector chính thức (VietQR/EMVCo, XML hoá đơn điện tử, FHIR, ISO 20022, IDS của buildingSMART…), CI chạy bộ đó **ghim theo phiên bản/commit**; ca chưa đạt ghi trong `known-gaps.txt` kèm lý do, và file này **chỉ được giảm**. → Kiểm: CI đỏ khi có ca fail mới ngoài `known-gaps.txt` hoặc khi số dòng `known-gaps.txt` tăng so với nhánh chính. · Nguồn: `seeker19110/stored` 23 §4.4 (Dhcb-Tools: corpus IDS buildingSMART 334 ca ghim commit + `known-gaps.txt`; đọc 2026-10-16)

### Hiệu năng & tải: k6/Locust, ngưỡng p95, Lighthouse, ngân sách

Nguồn khung: [`14-testing-quality/performance-and-load.md`](.xtemplates/framework/14-testing-quality/performance-and-load.md)

- [ ] `QA-PERF-010` **SHOULD** Load test có kịch bản theo luồng người dùng thật (không chỉ 1 endpoint), dùng dữ liệu seed đại diện (số hàng ≈ production). → Kiểm: script có ≥ 2 scenario và seed ≥ ngưỡng ghi trong `PROJECT.md`.
- [ ] `QA-PERF-011` **SHOULD** Có test "soak" (≥ 30 phút) hằng tuần để phát hiện rò rỉ bộ nhớ/kết nối. → Kiểm: job weekly `k6 run --duration 30m`; dashboard memory không tăng đơn điệu.
- [ ] `QA-PERF-012` **SHOULD** Có test "spike" (tăng VU đột ngột) xác nhận rate limit/autoscale/degrade có kiểm soát (không 5xx hàng loạt). → Kiểm: scenario `ramping-arrival-rate`; threshold `http_req_failed` giữ < ngưỡng; xem [`../05-architecture/resilience-and-scalability.md`](.xtemplates/framework/05-architecture/resilience-and-scalability.md).
- [ ] `QA-PERF-013` **SHOULD** Truy vấn nóng có test kế hoạch thực thi (không full scan) trên dữ liệu seed lớn. → Kiểm: test `EXPLAIN` (xem [`integration-and-contract.md`](.xtemplates/framework/14-testing-quality/integration-and-contract.md) QA-INT-014).
- [ ] `QA-PERF-014` **SHOULD** LLM app: đo p95 latency, token/request, chi phí/request trong eval và load test; ngưỡng ghi trong `PROJECT.md`. → Kiểm: báo cáo eval có 3 cột; xem [`../13-ai-engineering/observability-and-cost.md`](.xtemplates/framework/13-ai-engineering/observability-and-cost.md).
- [ ] `QA-PERF-015` **SHOULD** Lighthouse assertion mới đặt `warn` trước, siết lên `error` sau khi ổn định — không tắt cả cổng. → Kiểm: lịch sử `lighthouserc.json` không có xoá assertion; `warn` có ngày hết hạn trong comment/ticket.

### Phân tích tĩnh: lint, type, complexity, dead code, trùng lặp, kiến trúc

Nguồn khung: [`14-testing-quality/static-analysis-and-code-quality.md`](.xtemplates/framework/14-testing-quality/static-analysis-and-code-quality.md)

- [ ] `QA-STATIC-013` **SHOULD** Hook local không phải cổng cuối: CI chạy lại toàn bộ lint/type/format vì `--no-verify` bỏ qua được. → Kiểm: job CI `quality` có 3 bước này không `continue-on-error`.
- [ ] `QA-STATIC-014` **SHOULD** Một job `quality` gom mọi cổng tĩnh làm required check chất lượng (ruleset còn `protection-guard`, `gitleaks`, `dep-audit`); thêm cổng không cần sửa ruleset. → Kiểm: ruleset yêu cầu `quality`; `quality` `needs:` các job con. · Nguồn: catalog 23 §2.5 (ADR-0003)
- [ ] `QA-STATIC-015` **SHOULD** Không gom thứ chỉ _trông_ giống nhau khi DRY (quy tắc 3 lần); không gom trừu tượng sớm. → Kiểm: review; jscpd báo trùng nhưng PR giải thích nếu giữ.
- [ ] `QA-STATIC-016` **SHOULD** Hàm > 4 tham số gom thành object có kiểu; `if/else` lồng sâu → guard clause. → Kiểm: rule `max-params: 4`, ruff `PLR0913`; `max-depth`.
- [ ] `QA-STATIC-017` **SHOULD** Import lẻ và tách động cho phần nặng ít dùng; không hai thư viện cùng vai trò (2 lib ngày tháng, 2 HTTP client). → Kiểm: knip/`deptry` + script liệt kê dep theo nhóm; bundle analyzer trong PR.
- [ ] `QA-STATIC-021` **SHOULD** Mỗi luật/cổng tự viết (semgrep, ESLint, script `check:*`) có fixture xấu phải fail và fixture tốt phải pass, chạy trong CI. Nâng thành **MUST@L** khi cổng nằm trong required check. → Kiểm: `semgrep --test`, ESLint `RuleTester`, script chạy trên `fixtures/bad.*` cho exit ≠ 0 và trên `fixtures/good.*` cho exit 0. · Nguồn: stored 06 §7f (self-test 205 luật), §7b (fixture "plausible-wrong")

### Dữ liệu test, fixture, seed, ẩn danh hoá, factory

Nguồn khung: [`14-testing-quality/test-data-and-fixtures.md`](.xtemplates/framework/14-testing-quality/test-data-and-fixtures.md)

- [ ] `QA-DATA-011` **SHOULD** Fixture lớn (> 200 dòng) thay bằng factory hoặc builder; fixture JSON chỉ cho golden/contract. → Kiểm: lint kích thước file `tests/fixtures/*.json` ≤ ngưỡng ghi trong repo.
- [ ] `QA-DATA-012` **SHOULD** Dữ liệu perf sinh theo tỷ lệ production (số hàng, phân phối giá trị, tỷ lệ null) ghi trong `PROJECT.md`. → Kiểm: script `seed --profile perf` có tham số số hàng; load test dùng profile này.
- [ ] `QA-DATA-013` **SHOULD** Golden dataset cho eval LLM có phiên bản, nguồn nhãn, tập holdout không dùng khi tinh chỉnh prompt; negative control. → Kiểm: `evals/dataset.jsonl` + `evals/README` ghi `version`, `holdout`; xem [`../13-ai-engineering/evaluation.md`](.xtemplates/framework/13-ai-engineering/evaluation.md).
- [ ] `QA-DATA-014` **SHOULD** Dữ liệu seed cho staging đủ để chạy toàn bộ luồng chính (tài khoản mỗi vai trò, 1 bản ghi mỗi trạng thái nghiệp vụ). → Kiểm: `docs/ops/seed-catalog.md` liệt kê tài khoản/trạng thái; E2E `@smoke` chạy trên seed này.
- [ ] `QA-DATA-015` **SHOULD** Schema đổi → factory/seed cập nhật cùng PR migration (CI đỏ nếu factory không validate). → Kiểm: job chạy `seed` sau mọi PR có migration.

### Chiến lược kiểm thử: tháp, mức bao phủ, cổng, trách nhiệm

Nguồn khung: [`14-testing-quality/test-strategy.md`](.xtemplates/framework/14-testing-quality/test-strategy.md)

- [ ] `QA-STRAT-013` **SHOULD** Test gắn tag theo tầng/tốc độ (`@unit`, `@integration`, `@e2e`, `@slow`) để chạy chọn lọc ở pre-commit và đầy đủ ở CI. → Kiểm: lệnh `test:quick` và `test:all` tồn tại.
- [ ] `QA-STRAT-014` **SHOULD** Mỗi thư mục/module có chủ sở hữu test (CODEOWNERS) và test nằm cạnh code hoặc theo cấu trúc gương. → Kiểm: `CODEOWNERS` phủ `tests/`/`__tests__`.
- [ ] `QA-STRAT-015` **SHOULD** Lỗi lặp lại tạo hàng rào mới (test, lint rule, hook) ghi trong post-mortem. → Kiểm: post-mortem có mục "hàng rào" trỏ PR. · Nguồn: P12
- [ ] `QA-STRAT-016` **SHOULD** Test chạy được offline trong sandbox agent (không cần secret thật) — dùng fixture/record-replay. → Kiểm: `scripts/dev-task.sh test` xanh với `.env.test` không chứa secret thật.
- [ ] `QA-STRAT-017` **SHOULD** Eval cho LLM/agent có negative control (case phải fail) và chạy record/replay ở PR; chỉ ghi lại qua `workflow_dispatch`. → Kiểm: bộ eval có ≥ 1 case `expect: fail`; job PR không có API key model. · Nguồn: catalog 07, 23 §3.1
- [ ] `QA-STRAT-018` **SHOULD** Ma trận hỗ trợ (OS/trình duyệt/phiên bản runtime) ghi rõ và CI chạy ít nhất phiên bản thấp nhất + cao nhất. → Kiểm: workflow `matrix` có ≥ 2 giá trị.

### Unit test & chống lỗi logic: ca biên, null/0, race, thời gian, tiền

Nguồn khung: [`14-testing-quality/unit-and-logic-edge-cases.md`](.xtemplates/framework/14-testing-quality/unit-and-logic-edge-cases.md)

- [ ] `QA-UNIT-013` **SHOULD** Logic có miền đầu vào lớn (parser, chuyển đổi, tính toán) có property-based test với bất biến hoặc round-trip. → Kiểm: file test import `fast-check`/`hypothesis`; ≥ 1 property cho mỗi module parser/serializer.
- [ ] `QA-UNIT-014` **SHOULD** Chuỗi: test Unicode (dấu tiếng Việt tổ hợp vs dựng sẵn — NFC/NFD), emoji, chuỗi rất dài, khoảng trắng đầu/cuối. → Kiểm: ca test chứa `"Tiếng Việt"` dạng NFD và NFC cho so sánh/tìm kiếm.
- [ ] `QA-UNIT-015` **SHOULD** Tên test mô tả hành vi và ca (`rejects_withdraw_when_balance_insufficient`), một khái niệm mỗi test. → Kiểm: lint tên test (regex `^(should|when|rejects|returns|…)` hoặc quy ước repo).
- [ ] `QA-UNIT-016` **SHOULD** Không logic điều kiện/vòng lặp trong thân test; dùng bảng ca. → Kiểm: lint `no-conditional-in-test` (eslint-plugin-vitest/jest) hoặc review.
- [ ] `QA-UNIT-017` **SHOULD** Trước refactor vùng chưa có test: viết characterization test ghi hành vi hiện tại (kể cả hành vi "lạ"). → Kiểm: PR `refactor:` không giảm số test; coverage vùng sửa không giảm.
- [ ] `QA-UNIT-018` **SHOULD** Đầu vào bên ngoài được validate ở biên bằng schema và có test cho payload sai kiểu/thiếu trường/thừa trường. → Kiểm: test gửi payload thiếu trường bắt buộc → lỗi validate, không phải 500. · Nguồn: P6
- [ ] `QA-UNIT-019` **SHOULD** Mutation test xác nhận bộ unit test bắt được thay đổi logic (xem [`coverage-and-mutation.md`](.xtemplates/framework/14-testing-quality/coverage-and-mutation.md)). → Kiểm: mutation score vùng logic nghiệp vụ ≥ ngưỡng của module đó.

### Sao lưu & DR: RPO/RTO, diễn tập khôi phục, multi-region

Nguồn khung: [`15-operations/backup-and-disaster-recovery.md`](.xtemplates/framework/15-operations/backup-and-disaster-recovery.md)

- [ ] `OPS-DR-015` **SHOULD** Kịch bản DR theo loại thảm hoạ — mất một vùng, mất tài khoản cloud/bị khoá, ransomware/xoá hàng loạt, mất nhà cung cấp SaaS chính (auth, email, thanh toán) — mỗi kịch bản có mức ưu tiên dịch vụ (cái gì lên trước, cái gì chấp nhận degrade) và người ra quyết định. → Kiểm: `docs/ops/DR-PLAN.md` có ≥ 4 kịch bản; tabletop ≥ 1 kịch bản/năm (xem `OPS-IR-012`). · Nguồn: NIST SP 800-34r1 (contingency scenarios)
- [ ] `OPS-DR-016` **SHOULD** Retention backup theo bảng có lý do (vận hành 30 ngày, tháng 12 tháng, năm theo luật) và tự động xoá sau hạn; không giữ mãi mãi. → Kiểm: lifecycle policy trong IaC khớp bảng; chi phí storage backup theo dõi. · Nguồn: [`cost-management.md`](.xtemplates/framework/15-operations/cost-management.md); tối thiểu hoá dữ liệu (16)
- [ ] `OPS-DR-017` **SHOULD** Truyền thông khi DR: mẫu thông báo khách/nội bộ, kênh dự phòng khi kênh chính (Slack/email/SSO) cũng nằm trong vùng sự cố, danh sách liên hệ ngoài băng (out-of-band) kiểm hàng quý. → Kiểm: `DR-PLAN.md` mục truyền thông; ngày kiểm liên hệ. · Nguồn: NIST SP 800-34r1; [`incident-response.md`](.xtemplates/framework/15-operations/incident-response.md)
- [ ] `OPS-DR-018` **SHOULD** Ứng dụng desktop/mobile/CLI/IoT lưu dữ liệu cục bộ: có export/import hoặc đồng bộ, kiểm toàn vẹn file, hướng dẫn người dùng sao lưu; cập nhật firmware/app không mất dữ liệu (test). → Kiểm: test nâng cấp giữ dữ liệu; tính năng export. · Nguồn: P11; hồ sơ desktop/mobile/embedded
- [ ] `OPS-DR-019` **SHOULD** Bộ nhớ/trạng thái của agent (memory store, vector index, outbox) nằm trong phạm vi backup và khôi phục nhất quán với CSDL chính (cùng thời điểm hoặc có thể dựng lại từ nguồn). → Kiểm: BACKUP-SCOPE có mục agent state; drill khôi phục kiểm nhất quán. · Nguồn: [`../13-ai-engineering/rag-and-knowledge.md`](.xtemplates/framework/13-ai-engineering/rag-and-knowledge.md)

### Chi phí: ngân sách, cảnh báo, FinOps, chi phí AI/token

Nguồn khung: [`15-operations/cost-management.md`](.xtemplates/framework/15-operations/cost-management.md)

- [ ] `OPS-COST-013` **SHOULD** Môi trường dev/preview tự huỷ theo TTL (vd 7 ngày không dùng) và tắt ngoài giờ; preview per-PR huỷ khi PR đóng. → Kiểm: tag `ttl` + job dọn; preview env có hook đóng PR. · Nguồn: FinOps (waste)
- [ ] `OPS-COST-014` **SHOULD** Chi phí egress/data transfer và gọi API bên thứ ba được tách riêng và theo dõi (thường là bất ngờ lớn nhất). → Kiểm: dashboard có dòng egress + third-party API; alert tăng > 50%/tuần. · Nguồn: FinOps
- [ ] `OPS-COST-015` **SHOULD** Prompt caching/batching/model nhỏ cho tác vụ đơn giản được dùng có chủ đích và đo hiệu quả (A/B chi phí/chất lượng), không chỉ "model mạnh nhất cho mọi thứ". → Kiểm: báo cáo cache hit rate; ADR chọn model theo tác vụ. · Nguồn: [`../13-ai-engineering/observability-and-cost.md`](.xtemplates/framework/13-ai-engineering/observability-and-cost.md)
- [ ] `OPS-COST-016` **SHOULD** Bảng giá model/dịch vụ dùng để tính chi phí có ngày xác minh và được cập nhật ≤ 90 ngày; không hard-code giá trong nhiều nơi. → Kiểm: một file giá có `verified_at`; CI cảnh báo quá 90 ngày. · Nguồn: P5; evidence-and-sources (giá model lệch giữa tài liệu — research cũ §3b)
- [ ] `OPS-COST-017` **SHOULD** Chi phí observability (ingest GB, series, span) là dòng ngân sách riêng với alert; cardinality/sampling là đòn bẩy đầu tiên. → Kiểm: dashboard chi phí quan sát; alert ingest. · Nguồn: [`observability.md`](.xtemplates/framework/15-operations/observability.md) `OPS-OBS-010`

### Triển khai: canary, blue/green, feature flag, rollback, migration online

Nguồn khung: [`15-operations/deployment-strategies.md`](.xtemplates/framework/15-operations/deployment-strategies.md)

- [ ] `OPS-DEPLOY-016` **SHOULD** Deploy nhỏ và thường xuyên (mỗi PR một deploy hoặc ≥ hàng ngày) thay vì gộp lớn; PR lớn chia nhỏ sau flag. → Kiểm: DORA deployment frequency ≥ hàng ngày; kích thước deploy (số commit) median nhỏ. · Nguồn: DORA
- [ ] `OPS-DEPLOY-017` **SHOULD** Backfill/migration dữ liệu lớn chạy nền theo lô, idempotent, có tiến độ và dừng được; không trong transaction dài khoá bảng. → Kiểm: job backfill có checkpoint; test chạy lại không trùng. · Nguồn: [`../09-database/migrations.md`](.xtemplates/framework/09-database/migrations.md)
- [ ] `OPS-DEPLOY-018` **SHOULD** Deploy ngoài giờ cao điểm cho thay đổi rủi ro; không deploy khi không có người theo dõi ≥ 30 phút sau (trừ tự động có auto-rollback). → Kiểm: chính sách trong runbook; pipeline cảnh báo deploy ngoài giờ có người. · Nguồn: SRE Book
- [ ] `OPS-DEPLOY-019` **SHOULD** Embedded/IoT: OTA với phân vùng A/B, chữ ký firmware, rollback tự động khi boot thất bại, rollout theo lô thiết bị. → Kiểm: test boot fail → về bản cũ; firmware ký. · Nguồn: [`../02-profiles/embedded-iot.md`](.xtemplates/framework/02-profiles/embedded-iot.md)

### Ứng phó sự cố: SEV, runbook, liên lạc, post-mortem không đổ lỗi

Nguồn khung: [`15-operations/incident-response.md`](.xtemplates/framework/15-operations/incident-response.md)

- [ ] `OPS-IR-016` **SHOULD** Hệ có agent/tự động: sự cố "agent hành xử sai" là loại riêng với bước đầu = kill switch + đóng băng phiên bản agent + giữ transcript/audit làm chứng cứ. → Kiểm: runbook mục "Agent"; diễn tập kill switch ≤ 10 s (ghi ngày). · Nguồn: [`../12-security/ai-security.md`](.xtemplates/framework/12-security/ai-security.md); khung cũ spec C5-FR-09
- [ ] `OPS-IR-017` **SHOULD** Post-mortem được chia sẻ cho cả đội/công ty (không chỉ người liên quan) và lưu chỉ mục; lỗi lần thứ ba cùng nguyên nhân → leo thang kiến trúc (ADR). → Kiểm: chỉ mục `docs/ops/postmortems/README.md`; tag nguyên nhân để đếm lặp. · Nguồn: SRE Book — Postmortem Culture; catalog stored 23 §2.6 ("lỗi lần thứ ba")
- [ ] `OPS-IR-018` **SHOULD** Sự cố SEV3 lặp ≥ 2 lần trong quý → nâng SEV2 cho post-mortem bắt buộc. → Kiểm: review tháng đếm lặp theo tag. · Nguồn: P12
- [ ] `OPS-IR-019` **SHOULD** Có "bộ dụng cụ sự cố": lệnh truy cập khẩn (break-glass có log), dashboard sự cố, mẫu thông báo, danh sách lệnh chẩn đoán phổ biến — kiểm 1 lần/quý còn chạy. → Kiểm: `docs/ops/incident-kit.md` + ngày kiểm. · Nguồn: PagerDuty IR

### IaC: Terraform/Pulumi/compose, drift, review, policy-as-code

Nguồn khung: [`15-operations/infrastructure-as-code.md`](.xtemplates/framework/15-operations/infrastructure-as-code.md)

- [ ] `OPS-IAC-015` **SHOULD** Module tái dùng có test (terratest/`terraform test`/pulumi unit test) và ví dụ; thay đổi module qua semver. → Kiểm: thư mục `tests/` của module; CI chạy. · Nguồn: Terraform docs `test` (chưa xác minh phiên bản tính năng)
- [ ] `OPS-IAC-016` **SHOULD** Compose/K8s manifest cho dev giống production về cấu trúc (cùng image, cùng biến) khác về kích thước; `docker compose config` hợp lệ trong CI. → Kiểm: job `compose config --quiet`; image tag giống pipeline. · Nguồn: P5
- [ ] `OPS-IAC-017` **SHOULD** Thay đổi hạ tầng có cửa sổ và kế hoạch rollback (apply ngược plan cũ/`state` version trước) ghi trong PR; thay đổi đổi mạng/DB lên lịch ngoài giờ cao điểm. → Kiểm: template PR hạ tầng có mục Rollback. · Nguồn: P8; [`deployment-strategies.md`](.xtemplates/framework/15-operations/deployment-strategies.md)
- [ ] `OPS-IAC-018` **SHOULD** Ghim phiên bản IaC tool theo endoflife.date và nâng trong vòng hỗ trợ (ví dụ Terraform 1.13 EOL 2026-04-29, 1.14 EOL 2026-08-26; OpenTofu 1.11 EOL 2026-08-19). → Kiểm: `required_version` không thuộc cycle đã EOL (script đọc API endoflife). · Nguồn: endoflife.date (xác minh 2026-10-13)

### Bảo trì: cập nhật phụ thuộc, EOL, nâng cấp major, nợ kỹ thuật

Nguồn khung: [`15-operations/maintenance-and-lifecycle.md`](.xtemplates/framework/15-operations/maintenance-and-lifecycle.md)

- [ ] `OPS-MAINT-013` **SHOULD** Automerge patch của dependency khi CI (gồm E2E) xanh và dependency có test tốt; minor/major cần người. → Kiểm: cấu hình automerge theo `update-types`; log automerge. · Nguồn: Renovate/Dependabot docs (chưa fetch lại automerge 2026-10-13)
- [ ] `OPS-MAINT-014` **SHOULD** Canary dependency: một tập dependency rủi ro cao (vd urllib3, openssl binding, SDK thanh toán) được theo dõi release/advisory riêng và nâng sớm có eval. → Kiểm: danh sách canary dep + job theo dõi. · Nguồn: catalog stored 21 §8 (X-Agents `keeper`)
- [ ] `OPS-MAINT-015` **SHOULD** Harness/AI config (hook, skill, model id, prompt) ghi ngày + phiên bản và xét lại khi đổi model/tool — harness có hạn sử dụng. → Kiểm: file harness có `updated` + model id; review khi đổi model (ADR). · Nguồn: catalog stored 21 §2.2 (harness có hạn sử dụng)
- [ ] `OPS-MAINT-016` **SHOULD** Dọn định kỳ: branch cũ đã merge, artifact/image cũ (giữ N bản để rollback), flag quá hạn, dead code (knip/vulture/deadcode), dependency không dùng (depcheck/`pip-extra-reqs`). → Kiểm: job lịch tháng + báo cáo; ngưỡng giữ artifact ghi. · Nguồn: khung cũ `docs/ops/code-optimization-audit-prompt.md`; [`../14-testing-quality/static-analysis-and-code-quality.md`](.xtemplates/framework/14-testing-quality/static-analysis-and-code-quality.md)
- [ ] `OPS-MAINT-017` **SHOULD** License của dependency được quét lại khi cập nhật (license đổi giữa phiên bản — vd Terraform BUSL, Redis/Elastic trước đây); thay đổi license = review. → Kiểm: dependency review `deny-licenses`; SBOM license diff trong PR cập nhật. · Nguồn: [`../16-compliance-privacy/licensing-and-ip.md`](.xtemplates/framework/16-compliance-privacy/licensing-and-ip.md)

### Quan sát: log · metric · trace, OpenTelemetry, dashboard

Nguồn khung: [`15-operations/observability.md`](.xtemplates/framework/15-operations/observability.md)

- [ ] `OPS-OBS-014` **SHOULD** Deploy marker/annotation (phiên bản, commit, người/CI) được ghi vào hệ quan sát để nối thay đổi ↔ sự cố. → Kiểm: mỗi deploy tạo annotation/event; dashboard hiện vạch deploy. · Nguồn: DORA (change lead time/CFR); [`deployment-strategies.md`](.xtemplates/framework/15-operations/deployment-strategies.md)
- [ ] `OPS-OBS-015` **SHOULD** Business metric tối thiểu (đăng ký, đơn hàng, thanh toán thành công, job hoàn tất) đo cạnh metric kỹ thuật để phát hiện "hệ thống xanh nhưng nghiệp vụ đỏ". → Kiểm: ≥ 3 business counter; alert "0 đơn trong X phút giờ cao điểm". · Nguồn: Google SRE Workbook (SLI theo người dùng)
- [ ] `OPS-OBS-016` **SHOULD** Pipeline quan sát không làm hại ứng dụng: exporter có queue + retry, `memory_limiter`, drop có metric; kho log/trace chậm hoặc chết không chặn request (fire-and-forget/async). → Kiểm: test tắt backend → app vẫn phục vụ, metric `otelcol_exporter_queue_size`/`send_failed` tăng và có alert. · Nguồn: OTel Collector docs (chưa fetch lại 2026-10-13); P7
- [ ] `OPS-OBS-017` **SHOULD** Agent/LLM: span `invoke_agent`/`execute_tool`/inference theo OTel GenAI semconv với `gen_ai.usage.input_tokens/output_tokens`, `gen_ai.provider.name`; chi phí tính từ token (chi tiết ở 13). → Kiểm: trace mẫu có các span/attribute trên. · Nguồn: OTel GenAI semconv (Development — tên có thể đổi)
- [ ] `OPS-OBS-018` **SHOULD** Exemplar nối metric → trace cho histogram latency để từ p99 nhảy sang trace chậm. → Kiểm: metric có exemplar `trace_id`; dashboard hỗ trợ. · Nguồn: OpenMetrics/OTel exemplars (chưa xác minh)

### SLO, error budget, cảnh báo có thể hành động, on-call

Nguồn khung: [`15-operations/slo-and-alerting.md`](.xtemplates/framework/15-operations/slo-and-alerting.md)

- [ ] `OPS-SLO-013` **SHOULD** Alert gom nhóm/ức chế (grouping, inhibition, silence có hạn) để một sự cố gốc không tạo 50 thông báo; silence quá hạn tự hết. → Kiểm: cấu hình `inhibit_rules`/`group_by`; silence có `ends_at`. · Nguồn: Alertmanager docs (chưa fetch lại 2026-10-13)
- [ ] `OPS-SLO-014` **SHOULD** Alert ticket (burn chậm, cert sắp hết hạn, disk 80%, dependency EOL) đi vào hàng đợi việc, không vào kênh page. → Kiểm: routing theo `severity`; kênh page chỉ có `severity=page`. · Nguồn: SRE Workbook — Alerting on SLOs (ticket vs page)
- [ ] `OPS-SLO-015` **SHOULD** Lưu lượng thấp: dùng cửa sổ dài hơn, gộp nhiều dịch vụ, hoặc synthetic traffic để burn rate có ý nghĩa; không page vì 1 request lỗi. → Kiểm: rule có `min_requests` hoặc cửa sổ ≥ 1 giờ cho dịch vụ < N req/phút. · Nguồn: SRE Workbook — low-traffic services
- [ ] `OPS-SLO-016` **SHOULD** Agent/LLM: SLI gồm tỷ lệ run hoàn tất đúng (có kiểm chứng ngoài), p95 thời gian run, chi phí/run; alert khi chi phí/run hoặc tỷ lệ bị guardrail chặn tăng bất thường. → Kiểm: metric + rule tồn tại; xem [`../13-ai-engineering/observability-and-cost.md`](.xtemplates/framework/13-ai-engineering/observability-and-cost.md). · Nguồn: catalog stored 21 §8 (observability cho loop)
- [ ] `OPS-SLO-017` **SHOULD** Trang trạng thái (status page) công khai/nội bộ cập nhật theo sự cố, có lịch sử; không tự động xanh khi monitoring hỏng. → Kiểm: status page tồn tại; sự cố SEV1/2 gần nhất có mục. · Nguồn: [`incident-response.md`](.xtemplates/framework/15-operations/incident-response.md)

### Quy định AI: EU AI Act, minh bạch, phân loại rủi ro, Việt Nam

Nguồn khung: [`16-compliance-privacy/ai-regulation.md`](.xtemplates/framework/16-compliance-privacy/ai-regulation.md)

- [ ] `CMP-AI-013` **SHOULD** Bộ đánh giá (eval) an toàn/độ chính xác/thiên lệch chạy trong CI với ngưỡng chặn phát hành; kết quả lưu làm bằng chứng cho hồ sơ phân loại. → Kiểm: job eval + ngưỡng; báo cáo gắn phiên bản; xem [`../13-ai-engineering/evaluation.md`](.xtemplates/framework/13-ai-engineering/evaluation.md). · Nguồn: NĐ 142/2026/NĐ-CP (đánh giá sự phù hợp); EU AI Act Art. 15
- [ ] `CMP-AI-014` **SHOULD** Thông báo cho người dùng về hạn chế của AI (có thể sai, không phải tư vấn y tế/pháp lý/tài chính) ngay trong giao diện, không chỉ ở điều khoản. → Kiểm: snapshot UI; nội dung từ [`../06-design-ux/ai-ux.md`](.xtemplates/framework/06-design-ux/ai-ux.md). · Nguồn: Luật AI 134/2025/QH15 (minh bạch); EU AI Act Art. 13
- [ ] `CMP-AI-015` **SHOULD** Sandbox/thử nghiệm có kiểm soát (VN 3 cấp theo NĐ 142; EU Art. 57 từ 02/08/2027) được cân nhắc cho ứng dụng mới trong lĩnh vực nhạy cảm; ADR ghi quyết định. → Kiểm: ADR tồn tại. · Nguồn: NĐ 142/2026/NĐ-CP Chương IV; EU AI Act Art. 57
- [ ] `CMP-AI-016` **SHOULD** Hợp đồng với nhà cung cấp model/API có điều khoản: dữ liệu không dùng huấn luyện (hoặc có), vị trí xử lý, log, thông báo thay đổi model, bản quyền đầu ra. → Kiểm: `docs/privacy/processors.md` mục AI vendors có điều khoản. · Nguồn: GDPR Art. 28; Luật 91/2025/QH15 Đ.17, Đ.20

### Đồng ý, quyền chủ thể dữ liệu (truy cập/xoá/di chuyển), cookie, trẻ em

Nguồn khung: [`16-compliance-privacy/consent-and-user-rights.md`](.xtemplates/framework/16-compliance-privacy/consent-and-user-rights.md)

- [ ] `CMP-RIGHTS-014` **SHOULD** Trung tâm quyền riêng tư trong app: xem/sửa từng đồng ý, tải dữ liệu, xoá tài khoản, lịch sử yêu cầu — không cần gửi email. → Kiểm: trang tồn tại, E2E đủ 4 chức năng. · Nguồn: GDPR Art. 12 (dễ tiếp cận); Luật 91/2025/QH15 Đ.4
- [ ] `CMP-RIGHTS-015` **SHOULD** Banner cookie dùng cùng ngôn ngữ và dễ hiểu (đọc được ở trình độ phổ thông), tiếp cận được (bàn phím, screen reader), không chặn nội dung thiết yếu. → Kiểm: axe trên banner = 0 lỗi; test tab/Esc. · Nguồn: WCAG 2.2 SC 2.1.1; GDPR Art. 12(1)
- [ ] `CMP-RIGHTS-016` **SHOULD** Danh sách cookie/SDK sinh tự động từ quét thực tế (crawler) và đối chiếu với tuyên bố; cookie mới chưa khai báo → fail CI. → Kiểm: job quét staging liệt kê cookie; diff với `docs/privacy/cookies.yaml` = 0. · Nguồn: ePrivacy Art. 5(3)
- [ ] `CMP-RIGHTS-017` **SHOULD** Đồng ý thu qua kênh khác (giọng nói, giấy, offline) được số hoá vào cùng bảng với bằng chứng (file/hash). → Kiểm: bản ghi `channel != web` có `evidence_uri`. · Nguồn: Luật 91/2025/QH15 Đ.9 (hình thức in/sao chép được)
- [ ] `CMP-RIGHTS-018` **SHOULD** Email/SMS tiếp thị có liên kết huỷ đăng ký một chạm, xử lý ≤ 10 ngày (CAN-SPAM) và ngay lập tức ở hệ thống của mình. → Kiểm: header `List-Unsubscribe` + test huỷ cập nhật consent. · Nguồn: CAN-SPAM 16 CFR 316; RFC 8058
- [ ] `CMP-RIGHTS-019` **SHOULD** Khi người dùng tử vong/mất năng lực hành vi: quy trình cho người đại diện theo pháp luật yêu cầu truy cập/xoá với giấy tờ. → Kiểm: runbook + mẫu. · Nguồn: Luật 91/2025/QH15 Đ.24

### Quốc tế: GDPR, UK GDPR, CCPA/CPRA, PDPA (SG/TH), chuyển dữ liệu xuyên biên giới

Nguồn khung: [`16-compliance-privacy/international-privacy.md`](.xtemplates/framework/16-compliance-privacy/international-privacy.md)

- [ ] `CMP-INTL-013` **SHOULD** Privacy notice đa ngôn ngữ theo thị trường, cùng nguồn nội dung (sinh từ data map), nêu cơ sở pháp lý, thời hạn giữ, quyền và cách thực hiện, chuyển dữ liệu quốc tế. → Kiểm: i18n key đầy đủ; diff với data map = 0; xem [`../18-cross-cutting/i18n-and-l10n.md`](.xtemplates/framework/18-cross-cutting/i18n-and-l10n.md). · Nguồn: GDPR Art. 13–14; CCPA §1798.100(a)
- [ ] `CMP-INTL-014` **SHOULD** Khách hàng là tổ chức tài chính EU: hợp đồng theo DORA (ICT third-party), hỗ trợ báo cáo sự cố và kiểm tra; tổ chức thuộc NIS2: cam kết an ninh chuỗi cung ứng. → Kiểm: điều khoản mẫu + runbook. · Nguồn: DORA 2022/2554 Art. 28–30; NIS2 2022/2555 Art. 21
- [ ] `CMP-INTL-015` **SHOULD** Lưu vùng (region) theo người dùng/tenant và định tuyến dữ liệu theo vùng (EU ở EU khi khách yêu cầu). → Kiểm: `region` trong schema; policy IaC. · Nguồn: GDPR Chương V (giảm chuyển dữ liệu)
- [ ] `CMP-INTL-016` **SHOULD** Theo dõi thay đổi luật theo vùng hằng quý (ICO, EDPB, CPPA, PDPC SG/TH, Bộ Công an) ghi ngày rà vào `jurisdictions.md`. → Kiểm: ngày rà ≤ 90 ngày. · Nguồn: thực hành nội bộ

### License mã nguồn mở, IP, dữ liệu huấn luyện, thương hiệu, điều khoản dịch vụ

Nguồn khung: [`16-compliance-privacy/licensing-and-ip.md`](.xtemplates/framework/16-compliance-privacy/licensing-and-ip.md)

- [ ] `CMP-LIC-012` **SHOULD** Repo mở nguồn theo REUSE spec 3.3: `LICENSES/` chứa văn bản SPDX, header `SPDX-License-Identifier` hoặc `REUSE.toml`; `reuse lint` xanh. → Kiểm: `reuse lint` trong CI. · Nguồn: REUSE Specification 3.3 (14/11/2024)
- [ ] `CMP-LIC-013` **SHOULD** Rà license định kỳ (≤ 90 ngày) vì license gói có thể đổi giữa các phiên bản (vd chuyển sang BSL/SSPL); cảnh báo khi license của gói trong lockfile thay đổi so với lần trước. → Kiểm: job so SBOM kỳ trước ↔ kỳ này; diff license → issue. · Nguồn: `research/…catalog-extraction.md` §3 (bẫy license không OSI; Redis/Elastic/HashiCorp đổi license — ghi nhận ngành)
- [ ] `CMP-LIC-014` **SHOULD** Phân loại tài sản IP của sản phẩm (mã, model, dữ liệu, thương hiệu, bí mật kinh doanh) với chủ sở hữu và biện pháp bảo vệ (secret/NDA/đăng ký). → Kiểm: `docs/legal/ip-register.md`. · Nguồn: Luật SHTT; thực hành nội bộ
- [ ] `CMP-LIC-015` **SHOULD** Nội dung người dùng tạo (UGC): ToS ghi rõ quyền sử dụng cấp cho nền tảng (giới hạn mục đích), quy trình xử lý khiếu nại bản quyền (notice-and-takedown) có SLA; không dùng UGC huấn luyện AI nếu ToS không nói. → Kiểm: mục ToS; luồng khiếu nại có ticket; cờ `training_opt_in`. · Nguồn: Luật SHTT sửa đổi 07/2022/QH15 (trách nhiệm ISP); NĐ 147/2024/NĐ-CP; DMCA 17 U.S.C. §512; DSA Art. 16
- [ ] `CMP-LIC-016` **SHOULD** Ghi công theo yêu cầu license (CC BY, Apache NOTICE, OFL) ở nơi người dùng thấy được (trang "Giấy phép"/about). → Kiểm: trang tồn tại, sinh từ NOTICE. · Nguồn: CC BY 4.0 §3(a); Apache-2.0 §4
- [ ] `CMP-LIC-019` **SHOULD** Dependency từng **đổi license** (nhất là copyleft → dễ dãi) trên mã có nhiều tác giả mà không có CLA/DCO: coi lần đổi là rủi ro chưa xác minh; dùng theo license chặt hơn (hoặc bản trước khi đổi) cho tới khi repo ghi bằng chứng đã xin đồng ý người giữ bản quyền. → Kiểm: PR thêm dependency ghi `git log --follow -- LICENSE*` và có/không CLA/DCO; ngoại lệ trong `license-policy.yaml` có `reason`. · Nguồn: `seeker19110/stored` 19 §1b (OpenCreator: GPL-3.0 → Apache-2.0, 22 tác giả, không CLA/DCO)
- [ ] `CMP-LIC-020` **SHOULD** License của model/trọng số lấy từ **model card (hoặc LICENSE) của đúng repo** đang dùng, ghi **revision (commit hash)** và kích thước/biến thể đang dùng — không suy từ license của mã hay README; ghim revision khi tải; ghi điều kiện về doanh thu, lãnh thổ, đầu ra; đổi revision hoặc kích thước thì duyệt lại. → Kiểm: `docs/ai/<model>.md` có `revision`, `license_source_url`, `conditions`; loader ghim `revision=<sha>`. · Nguồn: `seeker19110/stored` 14 §3b (Audio8: README Apache-2.0 nhưng weights 0.1B theo Community License, trần doanh thu US$2M/năm), 14 §5b (Hunyuan3D 2.1 hạn chế lãnh thổ EU/UK/KR gồm output — (chưa xác minh), stored gắn `[UNVERIFIED]`), 18 §4c (PhoBERT base MIT, base-v2 AGPL-3.0); đọc 2026-10-16

### Privacy by design: tối thiểu hoá, mục đích, lưu trữ, xoá, DPIA

Nguồn khung: [`16-compliance-privacy/privacy-by-design.md`](.xtemplates/framework/16-compliance-privacy/privacy-by-design.md)

- [ ] `CMP-PRIV-013` **SHOULD** Threat model của tính năng có mục "mối đe doạ riêng tư" theo LINDDUN (linkability, identifiability, non-repudiation, detectability, disclosure, unawareness, non-compliance). → Kiểm: [`../templates/THREAT-MODEL.md`](.xtemplates/framework/templates/THREAT-MODEL.md) có bảng LINDDUN với biện pháp. · Nguồn: LINDDUN; ISO/IEC 29134
- [ ] `CMP-PRIV-014` **SHOULD** Dữ liệu định vị, sinh trắc, nội dung riêng tư (tin nhắn, ảnh) được xử lý tại thiết bị (on-device) khi khả thi thay vì gửi lên máy chủ. → Kiểm: ADR nêu lý do nếu gửi lên máy chủ; data map ghi nơi xử lý. · Nguồn: GDPR Art. 25; Luật 91/2025/QH15 Đ.31
- [ ] `CMP-PRIV-015` **SHOULD** Dữ liệu test/staging không chứa PII thật; dùng dữ liệu sinh hoặc đã khử nhận dạng. → Kiểm: quét DB staging bằng bộ phát hiện PII; script seed không đọc từ production. · Nguồn: GDPR Art. 32; ISO/IEC 27701:2025
- [ ] `CMP-PRIV-016` **SHOULD** Thời hạn giữ dữ liệu được công bố trong chính sách riêng tư khớp với data map (cùng nguồn sinh ra). → Kiểm: script sinh bảng retention trong policy từ data map; diff = 0 trong CI. · Nguồn: GDPR Art. 13(2)(a); Luật 91/2025/QH15 Đ.9
- [ ] `CMP-PRIV-017` **SHOULD** Ghép (link) dữ liệu từ nhiều nguồn về một người chỉ khi mục đích ghép đã ở data map và DPIA. → Kiểm: review truy vấn JOIN giữa domain PII; data map có mục `linked_from`. · Nguồn: GDPR Art. 5(1)(b); Art. 35(3)
- [ ] `CMP-PRIV-018` **SHOULD** Dữ liệu suy luận (inferred: sở thích, điểm rủi ro, cảm xúc) được coi là PII và có retention/mục đích riêng. → Kiểm: data map liệt kê trường suy luận; người dùng xem/xoá được qua DSAR. · Nguồn: GDPR Art. 4(1), Art. 22
- [ ] `CMP-PRIV-019` **SHOULD** Trước khi thêm SDK/bên thứ ba thu dữ liệu (analytics, ads, crash), chạy đánh giá nhà cung cấp: DPA, nơi lưu, sub-processor, cơ chế xoá. → Kiểm: file `docs/privacy/processors.md` có dòng cho mỗi SDK, link DPA. · Nguồn: GDPR Art. 28; Luật 91/2025/QH15 Đ.17

### Hồ sơ tuân thủ, audit trail, bằng chứng, chính sách, đào tạo

Nguồn khung: [`16-compliance-privacy/records-and-audit-readiness.md`](.xtemplates/framework/16-compliance-privacy/records-and-audit-readiness.md)

- [ ] `CMP-AUDIT-014` **SHOULD** Dashboard tình trạng control (đạt/thiếu bằng chứng/quá hạn) sinh từ `controls.yaml` + kho bằng chứng; alert khi control quá hạn. → Kiểm: trang/CLI tồn tại; alert cấu hình. · Nguồn: thực hành nội bộ
- [ ] `CMP-AUDIT-015` **SHOULD** Trust center/tài liệu bảo mật cho khách hàng: kiến trúc, kiểm soát, chứng chỉ, sub-processor, lịch sử sự cố — cập nhật từ cùng nguồn với kho bằng chứng. → Kiểm: trang công khai có ngày cập nhật ≤ 90 ngày. · Nguồn: SOC 2 CC2.3
- [ ] `CMP-AUDIT-016` **SHOULD** Bằng chứng có chữ ký/hash và thời gian tin cậy (commit SHA, run id, hoặc dấu thời gian từ dịch vụ tin cậy) để chống chỉnh sửa hồi tố. → Kiểm: mỗi file bằng chứng có metadata nguồn; kiểm tra hash. · Nguồn: Luật GDĐT 20/2023/QH15 (dấu thời gian); NIST SP 800-92
- [ ] `CMP-AUDIT-017` **SHOULD** Lịch tuân thủ (calendar) tập trung: hạn nộp ĐGTĐ, cập nhật hồ sơ 6 tháng, rà quyền quý, pentest năm, gia hạn chứng chỉ, mốc luật mới — có nhắc tự động. → Kiểm: file `docs/compliance/calendar.yaml` + job nhắc. · Nguồn: thực hành nội bộ

### Pháp luật dữ liệu Việt Nam: PDPL 2025, NĐ 356/2025, Luật ANM 2025, Luật Dữ liệu, lưu trữ trong nước

Nguồn khung: [`16-compliance-privacy/vietnam-data-law.md`](.xtemplates/framework/16-compliance-privacy/vietnam-data-law.md)

- [ ] `CMP-VN-016` **SHOULD** Thông báo xử lý dữ liệu (privacy notice) sinh từ data map, có phiên bản, hiển thị trước khi thu thập; lưu phiên bản người dùng đã đồng ý. → Kiểm: `policy_version` trong bảng consent khớp phiên bản notice đang hiển thị. · Nguồn: Luật 91/2025/QH15 Đ.9, Đ.11
- [ ] `CMP-VN-017` **SHOULD** Lĩnh vực tài chính–ngân hàng: không dùng thông tin tín dụng để chấm điểm/xếp hạng khi chưa có đồng ý; thông báo khách hàng khi lộ thông tin tài khoản/tín dụng. → Kiểm: feature flag chấm điểm chỉ bật khi có consent `credit-scoring`; runbook lộ dữ liệu có bước thông báo khách hàng. · Nguồn: Luật 91/2025/QH15 Đ.27
- [ ] `CMP-VN-018` **SHOULD** Lĩnh vực y tế/bảo hiểm: không cung cấp dữ liệu sức khoẻ cho bên thứ ba (bảo hiểm…) trừ khi có yêu cầu bằng văn bản của chủ thể hoặc thuộc Đ.19. → Kiểm: API chia sẻ hồ sơ sức khoẻ yêu cầu `consent_document_id`; log truy cập. · Nguồn: Luật 91/2025/QH15 Đ.26
- [ ] `CMP-VN-019` **SHOULD** Tuyển dụng/nhân sự: chỉ thu thông tin phục vụ tuyển dụng; xoá dữ liệu ứng viên không trúng tuyển trừ khi có thoả thuận khác. → Kiểm: retention ứng viên trong data map; job xoá chạy. · Nguồn: Luật 91/2025/QH15 Đ.25
- [ ] `CMP-VN-020` **SHOULD** Dữ liệu vị trí/sinh trắc: có tuỳ chọn bật/tắt theo dõi vị trí trong app; không theo dõi qua RFID/beacon khi chưa đồng ý. → Kiểm: test quyền hệ điều hành + cờ trong app; không gửi toạ độ khi tắt. · Nguồn: Luật 91/2025/QH15 Đ.31
- [ ] `CMP-VN-021` **SHOULD** Khi có bộ xử lý tự động/AI trên dữ liệu cá nhân: thông báo cho chủ thể, giải thích ảnh hưởng, cho phép từ chối; phân loại mức rủi ro. → Kiểm: UI có thông báo + tuỳ chọn; xem [`ai-regulation.md`](.xtemplates/framework/16-compliance-privacy/ai-regulation.md). · Nguồn: Luật 91/2025/QH15 Đ.30
- [ ] `CMP-VN-022` **SHOULD** Hồ sơ đã nộp theo NĐ 13/2023 được giữ nhưng lần cập nhật sau 01/01/2026 theo mẫu mới; đồng ý đã lấy hợp lệ không cần lấy lại. → Kiểm: `docs/privacy/DGTD/` ghi rõ hồ sơ gốc và lịch cập nhật theo mẫu NĐ 356. · Nguồn: Luật 91/2025/QH15 Đ.39

### Khám phá & yêu cầu: vấn đề, người dùng, chỉ số thành công, phạm vi không làm

Nguồn khung: [`17-product-project/discovery-and-requirements.md`](.xtemplates/framework/17-product-project/discovery-and-requirements.md)

- [ ] `PM-REQ-010` **SHOULD** Yêu cầu phi chức năng ghi bằng số theo hồ sơ (web: Core Web Vitals; backend: p95; CLI: thời gian chạy/kích thước; mobile: cold start) kèm nguồn ngưỡng. → Kiểm: bảng NFR có cột "ngưỡng" và "nguồn"; ngưỡng không tự nghĩ ra.
- [ ] `PM-REQ-011` **SHOULD** Ràng buộc cứng ghi rõ: hạn thật, ngân sách, nền tảng bắt buộc, tích hợp bắt buộc, luật ngành. → Kiểm: mục "Ràng buộc" phân biệt "hạn thật" và "hạn mong muốn" (xem `PM-PLAN`).
- [ ] `PM-REQ-012` **SHOULD** Có bảng giải pháp thay thế/đối thủ với dẫn chứng (URL, ngày xem) và điểm khác biệt của sản phẩm. → Kiểm: bảng ≥2 dòng, mỗi dòng có URL và ngày.
- [ ] `PM-REQ-013` **SHOULD** Cổng G0 có người duyệt (hoặc `D-NNN` của phiên chính, ADR-0008) ghi tên và ngày trong `PROJECT.md` hoặc `PROGRESS.md`; dự án một người vẫn tự ký để đóng băng phạm vi. → Kiểm: dòng "Cổng G0: duyệt bởi … ngày …" tồn tại.
- [ ] `PM-REQ-014` **SHOULD** Dự án có sẵn: `PROJECT.md` viết "ngược" từ repo (route/command/schema thật) và ghi rõ phần nào là đọc được, phần nào là suy đoán. → Kiểm: mỗi mục có nhãn _(đo được)_ / _(suy luận)_ / _(chưa biết)_ theo [`../00-method/evidence-and-sources.md`](.xtemplates/framework/00-method/evidence-and-sources.md) §1.8.
- [ ] `PM-REQ-015` **SHOULD** Luồng người dùng chính (2–5 luồng sống còn) mô tả từng bước từ điểm vào đến kết quả; đây là danh sách luồng bắt buộc có E2E sau này. → Kiểm: mục "Luồng chính" có ≥2 luồng, mỗi luồng tham chiếu `R-NNN`.

### Bàn giao & các bên: tài liệu bàn giao, đào tạo, hỗ trợ, kết thúc dự án

Nguồn khung: [`17-product-project/handover-and-stakeholders.md`](.xtemplates/framework/17-product-project/handover-and-stakeholders.md)

- [ ] `PM-HANDOVER-010` **SHOULD** Đào tạo người nhận: buổi hướng dẫn có ghi hình/ghi chú, FAQ từ câu hỏi thật, bài tập thực hành (deploy thử lên staging, xử lý một cảnh báo giả). → Kiểm: `docs/handover/training.md` + bằng chứng người nhận hoàn thành bài tập.
- [ ] `PM-HANDOVER-011` **SHOULD** Báo cáo tiến độ cho các bên theo nhịp cố định (tuần/mốc), ngắn, cùng một mẫu: đã xong (bằng chứng) · tiếp theo · rủi ro · cần quyết định. → Kiểm: `docs/status/` hoặc kênh có ≥1 báo cáo mỗi nhịp; mục "cần quyết định" được trả lời có ngày.
- [ ] `PM-HANDOVER-012` **SHOULD** Tài liệu người dùng cuối (hướng dẫn, FAQ, trang trạng thái/kênh báo lỗi) sẵn trước ra mắt; release notes cho người dùng theo [`../templates/RELEASE-NOTES.md`](.xtemplates/framework/templates/RELEASE-NOTES.md). → Kiểm: link tài liệu trong app/README; `CHANGELOG.md`/release notes có bản cho người dùng.
- [ ] `PM-HANDOVER-013` **SHOULD** Checklist đóng dự án: thu hồi quyền, tắt/huỷ tài nguyên có phí, xuất và lưu/xoá dữ liệu theo thời hạn luật, chuyển domain/IP, archive repo với README ghi trạng thái, thông báo người dùng. → Kiểm: `docs/handover/closure.md` tick đủ với bằng chứng (hoá đơn cuối, ảnh tài nguyên đã tắt, thông báo đã gửi).
- [ ] `PM-HANDOVER-014` **SHOULD** Retrospective cuối dự án/bàn giao: 3 điều giữ, 3 điều đổi, hành động có chủ + hạn; hàng rào mới đưa vào khung/CLAUDE.md/TRAPS. → Kiểm: `docs/retro-<ngày>.md`; ≥1 hành động thành PR/issue.
- [ ] `PM-HANDOVER-015` **SHOULD** Lịch "đi kèm" sau bàn giao có thời hạn (vd 2 tuần) và quy tắc: người cũ trả lời, người mới thao tác; hết hạn thì cắt quyền người cũ. → Kiểm: ngày kết thúc đi kèm ghi trong `docs/handover/`; offboarding sau ngày đó.

### Đo lường sản phẩm: sự kiện, funnel, quyền riêng tư trong analytics

Nguồn khung: [`17-product-project/metrics-and-analytics.md`](.xtemplates/framework/17-product-project/metrics-and-analytics.md)

- [ ] `PM-METRIC-009` **SHOULD** North Star và 2–4 chỉ số đầu vào ghi trong `PROJECT.md`, mỗi chỉ số có định nghĩa tính toán rõ (tử số, mẫu số, cửa sổ thời gian). → Kiểm: mục "North Star" có công thức, không chỉ tên.
- [ ] `PM-METRIC-010` **SHOULD** Thay đổi schema sự kiện tương thích ngược (thêm trường tuỳ chọn; đổi nghĩa thì tạo tên/phiên bản mới), có ghi CHANGELOG của sự kiện. → Kiểm: diff schema trong PR; CI chạy test tương thích ngược (payload cũ vẫn validate).
- [ ] `PM-METRIC-011` **SHOULD** A/B test có tài liệu trước khi chạy: giả thuyết, chỉ số chính, chỉ số rào chắn, cỡ mẫu/thời gian tính trước, phương pháp kiểm định, tiêu chí dừng; kết quả ghi lại dù thất bại. → Kiểm: `docs/experiments/EXP-NNN.md` có đủ mục trước ngày bật; kết luận có p-value/khoảng tin cậy hoặc phương pháp Bayes đã khai báo.
- [ ] `PM-METRIC-012` **SHOULD** Tôn trọng tín hiệu từ chối của trình duyệt/hệ điều hành (Global Privacy Control, App Tracking Transparency) và không dùng kỹ thuật định danh vòng (fingerprinting). → Kiểm: test với header `Sec-GPC: 1` không gửi sự kiện định danh; review không có thư viện fingerprint.
- [ ] `PM-METRIC-013` **SHOULD** Dashboard North Star + funnel + chỉ số đầu vào mọi người trong đội mở được, cập nhật tự động, có ngày dữ liệu cuối. → Kiểm: link trong `README.md`/`docs/metrics/`; ảnh chụp tại cổng G8.
- [ ] `PM-METRIC-014` **SHOULD** Sự kiện cho tính năng mới là phần của DoD (`PM-SPEC-009`): PR tính năng kèm sự kiện + test schema. → Kiểm: PR `feat:` có diff `analytics/` hoặc ghi "không cần đo" có lý do.
- [ ] `PM-METRIC-015` **SHOULD** Sản phẩm dùng AI đo thêm: tỷ lệ phản hồi bị người dùng sửa/từ chối, chi phí mỗi tác vụ, độ trễ; chi tiết ở [`../13-ai-engineering/observability-and-cost.md`](.xtemplates/framework/13-ai-engineering/observability-and-cost.md). → Kiểm: sự kiện `ai.*` trong schema.

### Kế hoạch & ước lượng: chia nhỏ, cổng, WIP, deadline thật

Nguồn khung: [`17-product-project/planning-and-estimation.md`](.xtemplates/framework/17-product-project/planning-and-estimation.md)

- [ ] `PM-PLAN-010` **SHOULD** Ước lượng ghi dạng khoảng P50–P90; tổng lịch báo bằng P50/P85, không cộng P50 các task thành một ngày hứa. → Kiểm: bảng ước lượng có hai cột; `PROGRESS.md` ghi "P50 … / P85 …".
- [ ] `PM-PLAN-011` **SHOULD** Có throughput và cycle time đo thật (từ ngày bắt đầu/kết thúc task hoặc PR) sau 2 tuần đầu; dự báo cập nhật từ số đo, không từ cảm giác. → Kiểm: bảng "Dòng chảy" trong `PROGRESS.md` hoặc `docs/metrics/flow.csv` cập nhật hằng tuần.
- [ ] `PM-PLAN-012` **SHOULD** Phụ thuộc giữa task ghi rõ (`sau: T-NNN`) và việc chờ bên ngoài có ngày cam kết + kế hoạch B. → Kiểm: `rg -n "sau: T-" PLAN.md` cho task có phụ thuộc; cột "Phụ thuộc ngoài".
- [ ] `PM-PLAN-013` **SHOULD** Mốc (milestone) trùng với cổng G1–G8; không có mốc "demo sếp" nằm ngoài cổng mà không có đầu ra file. → Kiểm: bảng mốc có cột "Cổng" và "Đầu ra (file)".
- [ ] `PM-PLAN-014` **SHOULD** Khi ba task liên tiếp trượt ước lượng cùng hướng → lập lại kế hoạch (chia lại, cắt phạm vi) thay vì tăng giờ làm. → Kiểm: `PROGRESS.md` mục Quyết định ghi "re-plan ngày …" khi điều kiện xảy ra.
- [ ] `PM-PLAN-015` **SHOULD** Có vùng đệm rõ ràng (Could của MoSCoW ≈ 20% nỗ lực) thay vì cộng "hệ số an toàn" ngầm vào từng task. → Kiểm: bảng MoSCoW có phần Could ≥ 15% nỗ lực hoặc lý do.
- [ ] `PM-PLAN-016` **SHOULD** Mỗi task kết thúc bằng commit nhỏ + cập nhật `PROGRESS.md` trong cùng PR, để đứt phiên vẫn tiếp tục được. → Kiểm: PR có diff `PROGRESS.md`; hook SessionStart đọc được mục "Đang làm".

### Ưu tiên & lộ trình: MVP, lát dọc, RICE/MoSCoW, không phình phạm vi

Nguồn khung: [`17-product-project/prioritization-and-roadmap.md`](.xtemplates/framework/17-product-project/prioritization-and-roadmap.md)

- [ ] `PM-PRIO-008` **SHOULD** Khi dùng RICE: Reach lấy từ sự kiện analytics có nguồn, Confidence < 50% không xếp hạng mà tạo spike. → Kiểm: bảng RICE có cột "Nguồn Reach"; dòng Confidence < 50% có link spike. · Nguồn: Intercom RICE
- [ ] `PM-PRIO-009` **SHOULD** Thứ tự lát dọc ưu tiên rủi ro cao/giả định nguy hiểm trước giá trị cao; lý do ghi một dòng cho mỗi lát. → Kiểm: `PLAN.md` phần "Thứ tự & lý do".
- [ ] `PM-PRIO-010` **SHOULD** Backlog có "cut line" rõ: mục dưới vạch không được bắt đầu khi còn mục trên vạch dở (phối hợp WIP ở [`planning-and-estimation.md`](.xtemplates/framework/17-product-project/planning-and-estimation.md)). → Kiểm: board/`PLAN.md` có dòng `--- cut line ---` hoặc nhãn tương đương.
- [ ] `PM-PRIO-011` **SHOULD** Ưu tiên lại định kỳ (mỗi mốc hoặc mỗi 2–4 tuần) với bảng có ngày và lý do thay đổi thứ hạng. → Kiểm: lịch sử git của bảng ưu tiên ≥1 lần/mốc.
- [ ] `PM-PRIO-012` **SHOULD** Tính năng "nhỏ thôi" vẫn qua spec và tiêu chí chấp nhận; không có đường tắt bỏ cổng vì kích thước. → Kiểm: PR `feat:` không có spec bị CI chặn (xem `PM-SPEC-006`).
- [ ] `PM-PRIO-013` **SHOULD** Yêu cầu pháp lý/bảo mật bắt buộc (luật ngành, MUST của blueprint) luôn là Must bất kể giá trị người dùng. → Kiểm: `xt.py blueprint-status --strict` không mở MUST tại cổng G7.

### Rủi ro & giả định: sổ rủi ro, spike, kế hoạch B

Nguồn khung: [`17-product-project/risk-and-assumptions.md`](.xtemplates/framework/17-product-project/risk-and-assumptions.md)

- [ ] `PM-RISK-009` **SHOULD** Rủi ro bảo mật không ghi lặp trong sổ này mà trỏ tới threat model; sổ chỉ giữ dòng tổng "xem THREAT-MODEL #id". → Kiểm: dòng rủi ro bảo mật có link `docs/THREAT-MODEL.md`.
- [ ] `PM-RISK-010` **SHOULD** Rủi ro con người: bus factor ≥2 cho mỗi thành phần sống còn (có người thứ hai đọc được code và chạy được runbook). → Kiểm: bảng "Thành phần → người biết" trong `docs/RISKS.md` không có dòng chỉ 1 tên khi dự án ≥ M.
- [ ] `PM-RISK-011` **SHOULD** Pre-mortem trước cổng G1: "giả sử dự án thất bại sau 6 tháng, vì sao?" — mỗi lý do thành một dòng sổ rủi ro. → Kiểm: mục "Pre-mortem" có ngày và ≥3 dòng được chuyển thành `RK-NNN`.
- [ ] `PM-RISK-012` **SHOULD** Rủi ro chi phí vận hành (hạ tầng, API trả theo lượt, model AI) có ước lượng theo khoảng và ngưỡng cảnh báo; chi tiết ở [`../15-operations/cost-management.md`](.xtemplates/framework/15-operations/cost-management.md). → Kiểm: dòng `RK` chi phí có số P50/P90 và link cảnh báo ngân sách.
- [ ] `PM-RISK-013` **SHOULD** Trước khi cài công cụ/skill/plugin từ ngoài: đọc script cài và hook, kiểm repo còn hoạt động (không archive/đổi tên), ghim phiên bản. → Kiểm: lockfile/ghim SHA; ghi chú "đã đọc `install.sh` ngày …" trong PR thêm phụ thuộc.
- [ ] `PM-RISK-014` **SHOULD** Rủi ro "benchmark tự công bố" của nhà cung cấp: không dùng làm căn cứ chọn khi chưa tái lập trên dữ liệu của mình. → Kiểm: ADR chọn công nghệ có mục "số đo của ta" hoặc ghi "chưa tái lập".

### Đặc tả: user story, Given/When/Then, ca biên, hợp đồng API, truy vết

Nguồn khung: [`17-product-project/specification.md`](.xtemplates/framework/17-product-project/specification.md)

- [ ] `PM-SPEC-011` **SHOULD** Spec có bảng dữ liệu: thực thể, trường, kiểu, ràng buộc, ai được đọc/ghi; thay đổi schema trỏ migration ([`../09-database/migrations.md`](.xtemplates/framework/09-database/migrations.md)). → Kiểm: mục "Dữ liệu" + link migration trong PR.
- [ ] `PM-SPEC-012` **SHOULD** Tính năng có UI mô tả đủ 4 trạng thái (đang tải, rỗng, lỗi, thành công) và a11y tối thiểu; chi tiết ở [`../06-design-ux/ui-states-and-feedback.md`](.xtemplates/framework/06-design-ux/ui-states-and-feedback.md). → Kiểm: mục "Trạng thái UI" có 4 dòng.
- [ ] `PM-SPEC-013` **SHOULD** Sửa spec sau Approved: tăng `Phiên bản`, ghi "Thay đổi" (gì, vì sao, ai duyệt), test tương ứng cập nhật trong cùng PR. → Kiểm: `git log -p docs/specs/SPEC-<slug>.md` cho thấy dòng phiên bản thay đổi cùng với test.
- [ ] `PM-SPEC-014` **SHOULD** Yêu cầu phi chức năng của tính năng ghi bằng số (giới hạn kích thước, rate limit, p95, kích thước bundle) để test hiệu năng có ngưỡng. → Kiểm: mục NFR có số + nguồn ngưỡng.
- [ ] `PM-SPEC-015` **SHOULD** Spec dùng thuật ngữ từ glossary; không có hai tên cho một khái niệm trong spec, code và UI. → Kiểm: review spec đối chiếu `docs/GLOSSARY.md`.
- [ ] `PM-SPEC-016` **SHOULD** Scenario "thử vượt quyền" (người dùng A truy cập dữ liệu B, khách truy cập tài nguyên cần đăng nhập) có trong mọi spec chạm dữ liệu người dùng. → Kiểm: `rg -n "vượt quyền|unauthorized|forbidden" docs/specs/` có kết quả cho các spec đó.

### DX: onboarding < 1 giờ, lệnh chuẩn, devcontainer, lỗi dễ hiểu

Nguồn khung: [`18-cross-cutting/developer-experience.md`](.xtemplates/framework/18-cross-cutting/developer-experience.md)

- [ ] `XC-DX-010` **SHOULD** Có **Dev Container** (`.devcontainer/devcontainer.json` với `image`/`build`, `features`, `postCreateCommand`, `forwardPorts`) để mở repo là có toàn bộ công cụ; CI có thể dùng cùng image (`devcontainers/ci`). → Kiểm: `devcontainer up --workspace-folder .` (CLI) thành công; `postCreateCommand` chạy `install` + hook. · Nguồn: Dev Container spec (containers.dev)
- [ ] `XC-DX-011` **SHOULD** Dữ liệu mẫu/seed và tài khoản thử cho dev được sinh bằng lệnh (`seed`), không dùng dữ liệu prod; fixture dùng chung với test. → Kiểm: lệnh `seed` tồn tại; không có file dump prod trong repo; xem [`../14-testing-quality/test-data-and-fixtures.md`](.xtemplates/framework/14-testing-quality/test-data-and-fixtures.md). · Nguồn: P11 (quyền riêng tư)
- [ ] `XC-DX-012` **SHOULD** Test chạy được **một file/một case** nhanh (`test -- path`, `-k`, `--filter`) và watch mode; thời gian suite unit < 2 phút tại chỗ. → Kiểm: README DX ghi cách chạy một test; `time test` < 120 s. · Nguồn: SPACE (efficiency & flow)
- [ ] `XC-DX-013` **SHOULD** Onboarding được **đo thật** với người (hoặc agent) mới: thời gian clone → PR đầu tiên qua cổng; ghi lại điểm vướng thành issue; mục tiêu < 1 giờ đến test xanh, < 1 ngày đến PR đầu. → Kiểm: `docs/onboarding-log.md` có ≥ 1 lần đo với ngày và thời gian. · Nguồn: SPACE (satisfaction, performance)
- [ ] `XC-DX-014` **SHOULD** Khảo sát DX ngắn (5–7 câu theo SPACE) mỗi quý; kết quả thành ≤ 3 hành động có owner. → Kiểm: kết quả và hành động ghi trong `docs/dx/`. · Nguồn: SPACE framework (Forsgren et al., ACM Queue 2021)
- [ ] `XC-DX-015` **SHOULD** Tài liệu "cách làm việc" cho người **và** agent là một nguồn: `AGENTS.md` (lệnh, quy ước, ranh giới) được README trỏ tới; không hai bộ hướng dẫn lệch nhau. → Kiểm: README link `AGENTS.md`; lệnh trong `AGENTS.md` khớp `xt.yaml` (script so sánh). · Nguồn: [`docs-for-ai-agents.md`](.xtemplates/framework/18-cross-cutting/docs-for-ai-agents.md)
- [ ] `XC-DX-016` **SHOULD** Cấu hình editor khuyến nghị commit ở dạng không ép buộc: `.vscode/extensions.json` (recommendations), `.vscode/settings.json` chỉ các khoá dự án (formatter mặc định), không khoá cá nhân. → Kiểm: `.vscode/settings.json` không chứa `window.*`/`workbench.colorTheme`. · Nguồn: EditorConfig (quy ước độc lập IDE)

### Tài liệu cho AI agent: AGENTS.md, CLAUDE.md, llms.txt, runtime.yaml, SCOPE.md

Nguồn khung: [`18-cross-cutting/docs-for-ai-agents.md`](.xtemplates/framework/18-cross-cutting/docs-for-ai-agents.md)

- [ ] `XC-DOCAI-010` **SHOULD** Tài liệu công khai (site docs/API) xuất bản `/llms.txt` theo đề xuất v2: H1 tên dự án, blockquote tóm tắt, H2 nhóm link dạng `[tên](https://…): ghi chú`, mục `## Optional` cho link thứ yếu; mỗi trang có bản Markdown (`.md`/`.html.md`) và header `Link: <…>; rel="alternate"; type="text/markdown"`. → Kiểm: `curl -f <site>/llms.txt | head -1` bắt đầu bằng `# `; `curl -f <site>/docs/page.md` 200; link trong llms.txt qua lychee 0 chết. · Nguồn: llms.txt v2 (llmstxt.org, cập nhật 2026-08-10)
- [ ] `XC-DOCAI-011` **SHOULD** `AGENTS.md` lồng theo package trong monorepo (gần nhất thắng), mỗi file chỉ chứa khác biệt so với gốc; không lặp luật chung. → Kiểm: `find . -name AGENTS.md` mỗi file < 100 dòng ở package; jscpd 0 trùng. · Nguồn: agents.md (nested files, closest wins); Codex AGENTS.md (gộp từ gốc xuống)
- [ ] `XC-DOCAI-012` **SHOULD** Tài liệu nạp vào agent có **phiên bản và ngày**: frontmatter `updated`, mục "Thay đổi gần đây" hoặc CHANGELOG riêng cho harness; harness ghi giả định về model/ngày để xét lại khi đổi model (harness có hạn sử dụng). → Kiểm: `AGENTS.md`/`.claude/**` có `updated`; CI cảnh báo > 180 ngày không cập nhật. · Nguồn: catalog 21 §2.2 ("harness có hạn sử dụng")
- [ ] `XC-DOCAI-013` **SHOULD** Mã nguồn đưa cho agent đọc ngoài repo (repomix, gitingest, Context7) chạy ở chế độ hạn chế thư mục (`repomix --sandbox`, MCP `--sandbox`) và quét bí mật trước khi xuất; không gói `.env`/khoá. → Kiểm: lệnh đóng gói có `--sandbox`/`--ignore` cho `.env*`; output qua gitleaks = 0. · Nguồn: catalog 16 §2b (repomix `--sandbox`, Secretlint)
- [ ] `XC-DOCAI-014` **SHOULD** Mỗi quy tắc trong file hướng dẫn mà máy kiểm được đã thành **cổng** (hook/lint/CI) và file ghi chú "được cưỡng chế bởi X"; quy tắc không kiểm được ghi rõ là hướng dẫn. → Kiểm: bảng trong `AGENTS.md`/`docs/agents/enforcement.md`: luật → cơ chế cưỡng chế; luật "bắt buộc" không có cơ chế → issue. · Nguồn: P9; catalog 23 §4.3 (thang mức bền `/hoc`)
- [ ] `XC-DOCAI-015` **SHOULD** Audit định kỳ file hướng dẫn: mâu thuẫn, lệnh lỗi thời, luật trùng (`/doctor prompt-audit` của Claude Code hoặc checklist tay); kết quả thành PR. → Kiểm: nhật ký audit hằng quý trong `docs/agents/`. · Nguồn: Claude Code memory docs (consistency, prompt audit)
- [ ] `XC-DOCAI-018` **SHOULD** Không bật đồng thời nhiều skill/plugin cùng chỉnh **giọng/hành vi trả lời** (vd ponytail + caveman + superpowers): nhiều prompt cùng ra lệnh về cách trả lời sẽ mâu thuẫn; mỗi vai chọn một pack, ghi trong `AGENTS.md`; plugin chạy binary ở hook phải ghim phiên bản, kiểm SHA và tắt telemetry (`DO_NOT_TRACK=1`). → Kiểm: danh sách plugin bật trong `.claude/settings.json` đối chiếu bảng vai trong `AGENTS.md`. · Nguồn: `seeker19110/stored` 20 §3g
- [ ] `XC-DOCAI-019` **SHOULD** Khi cấp skill cho agent **theo stack dự án**, ưu tiên installer dò stack có **cổng xuất xứ** — manifest + SHA-256 từng file, review nội dung skill trước khi nạp (injection/supply-chain), cảnh báo hiện trước khi cài, và ghi `skills-lock.json` (source + commit + hash) — hơn chép tay hoặc plugin marketplace tự cập nhật (xem `XC-DOCAI-009`, [`SEC-SUPPLY-016`](.xtemplates/framework/12-security/supply-chain.md)). Mẫu tham chiếu: autoskills (midudev). Nhưng license của nó là **CC BY-NC 4.0** (phi thương mại): chỉ gọi CLI đã xuất bản (`npx autoskills`) như **bước dev tuỳ chọn**, không đưa vào `dependencies` hay bước build phân phối, và **không vendor registry/mã** của nó vào sản phẩm phân phối/thương mại — CC BY-NC nằm trong nhóm cấm mặc định của [`CMP-LIC`](.xtemplates/framework/16-compliance-privacy/licensing-and-ip.md). → Kiểm: nếu dùng, có `skills-lock.json` với `source` + `sha256` mỗi skill; `grep -riE "autoskills" package.json` không thấy ở `dependencies`/`devDependencies` và không ở bước build phát hành (chỉ ở script dev hoặc tài liệu); nhúng registry/mã thì `license-policy.yaml` có ngoại lệ kèm `reason` và luật sư duyệt. · Nguồn: `seeker19110/stored` 20 §3h (autoskills: dò stack, registry review hai tầng bằng model + SHA-256 + `skills-lock.json`, license CC BY-NC 4.0)
- [ ] `XC-DOCAI-020` **SHOULD** Dự án để agent sinh UI có `DESIGN.md` theo spec DESIGN.md của `google-labs-code/design.md` (YAML front matter chứa token + văn xuôi giải thích; bản CLI đã đọc: `@google/design.md` 0.4.0, xác minh 2026-10-16 — **alpha; xác minh lại khi dùng**); phần token **sinh từ nguồn token gốc** (xem [`../06-design-ux/design-system-and-tokens.md`](.xtemplates/framework/06-design-ux/design-system-and-tokens.md)) bằng script, không chép tay; không dùng/chép `DESIGN.md` của thương hiệu khác làm file của dự án. → Kiểm: `npx @google/design.md lint DESIGN.md` 0 lỗi; job sinh lại phần token + `git diff --exit-code` sạch. · Nguồn: `seeker19110/stored` 06 §7c (linter 0.4.0 chấm 11 `DESIGN.md` "chính chủ": chỉ 1/11 sạch hoàn toàn; đọc 2026-10-16)

### Quốc tế hoá & bản địa hoá: chuỗi, số/ngày/tiền, RTL, tiếng Việt

Nguồn khung: [`18-cross-cutting/i18n-and-l10n.md`](.xtemplates/framework/18-cross-cutting/i18n-and-l10n.md)

- [ ] `XC-I18N-012` **SHOULD** Sắp xếp và lọc danh sách theo **collation của locale** (`Intl.Collator('vi')`, ICU, CSDL `COLLATE`), không theo byte; tìm kiếm tiếng Việt xử lý cả có dấu/không dấu theo spec. → Kiểm: test sắp xếp tên Việt đúng thứ tự từ điển (xem [`units-time-and-money.md`](.xtemplates/framework/18-cross-cutting/units-time-and-money.md) XC-UNITS-012). · Nguồn: UTS #10 rev. 55
- [ ] `XC-I18N-013` **SHOULD** Nội dung dịch có **quy trình**: ngôn ngữ nguồn duy nhất, nền tảng/định dạng trao đổi chuẩn (XLIFF/`.po`/JSON ICU), review bởi người bản ngữ cho ngôn ngữ phát hành; bản dịch máy (kể cả LLM) phải được đánh dấu và review trước khi lên production. → Kiểm: file dịch có metadata `reviewed_by`/trạng thái; CI chặn locale có khoá `machine-translated: true` chưa review ở nhánh phát hành. · Nguồn: P11; [`../13-ai-engineering/guardrails-and-safety.md`](.xtemplates/framework/13-ai-engineering/guardrails-and-safety.md)
- [ ] `XC-I18N-014` **SHOULD** Web: URL có tiền tố locale (`/vi/…`, `/en/…`) hoặc domain riêng, `hreflang` + `x-default`, sitemap theo ngôn ngữ; không chỉ dựa cookie. → Kiểm: `curl -I /vi/` 200; HTML có `<link rel="alternate" hreflang="vi">`; Lighthouse SEO không cảnh báo `hreflang`. · Nguồn: [`../07-frontend/rendering-and-routing.md`](.xtemplates/framework/07-frontend/rendering-and-routing.md)
- [ ] `XC-I18N-015` **SHOULD** Ảnh, icon, màu, ví dụ, đơn vị đo (km/mi, °C/°F, A4/Letter), định dạng địa chỉ và số điện thoại (E.164 lưu trữ, hiển thị theo quốc gia) theo locale; không nhúng chữ vào ảnh. → Kiểm: review checklist; test số điện thoại `+84` hiển thị `0xx xxx xxxx` ở `vi-VN`; thư viện `libphonenumber`. · Nguồn: W3C i18n (locale-sensitive data)
- [ ] `XC-I18N-016` **SHOULD** Test **pseudo-localization** và ít nhất một locale thật khác nguồn chạy trong CI (E2E render các màn chính) để bắt chuỗi hard-code, tràn, khoá thiếu trước khi dịch thật. → Kiểm: job E2E với `locale=qps-ploc` (hoặc `en-XA`) và `vi`/`en` xanh. · Nguồn: [`../14-testing-quality/e2e-and-accessibility.md`](.xtemplates/framework/14-testing-quality/e2e-and-accessibility.md)
- [ ] `XC-I18N-017` **SHOULD** Với sản phẩm có AI/LLM: prompt hệ thống, guardrail và eval có phiên bản **theo ngôn ngữ**; chất lượng tiếng Việt được đo riêng (không suy ra từ tiếng Anh); đầu ra giữ nguyên dấu tiếng Việt và không "dịch ngược" tên riêng. → Kiểm: bộ eval có tập tiếng Việt với ngưỡng riêng; test đầu ra NFC. · Nguồn: [`../13-ai-engineering/evaluation.md`](.xtemplates/framework/13-ai-engineering/evaluation.md); catalog 18 §4b–4c

### Mã nguồn mở & cộng đồng: CONTRIBUTING, CoC, SECURITY.md, phát hành công khai

Nguồn khung: [`18-cross-cutting/open-source-and-community.md`](.xtemplates/framework/18-cross-cutting/open-source-and-community.md)

- [ ] `XC-OSS-011` **SHOULD** Triage có quy tắc: nhãn chuẩn (`bug`, `enhancement`, `good first issue`, `needs-info`, `out-of-scope`), issue template bắt buộc bước tái hiện, `needs-info` tự đóng sau 14 ngày không phản hồi, bot stale có ngoại lệ cho issue đã xác nhận; phản hồi ban đầu cho bug ≤ 7 ngày. → Kiểm: workflow `needs-info`/stale tồn tại; tỷ lệ issue 2–12 tháng được phản hồi > 50 %. · Nguồn: OpenSSF Badge `report_process`, `report_responses`; catalog 20 §3c (`needs-info` 14 ngày)
- [ ] `XC-OSS-012` **SHOULD** `SCOPE.md` + `.out-of-scope/` công khai tiêu chí nhận (failure quan sát được, hợp triết lý) và danh sách đã từ chối có lý do; `+1` không được tính là bằng chứng. → Kiểm: file tồn tại; issue bị đóng `out-of-scope` trỏ file tương ứng. · Nguồn: catalog 20 §3c; [`docs-for-ai-agents.md`](.xtemplates/framework/18-cross-cutting/docs-for-ai-agents.md) XC-DOCAI-008
- [ ] `XC-OSS-013` **SHOULD** Tuân thủ **REUSE 3.3**: `LICENSES/<SPDX-id>.txt`, header `SPDX-License-Identifier`/`SPDX-FileCopyrightText` hoặc `REUSE.toml`; thông báo bên thứ ba (`THIRD_PARTY_NOTICES`) sinh từ SBOM. → Kiểm: `reuse lint` 0 lỗi trong CI; file notices cập nhật mỗi release. · Nguồn: REUSE Specification 3.3 (2024-11-14); SPDX License List 3.29.0
- [ ] `XC-OSS-014` **SHOULD** Phụ thuộc, action, image của dự án mở cũng ghim SHA và cập nhật tự động (Dependabot/Renovate cho `github-actions`, gói, docker); PR bot có nhãn `no-changelog`. → Kiểm: `pinact run --check`; `dependabot.yml` đủ hệ sinh thái. · Nguồn: Scorecard Pinned-Dependencies, Dependency-Update-Tool; [`../01-baseline/dependencies.md`](.xtemplates/framework/01-baseline/dependencies.md)
- [ ] `XC-OSS-015` **SHOULD** Thương hiệu/tên: tên gói không xung đột trên registry (đăng ký giữ chỗ scope), không dùng tên/logo của tổ chức khác (vd điều khoản "không dùng thương hiệu Claude Code" trong Agent SDK terms), `TRADEMARKS.md` nếu có nhãn hiệu. → Kiểm: tên đã đăng ký trên npm/PyPI/crates; review license của logo. · Nguồn: [`../16-compliance-privacy/licensing-and-ip.md`](.xtemplates/framework/16-compliance-privacy/licensing-and-ip.md); [`../../research/2026-10-13-ai-agent-research.md`](.xtemplates/framework/../research/2026-10-13-ai-agent-research.md) (Agent SDK terms)
- [ ] `XC-OSS-016` **SHOULD** Repo công khai **không chứa và chưa từng chứa** bí mật, dữ liệu người dùng, URL nội bộ; trước khi mở mã từ repo riêng tư: quét toàn lịch sử, cân nhắc tạo lịch sử mới. → Kiểm: gitleaks `--log-opts=--all` = 0; checklist "mở mã" ghi ngày thực hiện. · Nguồn: OWASP Secrets Management CS; [`../01-baseline/security-minimum.md`](.xtemplates/framework/01-baseline/security-minimum.md)

### Kỹ thuật hiệu năng chung: đo trước, ngân sách, profiling, regression

Nguồn khung: [`18-cross-cutting/performance-engineering.md`](.xtemplates/framework/18-cross-cutting/performance-engineering.md)

- [ ] `XC-PERF-009` **SHOULD** Benchmark **tái lập được**: ghi phần cứng/OS/runtime, warm-up, ≥ 5 lần chạy, báo trung vị + độ lệch; so sánh bằng công cụ thống kê (`benchstat`, `hyperfine --export-json`, `pytest-benchmark --compare`); CI dùng runner cố định hoặc chấp nhận ngưỡng rộng hơn. → Kiểm: script benchmark xuất JSON có metadata môi trường; README perf ghi cách chạy. · Nguồn: evidence-and-sources.md luật 11 (benchmark tự công bố chưa phải bằng chứng)
- [ ] `XC-PERF-010` **SHOULD** Dùng **USE** cho tài nguyên (CPU, RAM, disk, mạng, pool kết nối, queue) và **RED** cho dịch vụ khi chẩn đoán; dashboard tối thiểu có bốn tín hiệu vàng cho mỗi dịch vụ. → Kiểm: dashboard có latency, traffic, errors, saturation; runbook có checklist USE. · Nguồn: Brendan Gregg USE; Google SRE Book
- [ ] `XC-PERF-011` **SHOULD** Thuật toán và cấu trúc dữ liệu đúng độ phức tạp cho kích thước thật: không O(n²) trên danh sách người dùng, không N+1 truy vấn, không tải toàn bộ bảng vào bộ nhớ; kích thước dữ liệu thật ghi trong spec. → Kiểm: test với dữ liệu kích thước prod (×10) trong giới hạn thời gian; lint N+1 (vd `nplusone`, log cảnh báo ORM); EXPLAIN cho truy vấn nóng. · Nguồn: [`../09-database/indexing-and-query-performance.md`](.xtemplates/framework/09-database/indexing-and-query-performance.md)
- [ ] `XC-PERF-012` **SHOULD** Khởi động và đường nóng được đo riêng: cold start (serverless/CLI/mobile), thời gian build, thời gian test; ngân sách cho từng thứ (vd CLI `--help` < 100 ms, cold start < 1 s). → Kiểm: `hyperfine 'cli --help'` trong CI với `--export-json` so baseline. · Nguồn: clig.dev (responsiveness); hồ sơ `cli-tool`
- [ ] `XC-PERF-013` **SHOULD** Tài nguyên được **giải phóng**: không rò rỉ bộ nhớ/kết nối/file descriptor dưới tải kéo dài; pool có giới hạn; soak test ≥ 30 phút cho dịch vụ dài hạn. → Kiểm: soak test k6/Locust với metric RSS/fd ổn định (không tăng tuyến tính). · Nguồn: [`../14-testing-quality/performance-and-load.md`](.xtemplates/framework/14-testing-quality/performance-and-load.md)
- [ ] `XC-PERF-014` **SHOULD** Với hệ có LLM: đo TTFT, token/s, token vào/ra và chi phí mỗi tác vụ; ngân sách token/chi phí là cổng (circuit breaker 80/90/100 %). → Kiểm: trace OTel GenAI có `gen_ai.usage.*`; alert chi phí; chi tiết [`../13-ai-engineering/observability-and-cost.md`](.xtemplates/framework/13-ai-engineering/observability-and-cost.md). · Nguồn: catalog 21 §8
- [ ] `XC-PERF-015` **SHOULD** Tối ưu không đổi hành vi (refactor hiệu năng) đi PR riêng, có test bảo vệ và số đo; tối ưu đổi hành vi (bỏ tính năng, giảm độ chính xác) là quyết định sản phẩm có ADR. → Kiểm: PR `perf:` không chứa thay đổi tính năng; ADR khi đổi hành vi. · Nguồn: khung cũ N2 §9; Conventional Commits (`perf`)

### Bền vững: tài nguyên, chi phí năng lượng, tối ưu mã nguồn không đổi hành vi

Nguồn khung: [`18-cross-cutting/sustainability-and-efficiency.md`](.xtemplates/framework/18-cross-cutting/sustainability-and-efficiency.md)

- [ ] `XC-GREEN-009` **SHOULD** CI **không chạy thừa**: cache phụ thuộc/build theo hash lockfile, `concurrency` huỷ run cũ, job theo đường dẫn thay đổi (job gate vẫn luôn báo cáo), cron có jitter và bỏ qua khi không có commit mới, matrix tối thiểu cần. → Kiểm: workflow có `concurrency: { group, cancel-in-progress: true }`, `cache`; tổng phút CI/PR theo dõi và giảm hoặc ổn định. · Nguồn: catalog 23 §2.5 (cron có jitter; concurrency theo SHA)
- [ ] `XC-GREEN-010` **SHOULD** Việc nền không khẩn (báo cáo, huấn luyện, index, backup) chạy **theo lịch có thể dời** và ở vùng/lúc cường độ carbon thấp khi residency cho phép; batch thay vì polling; webhook thay vì poll định kỳ. → Kiểm: job nền có cửa sổ chạy cấu hình được; không có polling < 1 phút cho việc không cần realtime. · Nguồn: Green Software Patterns (time/region shifting); SCI (I theo vùng)
- [ ] `XC-GREEN-011` **SHOULD** Đo **năng lượng/carbon** ít nhất một thành phần có ý nghĩa (pipeline ML bằng CodeCarbon; cloud bằng carbon export/Cloud Carbon Footprint; web bằng SWDM) và tính SCI theo đơn vị chức năng (R = mỗi người dùng/yêu cầu/lần chạy); theo dõi xu hướng theo bản phát hành. → Kiểm: báo cáo SCI có E, I, M, R và nguồn hệ số; biểu đồ theo release. · Nguồn: SCI Specification 1.1.0; SWDM v4; CodeCarbon
- [ ] `XC-GREEN-012` **SHOULD** Độ phức tạp mã có ngưỡng (cyclomatic/cognitive) và trùng lặp có ngưỡng (jscpd); vượt → tách hàm/early return/gom tham số, không vì "đẹp" mà vì sửa rẻ hơn. → Kiểm: `jscpd --threshold 3` (% trùng), ESLint `complexity`/`sonarjs/cognitive-complexity`, ruff `C901`, `gocyclo` trong CI ở chế độ ratchet. · Nguồn: khung cũ N2 §9; [`../14-testing-quality/static-analysis-and-code-quality.md`](.xtemplates/framework/14-testing-quality/static-analysis-and-code-quality.md)
- [ ] `XC-GREEN-013` **SHOULD** Với LLM/AI: dùng model nhỏ nhất qua được eval, cache prompt/prefix, giới hạn vòng lặp và token, batch yêu cầu offline; chi phí/năng lượng mỗi tác vụ đo và có ngân sách (circuit breaker 80/90/100 %). → Kiểm: bảng chọn model theo eval; `gen_ai.usage.*` trong trace; ngân sách token ở cấu hình vòng lặp (xem [`../11-autonomous-loop/context-and-token-budget.md`](.xtemplates/framework/11-autonomous-loop/context-and-token-budget.md)). · Nguồn: catalog 21 §8, 03 §4 (150k → 2k token); [`../13-ai-engineering/observability-and-cost.md`](.xtemplates/framework/13-ai-engineering/observability-and-cost.md)
- [ ] `XC-GREEN-014` **SHOULD** Image container tối thiểu: multi-stage build, base image slim/distroless, không công cụ build trong runtime, `.dockerignore`; kích thước có ngân sách. → Kiểm: `docker image inspect` ≤ ngân sách (vd ≤ 200 MB cho dịch vụ Node/Python thường); `dive` hoặc script kiểm layer. · Nguồn: Green Software Patterns (containers); [`../15-operations/deployment-strategies.md`](.xtemplates/framework/15-operations/deployment-strategies.md)

### Đơn vị, thời gian (UTC, timezone), tiền (số nguyên), ID, so sánh chuỗi

Nguồn khung: [`18-cross-cutting/units-time-and-money.md`](.xtemplates/framework/18-cross-cutting/units-time-and-money.md)

- [ ] `XC-UNITS-013` **SHOULD** Ngày không gắn thời điểm (ngày sinh, hạn hợp đồng, ngày lễ) lưu kiểu **ngày thuần** (`DATE`, `PlainDate`, `LocalDate`), không `timestamp` 00:00 UTC (lệch ngày khi đổi múi giờ). → Kiểm: schema cột ngày sinh/hạn là `DATE`; test ngày sinh hiển thị đúng ở `Asia/Ho_Chi_Minh` và `America/Los_Angeles`. · Nguồn: Temporal `PlainDate`; java.time `LocalDate`
- [ ] `XC-UNITS-014` **SHOULD** Thời gian hiển thị cho người theo múi giờ **của người dùng** (lưu trong hồ sơ hoặc lấy từ client), định dạng theo locale (xem [`i18n-and-l10n.md`](.xtemplates/framework/18-cross-cutting/i18n-and-l10n.md)); dữ liệu xuất (CSV/báo cáo) ghi rõ múi giờ trong tiêu đề cột hoặc dùng RFC 3339. → Kiểm: test render cùng thời điểm cho hai người dùng khác tz; CSV xuất có cột `_utc` hoặc header ghi tz. · Nguồn: RFC 3339; W3C i18n (locale-sensitive data)
- [ ] `XC-UNITS-015` **SHOULD** Phần trăm/tỷ lệ lưu dạng số hữu tỉ có đơn vị rõ (`rate_bps` basis point, `percent` 0–100, `fraction` 0–1) — chọn một và ghi trong tên; không lẫn 0.15 với 15. → Kiểm: lint tên trường; test chuyển đổi. · Nguồn: P5
- [ ] `XC-UNITS-016` **SHOULD** Thư viện thời gian/tiền được **pin** và thay thế có ADR; với JS ưu tiên `Temporal` (hoặc polyfill) cho mã mới; không trộn hai thư viện ngày trong một codebase. → Kiểm: manifest có đúng một thư viện ngày; ADR chọn. · Nguồn: TC39 Temporal; [`../01-baseline/dependencies.md`](.xtemplates/framework/01-baseline/dependencies.md)
- [ ] `XC-UNITS-017` **SHOULD** Đồng hồ máy chủ đồng bộ NTP/PTP; chênh lệch > 1 s giữa các node sinh cảnh báo (ảnh hưởng token hết hạn, thứ tự sự kiện, UUIDv7). → Kiểm: metric `clock_offset_seconds` có alert; runbook có mục. · Nguồn: [`../15-operations/observability.md`](.xtemplates/framework/15-operations/observability.md)
- [ ] `XC-UNITS-018` **SHOULD** Độ dài/kích thước: `bytes` cho dữ liệu, ký tự Unicode (grapheme) cho giới hạn nhập của người, ghi rõ ở validate và CSDL (`VARCHAR(n)` là ký tự hay byte tuỳ CSDL). → Kiểm: test chuỗi tiếng Việt/emoji ở giới hạn ký tự không bị cắt giữa ký tự; tài liệu ghi đơn vị giới hạn. · Nguồn: W3C i18n (personal names: 4 ký tự Nhật = 12 byte)

### Ứng dụng web

Nguồn khung: [`02-profiles/web-app.md`](.xtemplates/framework/02-profiles/web-app.md)

- [ ] `PRF-WEB-011` **SHOULD** Trang lỗi 404/500 tùy chỉnh, mọi màn hình có 4 trạng thái (tải/rỗng/lỗi/thành công), thao tác ghi có trạng thái đang gửi và chống bấm đúp. → Kiểm: E2E chụp 404 và 500 giả lập; Storybook/visual test cho 4 trạng thái. · Nguồn: [`../06-design-ux/ui-states-and-feedback.md`](.xtemplates/framework/06-design-ux/ui-states-and-feedback.md)
- [ ] `PRF-WEB-012` **SHOULD** SEO kỹ thuật cho trang công khai: `sitemap.xml`, `robots.txt`, canonical, Open Graph, metadata theo route, structured data khi có nội dung phù hợp. → Kiểm: Lighthouse SEO ≥ 0.9; `curl /sitemap.xml` và `/robots.txt` trả 200; trang riêng tư có `noindex`.
- [ ] `PRF-WEB-013` **SHOULD** Ngân sách JS initial theo route ghi trong `PROJECT.md` và kiểm bằng `size-limit` (hoặc bundle analyzer) trong CI; vượt ngân sách → đỏ. → Kiểm: `size-limit` 14.2.0 cấu hình + job CI.
- [ ] `PRF-WEB-014` **SHOULD** Luồng cốt lõi (đăng nhập, form chính) vẫn dùng được khi JS tải chậm/lỗi hoặc có fallback rõ ràng (progressive enhancement). → Kiểm: E2E chạy với `javaScriptEnabled: false` cho form chính, hoặc ghi lý do miễn.
- [ ] `PRF-WEB-015` **SHOULD** Theme dark + light bằng design tokens, tôn trọng `prefers-color-scheme`, đạt tương phản AA ở **cả hai** chế độ. → Kiểm: axe chạy 2 lần với `colorScheme: 'dark'|'light'`; không hard-code mã màu ngoài file tokens (`grep -rE "#[0-9a-fA-F]{6}" src/ --exclude=tokens.css` rỗng). · Nguồn: [`../06-design-ux/design-system-and-tokens.md`](.xtemplates/framework/06-design-ux/design-system-and-tokens.md)
- [ ] `PRF-WEB-016` **SHOULD** Có RUM gửi Core Web Vitals thật từ người dùng (thư viện `web-vitals` hoặc tương đương) để đối chiếu với số lab của Lighthouse. → Kiểm: dashboard có p75 LCP/INP/CLS theo trang.

### SaaS B2B đa tenant

Nguồn khung: [`03-industries/saas-multitenant.md`](.xtemplates/framework/03-industries/saas-multitenant.md)

- [ ] `IND-SAAS-017` **SHOULD** Feature flag/entitlement theo tenant kiểm ở server; hạ cấp gói không khoá dữ liệu, chỉ chặn tạo mới và cảnh báo. → Kiểm: test hạ gói → đọc được, tạo mới bị chặn. · Nguồn: Luật BVQLNTD 19/2023/QH15 (khi khách cá nhân)
- [ ] `IND-SAAS-018` **SHOULD** API có phiên bản, chính sách deprecation ≥ 6 tháng với header cảnh báo, changelog công khai; webhook ra ngoài ký HMAC, retry có giới hạn, DLQ theo tenant. → Kiểm: contract test phiên bản cũ; test webhook retry; xem [`../08-backend/integrations-and-webhooks.md`](.xtemplates/framework/08-backend/integrations-and-webhooks.md). · Nguồn: [`../08-backend/api-design.md`](.xtemplates/framework/08-backend/api-design.md)
- [ ] `IND-SAAS-019` **SHOULD** Chi phí hạ tầng gán theo tenant (tag/label), cảnh báo tenant vượt ngưỡng chi phí so với doanh thu gói. → Kiểm: báo cáo cost-per-tenant hằng tháng; xem [`../15-operations/cost-management.md`](.xtemplates/framework/15-operations/cost-management.md). · Nguồn: thực hành FinOps
- [ ] `IND-SAAS-020` **SHOULD** Triển khai theo vòng (canary theo tenant nội bộ → % tenant → tất cả) với rollback tự động theo SLO. → Kiểm: pipeline có giai đoạn canary + tiêu chí; xem [`../15-operations/deployment-strategies.md`](.xtemplates/framework/15-operations/deployment-strategies.md). · Nguồn: thực hành SRE
- [ ] `IND-SAAS-021` **SHOULD** Dữ liệu người dùng cuối của tenant chỉ dùng cho mục đích cung cấp dịch vụ; không huấn luyện model/phân tích chéo tenant nếu không có đồng ý ghi trong hợp đồng. → Kiểm: data map ghi mục đích; flag `training_opt_in` theo tenant. · Nguồn: GDPR Art. 28(3)(a); Luật 91/2025/QH15 Đ.37
- [ ] `IND-SAAS-024` **SHOULD** Thành phần AI có **trạng thái thích nghi lúc chạy** (prior/hiệu chỉnh theo batch, ngưỡng động, hạn mức leo thang, semantic cache, memory bank) được khoá theo tenant (mỗi tenant một instance/khoá trạng thái) hoặc dùng cấu hình cố định (vd `prior=none`); không chia sẻ trạng thái giữa tenant. → Kiểm: test tenant A gửi 100 request lệch nhãn → đầu ra của tenant B cho cùng input không đổi (so trước/sau). · Nguồn: `seeker19110/stored` 17 §2c.5 (AnyJev: prior batch là trạng thái theo tiến trình; hệ đa tenant nên tách `Decider` theo tenant hoặc dùng `content_free`/`none`; đọc 2026-10-16)
