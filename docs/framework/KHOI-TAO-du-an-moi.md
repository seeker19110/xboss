# Runbook: Khởi tạo & triển khai một dự án mới

> Tài liệu này chỉ rõ: khi bắt đầu một dự án, **làm gì theo thứ tự** (Phần A) và **phải tuân thủ gì** (Phần B), kết thúc bằng **cổng "sẵn sàng phát triển"** (Phần C).
> Đi từ trên xuống. Không bỏ bước.

---

## Phần 0 — Cấu trúc repo chuẩn (đặt file vào đâu)

```
dự-án/
├─ CLAUDE.md                          ← luật AI (Claude Code tự đọc)
├─ PROJECT.md                         ← đặc tả dự án
├─ PROGRESS.md                        ← trạng thái dự án (cập nhật liên tục)
├─ docs/
│  ├─ framework/                      ← khung chung + hướng dẫn (tham khảo)
│  │  ├─ KHUNG-1-quy-trinh-va-tieu-chuan.md
│  │  ├─ KHUNG-2-luat-AI-va-mau-du-an.md
│  │  ├─ KHUNG-3-chon-cong-nghe-va-de-xuat-chu-dong.md
│  │  ├─ KHOI-TAO-du-an-moi.md         ← runbook (gồm cấu hình hàng rào + checklist dự án thật)
│  │  ├─ AP-DUNG-vao-du-an-co-san.md   ← áp khung lên dự án có sẵn (brownfield)
│  │  └─ BO-SUNG-chat-luong.md         ← Nhóm 1 + Nhóm 2 + theme + nâng cao
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

### Bước 1 — Định nghĩa dự án → tạo `PROJECT.md`
*(Tương ứng Giai đoạn 0–2 của khung, làm gọn)*
- [ ] Điền **Mẫu định nghĩa dự án** (Phần B của KHUNG 2): vấn đề, người dùng, MVP (MoSCoW), yêu cầu phi chức năng, stack, schema CSDL, kiến trúc/API, luồng người dùng, DoD, lộ trình, rủi ro.
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
- [ ] `styles/theme.css`: nối tokens vào Tailwind + script no-flash + nút chuyển (theo `BO-SUNG-chat-luong.md` PHẦN 3). Mặc định **Dark blue**, có **Light**.
- [ ] `e2e/smoke.spec.ts`: sửa cho khớp luồng chính thật.
- [ ] `.github/pull_request_template.md` + `ISSUE_TEMPLATE/` + `CHANGELOG.md` đã ở đúng chỗ.
- [ ] Thư mục `docs/adr/` sẵn sàng (viết ADR khi có quyết định kỹ thuật lớn).

### Bước 6 — Bật branch protection (GitHub UI)
- [ ] Settings → Branches → rule cho `main`: yêu cầu **Pull request**, yêu cầu **status checks (job CI) xanh**, yêu cầu **nhánh cập nhật** trước khi merge.
- **Tuân thủ:** từ đây, không gì vào `main` khi CI chưa xanh.

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

### Hành vi AI
- **Không bịa** hàm/thư viện/API — xác minh tồn tại.
- **Đọc file thật**, **chạy lệnh thật** — không giả định, không đoán kết quả.
- **Xuất báo cáo xác thực** trước mỗi commit/merge; có mục ❌ thì không commit/merge.
- **Dừng và hỏi** khi mơ hồ / thao tác không hoàn tác được / đụng bảo mật, thanh toán, dữ liệu thật.
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

# Phần D — Cấu hình chi tiết hàng rào (pre-commit + CI)

> Cấu hình cụ thể, sao chép được, cho stack **Next.js (App Router) + TypeScript + Tailwind + Supabase + Vercel**.
> Đây là phần biến tiêu chuẩn thành "hàng rào tự động" — máy chặn lỗi để con người không phải nhớ.
> Làm theo thứ tự từ trên xuống. Mỗi khối code ghi rõ tên file cần tạo / lệnh cần chạy.

---

## Tổng quan các lớp hàng rào (từ gần code ra ngoài)

1. **ESLint + Prettier + TypeScript** — báo lỗi ngay khi gõ.
2. **Pre-commit hook (Husky + lint-staged)** — chặn `git commit` nếu lint/format/type sai.
3. **commit-msg hook (commitlint)** — ép commit message đúng chuẩn.
4. **CI (GitHub Actions)** — chạy lại toàn bộ kiểm tra trên máy chủ sạch ở mỗi push/PR
   (lint/type/format/test+coverage/build/audit + **E2E Playwright** + chặn placeholder `[ĐIỀN]`).
5. **Lighthouse CI** — cổng ngân sách hiệu năng (Core Web Vitals) trên mỗi PR.
6. **CodeQL (SAST) + gitleaks** — quét lỗ hổng mã nguồn + bí mật lỡ commit.
7. **Branch protection** — cấm merge khi CI chưa xanh.
8. **Dependabot** — tự vá thư viện có lỗ hổng.

---

## Bước 1 — Cài các gói cần thiết

```bash
# Chất lượng code
npm install --save-dev prettier prettier-plugin-tailwindcss

# Pre-commit hooks
npm install --save-dev husky lint-staged

# Chuẩn commit message
npm install --save-dev @commitlint/cli @commitlint/config-conventional

# Kiểm thử (unit)
npm install --save-dev vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/jest-dom @vitest/coverage-v8

# Kiểm thử (E2E + accessibility) — Nhóm 2
npm install --save-dev @playwright/test @axe-core/playwright
npx playwright install --with-deps   # tải trình duyệt (bỏ qua nếu môi trường đã có)

# Hiệu năng (Lighthouse CI) — Nhóm 2
npm install --save-dev @lhci/cli

# Xác thực biến môi trường (dùng bởi lib/env.ts)
npm install zod

# (Tùy chọn — xem BO-SUNG-chat-luong.md PHẦN 4) i18n / PWA / Sentry:
# npm install next-intl @serwist/next @sentry/nextjs && npm install --save-dev serwist
```

> `create-next-app` đã kèm ESLint + `eslint.config.mjs` (flat config). Next 16 đã bỏ `next lint` — chạy `eslint` trực tiếp.
> `jsx-a11y` đã có sẵn trong `eslint-config-next` — không cần cài riêng.

---

## Bước 2 — Scripts trong `package.json`

Thêm/đảm bảo các script sau trong `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "type-check": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "lhci": "lhci autorun",
    "prepare": "husky"
  }
}
```

> `--max-warnings 0` biến cảnh báo thành lỗi → ép "0 cảnh báo" như tiêu chuẩn yêu cầu.
> **Next 16 đã bỏ lệnh `next lint`** — chạy ESLint trực tiếp như trên (ESLint 9/10 + flat config).

---

## Bước 3 — Prettier

Tạo file `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

Tạo file `.prettierignore`:

```
node_modules
.next
out
build
coverage
```

> `prettier-plugin-tailwindcss` tự sắp xếp các class Tailwind theo thứ tự chuẩn.

---

## Bước 4 — ESLint nghiêm hơn (flat config)

ESLint 9/10 và Next 16 dùng **flat config** (`eslint.config.mjs`) — không còn `.eslintrc.json`.
File `eslint.config.mjs` đã kèm sẵn ở gốc repo:

```js
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
    },
  },
  { ignores: ['.next/**', 'coverage/**', 'playwright-report/**', 'public/sw.js', 'next-env.d.ts'] },
];

export default eslintConfig;
```

> `eslint-config-next` đã gồm React/Hooks và bộ rule **jsx-a11y** cốt lõi. `no-explicit-any` ép bỏ `any`;
> `no-floating-promises` (cần `projectService` để lint theo kiểu) bắt promise quên `await`.
> **Tailwind v4:** cần `postcss.config.mjs` (đã kèm) với plugin `@tailwindcss/postcss`; trong `globals.css`
> chỉ cần `@import "tailwindcss";` (không còn `@tailwind base/components/utilities` như v3).

---

## Bước 5 — TypeScript strict tối đa

Trong `tsconfig.json`, đảm bảo `compilerOptions` có (Next đã bật `strict: true`, thêm các cờ sau):

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

> `noUncheckedIndexedAccess` rất đáng giá: buộc kiểm tra trước khi truy cập phần tử mảng/object → tránh lỗi `undefined`. Nếu thấy quá chặt lúc mới bắt đầu, có thể tạm tắt `noUnusedLocals`/`noUnusedParameters` (ESLint đã lo phần này).

---

## Bước 6 — Khởi tạo Husky & pre-commit hook

```bash
npx husky init
```

Lệnh này tạo thư mục `.husky/` và thêm script `prepare`. Giờ **ghi đè** nội dung file `.husky/pre-commit` thành:

```sh
npx lint-staged
npm run type-check
```

> `lint-staged` chỉ lint/format các file đang staged (nhanh). `type-check` chạy trên cả dự án vì TypeScript cần ngữ cảnh toàn bộ. Nếu bất kỳ bước nào fail, commit bị chặn.

---

## Bước 7 — Cấu hình lint-staged

Tạo file `.lintstagedrc.json`:

```json
{
  "*.{ts,tsx}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "*.{js,jsx,json,css,scss,md}": ["prettier --write"]
}
```

---

## Bước 8 — commitlint & commit-msg hook

Tạo file `commitlint.config.cjs`:

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```

> Dùng đuôi **`.cjs`** (CommonJS) thay vì `.js`: nếu `package.json` đặt `"type": "module"` thì file
> `.js` sẽ bị coi là ESM và `module.exports` vỡ. `.cjs` chạy đúng bất kể cấu hình module của dự án.
> (commitlint tự nhận diện `commitlint.config.{cjs,js,mjs,ts}`.)

Tạo file `.husky/commit-msg` với nội dung:

```sh
npx --no-install commitlint --edit "$1"
```

> Từ giờ commit message phải đúng dạng `feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `test: ...`, `chore: ...`. Sai dạng → bị chặn.

---

## Bước 9 — Kiểm thử với Vitest

Tạo file `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});
```

Tạo file `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom';
```

Viết thử một test nhỏ (ví dụ `lib/example.test.ts`) để xác nhận `npm test` chạy được.

---

## Bước 10 — CI với GitHub Actions

File `.github/workflows/ci.yml` (đã kèm ở gốc repo) chạy trên Node 22 với khung sau (rút gọn — xem file
thật để biết đầy đủ guard `package.json`):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Cài đặt
        run: npm ci

      - name: Quét bảo mật phụ thuộc
        run: npm audit --audit-level=high

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Kiểm tra format
        run: npm run format:check

      - name: Test (unit + coverage)
        run: npm run test:coverage

      - name: Build
        run: npm run build

  # Cổng E2E riêng: build app rồi chạy Playwright (desktop + mobile) + axe.
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:e2e
```

> CI chạy trên máy chủ sạch nên bắt được lỗi kiểu "máy tôi chạy được mà". Mọi pull request sẽ hiển thị xanh/đỏ theo kết quả này.
>
> File `ci.yml` kèm theo có một step kiểm tra đầu mỗi job: **nếu chưa có `package.json`** (repo mới chỉ có
> khung) thì các bước build/test/E2E được bỏ qua để CI vẫn xanh; **khi dự án thật được tạo**, toàn bộ hàng rào
> tự kích hoạt. Khi đã có app, có thể xóa step guard này nếu muốn CI luôn chạy đầy đủ. File thật còn có thêm:
> bước **chặn placeholder `[ĐIỀN]`** trong CLAUDE.md, và job **e2e** lưu báo cáo Playwright làm artifact.
>
> **Hàng rào CI khác kèm theo** (file riêng trong `.github/workflows/`): `lighthouse-ci.yml` (ngân sách hiệu năng),
> `codeql.yml` (SAST), `secret-scan.yml` (gitleaks), `release.yml` (release-please — sinh CHANGELOG/phiên bản
> từ conventional commits khi đã có dự án thật).

---

## Bước 11 — Branch protection (trên giao diện GitHub)

Vào repo → **Settings → Branches → Add branch ruleset** (hoặc Add rule) cho nhánh `main`:

- [ ] Bật **Require a pull request before merging** (cấm push thẳng).
- [ ] Bật **Require status checks to pass** → chọn các job: `quality`, `e2e`, `lighthouse`,
      `analyze` (CodeQL), `gitleaks` (chọn những cái bạn đã bật).
- [ ] Bật **Require branches to be up to date before merging**.
- [ ] Bật **Require review from Code Owners** (kết hợp `.github/CODEOWNERS`).
- [ ] (Tùy chọn) Bật **Require conversation resolution before merging**.

> Đây là lưới an toàn cuối: dù làm một mình, không gì lọt vào `main` khi CI chưa xanh.

---

## Bước 12 — Dependabot

Tạo file `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

Ngoài ra, vào **Settings → Code security** bật **Dependabot alerts** và **Dependabot security updates**.

---

## Bước 13 — Bảo vệ bí mật

Đảm bảo `.gitignore` có:

```
# Biến môi trường
.env
.env*.local

# Phụ thuộc & build
node_modules
.next
out
coverage
```

> Tuyệt đối không commit `.env`. Trên Vercel/Supabase, đặt biến môi trường qua dashboard, tách riêng cho dev và production.

---

## Bước 14 — Kiểm chứng hàng rào hoạt động

Chạy thử để chắc chắn mọi thứ chặn đúng:

```bash
# 1. Thử commit message sai chuẩn → phải BỊ CHẶN
git commit -m "sửa lung tung" --allow-empty
#    (kỳ vọng: commitlint báo lỗi)

# 2. Tạm thêm 1 dòng code sai kiểu hoặc thừa biến, rồi:
git add .
git commit -m "test: thử hàng rào"
#    (kỳ vọng: pre-commit chặn vì lint/type fail)

# 3. Chạy tay toàn bộ cổng chất lượng:
npm run lint && npm run type-check && npm run format:check && npm test && npm run build
#    (kỳ vọng: tất cả xanh)
```

Nếu bước 1–2 **không** bị chặn → hook chưa hoạt động (kiểm tra lại `.husky/` và script `prepare`).

---

## Thứ tự ưu tiên nếu bạn muốn làm gọn (cho người làm một mình)

Tối thiểu cần 4 lớp này là đã chặn phần lớn lỗi:
1. **Pre-commit hook** (Bước 6–7) — chặn ngay trên máy.
2. **commit-msg** (Bước 8) — lịch sử sạch.
3. **CI** (Bước 10) — kiểm tra tập trung.
4. **Branch protection** (Bước 11) — không cho merge khi đỏ.

Các phần còn lại (Dependabot, Lighthouse CI...) thêm dần sau.


===============================================================================

# Phần E — Triển khai trên DỰ ÁN THẬT (việc chỉ làm được khi có dự án)

> **File ghi chú để bổ sung sau.** Template chứa sẵn *quy trình + cấu hình mẫu*, nhưng có những thứ
> **chỉ tồn tại khi đã có dự án thật** (mã nguồn thật, repo settings, tài khoản dịch vụ, bí mật, lựa chọn
> nhà cung cấp). Tài liệu này gom hết lại thành một chỗ — đi từ trên xuống, tick dần.
>
> Đây **không phải lỗ hổng của template** mà là phần "điền vào chỗ trống" theo từng dự án. Mỗi mục ghi rõ
> *mở khóa cái gì* (file/cổng nào trong khung sẽ hoạt động sau khi làm) và *xem chi tiết ở đâu*.

---

## 1. Tạo bộ mã nguồn thật (mở khóa toàn bộ CI)

- [ ] `npx create-next-app@latest` (TypeScript + Tailwind + ESLint) → sinh `package.json`, `tsconfig.json`, `next.config.ts`.
- [ ] Cài gói + thêm khối `scripts` + `npx husky init` (rồi copy đè 2 hook `.husky/*`) — chi tiết **Phần D**.
- [ ] Thêm các cờ TypeScript `strict` (`noUncheckedIndexedAccess`...) — **Phần D** (Bước 5).
- [ ] Nối theme vào `app/globals.css` + `app/layout.tsx` (script no-flash) — xem `BO-SUNG-chat-luong.md` PHẦN 3.

> **Mở khóa:** mọi job CI hiện đang *tự bỏ qua khi chưa có `package.json`* (quality/e2e/lighthouse/codeql/release)
> sẽ tự kích hoạt. Sau bước này, xóa step guard `package.json` nếu muốn CI luôn chạy đầy đủ.

## 2. Xác minh lại công nghệ & phiên bản (research-first)

- [ ] **Xác minh lại phiên bản** từng gói bằng nguồn sống tại thời điểm khởi tạo (KHUNG 3, PHẦN B/B4) —
      bản ghi trong khung là ảnh chụp **2026-06-29**, sẽ lỗi thời.
- [ ] Ghi `PROJECT.md` mục 4: mỗi lựa chọn + **phiên bản + ngày xác minh** + 1 câu lý do; ghi **ADR** cho quyết định lớn.

## 3. Điền đặc tả & luật cho dự án

- [ ] `PROJECT.md`: điền đủ 10 mục (vấn đề, MVP+tiêu chí chấp nhận, phi chức năng, schema, API, DoD, rủi ro).
- [ ] `CLAUDE.md`: thay **mọi** chỗ `[ĐIỀN: ...]` (stack, lệnh, cấu trúc, quy ước). *CI sẽ fail nếu còn `[ĐIỀN]`.*
- [ ] `PROGRESS.md`: ghi giai đoạn hiện tại + việc tiếp theo.
- [ ] `LICENSE` + `.github/CODEOWNERS`: đổi `seeker19110`/MIT thành chủ sở hữu & giấy phép thật của dự án.

## 4. Cấu hình GitHub repository (Settings — không đóng gói được trong code)

- [ ] **Branch protection** cho `main` (KHOI-TAO Bước 6 / HUONG-DAN Bước 11): yêu cầu PR + status checks xanh +
      nhánh cập nhật + review từ Code Owners. Chọn các check bắt buộc: `quality`, `e2e`, `lighthouse`,
      `analyze` (CodeQL), `gitleaks`.
- [ ] **Code scanning**: Settings → Code security & analysis → bật (CodeQL cần để upload kết quả; nếu không
      job sẽ lỗi "Code scanning is not enabled"). Public: miễn phí · Private: cần GitHub Advanced Security.
- [ ] **Dependabot alerts** + **security updates**: bật trong Code security (file `dependabot.yml` đã có sẵn).
- [ ] **Secret scanning** (GitHub native) — bật nếu repo hỗ trợ (bổ trợ cho gitleaks).

## 5. Bí mật & biến môi trường (KHÔNG commit — đặt qua dashboard)

- [ ] **GitHub Actions secrets** (dùng bởi `lighthouse-ci.yml`, job `e2e`): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` (+ biến build khác nếu có).
- [ ] **Vercel env**: đặt riêng cho **Production** và **Preview**; Preview trỏ Supabase "staging".
- [ ] `.env.local` (local, đã bị `.gitignore` chặn): copy từ `.env.example`, điền giá trị thật.
- [ ] Đổi tên biến trong `lib/env.ts` cho khớp dự án; thêm bí mật mới vào `serverSchema`.

## 6. Cơ sở dữ liệu — Supabase (mở khóa RLS + migration thật)

- [ ] `npx supabase init` → `link --project-ref <ref>`; commit `supabase/` (gồm `config.toml`).
- [ ] Thay migration **mẫu** (`supabase/migrations/...init_example.sql`) bằng **schema thật**.
- [ ] **Bật & test RLS** trước khi mở cho người ngoài.
- [ ] **Backup tự động** đã bật và **đã thử khôi phục một lần** (BO-SUNG Nhóm 1 mục 2).

## 7. Hosting & triển khai — Vercel

- [ ] Kết nối repo với Vercel; xác nhận build + deploy "Hello World" OK.
- [ ] Mỗi PR tự sinh **Preview** (= staging miễn phí); chỉ `main` deploy production.

## 8. Quan sát & ra mắt (GĐ 6–7)

- [ ] **Sentry**: chạy `npx @sentry/wizard@latest -i nextjs`; đặt `SENTRY_DSN` qua env; bật cảnh báo
      (`BO-SUNG-chat-luong.md` PHẦN 4 — Sentry).
- [ ] **Analytics**: chọn nhà cung cấp theo nhu cầu (`BO-SUNG-chat-luong.md` PHẦN 4 — Analytics) + đặt khóa qua env.
- [ ] **release-please**: lần merge đầu vào `main` sẽ mở "release PR"; merge nó để cắt phiên bản + CHANGELOG.
- [ ] Checklist ra mắt GĐ 7 (KHUNG 1): privacy/terms, SEO meta/OG, trang lỗi, onboarding, kênh phản hồi.

## 9. Kiểm thử thật

- [ ] Thay `e2e/smoke.spec.ts` bằng **luồng chính thật** (đăng nhập → thao tác lõi → đạt mục tiêu).
- [ ] Viết unit test cho logic quan trọng + ca biên; giữ coverage ≥ ngưỡng (`vitest.config.ts`).

## 10. Kiểm chứng hàng rào (cổng "sẵn sàng phát triển")

- [ ] Thử commit message sai chuẩn → **bị chặn**; thêm code sai kiểu rồi commit → **bị chặn**.
- [ ] Tạo PR thử → CI chạy; khi đỏ thì **không merge được**.
- [ ] Đối chiếu **Phần C** của `KHOI-TAO-du-an-moi.md` — đạt đủ mới bắt đầu code tính năng.

---

> Với **dự án đã có sẵn** (brownfield), không làm tuần tự như trên mà áp tăng dần theo
> `AP-DUNG-vao-du-an-co-san.md` (đo baseline → hạ nợ dần). Checklist này vẫn là danh mục "đích đến".
