#!/usr/bin/env bash
# risk-zone-gate.sh — PreToolUse hook (matcher: Edit|Write|MultiEdit). Port "GateGuard
# fact-forcing gate" của ECC (ADR-0012), thu hẹp đúng vùng rủi ro cao của XBoss.
#
# VÌ SAO CẦN: CLAUDE.md bắt buộc "rà theo mục Vùng rủi ro cao (docs/audit.md §8) khi PR chạm
# recompute/auth/material-sync/boq/route tài chính-nghiệm thu" — nhưng đó là văn bản; lỗi thật
# 2026-10-01 (nghiệm thu, IPC trả trùng tiền) đều nằm trong vùng này. GateGuard của ECC cho thấy
# tự hỏi "chắc chưa?" không hiệu quả bằng BẮT nêu dữ kiện cụ thể; ECC chặn mọi file — XBoss chỉ
# chặn vùng §8 để không làm chậm việc thường.
#
# Cơ chế: lần ĐẦU mỗi phiên sửa 1 file khớp .claude/hooks/risk-zones.txt → deny kèm danh sách
# dữ kiện phải nêu; nêu xong gọi lại cùng thao tác → được phép (đã ghi nhận theo session_id).
#
# Bỏ qua: XBOSS_SKIP_RISK_GATE=1 trong env của tiến trình Claude Code.
set -uo pipefail   # cố ý KHÔNG -e: hook không được làm chết phiên

[ "${XBOSS_SKIP_RISK_GATE:-}" = "1" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
ZONES="$ROOT/.claude/hooks/risk-zones.txt"
[ -f "$ZONES" ] || exit 0

payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
session="$(printf '%s' "$payload" | jq -r '.session_id // "khong-ro"' 2>/dev/null)"
[ -n "$file" ] || exit 0

case "$file" in
  "$ROOT"/*) rel="${file#"$ROOT"/}" ;;
  /*) exit 0 ;;
  *) rel="${file#./}" ;;
esac

matched=""
while IFS= read -r pat || [ -n "$pat" ]; do
  pat="${pat%%#*}"
  pat="${pat%"${pat##*[![:space:]]}"}"   # cắt khoảng trắng cuối
  [ -n "$pat" ] || continue
  # shellcheck disable=SC2053  # cố ý: $pat là glob
  if [[ "$rel" == $pat ]]; then matched="$pat"; break; fi
done < "$ZONES"
[ -n "$matched" ] || exit 0

state_dir="${TMPDIR:-/tmp}/xboss-risk-gate"
mkdir -p "$state_dir" 2>/dev/null || exit 0
state="$state_dir/$(printf '%s' "$session" | tr -c 'A-Za-z0-9_-' '_')"
if [ -f "$state" ] && grep -qxF "$rel" "$state"; then
  exit 0   # đã nêu dữ kiện cho file này trong phiên
fi
printf '%s\n' "$rel" >> "$state"

reason="[risk-zone-gate] $rel thuộc VÙNG RỦI RO CAO (docs/audit.md §8, mẫu '$matched'). Trước lần sửa đầu tiên, nêu rõ trong câu trả lời:
1. Nơi gọi/import file này (grep thật, không đoán) và luồng người dùng nào đi qua.
2. Bất biến liên quan sẽ phải giữ — đối chiếu docs/audit.md §3/§4, TRAPS.md và .claude/rules/xboss/* (vd nghiem_thu ⇒ progress = 1, không cộng tiền trên float, kiểm quyền đối xứng route anh em, scope projectId).
3. Test đang phủ đường này + test hồi quy sẽ thêm (fix lỗi: phải thấy đỏ trên code cũ).
4. Nguyên văn yêu cầu của người dùng/đặc tả mà thay đổi này phục vụ.
Nêu xong, gọi lại đúng thao tác này — lần thứ hai trong phiên sẽ được phép. Review sau khi sửa: agent audit-logic/audit-bao-mat."

jq -n --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
