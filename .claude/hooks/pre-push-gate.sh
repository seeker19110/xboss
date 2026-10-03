#!/usr/bin/env bash
# pre-push-gate.sh — PreToolUse hook (matcher: Bash). Port "git push reminder" của ECC (ADR-0013)
# thành cổng thật cho 2 bài học lặp lại nhiều lần của XBoss:
#
#   1. PROGRESS.md quên cập nhật (CLAUDE.md DoD: "bài học lặp lại nhiều lần") — CI chỉ bắt được SAU khi
#      đã merge vào main (job progress-freshness). Ở đây chạy CÙNG script với `--base origin/main`
#      để chặn ngay lúc push nhánh.
#   2. Trùng số migration khi làm song song (TRAPS.md §1) — `check-migration-numbers.ts`.
#
# Cổng đỏ → exit 2 (chặn push, in lỗi về Claude). Không phải `git push`, thiếu node_modules
# hoặc thiếu origin/main → bỏ qua (exit 0).
#
# Bỏ qua có chủ đích: SKIP_PREPUSH_GATE=1 trong env của tiến trình Claude Code.
set -uo pipefail   # cố ý KHÔNG -e: hook không được làm chết phiên

[ "${SKIP_PREPUSH_GATE:-}" = "1" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || exit 0

payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -n "$cmd" ] || exit 0
printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)' || exit 0
printf '%s' "$cmd" | grep -Eq -- '(--help|--dry-run|(^|[[:space:]])-n([[:space:]]|$))' && exit 0

TSX="$ROOT/node_modules/.bin/tsx"
[ -x "$TSX" ] || exit 0
git rev-parse --verify --quiet origin/main >/dev/null || exit 0

fail=0
out=""
if [ -f "$ROOT/scripts/check-progress-freshness.ts" ]; then
  o="$("$TSX" "$ROOT/scripts/check-progress-freshness.ts" --base origin/main 2>&1)" || { fail=1; out+="$o"$'\n'; }
fi
if [ -f "$ROOT/scripts/check-migration-numbers.ts" ]; then
  o="$("$TSX" "$ROOT/scripts/check-migration-numbers.ts" 2>&1)" || { fail=1; out+="$o"$'\n'; }
fi

if [ "$fail" -eq 1 ]; then
  {
    echo "[pre-push-gate] Chặn push — cổng trước-push đỏ (cùng luật với CI, xem ADR-0013):"
    printf '%s' "$out" | tail -40
    echo "Sửa rồi commit lại (thường là thêm mục vào PROGRESS.md, hoặc đổi số migration sau 'git fetch origin'), rồi push lại."
  } >&2
  exit 2
fi
exit 0
