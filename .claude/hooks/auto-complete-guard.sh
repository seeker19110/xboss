#!/usr/bin/env bash
# auto-complete-guard.sh — Stop hook GIỮ VÒNG /auto-complete (port từ projects-template @ 59bd1d1, ADR-0015).
#
# Khi lượt /auto-complete đang bật (marker .claude/.auto-complete-loop do lệnh ghi, gitignored — dòng 1 là đường
# dẫn hồ sơ docs/nang-cap/auto/<id>.md) mà hồ sơ còn `- Trạng thái: Active`, hook trả {"decision":"block"} để
# Claude KHÔNG kết lượt sớm và nối tiếp đúng mục "Bàn giao / bước tiếp theo".
#
# VÌ SAO: "chỉ dừng ở Blocked/Waiting" nếu chỉ là văn xuôi thì model hay dừng giữa chừng sau mỗi PR. Tín hiệu
# DỪNG đọc từ FILE TRẠNG THÁI (artifact đi cùng PR, chủ repo audit được), không từ câu "đã xong" model in ra.
# Giới hạn nói thật: dòng Trạng thái vẫn do model ghi — hook là lưới đỡ "quên tiếp tục", không phải hàng rào.
#
# CHO DỪNG khi (thứ tự kiểm): không marker · thiếu jq (cảnh báo) · marker rỗng · hồ sơ không tồn tại (xoá marker) ·
# Trạng thái Done (xoá marker) / Blocked / Waiting · đủ AUTO_COMPLETE_MAX_CONTINUES (mặc định 20) · lời cuối lặp
# y hệt lượt trước (không tiến triển) · chuỗi đỏ pre-commit-gate ≥ 3 cùng lỗi đã nhắc một lần.
# Claude Code còn tự có trần block liên tiếp không tool call — lớp đỡ thứ hai.
set -uo pipefail   # cố ý KHÔNG -e: hook không được làm chết phiên

# ROOT = cây ĐANG làm việc (worktree); CLAUDE_PROJECT_DIR chỉ là chỗ lùi về.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$ROOT" ] || ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
MARK="$ROOT/.claude/.auto-complete-loop"
[ -f "$MARK" ] || exit 0
command -v jq >/dev/null 2>&1 || { echo "[auto-complete-guard] không có jq → KHÔNG giữ được vòng /auto-complete (tự nối bằng tay)." >&2; exit 0; }

payload="$(cat 2>/dev/null || true)"
last="$(printf '%s' "$payload" | jq -r '.last_assistant_message // ""' 2>/dev/null | cksum | cut -d' ' -f1)"
MAX="${AUTO_COMPLETE_MAX_CONTINUES:-20}"; case "$MAX" in ''|*[!0-9]*) MAX=20 ;; esac

hs="$(sed -n 1p "$MARK" | tr -d '[:space:]')"
n="$(sed -n 's/^n=//p' "$MARK" | head -1)"; case "$n" in ''|*[!0-9]*) n=0 ;; esac
prev_last="$(sed -n 's/^last=//p' "$MARK" | head -1)"
nudged="$(sed -n 's/^nudged=//p' "$MARK" | head -1)"
WF="$ROOT/$hs"

save()  { printf '%s\nn=%s\nlast=%s\nnudged=%s\n' "$hs" "$1" "$2" "$3" > "$MARK" 2>/dev/null || true; }
allow() { echo "[auto-complete-guard] $1" >&2; exit 0; }   # exit 0 không JSON = cho dừng
block() { jq -n --arg r "$1" '{decision:"block", reason:$r}'; exit 0; }

[ -n "$hs" ] || allow "marker không ghi đường dẫn hồ sơ → bỏ qua."
[ -f "$WF" ] || { rm -f "$MARK"; allow "không thấy hồ sơ $hs → tắt vòng, cho dừng."; }
status="$(grep -m1 -E '^- Trạng thái:' "$WF" 2>/dev/null || true)"
if printf '%s' "$status" | grep -Eq '^- Trạng thái:[[:space:]]*Done'; then
  rm -f "$MARK"; allow "hồ sơ $hs đã Done → tắt vòng, cho dừng."
fi
if printf '%s' "$status" | grep -Eq '^- Trạng thái:[[:space:]]*(Blocked|Waiting)'; then
  allow "hồ sơ $hs ở trạng thái dừng hợp lệ ('$status') → cho dừng; marker giữ để nối lại sau khi có quyết định."
fi
[ "$n" -ge "$MAX" ] && allow "đã $n/$MAX lượt tiếp tục → cho dừng (trần AUTO_COMPLETE_MAX_CONTINUES); gõ /auto-complete để nối."
[ -n "$prev_last" ] && [ "$last" = "$prev_last" ] && allow "lời cuối lượt lặp y hệt lượt trước (không tiến triển) → cho dừng, tránh vòng kẹt."

streak="$(sed -n 's/^n=//p' "$ROOT/.claude/.gate-red-streak" 2>/dev/null | head -1)"; case "$streak" in ''|*[!0-9]*) streak=0 ;; esac
if [ "$streak" -ge 3 ]; then
  [ "$nudged" = "1" ] && allow "chuỗi đỏ cổng commit ≥ 3 đã nhắc → cho dừng."
  save "$n" "$last" 1
  block "/auto-complete: pre-commit-gate đã đỏ $streak lần liên tiếp CÙNG một lỗi — không sửa mù thêm. Ghi '- Trạng thái: Blocked — <lỗi + giả thuyết đã bác bỏ + lựa chọn + đề xuất>' vào $hs rồi kết lượt (hook sẽ cho dừng)."
fi

save $((n + 1)) "$last" "$nudged"
excerpt="$(awk '/^## Bàn giao/{f=1; next} /^## /{f=0} f' "$WF" 2>/dev/null | grep -v '^[[:space:]]*$' | head -12)"
block "/auto-complete đang bật (hồ sơ $hs, lượt tiếp tục $((n + 1))/$MAX): hồ sơ còn Active → chưa được kết lượt. Nối tiếp đúng chỗ dở theo 'Bàn giao / bước tiếp theo':
${excerpt:-(mục Bàn giao trống — ghi bước kế tiếp cụ thể trước)}
Chỉ dừng khi gặp danh sách 'không bao giờ tự quyết': ghi '- Trạng thái: Blocked — <lý do>' hoặc 'Waiting — <chờ gì>' vào hồ sơ rồi kết lượt; Definition of Complete đạt + mọi PR đã merge → '- Trạng thái: Done'. Không tuyên bố xong mà không có lệnh chứng minh."
