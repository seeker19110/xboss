# XBoss áp bộ khung `projects-template` — phần lấy, phần không lấy, cách nâng bản

> File riêng của XBoss (không có trong repo khung — `copy-framework.sh --upgrade` không đụng tới).
> Quyết định: `docs/adr/0014-quy-trinh-theo-rui-ro-va-khung-projects-template.md`. Bản khung đang áp:
> `docs/framework/FRAMEWORK-VERSION` (v0.1.0 @ `59bd1d1`, 2026-10-12).

## Đọc tài liệu khung thế nào

Mọi file khác trong `docs/framework/` là **bản nguyên văn** của repo khung — để `--upgrade` so hash và
merge 3 chiều, không định dạng lại (đã loại khỏi prettier) và chỉ sửa khi thật cần.

- Số ADR (`ADR-0004`, `ADR-0010`…) và `CLAUDE.md §N` trong tài liệu khung trỏ tới **repo khung**, không
  phải XBoss (vd ADR-0010 của khung là "quy trình theo rủi ro", của XBoss là "tương phản màu").
- Khi khung và XBoss nói khác nhau: `CLAUDE.md` + `docs/adr/` + `docs/audit.md` của XBoss **thắng**.
- Tương ứng hay gặp:

| Khung nói                                                          | Ở XBoss là                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `docs/specs/*.md`, `FEATURE-SPEC.template.md`, "Approved for implementation" | Đặc tả `docs/nang-cap/M<xx>-*.md` (mức M/L), LUẬT CỨNG "thiếu đặc tả thì hỏi" |
| `standard-delivery.md` §3c (mức S/M/L, trần 5 subagent)            | `CLAUDE.md` mục "Quy trình theo mức rủi ro" (ADR-0014)                           |
| `scripts/dev-task.sh gate`                                         | `npm run gate` (+ `-- --test --build`), skill `/gate`                            |
| `docs/work/<id>/working.md`, `new-work.sh`, `docs/goals/`          | `PROGRESS.md` + `PLAN.md` + `docs/nang-cap/`                                     |
| `/audit-full`, `/completion`, `/audit-optimize`                    | `/review`, agent `audit-*`, `docs/audit.md`, lộ trình `docs/ops/lo-trinh-*`      |
| `vitest`, `ci-workflow-policy.test.ts`                             | `node:test` qua `tsx` (ADR-0002)                                                 |
| `subagent-dispatch.sh --tier`                                      | Bảng `route:` trong `CLAUDE.md`                                                  |

## Đã lấy (2026-10-12)

| Thành phần                                                                 | Ghi chú                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Chính sách: model mặc định Sonnet, quy trình S/M/L, trần 5 subagent        | ADR-0007/0010/0011 của khung → ADR-0014 của XBoss; viết lại cho XBoss trong `CLAUDE.md`          |
| `docs/framework/*` (toàn bộ, thay 6 tài liệu `KHUNG-*`/`AP-DUNG`/`BO-SUNG`/`KHOI-TAO` cũ) + `FRAMEWORK-VERSION` | Nguyên văn                                                            |
| Workflow `codeql`, `dependency-review`, `scorecard`, `stale-pr-alert`      | Chỉnh cho XBoss (ngôn ngữ cố định, bỏ bước dò manifest, thông điệp)                              |
| Hook `precompact-checkpoint` (PreCompact) + `session-resume` nạp lại sau nén | Bỏ phần telemetry; test ở `tests/claude-hooks.test.ts`                                        |
| Lệnh `/debug`, `/incident`, `/deps-upgrade`, `/grill`, `/contract`         | Thêm ghi chú tham chiếu; `/contract` viết lại bước 2/4 theo `docs/nang-cap` + migration append-only |
| Agent `version-check` (Haiku, chỉ tra phiên bản từ nguồn sống)             | Bỏ tham chiếu `KHUNG-3`                                                                          |

Lần lấy trước (2026-09-21): hook `block-dangerous-git`/`pre-commit-gate`/`session-resume`, `TRAPS.md`,
`CODEMAP.md`, `/review`, `/maintain`, agent `maintainer`, `scripts/maintenance-sweep.sh` — đã tuỳ biến
sâu, `--upgrade` để bản khung mới cạnh bên (`.framework-new`) chứ không ghi đè.

## Không lấy — và lý do

| Thành phần khung                                                                                  | Lý do                                                                                    |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/auto`, `/auto-complete`, `/completion`, `/audit-full`, `/audit-optimize`, `/bootstrap`, `/consult`, `/ui-ux`, `/adr`, `/gate` | Dựa vào `dev-task.sh`, `docs/work/`, hook `auto-complete-guard` hay mẫu greenfield; `/gate` trùng skill `gate` của XBoss; `/adr` trùng `ecc-architecture-decision-records` |
| Agent `lookup`, `security-reviewer`, `tester`                                                     | Trùng `ecc-code-explorer`, `audit-bao-mat`/`ecc-security-reviewer`, `ecc-pr-test-analyzer`/`ecc-e2e-runner` |
| Hook `auto-format`, `usage-guard`, `telemetry-record`, `ui-intelligence`, `session-guide`, `auto-complete-guard` | husky + lint-staged đã format; XBoss không đo telemetry/quota; `session-guide` chỉ nhắc model |
| `scripts/dev-task.sh`, `new-work.sh`, engine Python (`spec-compiler`, `arch-health-radar`, `subagent-dispatch`, `telemetry-log`, `delivery-handoff`), bộ test shell | XBoss đã có `npm run gate` + 17 cổng CI TS; thêm Python vào chuỗi công cụ không đáng |
| `.mcp.json`, `GEMINI.md`, `AGENTS.md` mới, `.clinerules`, `.windsurfrules`, `.cursor/`, `.codex/`, `copilot-instructions.md` | XBoss chỉ dùng Claude Code (phiên cloud) |
| `docs/ops/*` mới (`repository-settings`, `supply-chain`, `release-readiness`, prompt audit, `threat-model-maintain-cron`) | Mô tả job/cron của chính repo khung; `docs/ops/` của XBoss là vận hành production thật |
| `ci.yml`, `pr-policy.yml`, `release.yml`, `maintenance.yml`, `dependabot-auto-merge.yml`, rulesets | `ci.yml`/`pr-policy.yml`/`release.yml` của XBoss đầy đủ hơn; còn lại cần quyết định riêng về quyền repo |
| `core.hooksPath=scripts/githooks`                                                                | XBoss dùng husky (`.husky/`) — đặt hooksPath khác sẽ vô hiệu husky                        |

## Nâng bản khung

```bash
git clone https://github.com/seeker19110/projects-template /tmp/khung   # ĐẦY ĐỦ — không --depth
bash scripts/framework-upgrade.sh /tmp/khung                            # cây XBoss phải sạch
```

Script gọi `copy-framework.sh --upgrade --no-hooks` (file XBoss chưa sửa → cập nhật; đã sửa → merge 3 chiều
với bản khung cũ ghi trong `FRAMEWORK-VERSION`; xung đột → `*.framework-conflict` và thoát mã 2, dấu bản
giữ nguyên), rồi xoá mọi file **mới** nằm trong bảng "Không lấy". Sau đó:

1. Soát `git diff` (tài liệu khung, lệnh đã lấy, `FRAMEWORK-VERSION`).
2. Soát các file gitignored script liệt kê: `CLAUDE.md.framework-new`, `.claude/agents.framework-new/`,
   `.claude/hooks.framework-new/`, `_framework-dropins/`… — chỉ chép tay phần đáng lấy (theo
   `docs/framework/adopt-from-outside.md`: chỉ lấy thứ chứng minh được tốt hơn hiện trạng), rồi xoá.
3. Thành phần mới đáng lấy → cập nhật bảng "Đã lấy"/"Không lấy" ở trên và biểu thức `GIU_LAI` trong script.
