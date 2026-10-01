#!/usr/bin/env bash
# protect-config.sh — PreToolUse hook (matcher: Edit|Write|MultiEdit). Port từ "config-protection"
# của ECC (ADR-0012), viết lại cho luật riêng XBoss.
#
# VÌ SAO CẦN: agent hay "làm cổng xanh" bằng cách nới cấu hình (tắt rule eslint, thêm file vào
# allowlist skip, hạ coverage-baseline, bỏ bước CI) thay vì sửa code; và luật "migration
# append-only" của CLAUDE.md trước đây chỉ là văn bản. Hook này thi hành thật ở lớp tool:
#
#   deny — sửa file migrations/*.sql ĐÃ CÓ trên origin/main (đã áp production): tạo file mới.
#   deny — sửa tay file ECC vendor (ecc-*, .claude/rules/ecc/**): sinh lại bằng
#          scripts/ecc-vendor.ts, hoặc ghi đè hành vi ở .claude/rules/00-uu-tien-ecc.md.
#   ask  — sửa cấu hình cổng chất lượng (eslint/tsconfig/prettier/skip-allowlist/coverage/
#          layers/workflows/husky/settings + hook Claude): người dùng xác nhận từng lần.
#
# Bỏ qua có chủ đích: đặt XBOSS_ALLOW_PROTECTED_EDIT=1 trong env của tiến trình Claude Code
# (vd khối "env" của .claude/settings.local.json) — chỉ khi người dùng đã đồng ý.
set -uo pipefail   # cố ý KHÔNG -e: hook không được làm chết phiên

[ "${XBOSS_ALLOW_PROTECTED_EDIT:-}" = "1" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[ -n "$file" ] || exit 0

case "$file" in
  "$ROOT"/*) rel="${file#"$ROOT"/}" ;;
  /*) exit 0 ;;              # ngoài repo — không phải việc của hook này
  *) rel="${file#./}" ;;
esac

decide() {
  jq -n --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

# 1. Migration đã áp production.
if [[ "$rel" == migrations/*.sql ]]; then
  base="origin/main"
  git -C "$ROOT" rev-parse --verify --quiet "$base" >/dev/null || base="HEAD"
  if git -C "$ROOT" cat-file -e "$base:$rel" 2>/dev/null; then
    decide deny "[protect-config] $rel đã có trên $base (đã áp production) — migration là APPEND-ONLY (CLAUDE.md, ADR-0003). Tạo file migrations/000N_<mo-ta>.sql MỚI (git fetch origin + npm run check:migrations để lấy số kế tiếp) thay vì sửa file cũ."
  fi
fi

# 2. File ECC vendor.
case "$rel" in
  .claude/agents/ecc-*.md|.claude/commands/ecc-*.md|.claude/skills/ecc-*|.claude/rules/ecc/*|.claude/ecc/lock.json|.claude/ecc/LICENSE)
    decide deny "[protect-config] $rel là nội dung ECC vendor (sinh tự động, khoá sha256 trong .claude/ecc/lock.json). Muốn đổi HÀNH VI → ghi đè ở .claude/rules/00-uu-tien-ecc.md; muốn thêm/bớt mục → sửa .claude/ecc/manifest.json rồi chạy 'npx tsx scripts/ecc-vendor.ts --src <checkout ECC>'."
    ;;
esac

# 3. Cấu hình cổng chất lượng — hỏi người dùng.
case "$rel" in
  eslint.config.mjs|tsconfig.json|.prettierrc|.prettierignore|coverage-baseline.json|lib/layers.json|scripts/test-skip-allowlist.json|.github/workflows/*|.husky/*|.claude/settings.json|.claude/hooks/*)
    decide ask "[protect-config] $rel là cấu hình cổng chất lượng/an toàn. Agent hay sửa file loại này để cổng xanh thay vì sửa code (nới rule, thêm skip, hạ ngưỡng). Chỉ đồng ý nếu thay đổi này là CHỦ ĐÍCH của việc đang làm, không phải để né một lỗi."
    ;;
esac

exit 0
