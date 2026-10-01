# PLAN.md — Tích hợp OpenCodeReview (OCR): luật review XBoss theo đường dẫn (2026-10-01)

**Cập nhật:** 2026-10-01 · **Nhánh tích hợp:** `claude/elegant-carson-8jv8kz` (= `origin/main` `03d504b` + 1 commit đặc tả của phiên chính). **Trạng thái:** ĐÃ THI HÀNH 2026-10-01 (coordinator không giao được việc — xem TRAPS.md §5 — phiên chính giao trực tiếp A ∥ C → B).

**Bối cảnh (worker không thấy hội thoại):** Người dùng yêu cầu nghiên cứu và tích hợp sâu [alibaba/open-code-review](https://github.com/alibaba/open-code-review) — CLI review code bằng AI (`ocr`, Go, Apache-2.0). Quyết định đã chốt với người dùng: **chạy cả trong Claude Code (chế độ delegation, không cần API key) lẫn CI (mỗi PR, CHỈ GÓP Ý, không chặn merge)**. Đọc **`docs/adr/0012-review-ai-theo-luat-duong-dan.md`** trước tiên — nó ghi đủ lý do, ngữ nghĩa OCR đã kiểm chứng và các quyết định.

Phiên chính đã viết xong (commit đặc tả trên nhánh tích hợp — KHÔNG sửa nội dung trừ khi brief nói):

- `.opencodereview/rules/*.md` — các mảnh checklist (tiếng Việt) đúc từ `docs/audit.md` + `TRAPS.md`; `_boi-canh.md` là phần mở đầu chung.
- `.opencodereview/rules/manifest.json` — `include`/`exclude` + danh sách `rules` **có thứ tự** `{ id, path, fragments[], mergeSystemRule? }`.
- `docs/adr/0012-review-ai-theo-luat-duong-dan.md`.

Ngữ nghĩa OCR (đã kiểm từ mã nguồn `internal/config/rules/system_rules.go` bản 1.12.11 — test phải giả lập ĐÚNG như vầy):

- Duyệt `rules` theo thứ tự, **mục đầu tiên khớp thắng**. Bỏ qua mục có `rule` rỗng và không `merge_system_rule`.
- Với mỗi `path`: `expandBraces` chỉ tách cặp `{...}` **đầu tiên** (tìm `{` đầu tiên, rồi `}` đầu tiên sau nó, tách nội dung theo `,` → `prefix + opt + suffix`); không có `{` thì giữ nguyên. Mỗi phương án so bằng doublestar `Match(lower(pattern), lower(path))` — `*` không qua `/`, `**` khớp 0..n thư mục.
- `include`/`exclude` cũng so chữ thường như trên.
- Định dạng `rule.json`: `{ "include": [...], "exclude": [...], "rules": [{ "path", "rule", "merge_system_rule"? }] }`.

Đã chạy thử thật bằng `ocr rules check` (bản prototype) — bảng ánh xạ ở Việc A mục 4 là KẾT QUẢ THẬT, test phải tái hiện đúng.

## Ràng buộc CỨNG (mọi việc)

- Đọc `CLAUDE.md` (Quy ước, Definition of Done) + ADR-0012 trước khi code. Không đọc/sửa file `.env*`.
- Không chạm `app/`, `lib/`, `migrations/` (việc này chỉ là hạ tầng review). Không sửa nội dung mảnh luật `.opencodereview/rules/*.md`/`manifest.json` — thấy sai/thiếu thì **dừng và báo**, không tự chế.
- Phiên bản OCR ghim: **`1.12.11`**; action ghim SHA **`a758d9cbfb689937c7857ad64b2dd66adb58c0c2`** (commit của tag `v1.12.11`).
- Worker làm trong worktree được giao, commit, **không push**, không sửa `PROGRESS.md`. Commit message conventional + tiếng Việt, kết thúc bằng 2 dòng:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` và `Claude-Session: https://claude.ai/code/session_0161WZaHT8JNxeGRaPJhiLz4`.
- **Cổng bắt buộc trước khi báo xong:** `npx prettier --write <file đổi>` rồi `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run check:dead-code`, và test của việc (`npx tsx --test tests/ocr-rules.test.ts`). Không cần DB.

## Việc A — Bộ sinh `rule.json` + test canh luật + script `ocr` — `route: standard`

1. **`scripts/lib/ocr-rules.ts`** (thuần, không I/O ngoài tham số; bám phong cách các file trong `scripts/lib/`, comment tiếng Việt ngắn nói _vì sao_). Export:
   - type `OcrManifestRule = { id: string; path: string; fragments: string[]; mergeSystemRule?: boolean }`, `OcrManifest = { include: string[]; exclude: string[]; rules: OcrManifestRule[] }` (bỏ qua khoá `$comment`).
   - `buildOcrRuleFile(manifest, readFragment: (name: string) => string)`: mỗi mục → `{ path, rule, merge_system_rule: true chỉ khi mergeSystemRule }`; `rule` = `[readFragment("_boi-canh"), ...fragments.map(readFragment)].map(s => s.trim()).join("\n\n---\n\n")`. Trả `{ include, exclude, rules }` đúng thứ tự khoá đó.
   - `serializeOcrRuleFile(file)` = `JSON.stringify(file, null, 2) + "\n"`.
   - `expandFirstBrace(pattern): string[]` — đúng ngữ nghĩa `expandBraces` mô tả ở trên.
   - `matchesOcrGlob(pattern, filePath): boolean` — `expandFirstBrace(pattern).some(p => path.matchesGlob(filePath.toLowerCase(), p.toLowerCase()))` (`node:path`, Node ≥22; CI dùng Node 24).
   - `resolveRuleId(manifest, filePath): string | null` — id mục đầu tiên khớp.
2. **`scripts/gen-ocr-rules.ts`** — đọc `.opencodereview/rules/manifest.json` + `.opencodereview/rules/<tên>.md`, ghi `.opencodereview/rule.json` bằng 2 hàm trên; mảnh không tồn tại → throw rõ tên mảnh. In 1 dòng tóm tắt (số mục). Header comment theo mẫu `scripts/check-*.ts` (vì sao cần, cách chạy).
3. **`package.json`** scripts (đặt cạnh `gen:erd`): `"gen:ocr-rules": "tsx scripts/gen-ocr-rules.ts"` và `"ocr": "npx --yes @alibaba-group/open-code-review@1.12.11"`. **`.prettierignore`**: thêm `.opencodereview/rule.json` kèm comment kiểu dòng `docs/ERD.md` ("sinh tự động bằng npm run gen:ocr-rules — test so khớp, không để prettier canh lại"). Chạy `npm run gen:ocr-rules` và commit `.opencodereview/rule.json` sinh ra.
4. **`tests/ocr-rules.test.ts`** (`node:test` + `node:assert/strict`, không chạm DB → KHÔNG import `./setup`; đọc file theo đường dẫn từ gốc repo như các test khác). Các ca, thông điệp assert tiếng Việt chỉ rõ cách sửa:
   - `rule.json` trên đĩa **bằng đúng** `serializeOcrRuleFile(buildOcrRuleFile(...))` — lệch thì báo "chạy npm run gen:ocr-rules".
   - Mọi mảnh được tham chiếu tồn tại; mọi `*.md` trong `.opencodereview/rules/` (trừ `_boi-canh.md`) được ít nhất 1 mục dùng; `id` không trùng; không `path` nào có brace lồng (sau `{` đầu tiên không có `{` nào trước `}` tương ứng) và không có quá 1 cặp `{}`.
   - Bảng ánh xạ (đường dẫn → id) — **mỗi đường dẫn phải tồn tại trên đĩa** (`fs.existsSync`) và `resolveRuleId` trả đúng id:
     `lib/tien-do/recompute.ts`→`tien-do`; `lib/tien-do/status.ts`→`tien-do`; `app/api/tasks/[id]/approve/route.ts`→`nghiem-thu`; `app/api/approvals/route.ts`→`nghiem-thu`; `app/api/tasks/[id]/progress/route.ts`→`tick-tien-do`; `app/api/tasks/[id]/dimensions/route.ts`→`tick-tien-do`; `app/api/dimensions/[id]/route.ts`→`tick-tien-do`; `lib/bao-mat/auth.ts`→`phien-quyen`; `lib/bao-mat/session-token.ts`→`phien-quyen`; `lib/nen/roles.ts`→`phien-quyen`; `proxy.ts`→`phien-quyen`; `lib/bao-mat/ratelimit.ts`→`bao-mat-lib`; `app/api/auth/login/route.ts`→`bao-mat-route`; `lib/vat-tu/material-sync.ts`→`dong-bo-sheet-lib`; `app/api/materials/sync/route.ts`→`dong-bo-sheet-route`; `app/api/cron/sync-sheets/route.ts`→`dong-bo-sheet-route`; `lib/khoi-luong/boq.ts`→`boq-lib`; `app/api/boq/export/route.ts`→`boq-route`; `app/api/cron/daily-report/route.ts`→`cron`; `lib/tai-chinh/contracts.ts`→`tai-chinh-lib`; `app/api/payment-certs/[id]/excel/route.ts`→`tai-chinh-route`; `app/api/costs/route.ts`→`tai-chinh-route`; `lib/dich-vu/thong-bao.ts`→`thong-bao-lib`; `lib/van-hanh/push.ts`→`thong-bao-lib`; `app/api/notifications/route.ts`→`thong-bao-route`; `app/api/export/excel/route.ts`→`xuat-file`; `app/api/admin/audit-log/export/route.ts`→`xuat-file`; `app/api/dashboard/route.ts`→`route-api`; `app/api/v1/tasks/route.ts`→`route-api`; `lib/db/index.ts`→`lib`; `scripts/check-db-params.ts`→`scripts`; `migrations/0001_baseline.sql`→`migration`; `public/sw.js`→`offline-pwa`; `app/components/offlineQueue/index.ts`→`offline-pwa`; `app/tracking/[sheet]/TrackingGrid.tsx`→`giao-dien`; `app/globals.css`→`giao-dien`; `tests/recompute.test.ts`→`test`; `e2e/authed/approvals.spec.ts`→`e2e`; `.github/workflows/ci.yml`→`workflow`. Thêm 1 ca cho một file bất kỳ trong `lib/dich-vu/` khác `thong-bao.ts` (chọn file có thật) →`dich-vu`.
   - Tiền tố tĩnh còn tồn tại: với mỗi phương án sau `expandFirstBrace`, lấy phần trước ký tự glob đầu tiên (`*?[{`) cắt tới `/` cuối — đường dẫn đó phải tồn tại; phương án không có ký tự glob thì file phải tồn tại (bắt việc đổi tên/xoá thư mục mà quên luật).
   - `include` khớp `tests/recompute.test.ts` và `e2e/authed/approvals.spec.ts`; `exclude` khớp `.opencodereview/rule.json` và `package-lock.json`.
   - Viết sẵn hàm đọc `package.json` lấy phiên bản trong script `ocr` (regex `@alibaba-group/open-code-review@(\d+\.\d+\.\d+)`) và assert là `1.12.11`-dạng semver hợp lệ — Việc B sẽ thêm ca đối chiếu với workflow.
5. Commit: `ci(review): sinh .opencodereview/rule.json từ mảnh luật + test canh luật OCR theo đường dẫn`.

Tiêu chí: test mới xanh; `npm run gen:ocr-rules` chạy 2 lần liên tiếp không đổi file; các cổng ở Ràng buộc xanh.

## Việc B — Workflow CI `ocr-review.yml` (chỉ góp ý) — `route: standard` — chạy SAU khi Việc A đã gộp

Tạo **`.github/workflows/ocr-review.yml`**, comment đầu file tiếng Việt giải thích: review AI theo luật `.opencodereview/` (ADR-0012), chỉ góp ý, tự bỏ qua khi chưa cấu hình secret, action đọc luật từ merge ref của PR (_sửa sau review — bản đầu ghi nhầm "nhánh base"_). Bám phong cách `pr-policy.yml`/`ci.yml` (pin SHA đầy đủ kèm `# vX`, `permissions` tường minh).

- `on: pull_request` types `[opened, synchronize, reopened, ready_for_review]`. **Không** dùng `pull_request_target`.
- `permissions:` mức workflow `contents: read`; job khai `contents: read` + `pull-requests: write`.
- `concurrency: { group: ocr-review-${{ github.event.pull_request.number }}, cancel-in-progress: true }`.
- Job `ocr-review`, `name: OCR review (góp ý)`, `runs-on: ubuntu-latest`, `timeout-minutes: 30`, `if: github.event.pull_request.draft == false && github.event.pull_request.user.login != 'dependabot[bot]'`.
- Bước 1 `id: cfg` "Kiểm cấu hình LLM": env `OCR_URL: ${{ secrets.OCR_LLM_URL }}`, `OCR_TOKEN: ${{ secrets.OCR_LLM_AUTH_TOKEN }}`, `OCR_MODEL: ${{ vars.OCR_LLM_MODEL }}`; đủ cả 3 → `enabled=true` vào `$GITHUB_OUTPUT`; thiếu → `enabled=false` + `::notice title=OCR review bỏ qua::...` nêu tên secret/biến cần thêm và trỏ ADR-0012.
- Bước 2 `id: ocr`, `if: steps.cfg.outputs.enabled == 'true'`, `continue-on-error: true` (kèm comment: job chỉ góp ý — ngoại lệ có chủ đích so với audit §6), `uses: alibaba/open-code-review@a758d9cbfb689937c7857ad64b2dd66adb58c0c2 # v1.12.11`, `with:`
  `llm_url: ${{ secrets.OCR_LLM_URL }}`, `llm_auth_token: ${{ secrets.OCR_LLM_AUTH_TOKEN }}`, `llm_model: ${{ vars.OCR_LLM_MODEL }}`, `llm_use_anthropic: ${{ vars.OCR_LLM_USE_ANTHROPIC || 'true' }}`, `ocr_version: "1.12.11"`, `language: Vietnamese`, `effort: ${{ vars.OCR_EFFORT || 'medium' }}`, `max_tokens_budget: ${{ vars.OCR_MAX_TOKENS_BUDGET || '3000000' }}`, `review_concurrency: "4"`, `sticky_summary: "true"`, `incremental: "true"`, `checkpoint_range: "true"`, `route_severity_below: low`, `route_categories: style,documentation`, `upload_artifacts: "true"`, `stream_progress: "true"`, và `background` dạng block `|` gồm dòng `PR: ${{ github.event.pull_request.title }}`, dòng trống, `${{ github.event.pull_request.body }}` (an toàn: action truyền qua env, không nội suy vào shell của ta). Action tự checkout (merge ref của PR) — **không** thêm bước checkout. (_Sau review: thêm `timeout-minutes: 25` ở bước OCR và `background` chỉ còn tiêu đề — xem PROGRESS.md._)
- Bước 3 `if: steps.ocr.outcome == 'failure'`: `::warning title=OCR review lỗi::...` + ghi 1 dòng vào `$GITHUB_STEP_SUMMARY` (job vẫn xanh).
- **Test:** thêm vào `tests/ocr-rules.test.ts` ca "phiên bản OCR ghim khớp nhau": phiên bản trong script `ocr` của `package.json` = `ocr_version` trong workflow = phiên bản trong comment `# vX` sau `uses: alibaba/open-code-review@<40 hex>`; SHA đúng 40 ký tự hex.
- Kiểm cú pháp YAML bằng `node -e` + gói có sẵn trong repo nếu có (vd `yaml`/`js-yaml` trong `node_modules`), không có thì `python3 -c "import yaml"`; báo lại đã kiểm bằng gì.
- Commit: `ci(review): workflow OCR review mỗi PR bằng luật XBoss — chỉ góp ý, tự bỏ qua khi chưa có secret`.

Tiêu chí: YAML hợp lệ; mọi `uses:` pin SHA 40 ký tự; test xanh; cổng ở Ràng buộc xanh.

## Việc C — Tích hợp vào quy trình Claude Code + tài liệu — `route: standard` — song song với A

1. **Mới `.claude/commands/ocr-review.md`** (frontmatter `description:` tiếng Việt, bám kiểu `.claude/commands/review.md`). Quy trình delegation đã điều chỉnh cho XBoss:
   - Bước 1 phạm vi: mặc định `git fetch origin main` rồi `npm run -s ocr -- delegate preview --from origin/main --to HEAD`; người dùng chỉ định `--commit`/`--from --to`/workspace thì truyền nguyên. Có thể thêm `-b "<bối cảnh yêu cầu>"`.
   - Bước 2: `npm run -s ocr -- delegate rule <các file reviewable>` → nhóm luật. Mỗi nhóm là checklist bắt buộc cho đúng các file đó.
   - Bước 3: diff từng file theo mode (range: `git diff <merge_base>..<to> -- <file>`; commit: `git show <hash> -- <file>`; workspace: `git diff HEAD -- <file>`, file mới chưa track thì đọc thẳng). Review **chỉ dòng thay đổi**, đối chiếu từng mục checklist, đọc code xung quanh/route anh em để xác nhận (nguyên tắc ground-truth của `docs/audit.md` §1).
   - Bước 4 báo cáo tiếng Việt: chỉ mức **Cao** và **Trung bình**, mỗi phát hiện có `file:dòng`, kịch bản cụ thể, mục luật bị vi phạm (tên mảnh, vd `tai-chinh`); mức Thấp bỏ im lặng. Lỗi logic → đề xuất test hồi quy.
   - **Không tự sửa** mặc định (khác lệnh gốc của OCR); chỉ sửa khi người dùng truyền `--fix` — khi đó sửa mức Cao an toàn, rõ ràng rồi chạy lại lint/typecheck/test liên quan.
   - Dự phòng khi `npm run ocr` không chạy được (mất mạng): đọc `.opencodereview/rules/manifest.json`, tự chọn mục khớp đầu tiên theo thứ tự cho từng file và đọc các mảnh tương ứng — ghi rõ trong báo cáo là đã dùng dự phòng.
2. **Sửa `.claude/commands/review.md`**: Bước 2 thành hai lượt bổ sung nhau — (a) lượt luật XBoss theo đường dẫn qua quy trình `/ocr-review` (delegation), (b) `Skill(code-review)` như cũ; gộp phát hiện trùng. Giữ nguyên các bước/ranh giới khác.
3. **Sửa `.claude/agents/reviewer.md`**: trước khi gọi skill `code-review`, chạy `npm run -s ocr -- delegate preview --from origin/main --to HEAD` + `delegate rule` và soát diff theo từng nhóm luật; báo cáo cuối vẫn qua ReportFindings, ghi mục luật vào `summary`. Thêm `npm run -s ocr *` nếu cần vào phần mô tả công cụ (agent đã có Bash).
4. **`CLAUDE.md`** (giữ văn phong, thay đổi tối thiểu):
   - "Tài liệu dự án & khung": thêm bullet `.opencodereview/` — checklist `docs/audit.md`/`TRAPS.md` đúc thành luật review máy đọc theo đường dẫn (ADR-0012), dùng bởi `/ocr-review`, `/review`, agent `reviewer` và CI; **sửa checklist audit thì sửa mảnh tương ứng + `npm run gen:ocr-rules`**.
   - "Lệnh thường dùng": thêm `npm run gen:ocr-rules` và `npm run -s ocr -- delegate preview --from origin/main --to HEAD` (kèm comment ngắn).
   - "Quy ước" (cạnh mục merge khi CI xanh): job `OCR review (góp ý)` không chặn merge nhưng là một check — chờ nó xong như mọi check; phát hiện mức cao/critical phải xác minh: lỗi thật → sửa trước khi merge, báo sai → trả lời thread nêu lý do. Bật bằng secret `OCR_LLM_URL`/`OCR_LLM_AUTH_TOKEN` + biến `OCR_LLM_MODEL` (ADR-0012).
5. **`docs/audit.md`**: cuối §8 thêm 1 đoạn: luật review máy đọc của các vùng trên nằm ở `.opencodereview/rules/` (ADR-0012) — đổi checklist §3–§7 thì đồng bộ mảnh luật; `tests/ocr-rules.test.ts` canh mỗi vùng giải đúng mục luật.
6. Commit: `docs(review): lệnh /ocr-review + nối OCR delegation vào /review, agent reviewer, CLAUDE.md, docs/audit.md`.

Tiêu chí: `npm run format:check` xanh; lệnh trong tài liệu khớp đúng tên script của Việc A (`gen:ocr-rules`, `ocr`); không đổi hành vi nào ngoài phạm vi trên.

## Thứ tự

A ∥ C trên 2 worktree từ nhánh tích hợp `claude/elegant-carson-8jv8kz`; B bắt đầu từ nhánh tích hợp **sau khi gộp A**. Mỗi việc qua `reviewer`. Gộp A → C → B vào nhánh tích hợp (không push). Sau gộp chạy: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run check:dead-code`, `npx tsx --test tests/ocr-rules.test.ts`, `npm test`, `npm run build`. Báo cáo về phiên chính (phiên chính cập nhật `PROGRESS.md`, kiểm thật bằng `ocr`, push, mở PR).
