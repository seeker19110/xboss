#!/usr/bin/env bash
# pre-commit-gate.sh — PreToolUse hook (matcher: Bash).
#
# Khi Claude sắp chạy `git commit`, chạy nhanh lint + typecheck trước để chặn commit code đỏ
# (đồng bộ mục "Definition of Done" trong CLAUDE.md: "npm run lint và npm run typecheck xanh"
# TRƯỚC khi push). husky/lint-staged chỉ format+lint file staged, không typecheck toàn repo —
# lớp này bắt thêm lỗi type trước khi commit thay vì để CI đỏ mới biết.
#
# Cổng ĐỎ → exit 2 (chặn commit, in lỗi về lại Claude để sửa trước). Cổng xanh hoặc không áp
# dụng (không phải lệnh commit, hoặc project chưa cài dependency) → exit 0.
#
# Bỏ qua có chủ đích (vd commit WIP tạm trên nhánh riêng): đặt SKIP_PRECOMMIT_GATE=1.
set -uo pipefail   # cố ý KHÔNG -e: hook không được làm chết phiên

[ "${SKIP_PRECOMMIT_GATE:-}" = "1" ] && exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || exit 0

payload="$(cat)"
cmd=""
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
fi
[ -n "$cmd" ] || exit 0

# Chỉ áp dụng cho lệnh commit thật (không áp lên `git commit --help`, `git log`, v.v.).
printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+commit(\s|$)' || exit 0
printf '%s' "$cmd" | grep -Eq -- '--no-verify' && {
  echo "[pre-commit-gate] '--no-verify' bị cấm theo CLAUDE.md (\"NEVER skip hooks\") — bỏ cờ này rồi sửa lỗi cổng thay vì né." >&2
  exit 2
}

[ -f "$ROOT/package.json" ] || exit 0
[ -d "$ROOT/node_modules" ] || exit 0

fail=0
lint_out="$(cd "$ROOT" && npm run lint 2>&1)" || fail=1
if [ "$fail" -eq 1 ]; then
  echo "[pre-commit-gate] 'npm run lint' đỏ — sửa lỗi rồi mới commit:" >&2
  echo "$lint_out" | tail -60 >&2
  exit 2
fi

type_out="$(cd "$ROOT" && npm run typecheck 2>&1)" || fail=1
if [ "$fail" -eq 1 ]; then
  echo "[pre-commit-gate] 'npm run typecheck' đỏ — sửa lỗi rồi mới commit:" >&2
  echo "$type_out" | tail -60 >&2
  exit 2
fi

exit 0
