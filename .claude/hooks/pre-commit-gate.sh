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

# Chuỗi đỏ: mỗi lần chặn ghi .claude/.gate-red-streak (gitignored) — `n=` tăng khi CÙNG một lỗi (chữ ký =
# cksum output), về 1 khi lỗi khác, xoá khi cổng xanh. auto-complete-guard.sh đọc file này để dừng vòng
# /auto-complete sau 3 lần đỏ cùng lỗi thay vì sửa mù (ADR-0015).
STREAK="$ROOT/.claude/.gate-red-streak"
do_chan() {   # $1 = tên cổng, $2 = output đỏ
  local sig prev n
  sig="$(printf '%s:%s' "$1" "$2" | cksum | cut -d' ' -f1)"
  prev="$(sed -n 's/^sig=//p' "$STREAK" 2>/dev/null | head -1)"
  n="$(sed -n 's/^n=//p' "$STREAK" 2>/dev/null | head -1)"; case "$n" in ''|*[!0-9]*) n=0 ;; esac
  if [ "$sig" = "$prev" ]; then n=$((n + 1)); else n=1; fi
  printf 'sig=%s\nn=%s\n' "$sig" "$n" > "$STREAK" 2>/dev/null || true
  echo "[pre-commit-gate] '$1' đỏ (lần $n liên tiếp cùng lỗi) — sửa lỗi rồi mới commit:" >&2
  printf '%s\n' "$2" | tail -60 >&2
  exit 2
}

lint_out="$(cd "$ROOT" && npm run lint 2>&1)" || do_chan "npm run lint" "$lint_out"
type_out="$(cd "$ROOT" && npm run typecheck 2>&1)" || do_chan "npm run typecheck" "$type_out"

rm -f "$STREAK"
exit 0
