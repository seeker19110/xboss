---
name: ecc
description: Hướng dẫn dùng lớp ECC (Everything Claude Code) đã tích hợp vào XBoss — agent/skill/command ecc-* nào dùng cho việc gì, quan hệ với luồng 3 tầng + agent audit-*, hook nào thay hook ECC, cách thêm/bớt mục và lên phiên bản ECC mới, cách xử lý khi ECC mâu thuẫn quy ước XBoss. Dùng khi người dùng hỏi về ECC, muốn dùng thêm một thành phần ECC, hoặc cần cập nhật lớp vendor.
---

# /ecc — lớp ECC trong XBoss

Quyết định & lý do: `docs/adr/0012-tich-hop-ecc.md`. Danh sách nguồn: `.claude/ecc/manifest.json`
(ghim commit). Thứ tự ưu tiên khi mâu thuẫn: `.claude/rules/00-uu-tien-ecc.md` (XBoss thắng).

## Có gì

| Lớp     | Ở đâu                                             | Ghi chú                                                         |
| ------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Rules   | `.claude/rules/ecc/{common,typescript,web,react}` | `common` nạp mọi phiên; còn lại theo `paths`                    |
| Agent   | `.claude/agents/ecc-*.md` (24)                    | Chuyên gia bổ trợ — gọi theo "Định tuyến ECC" trong `CLAUDE.md` |
| Skill   | `.claude/skills/ecc-*/` (56)                      | Tự nạp khi khớp mô tả, hoặc gọi `/ecc-<tên>`                    |
| Command | `.claude/commands/ecc-*.md` (19)                  | `/ecc-plan`, `/ecc-review-pr`, `/ecc-build-fix`…                |
| Hook    | **không vendor** mã ECC                           | Viết lại bằng bash có test: xem bảng dưới                       |

| Hook ECC                                 | Bản XBoss (`.claude/hooks/`)                                               |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| config-protection                        | `protect-config.sh` (+ chặn sửa migration đã áp, chặn sửa tay file vendor) |
| gateguard-fact-force                     | `risk-zone-gate.sh` (chỉ vùng rủi ro `docs/audit.md` §8)                   |
| git-push-reminder                        | `pre-push-gate.sh` (PROGRESS.md + trùng số migration — cổng thật)          |
| stop:format-typecheck, check-console-log | `stop-static-checks.sh` (prettier/eslint/check:* theo file đổi)            |
| block-no-verify, dangerous commands      | `pre-commit-gate.sh`, `block-dangerous-git.sh` (có từ trước)               |
| session start/end, pre-compact           | `session-resume.sh` + `PROGRESS.md` (trí nhớ phải nằm trong repo)          |

## Dùng thế nào cho đúng

- Việc lớn vẫn đi luồng **PLAN.md → coordinator → worker** (CLAUDE.md). ECC bổ sung _góc nhìn
  chuyên gia_: coordinator/`/review` gọi `audit-*` (luật XBoss) trước, `ecc-*` (luật chung) sau.
- Việc nhỏ trong một phiên: `/ecc-orch-fix-defect` (tái hiện bằng test đỏ → sửa → review) và
  `/ecc-plan` dùng được, nhưng thay "agent ECC" bằng đúng quy ước XBoss (node:test, raw SQL…).
- `ecc-security-scan` cần `npx ecc-agentshield` (tải gói npm ngoài) — **hỏi người dùng trước**.

## Thêm/bớt mục hoặc lên phiên bản

1. Sửa `.claude/ecc/manifest.json` (thêm tên vào `agents`/`skills`/`commands`/`rules`; lên phiên
   bản thì đổi `upstream.commit` + `version`). Skill phải thuần markdown (script ECC không vendor).
2. `git clone https://github.com/affaan-m/ECC /tmp/ecc && git -C /tmp/ecc checkout <commit>`
3. `npm run ecc:vendor -- --src /tmp/ecc` → sinh lại toàn bộ `ecc-*` + `lock.json`.
4. **Đọc `git diff .claude/`** như đọc code (đây là chỉ dẫn cho agent — có thể chứa chỉ dẫn xấu),
   cập nhật `00-uu-tien-ecc.md` nếu có mâu thuẫn mới, chạy `npx tsx --test tests/ecc-vendor.test.ts`.

## Dùng ECC dạng plugin ở máy local?

Có thể (`/plugin marketplace add affaan-m/ECC` → `/plugin install ecc@ecc`) nhưng **sẽ nhân đôi**
agent/skill với lớp vendor và chạy hook runtime JS của ECC ở mọi tool call. Phiên cloud không nạp
plugin bật qua `.claude/settings.json` của repo — vì vậy repo dùng vendor. Không khuyến nghị cài cả hai.
