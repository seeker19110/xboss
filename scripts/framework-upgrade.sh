#!/usr/bin/env bash
# framework-upgrade.sh — nâng bộ khung seeker19110/projects-template trong XBoss (ADR-0014).
#
# VÌ SAO KHÔNG GỌI THẲNG copy-framework.sh: script của khung đổ vào dự án đích mọi thứ nó có (cầu nối
# Cursor/Gemini/Codex, .mcp.json, engine Python, ~40 script/test shell, 12 lệnh mà XBoss không dùng),
# và đặt core.hooksPath (có thể vô hiệu husky). Script này gọi copy-framework.sh --upgrade --no-hooks
# (merge 3 chiều theo dấu bản docs/framework/FRAMEWORK-VERSION, không ghi đè chỉnh sửa của XBoss) rồi
# DỌN mọi file MỚI mà XBoss không lấy — chỉ file chưa được git theo dõi, không bao giờ đụng file đã commit.
# Danh sách lấy/không lấy + lý do: docs/framework/XBOSS.md.
#
# Dùng:  git clone https://github.com/seeker19110/projects-template /tmp/khung   # clone ĐẦY ĐỦ, không --depth
#        bash scripts/framework-upgrade.sh /tmp/khung
# Xong: soát `git diff`, các file *.framework-new / *.framework-conflict (gitignored) và _framework-dropins/.
set -euo pipefail

SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -f "$SRC/copy-framework.sh" ]; then
  echo "Dùng: bash scripts/framework-upgrade.sh <checkout đầy đủ của seeker19110/projects-template>" >&2
  exit 1
fi
ROOT="$(git rev-parse --show-toplevel)"
if [ "$(git -C "$SRC" rev-parse --is-shallow-repository)" != "false" ]; then
  echo "Lỗi: clone khung là shallow → thiếu commit-nguon cũ, không merge 3 chiều được. Clone lại không --depth." >&2
  exit 1
fi
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  echo "Lỗi: cây làm việc XBoss chưa sạch — commit/stash trước để diff nâng bản chỉ chứa thay đổi của khung." >&2
  exit 1
fi

# Phần MỚI của khung mà XBoss giữ lại; mọi file mới khác (chưa được git theo dõi) sẽ bị xoá.
GIU_LAI='^(docs/framework/|\.claude/commands/(grill|contract|debug|deps-upgrade|incident)\.md$)'

rc=0
bash "$SRC/copy-framework.sh" "$ROOT" --upgrade --no-hooks || rc=$?

echo ""
echo "[framework-upgrade] Dọn phần khung XBoss không lấy (ADR-0014):"
bo=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [[ "$f" =~ $GIU_LAI ]] && continue
  rm -f -- "$ROOT/$f"
  rmdir -p "$(dirname "$ROOT/$f")" 2>/dev/null || true # thư mục rỗng còn lại (.cursor/, .codex/…)
  echo "  - $f"
  bo=$((bo + 1))
done < <(git -C "$ROOT" ls-files --others --exclude-standard)
echo "  → đã bỏ $bo file."

echo ""
echo "[framework-upgrade] Cần soát tay (gitignored, không commit):"
git -C "$ROOT" status --porcelain --ignored | sed -n 's/^!! //p' |
  grep -E '\.framework-(new|conflict)$|\.framework-new/$|^_framework-dropins/$' | sed 's/^/  ~ /' || echo "  (không có)"

if [ "$rc" -ne 0 ]; then
  echo "" >&2
  echo "copy-framework.sh thoát mã $rc (2 = xung đột merge, 3 = lỗi merge): FRAMEWORK-VERSION giữ nguyên." >&2
  echo "Gộp tay các *.framework-conflict rồi chạy lại." >&2
fi
exit "$rc"
