#!/usr/bin/env bash
# precompact-checkpoint.sh — PreCompact hook. Port từ projects-template @ 59bd1d1 (ADR-0014), bỏ phần
# telemetry (XBoss không dùng .ai-telemetry/).
#
# VÌ SAO CẦN: ngay TRƯỚC khi Claude Code nén ngữ cảnh (tự động hoặc /compact), chụp trạng thái làm việc
# ra file để phần "sau nén" không mất dấu việc đang làm: nhánh, thay đổi chưa commit, 5 commit gần nhất.
# session-resume.sh nạp lại file này khi phiên tiếp tục sau nén (SessionStart source=compact).
# Ghi vào .claude/.compact-checkpoint (gitignored). Chỉ đọc git + ghi 1 file cục bộ; fail-open.
set -uo pipefail   # cố ý KHÔNG -e: hook không được làm chết phiên

# ROOT = cây ĐANG làm việc (có thể là git worktree của worker); CLAUDE_PROJECT_DIR chỉ là chỗ lùi về —
# nếu lấy CLAUDE_PROJECT_DIR trước, phiên trong worktree sẽ chụp nhầm nhánh/diff của checkout chính.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$ROOT" ] || ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
OUT="$ROOT/.claude/.compact-checkpoint"

payload="$(cat 2>/dev/null || true)"
trigger="unknown"
if command -v jq >/dev/null 2>&1; then
  trigger="$(printf '%s' "$payload" | jq -r '.trigger // "unknown"' 2>/dev/null || echo unknown)"
fi

{
  echo "# Checkpoint trước khi nén ngữ cảnh — $(date -u +%Y-%m-%dT%H:%M:%SZ) (trigger: $trigger)"
  if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    echo "Nhánh: $(git -C "$ROOT" branch --show-current 2>/dev/null)"
    echo "-- Thay đổi chưa commit (tối đa 30) --"
    git -C "$ROOT" status --short 2>/dev/null | head -30
    echo "-- 5 commit gần nhất --"
    git -C "$ROOT" log --oneline -5 2>/dev/null
  fi
} > "$OUT" 2>/dev/null || exit 0

echo "[precompact-checkpoint] đã chụp trạng thái vào .claude/.compact-checkpoint — sau khi nén, đọc lại file này nếu mất dấu việc đang làm." >&2
exit 0
