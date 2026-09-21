#!/usr/bin/env bash
# session-resume.sh — SessionStart hook.
# Nạp trạng thái phiên trước vào ngữ cảnh để phiên mới đỡ phải tự dò lại: vài mục đầu của
# PROGRESS.md (mục mới nhất luôn ở đầu file theo quy ước dự án) + tóm tắt git (branch hiện
# tại, thay đổi chưa commit, commit gần nhất). Chỉ ĐỌC, không đổi gì. No-op nếu thiếu jq.
set -uo pipefail   # cố ý KHÔNG -e: hook không được làm chết phiên

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" 2>/dev/null || exit 0

command -v jq >/dev/null 2>&1 || exit 0

branch="$(git branch --show-current 2>/dev/null || echo '?')"
dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
last_commit="$(git log -1 --format='%h %s' 2>/dev/null || echo '(không có commit)')"

progress_head=""
if [ -f "$ROOT/PROGRESS.md" ]; then
  progress_head="$(head -c 3000 "$ROOT/PROGRESS.md" 2>/dev/null)"
fi

ctx="$(
  jq -n \
    --arg branch "$branch" \
    --arg dirty "$dirty" \
    --arg last_commit "$last_commit" \
    --arg progress "$progress_head" \
    '"Trạng thái phiên trước (session-resume hook):\n- Nhánh git hiện tại: " + $branch +
     "\n- Số file thay đổi chưa commit: " + $dirty +
     "\n- Commit gần nhất: " + $last_commit +
     "\n- Đầu PROGRESS.md (mục mới nhất, có thể đã cắt bớt):\n" + $progress'
)"

jq -n --arg ctx "$ctx" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
