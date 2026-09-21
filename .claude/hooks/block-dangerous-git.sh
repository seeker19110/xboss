#!/usr/bin/env bash
# block-dangerous-git.sh — PreToolUse hook (matcher: Bash).
#
# VÌ SAO CẦN: CLAUDE.md/system prompt CẤM một số thao tác git phá hoại (force-push vào main,
# reset --hard, né giải xung đột bằng merge/rebase --abort) nhưng trước hook này luật chỉ tồn
# tại dưới dạng VĂN BẢN — không có gì thi hành. Hook này chặn thật ở lớp PreToolUse, độc lập
# với việc model có tuân thủ prompt hay không.
#
# Chặn (exit 2 = chặn tool call, in lý do về lại Claude):
#   1. force-push (--force/-f/--force-with-lease) thẳng vào main/master
#   2. `git reset --hard` (mất thay đổi chưa commit, không hoàn tác được)
#   3. `git clean -f`/`-fd`/`-fx` (xoá file chưa track, không hoàn tác được)
#   4. `merge --abort` / `rebase --abort` (né việc giải xung đột)
#
# Bỏ qua có chủ đích: đặt ALLOW_DANGEROUS_GIT=1 trong môi trường trước khi chạy lệnh đó.
set -uo pipefail   # cố ý KHÔNG -e: hook không được làm chết phiên

[ "${ALLOW_DANGEROUS_GIT:-}" = "1" ] && exit 0

payload="$(cat)"
cmd=""
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
fi
[ -n "$cmd" ] || exit 0

block() {
  echo "$1" >&2
  exit 2
}

# 1. force-push vào main/master.
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push'; then
  if printf '%s' "$cmd" | grep -Eq -- '(--force([^-]|$)|--force-with-lease|-f\b)' \
     && printf '%s' "$cmd" | grep -Eq '(^|[[:space:]/:])(main|master)([[:space:]]|$)'; then
    block "[block-dangerous-git] Chặn force-push vào main/master — thao tác này ghi đè lịch sử chung, không hoàn tác được. Đặt ALLOW_DANGEROUS_GIT=1 nếu chắc chắn cần (hiếm khi đúng)."
  fi
fi

# 2. reset --hard.
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+reset[[:space:]]+.*--hard'; then
  block "[block-dangerous-git] Chặn 'git reset --hard' — xoá thay đổi chưa commit không hoàn tác được. Stash trước ('git stash -u') nếu cần giữ lại, hoặc đặt ALLOW_DANGEROUS_GIT=1 nếu chắc chắn không còn gì cần giữ."
fi

# 3. clean -f/-fd/-fx.
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+clean[[:space:]]+.*-[a-z]*f'; then
  block "[block-dangerous-git] Chặn 'git clean -f...' — xoá file chưa track không hoàn tác được. Kiểm 'git clean -nd' (dry-run) trước, hoặc đặt ALLOW_DANGEROUS_GIT=1 nếu chắc chắn."
fi

# 4. merge/rebase --abort — né giải xung đột thay vì xử lý.
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+(merge|rebase)[[:space:]]+.*--abort'; then
  block "[block-dangerous-git] Chặn '${cmd}' — huỷ merge/rebase để né xung đột thay vì giải quyết là điều CLAUDE.md muốn tránh (chọn sai bên mất nội dung im lặng). Giải xung đột tại chỗ, hoặc đặt ALLOW_DANGEROUS_GIT=1 nếu người dùng đã xác nhận muốn huỷ."
fi

exit 0
