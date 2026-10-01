#!/usr/bin/env bash
# stop-static-checks.sh — Stop hook. Port "stop:format-typecheck" + "check-console-log" của ECC
# (ADR-0013), dùng CHÍNH các cổng CI tĩnh của XBoss thay vì luật tự chế.
#
# VÌ SAO CẦN: quy ước "merge ngay khi CI xanh" dồn trách nhiệm vào phần tự kiểm trước push, nhưng
# các cổng tĩnh (prettier, check:hex-hardcode, check:route-perms, check:db-params...) chỉ chạy ở CI
# → mỗi lần quên là 1 vòng CI đỏ (~8 phút). Hook này chạy NGAY khi Claude định dừng lượt, chỉ
# các cổng liên quan tới file đang đổi (mỗi cổng ~0,5s), và chặn dừng nếu đỏ để Claude sửa luôn.
# Không chạy tsc toàn repo (~40s) — việc đó thuộc pre-commit-gate.sh.
#
# Chống lặp: bỏ qua khi `stop_hook_active` (đang trong vòng tiếp tục do chính hook này), và khi
# nội dung thay đổi y hệt lần đã xanh trước đó (dấu vân tay lưu theo session_id).
#
# Bỏ qua có chủ đích: SKIP_STOP_CHECKS=1 trong env của tiến trình Claude Code.
set -uo pipefail   # cố ý KHÔNG -e: hook không được làm chết phiên

[ "${SKIP_STOP_CHECKS:-}" = "1" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

payload="$(cat)"
[ "$(printf '%s' "$payload" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ] && exit 0
session="$(printf '%s' "$payload" | jq -r '.session_id // "khong-ro"' 2>/dev/null)"

# File đang đổi so với HEAD (đã/chưa stage) + file mới chưa track, bỏ file đã xoá.
mapfile -t files < <(
  { git diff --name-only --diff-filter=d HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sort -u
)
[ "${#files[@]}" -gt 0 ] || exit 0

fp="$( { git diff HEAD 2>/dev/null; for f in "${files[@]}"; do [ -f "$f" ] && { printf '%s\n' "$f"; cat "$f"; }; done; } | sha256sum | cut -c1-32)"
state_dir="${TMPDIR:-/tmp}/xboss-stop-checks"
mkdir -p "$state_dir" 2>/dev/null
state="$state_dir/$(printf '%s' "$session" | tr -c 'A-Za-z0-9_-' '_')"
[ -f "$state" ] && [ "$(cat "$state")" = "$fp" ] && exit 0

has() { printf '%s\n' "${files[@]}" | grep -Eq "$1"; }
fails=""
note() { fails+="── $1"$'\n'"$(printf '%s' "$2" | tail -25)"$'\n'; }

run_npm_check() {   # chạy `npm run <tên>` nếu package.json có script đó
  local name="$1" o
  jq -e --arg n "$name" '.scripts[$n]' package.json >/dev/null 2>&1 || return 0
  o="$(npm run -s "$name" 2>&1)" || note "npm run $name" "$o"
}

# 1. console.log mới trong app/lib (dùng lib/nen/log.ts) — chỉ xét dòng THÊM.
added="$( { git diff HEAD -U0 -- app lib 2>/dev/null | grep -E '^\+[^+]'; for f in "${files[@]}"; do case "$f" in app/*|lib/*) git ls-files --error-unmatch "$f" >/dev/null 2>&1 || sed 's/^/+/' "$f" 2>/dev/null ;; esac; done; } | grep -E 'console\.log\(' | head -5)"
[ -n "$added" ] && note "console.log mới trong app/lib — dùng lib/nen/log.ts" "$added"

# 2. Prettier + eslint chỉ trên file đổi (cùng cấu hình CI).
mapfile -t fmt < <(printf '%s\n' "${files[@]}" | grep -E '\.(ts|tsx|js|mjs|cjs|json|md|css|ya?ml)$')
if [ "${#fmt[@]}" -gt 0 ] && [ -x node_modules/.bin/prettier ]; then
  o="$(node_modules/.bin/prettier --check --ignore-unknown "${fmt[@]}" 2>&1)" || note "prettier --check (npx prettier --write <file>)" "$o"
fi
mapfile -t lintf < <(printf '%s\n' "${files[@]}" | grep -E '^(app|lib|scripts|tests|e2e)/.*\.(ts|tsx|mjs|js)$')
if [ "${#lintf[@]}" -gt 0 ] && [ -x node_modules/.bin/eslint ]; then
  o="$(node_modules/.bin/eslint "${lintf[@]}" 2>&1)" || note "eslint (file đổi)" "$o"
fi

# 3. Cổng CI tĩnh theo vùng file đổi.
has '^app/.*\.tsx$|^app/globals\.css$' && { run_npm_check check:ui-ux-guard; run_npm_check check:hex-hardcode; run_npm_check check:mau-accent; }
has '^app/globals\.css$' && run_npm_check check:contrast
has '^app/api/' && { run_npm_check check:route-perms; run_npm_check check:project-scope; }
has '^(app|lib)/.*\.tsx?$' && run_npm_check check:db-params
has '^lib/' && run_npm_check check:lib-layers
has '^migrations/' && run_npm_check check:migrations
has '^tests/' && run_npm_check check:test-fk-ids
has '^\.claude/(ecc/|agents/ecc-|commands/ecc-|skills/ecc-|rules/ecc/)|^scripts/(lib/)?ecc-vendor\.ts$' \
  && [ -x node_modules/.bin/tsx ] && { o="$(node_modules/.bin/tsx --test tests/ecc-vendor.test.ts 2>&1)" || note "tests/ecc-vendor.test.ts (lớp ECC vendor)" "$o"; }

if [ -n "$fails" ]; then
  reason="[stop-static-checks] Cổng CI tĩnh đang ĐỎ với thay đổi hiện tại — sửa trước khi kết thúc lượt (CI sẽ đỏ y hệt):
$fails"
  jq -n --arg r "$reason" '{decision: "block", reason: $r}'
  exit 0
fi

printf '%s' "$fp" > "$state" 2>/dev/null
exit 0
