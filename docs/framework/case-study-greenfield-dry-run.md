# Case-study: chạy thử runbook greenfield đầu-cuối

> Mục đích: tự kiểm chứng `new-project-runbook.md` + `copy-framework.sh` thực sự dùng được trên
> một dự án Next.js thật, không chỉ đúng trên giấy. Chạy ngày 2026-07-02, trên `create-next-app@latest`
> thật (Next.js 16.2.10, ESLint 9.39.4, Node 22), không mô phỏng.

## Phạm vi đã chạy thật (verifiable, không cần tài khoản ngoài)

1. `npx create-next-app@latest` (TypeScript, Tailwind, ESLint, App Router) — dự án thật.
2. `bash copy-framework.sh <dự án>` — áp khung vào brownfield vừa tạo.
3. Cài đủ gói theo **Bước 1** (Phần D): prettier, husky, lint-staged, commitlint, vitest, playwright,
   lighthouse-ci, zod.
4. Merge các file `_framework-dropins/` cần thiết (eslint, postcss, prettier, vitest, lib/env.ts),
   thêm script `package.json` (**Bước 2**), thêm cờ TypeScript strict (**Bước 5**).
5. Chạy `npx husky init`, cài `.husky/pre-commit` + `.husky/commit-msg` từ dropins (**Bước 6, 8**).
6. Chạy đủ 5 cổng: `lint`, `type-check`, `format:check`, `test` (vitest), `build` (**Bước 14**).
7. Thử commit message sai chuẩn (phải bị chặn) và đúng chuẩn (phải qua) — kiểm chứng hook thật hoạt động.

**Ngoài phạm vi (cần tài khoản/hạ tầng ngoài, không mô phỏng được trong case-study):** branch protection
trên GitHub Settings (Bước 6/11), kết nối Supabase + RLS thật (Bước 7), deploy Vercel thật (Bước 8),
CodeQL/gitleaks/Lighthouse CI chạy trên GitHub Actions thật (đã kiểm gián tiếp qua `ci.yml`
chạy trên chính repo khung — xem `scripts/test-copy-framework.sh` và job `docs-consistency`).

## Kết quả: 5/5 cổng xanh, hook chặn đúng

```
npm run lint          → 0 lỗi, 0 cảnh báo (sau khi vá lỗi #1 dưới đây)
npm run type-check    → sạch (sau khi vá lỗi #3)
npm run format:check  → sạch (sau khi chạy `npm run format` một lần — xem lỗi #2)
npm test (vitest)     → 1/1 test qua
npm run build         → build production thành công (Turbopack, Next 16.2.10)

git commit -m "sửa lung tung"                              → BỊ CHẶN đúng (commitlint: subject-empty, type-empty)
git commit -m "chore: case study dry-run..."                → QUA đúng (pre-commit + commit-msg đều xanh)
```

## 3 lỗi thật tìm được — đã vá vào repo khung

### Lỗi #1 (nghiêm trọng) — `eslint.config.mjs` crash hoàn toàn trên Next.js 16 hiện tại
Config gốc dùng `FlatCompat` (`@eslint/eslintrc`) để nạp `next/core-web-vitals` + `next/typescript`.
Chạy thật cho lỗi:
```
TypeError: Converting circular structure to JSON
  ... at @eslint/eslintrc/lib/shared/config-validator.js
```
Nguyên nhân: `eslint-config-next` (đi kèm Next 16.2.10) giờ export **flat config gốc** qua subpath riêng
(`eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`) — không còn tương thích với cách nạp
qua `FlatCompat` kiểu cũ. Bằng chứng: `create-next-app@latest` tự sinh `eslint.config.mjs` dùng
`import nextVitals from 'eslint-config-next/core-web-vitals'` trực tiếp, không dùng `FlatCompat`.
**Đã vá:** `eslint.config.mjs` (gốc repo) + đoạn code mẫu trong `new-project-runbook.md` Bước 4 — chuyển sang
import subpath trực tiếp. Kiểm chứng lại: `npx eslint . --max-warnings 0` → exit 0.

### Lỗi #2 (tài liệu) — thiếu bước "chạy `npm run format` một lần"
`create-next-app` xuất mã theo style riêng (dấu nháy đôi, thứ tự class Tailwind mặc định) khác
`.prettierrc` của khung (`singleQuote: true`, `prettier-plugin-tailwindcss`). Runbook hướng dẫn tạo
`.prettierrc` nhưng không nói phải chạy `prettier --write .` một lần — nên `format:check`/CI đỏ ngay từ
commit đầu dù không có lỗi thật. **Đã vá:** thêm ghi chú bắt buộc vào cuối Bước 3.

### Lỗi #3 (nghiêm trọng, brownfield) — `copy-framework.sh`/`.ps1` ghi đè `.claude/` đang có
Bước "[2/3] Cấu hình Claude Code" copy `settings-shared-default.json` → `.claude/settings.json` và
`.claude/hooks`, `.claude/agents` **không điều kiện** — trái với chính lời cam kết đầu script
("An toàn cho dự án đã có sẵn... KHÔNG đè"). Một dự án brownfield đã dùng Claude Code từ trước (rất có thể,
vì Claude Code ngày càng phổ biến) sẽ **mất `.claude/settings.json` của họ không cảnh báo**.
**Đã vá:** cả `copy-framework.sh` và `.ps1` giờ theo đúng mẫu `copy_if_absent` (đã dùng cho `CLAUDE.md`):
nếu đích đã có `.claude/settings.json`/`hooks`/`agents` → để bản khung cạnh bên đuôi `.framework-new`.
Có test hồi quy: `scripts/test-copy-framework.sh` (ca "đích đã có `.claude/settings.json` + `.claude/hooks`").

## 1 lỗ hổng cấu trúc tìm được — vá bằng quy tắc quy trình, không vá từng công cụ

`_framework-dropins/` (thư mục staging của Lớp 2) tự nó **chứa một bản sao mọi file dropin**, bao gồm cả
`.lintstagedrc.json` của chính nó. Nếu người dùng `git add -A` trước khi dọn `_framework-dropins/`:
- `tsc --noEmit` lỗi vì `_framework-dropins/app/sw.ts`, `_framework-dropins/i18n/request.ts` tham chiếu
  gói tuỳ chọn (`serwist`, `next-intl`) chưa cài.
- Thử vá bằng cách thêm pattern loại trừ `_framework-dropins` vào `.lintstagedrc.json` gốc **không đủ**:
  lint-staged tự nạp `_framework-dropins/.lintstagedrc.json` như một scope lồng độc lập (vẫn dùng pattern
  cũ `*.{ts,tsx}` không loại trừ gì) → `git commit` **crash thật** ("Task killed") khi ESLint type-aware
  chạy đồng thời trên nhiều file dropin.

**Kết luận:** vá riêng từng công cụ (ignore list của ESLint, exclude của tsconfig, pattern của lint-staged)
không triệt để vì `_framework-dropins/` tự tái tạo lại vấn đề bằng chính bản sao cấu hình bên trong nó.
**Đã vá đúng gốc:** thêm bắt buộc vào Bước 0 của runbook — merge xong phần cần rồi **XOÁ hẳn
`_framework-dropins/` trước khi chạy gate/commit đầu tiên**. Xác nhận: sau khi loại `_framework-dropins/`
khỏi staging, toàn bộ chuỗi hook (`pre-commit` → `commit-msg`) chạy đúng như tài liệu mô tả.

## Chạy thật phần GitHub (FT-41, 2026-10-09)

Dự án đích `create-next-app@latest` (Next 16.4.0) + `copy-framework.sh` + toàn bộ `_framework-dropins/`, thêm `type-check`/`test`
(vitest) → `dev-task.sh gate` PASS cục bộ. Repo thật `seeker19110/case-study-ft41` (tạo private, chuyển public để bật bảo vệ nhánh).
Supabase (Bước 7) và Vercel (Bước 8) **ngoài phạm vi**, vẫn chưa kiểm chứng.

| Kiểm | Kết quả thật |
|---|---|
| Ruleset `main` trên repo **private, gói Free** | 403 "Upgrade to GitHub Pro or make this repository public" — cả ruleset lẫn branch protection kiểu cũ |
| Import `.github/rulesets/main.json` (repo public) | active: `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks` |
| Push thẳng `main` | `remote rejected` — "Changes must be made through a pull request", "2 of 2 required status checks are expected" |
| PR #6, #7 (squash) | `gate`, `metadata`, gitleaks, dependency-review, CodeQL (`javascript-typescript`/`python`/`actions`) ✅ → MERGED |
| `main` sau merge (`161f4ef`) | CI, CodeQL, Secret scan, OpenSSF Scorecard, Release ✅ |

Phát hiện (đều do chạy thật mới thấy):

- **F-41a (lỗi khung, đã sửa — TRAPS 61):** Dependabot mở 5 PR bot ngay lần đầu → cổng WIP (trần 3, đếm bot) chặn PR của người.
  Sửa: một `multi-ecosystem-group` (≤ 1 PR bot nâng phiên bản) + bỏ qua `semver-major`. Đưa cấu hình mới lên đích (PR #7): log
  Dependabot ghi `multi-ecosystem-update: true`, nhóm `dependencies`, áp ignore major → 0 PR (5 bản có sẵn đều major). Chưa quan sát
  được lúc tạo PR gộp vì chưa có bản minor/patch.
- **Repo private gói Free:** không có bảo vệ nhánh, Code scanning (CodeQL đỏ khi upload SARIF), Scorecard đỏ ("Resource not
  accessible by integration"). Dự án đích private cần GitHub Pro/Team hoặc bỏ các job đó có chủ đích.
- **Dependency graph** không tự bật khi repo tạo private rồi chuyển public → `dependency-review` đỏ đến khi bật
  (`PUT repos/<repo>/vulnerability-alerts`) — đã có trong `docs/ops/repository-settings.md` (checklist bảo mật).
- **gitleaks lần push đầu:** push chứa commit gốc (create-next-app luôn tạo) → `fatal: ambiguous argument '<root>^..<head>'`; lần
  push sau xanh. Đỏ một lần, không phải rò bí mật.
- CodeQL drop-in chỉ có `python`, `actions`: đích Next.js phải thêm `javascript-typescript` (đúng chú thích của drop-in; PR #6).

## Bài học cho các lần "chạy thử" sau

- Chạy thật luôn phát hiện được lỗi mà đọc lại tài liệu không thấy — cả 3 lỗi ở trên đều "đúng trên giấy"
  cho tới khi có lệnh `npm run lint`/`git commit` thật chạy trên máy.
- Ưu tiên vá gốc (quy trình) hơn vá ngọn (từng công cụ) khi một cấu trúc (như `_framework-dropins/`) có thể
  tự nhân bản vấn đề qua nhiều lớp công cụ khác nhau.
- Case-study này KHÔNG thay thế `scripts/test-copy-framework.sh` (kiểm cấu trúc copy tự động, chạy mỗi CI) —
  hai thứ bổ sung nhau: script bắt regression tự động, case-study bắt friction chỉ lộ ra khi chạy trọn luồng
  người dùng thật (cài gói, chạy gate, commit).
