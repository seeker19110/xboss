# Phần D — Cấu hình chi tiết hàng rào (pre-commit + CI)

> **Theo ADR-0004: repo khung KHÔNG kèm sẵn scaffold Web.** Mọi tên công nghệ/file cụ thể trong tài liệu này
> (Next.js, Supabase, Vercel, `lighthouse-ci.yml`, `lib/env.ts`…) là **ví dụ cho hồ sơ Web (C1)** — dự án đích tự tạo
> khi hồ sơ áp dụng là Web; hồ sơ khác thay bằng công cụ tương đương (`quality-gates-by-profile.md`).

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

# (Tùy chọn — xem quality-supplements.md PHẦN 4) i18n / PWA / Sentry:
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

**Sau khi thêm script (Bước 2) và `.prettierrc`, chạy `npm run format` MỘT LẦN** để định dạng lại toàn bộ mã
nguồn `create-next-app` sinh ra (dấu nháy đôi → đơn, thứ tự class Tailwind...) và các file tài liệu khung vừa
copy. Bỏ qua bước này thì `npm run format:check`/CI sẽ đỏ ngay từ commit đầu — không phải do lỗi thật, mà vì
chưa ai format qua chuẩn Prettier mới (đã xác nhận bằng chạy thật — xem
`docs/framework/case-study-greenfield-dry-run.md`).

---

## Bước 4 — ESLint nghiêm hơn (flat config)

ESLint 9/10 và Next 16 dùng **flat config** (`eslint.config.mjs`) — không còn `.eslintrc.json`.
File `eslint.config.mjs` đã kèm sẵn ở gốc repo:

```js
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
  globalIgnores(['.next/**', 'coverage/**', 'playwright-report/**', 'public/sw.js', 'next-env.d.ts', '_framework-dropins/**']),
]);

export default eslintConfig;
```

> `eslint-config-next` (Next 16+) export flat config qua subpath riêng (`eslint-config-next/core-web-vitals`,
> `eslint-config-next/typescript`) — **không dùng `FlatCompat`** nữa: bản cũ dựa vào `@eslint/eslintrc`
> gây lỗi `TypeError: Converting circular structure to JSON` trên phiên bản `eslint-config-next` hiện tại
> (đã xác nhận bằng chạy thật — xem `docs/framework/case-study-greenfield-dry-run.md`).
> `eslint-config-next` đã gồm React/Hooks và bộ rule **jsx-a11y** cốt lõi. `no-explicit-any` ép bỏ `any`;
> `no-floating-promises` (cần `projectService` để lint theo kiểu) bắt promise quên `await`.
> **Tailwind v4:** cần `postcss.config.mjs` (đã kèm) với plugin `@tailwindcss/postcss`; trong `globals.css`
> chỉ cần `@import "tailwindcss";` (không còn `@tailwind base/components/utilities` như v3).

---

## Bước 5 — TypeScript strict tối đa

> **Nếu dùng PWA (`app/sw.ts`):** file service worker cần `/// <reference lib="webworker" />`
> ở dòng đầu (đã có sẵn trong dropins). Không có nó, `tsc --noEmit` báo `TS2552: Cannot find
> name 'ServiceWorkerGlobalScope'` vì `lib` của Next chỉ có DOM. Khai theo từng-file thay vì
> thêm `"webworker"` vào `lib` toàn cục để không trộn kiểu DOM/Worker cho phần còn lại.


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

Tạo file `vitest.config.mts`:

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
