# Runbook: Khởi tạo & triển khai một dự án mới

> **Theo ADR-0004: repo khung KHÔNG kèm sẵn scaffold Web.** Mọi tên công nghệ/file cụ thể trong tài liệu này
> (Next.js, Supabase, Vercel, `lighthouse-ci.yml`, `lib/env.ts`…) là **ví dụ cho hồ sơ Web (C1)** — dự án đích tự tạo
> khi hồ sơ áp dụng là Web; hồ sơ khác thay bằng công cụ tương đương (`quality-gates-by-profile.md`).

> Tài liệu này chỉ rõ: khi bắt đầu một dự án, **làm gì theo thứ tự** (Phần A) và **phải tuân thủ gì** (Phần B), kết thúc bằng **cổng "sẵn sàng phát triển"** (Phần C).
> Đi từ trên xuống. Không bỏ bước.

> **Áp cho mọi loại dự án — chọn hồ sơ trước:** *trình tự* (định nghĩa dự án → `CLAUDE.md` → khởi tạo → dựng hàng
> rào tự động → CI → branch protection → kiểm chứng) là **phổ quát cho mọi loại dự án** (web, mobile, desktop,
> backend/API, site tĩnh, CLI/thư viện, data/ML, game, blockchain, monorepo). Trước Bước 3, **xác định loại dự án &
> chọn hồ sơ** theo **KHUNG-3 PHẦN A0 + PHẦN C**. **Phần 0 và Phần D dưới đây là cấu hình cụ thể của hồ sơ Web app
> (Next.js + Supabase + Vercel)** — với hồ sơ khác, giữ nguyên trình tự nhưng **thay công cụ tương đương** (vd init
> dự án, hệ test, đóng gói, CI của loại đó); nguyên tắc hàng rào (pre-commit + commit-msg + CI + branch protection)
> không đổi. **Dự án có sẵn:** dùng `existing-project-adoption.md` (chỉ tư vấn & nâng cấp), không chạy runbook này.
> **Không xây dự án "cấm"** (mã độc/phá hoại/DoS… — xem CLAUDE.md §0b).

---

## Phần 0 — Cấu trúc repo chuẩn (đặt file vào đâu)

```
dự-án/
├─ CLAUDE.md                          ← luật AI (Claude Code tự đọc)
├─ PROJECT.md                         ← đặc tả dự án
├─ PROGRESS.md                        ← trạng thái dự án (cập nhật liên tục)
├─ .claude/                           ← cấu hình Claude Code: settings (model tiêu chuẩn Sonnet 5) + commands + hooks + agents
├─ scripts/                           ← dev-task.sh (điểm vào format/lint/test/build/gate cho hook) + usage-estimate.sh
├─ docs/
│  ├─ framework/                      ← khung chung + hướng dẫn (tham khảo)
│  │  ├─ 01-process-and-standards.md
│  │  ├─ 02-ai-rules-and-project-template.md
│  │  ├─ 03-tech-selection-and-proactive-advice.md
│  │  ├─ new-project-runbook.md         ← runbook (gồm cấu hình hàng rào + checklist dự án thật)
│  │  ├─ existing-project-adoption.md   ← áp khung lên dự án có sẵn (brownfield)
│  │  └─ quality-supplements.md         ← Nhóm 1 + Nhóm 2 + theme + nâng cao
│  ├─ ops/                            ← vận hành GĐ 8: incident-response + post-mortem (mẫu)
│  └─ adr/                            ← các quyết định kỹ thuật
│     └─ 0000-template.md
├─ LICENSE · SECURITY.md · CONTRIBUTING.md  ← giấy phép + chính sách bảo mật + hướng dẫn đóng góp
├─ eslint.config.mjs                  ← ESLint flat config (Next 16 / ESLint 9-10)
├─ postcss.config.mjs                 ← Tailwind v4
├─ .nvmrc · .editorconfig · .env.example
├─ lib/env.ts                         ← xác thực biến môi trường
├─ styles/theme.css                   ← design tokens (Dark blue + Light)
├─ components/theme-toggle.tsx        ← nút chuyển theme (dùng ngay)
├─ app/                               ← starter: trang lỗi, robots/sitemap, manifest, sw (PWA)
├─ i18n/request.ts · messages/*.json  ← đa ngôn ngữ (next-intl)
├─ e2e/smoke.spec.ts                  ← E2E mẫu (Playwright + axe)
├─ playwright.config.ts               ← cấu hình E2E (desktop + mobile)
├─ lighthouserc.json                  ← ngân sách hiệu năng (Lighthouse CI)
├─ CHANGELOG.md                       ← lịch sử thay đổi
├─ supabase/migrations/               ← migration có phiên bản (mẫu: bảng + ràng buộc + RLS policy)
└─ .github/
   ├─ pull_request_template.md
   ├─ CODEOWNERS                       ← tự gán reviewer (ăn khớp branch protection)
   ├─ ISSUE_TEMPLATE/                  ← mẫu báo lỗi / đề xuất tính năng / sự cố
   ├─ dependabot.yml
   └─ workflows/
      ├─ ci.yml                        ← lint/type/format/test+coverage/build/audit + E2E + chặn [ĐIỀN]
      ├─ lighthouse-ci.yml             ← cổng hiệu năng (Core Web Vitals)
      ├─ codeql.yml                    ← SAST (quét lỗ hổng mã nguồn)
      ├─ secret-scan.yml               ← gitleaks (chặn bí mật lỡ commit)
      └─ release.yml                   ← release-please (CHANGELOG + phiên bản tự động)
```

---

## Phần A — LÀM GÌ (trình tự triển khai)

### Bước 0 — Đưa khung vào repo
- [ ] Copy thư mục `docs/framework/` (các file KHUNG + runbook + BO-SUNG) và `docs/ops/`, `docs/adr/`.
- [ ] Copy `CLAUDE.md`, `lib/env.ts`, `pull_request_template.md` vào đúng chỗ theo Phần 0. (Hoặc dùng `copy-framework.sh`.)
- [ ] **Nếu dùng `copy-framework.sh`/`.ps1`:** soát `_framework-dropins/`, merge file khớp stack vào gốc repo,
      rồi **XOÁ hẳn `_framework-dropins/` trước khi chạy gate/commit đầu tiên**. Để lại thư mục này khi chạy
      `lint`/`type-check`/pre-commit sẽ làm hỏng cổng vì nó chứa file ví dụ tham chiếu gói tuỳ chọn chưa cài
      (`next-intl`, `serwist`...) — đã xác nhận bằng chạy thật (`docs/framework/case-study-greenfield-dry-run.md`).

### Bước 1 — Định nghĩa dự án → tạo `PROJECT.md`
*(Tương ứng Giai đoạn 0–2 của khung, làm gọn)*
- [ ] Điền mẫu `PROJECT.md` ở gốc repo (quy trình: KHUNG 2 Phần C): vấn đề, người dùng, MVP (MoSCoW), yêu cầu phi chức năng, stack, schema CSDL, kiến trúc/API, luồng người dùng, DoD, lộ trình, rủi ro.
- [ ] **AI chạy KHUNG 3 (research-first):** đề xuất chủ động *mọi mặt* (PHẦN A) + chọn công nghệ với **phiên bản ổn định đã xác minh bằng nguồn sống** (PHẦN B), cân bằng phổ biến ↔ năng lực; ghi ADR.
- [ ] Chốt `PROJECT.md` sau khi đồng ý các góp ý (tech stack ghi rõ **phiên bản + ngày xác minh**).
- **Tuân thủ:** mỗi tính năng Must có *tiêu chí chấp nhận* đo được; *đóng băng* phạm vi MVP; **không đoán phiên bản theo trí nhớ**.

### Bước 2 — Tạo `CLAUDE.md` cho dự án
- [ ] Điền mọi chỗ `[ĐIỀN: ...]` từ `PROJECT.md`: stack, lệnh (dev/build/test/type-check/format/migration), cấu trúc thư mục, quy ước đặt tên, thư viện chính, giai đoạn hiện tại.
- [ ] Giữ file gọn (< 200 dòng); để chi tiết ở `docs/framework/`.

### Bước 3 — Khởi tạo dự án + Git
- [ ] `npx create-next-app@latest` (TypeScript, Tailwind, ESLint).
- [ ] `git init`, tạo repo trên GitHub, commit đầu tiên.
- [ ] `.gitignore` chặn `.env`, `.env*.local`, `node_modules`, `.next`.
- **Tuân thủ:** không bao giờ commit `.env` hay bí mật.

### Bước 4 — Dựng hàng rào tự động
*(Cấu hình chi tiết, sao chép được: **Phần D** bên dưới, 14 bước)*
- [ ] TypeScript `strict` + các cờ nghiêm (`noUncheckedIndexedAccess`...).
- [ ] ESLint (no-explicit-any, no-floating-promises) + Prettier.
- [ ] ESLint thêm `jsx-a11y/recommended` (a11y tĩnh).
- [ ] Husky + lint-staged → **pre-commit hook** (lint + format + type-check).
- [ ] commitlint → **commit-msg hook** (ép conventional commits).
- [ ] Vitest (`npm test`) + **ngưỡng coverage** (`npm run test:coverage`).
- [ ] **Playwright** E2E (desktop + mobile) + **axe** (`npm run test:e2e`).
- [ ] CI (GitHub Actions): build + lint + type-check + format:check + test+coverage + `npm audit` + **chặn `[ĐIỀN]`**;
      job **E2E Playwright** (desktop + mobile + axe); **Lighthouse CI** trên PR (`lighthouse-ci.yml`).
- [ ] **CodeQL** (SAST) + **gitleaks** (secret scan) — `codeql.yml`, `secret-scan.yml`.
- [ ] **release-please** (`release.yml`) — sinh CHANGELOG + phiên bản tự động từ conventional commits.
- [ ] Dependabot.
- **Tuân thủ:** không bỏ bước nào của hàng rào — đây là tầng chặn lỗi đáng tin cậy nhất.

### Bước 5 — Thêm file bổ sung chất lượng
- [ ] `lib/env.ts`: đổi tên biến cho khớp dự án; dùng `clientEnv`/`serverEnv` thay cho `process.env` rải rác.
- [ ] `styles/theme.css`: nối tokens vào Tailwind + script no-flash + nút chuyển (theo `quality-supplements.md` PHẦN 3). Mặc định **Dark blue**, có **Light**.
- [ ] `e2e/smoke.spec.ts`: sửa cho khớp luồng chính thật.
- [ ] `.github/pull_request_template.md` + `ISSUE_TEMPLATE/` + `CHANGELOG.md` đã ở đúng chỗ.
- [ ] Thư mục `docs/adr/` sẵn sàng (viết ADR khi có quyết định kỹ thuật lớn).
- [ ] `SUPPORT.md` + `GOVERNANCE.md` của dự án đích: tự sinh từ `docs/framework/templates/SUPPORT.template.md` và `docs/framework/templates/GOVERNANCE.template.md` (manifest cố ý không copy bản của khung).

### Bước 6 — Bật branch protection (GitHub UI)
- [ ] Settings → Branches → rule cho `main`: yêu cầu **Pull request**, yêu cầu **status checks (job CI) xanh**, yêu cầu **nhánh cập nhật** trước khi merge.
- **Tuân thủ:** từ đây, không gì vào `main` khi CI chưa xanh.
- **Lưu ý gói:** repo **private** trên tài khoản GitHub Free không bật được ruleset/branch protection (API trả 403) và không có Code scanning — cần Pro/Team hoặc repo public (đo thật FT-41, `case-study-greenfield-dry-run.md`).

### Bước 7 — Kết nối Supabase + migration đầu tiên
- [ ] `npx supabase init` → `link` tới project; commit thư mục `supabase/`.
- [ ] Tạo schema qua migration (`supabase migration new ...` hoặc `db diff`).
- [ ] **Bật và test Row Level Security** trước khi mở cho người ngoài.
- [ ] Commit `supabase/migrations/`.
- **Tuân thủ:** mọi thay đổi CSDL đi qua migration có phiên bản; có sẵn đường rollback (migration bù trừ hoặc backup).

### Bước 8 — Deploy thử lên Vercel (Hello World)
- [ ] Kết nối repo với Vercel.
- [ ] Đặt biến môi trường **riêng** cho Production và Preview (Preview trỏ tới Supabase "staging", không đụng dữ liệu thật).
- [ ] Xác nhận build + deploy thành công, và mỗi PR tự sinh một bản Preview.
- **Tuân thủ:** chỉ nhánh `main` deploy lên production.

### Bước 9 — Kiểm chứng hàng rào hoạt động
- [ ] Thử commit message sai chuẩn → **phải bị chặn**.
- [ ] Thử thêm code sai kiểu/thừa biến rồi commit → pre-commit **phải chặn**.
- [ ] Tạo một PR thử → CI chạy; khi đỏ thì **không merge được**.
- Nếu một trong số này không bị chặn → hàng rào chưa hoạt động, quay lại Bước 4/6.

> **Hết Bước 9 = dự án "sẵn sàng phát triển".** Chuyển sang Giai đoạn 4 (Phát triển), mỗi tính năng đi qua cổng commit/merge trong `CLAUDE.md`.

---

## Phần B — PHẢI TUÂN THỦ GÌ (quy tắc bất biến, không bao giờ phá)

### Mã nguồn & kiểu dữ liệu
- TypeScript `strict`, **không `any`**.
- Mọi đầu vào (người dùng, API, CSDL) **validate lúc chạy** trước khi dùng.
- Mọi thao tác có thể fail đều có **xử lý lỗi** + trạng thái tải/rỗng/lỗi trên UI.
- Không lặp logic; hàm nhỏ làm một việc; không "số/chuỗi ma thuật".

### Bảo mật
- **Bí mật không bao giờ vào Git** (dùng biến môi trường).
- Logic nhạy cảm (kiểm tra quyền, tính toán quan trọng) **luôn ở server**.
- Truy vấn **tham số hóa** (chống SQL injection); **escape** dữ liệu ra HTML (chống XSS).
- **RLS** bật và đã test trước khi mở cho người ngoài.

### Git & quy trình
- Mỗi tính năng/sửa lỗi **một nhánh riêng**; commit nhỏ.
- **Conventional commits** (`feat`, `fix`, `refactor`...).
- **Mọi merge qua Pull Request**; **CI xanh mới được merge**; **không push thẳng `main`**.

### Chất lượng
- Một tính năng chỉ **XONG** khi đạt **Definition of Done** (đối chiếu checklist PR).
- Một task chỉ **BẮT ĐẦU** khi đạt **Definition of Ready** (có tiêu chí chấp nhận rõ, không còn câu hỏi mở, phạm vi gói trong một PR).
- **Tối ưu mã nguồn** trước khi đóng mỗi mảng/tính năng: gỡ dead code, giảm trùng lặp & độ phức tạp, tỉa dependency thừa, thu nhỏ bundle — refactor **không đổi hành vi**, có test bảo vệ (playbook: `quality-supplements.md` Nhóm 2 mục 9).

### Hành vi AI
- **Không bịa** hàm/thư viện/API — xác minh tồn tại.
- **Đọc file thật**, **chạy lệnh thật** — không giả định, không đoán kết quả.
- **Xuất báo cáo xác thực** trước mỗi commit/merge; có mục ❌ thì không commit/merge.
- **Dừng và hỏi chỉ theo CLAUDE.md §9 (thiếu mục tiêu/dữ kiện không tự xác minh · không có phương án đạt chất lượng trong scope/budget · cần quyền chưa cấp) và `docs/framework/standard-delivery.md` §3d**.
- **Chủ động góp ý** khi thấy cách tốt hơn hoặc rủi ro — không im lặng làm theo.

### Dữ liệu & vận hành
- Mọi thay đổi CSDL qua **migration có phiên bản**, có đường **rollback**.
- **Backup đã thử khôi phục** ít nhất một lần.
- **Không test trên dữ liệu production thật**; tách môi trường dev/staging/production.

---

## Phần C — Cổng "Sẵn sàng phát triển" (kiểm trước khi viết code tính năng)

Chỉ bắt đầu phát triển tính năng khi **tất cả** đã đạt:

- [ ] `PROJECT.md` hoàn chỉnh, đã qua phản biện của AI.
- [ ] `CLAUDE.md` đã điền đầy đủ cho dự án (không còn `[ĐIỀN]`).
- [ ] Repo + GitHub + `.gitignore` chặn bí mật.
- [ ] Pre-commit hook + commit-msg hook **đã thử và chặn được** lỗi.
- [ ] CI chạy trên PR; branch protection bật, **không merge được khi đỏ**.
- [ ] `lib/env.ts` hoạt động; biến môi trường đã đặt cho cả Production và Preview.
- [ ] Supabase kết nối, RLS bật, migration đầu đã commit.
- [ ] Deploy thử lên Vercel thành công; Preview tự sinh cho PR.
- [ ] Backup CSDL đã bật.

> Đạt đủ = ba tầng phòng thủ đã sẵn sàng (AI có kỷ luật + hook cục bộ + CI tập trung). Giờ mới bắt đầu code tính năng theo Giai đoạn 4.

> **Danh mục đầy đủ** các việc chỉ làm được trên dự án thật (tạo app, repo settings, Code scanning,
> secrets, Supabase/Vercel, analytics, release): xem **Phần E** bên dưới.


===============================================================================

---

> **Phần D và Phần E đã tách ra file riêng** để file này còn đúng phần "làm gì / tuân thủ gì /
> cổng sẵn sàng" (~200 dòng) thay vì 758 dòng. **Tên file này giữ nguyên** nên mọi tham chiếu cũ
> (`docs/framework/new-project-runbook.md`) vẫn đúng.

| Phần | File | Nội dung |
| --- | --- | --- |
| **Phần D** | `docs/framework/new-project-runbook-part-d-guardrails.md` | Cấu hình chi tiết hàng rào — 14 bước sao chép được (Prettier, ESLint, TS strict, Husky, lint-staged, commitlint, Vitest, CI, branch protection, Dependabot, bảo vệ bí mật, kiểm chứng) |
| **Phần E** | `docs/framework/new-project-runbook-part-e-checklist.md` | Checklist triển khai trên DỰ ÁN THẬT — việc chỉ làm được khi đã có dự án (secrets, Supabase/Vercel, analytics, release) |

