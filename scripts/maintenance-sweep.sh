#!/usr/bin/env bash
# maintenance-sweep.sh — quét bảo trì định kỳ, chỉ ĐỌC (không sửa gì).
#
# VÌ SAO CẦN: một số thứ "mục nát theo thời gian" dù code không đổi — dependency lỗi thời/lỗ
# hổng, nhánh git đã merge còn sót trên remote, PROGRESS.md lỗi thời, mục trong các allowlist
# (test-skip, dead-code, dead-routes) không còn lý do hợp lệ. Không cổng CI nào bắt được nhóm
# này (chúng không đỏ ngay, chỉ tích tụ). Dùng qua lệnh `/maintain`.
#
# Chạy: bash scripts/maintenance-sweep.sh [--no-deps] [--out <file>]
#   --no-deps   bỏ qua 'npm outdated'/'npm audit' (chậm nhất, cần mạng) — dùng khi cần quét nhanh.
#   --out FILE  ghi báo cáo ra FILE thay vì chỉ in stdout (mặc định docs/ops/MAINTENANCE-REPORT.md).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NO_DEPS=0
OUT="docs/ops/MAINTENANCE-REPORT.md"
while [ $# -gt 0 ]; do
  case "$1" in
    --no-deps) NO_DEPS=1 ;;
    --out) shift; OUT="$1" ;;
    *) echo "Tham số không nhận diện: $1" >&2; exit 2 ;;
  esac
  shift
done

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

section() { echo -e "\n## $1\n" >>"$tmp"; }
line() { echo "$1" >>"$tmp"; }

{
  echo "# Báo cáo bảo trì XBoss"
  echo
  echo "Sinh lúc: $(date -u +%Y-%m-%dT%H:%M:%SZ) — nhánh: $(git branch --show-current 2>/dev/null || echo '?')"
} >"$tmp"

# --- 1. Trạng thái git: uncommitted, nhánh remote đã merge còn sót. ---
section "1. Trạng thái git"
dirty="$(git status --porcelain | wc -l | tr -d ' ')"
line "- Thay đổi chưa commit: $dirty file(s)."

git fetch origin --prune >/dev/null 2>&1 || true
merged_branches="$(git branch -r --merged origin/main 2>/dev/null | grep -v 'origin/main\|origin/HEAD' | sed 's#origin/##' | sed 's/^ *//')"
if [ -n "$merged_branches" ]; then
  line "- 🟡 Nhánh remote đã merge vào main nhưng chưa xoá:"
  echo "$merged_branches" | while read -r b; do [ -n "$b" ] && line "  - \`$b\`"; done
else
  line "- OK: không có nhánh remote nào đã merge còn sót."
fi

# --- 2. PROGRESS.md lỗi thời (cơ học, xem TRAPS.md mục 1). ---
section "2. PROGRESS.md"
if npx tsx scripts/check-progress-freshness.ts >/dev/null 2>&1; then
  line "- OK: PROGRESS.md khớp commit gần nhất trên nhánh hiện tại (hoặc không áp dụng)."
else
  line "- 🔴 \`check:progress-freshness\` đỏ — xem chi tiết bằng \`npm run check:progress-freshness\`."
fi

# --- 3. Dependency: outdated + lỗ hổng (bỏ qua nếu --no-deps). ---
section "3. Dependency"
if [ "$NO_DEPS" -eq 1 ]; then
  line "- Bỏ qua (chạy với --no-deps)."
else
  audit_out="$(npm audit --omit=dev --audit-level=high --fetch-timeout=15000 2>&1)" || true
  if echo "$audit_out" | grep -q "found 0 vulnerabilities"; then
    line "- OK: \`npm audit\` (production) không có lỗ hổng mức high+."
  else
    line "- 🔴 \`npm audit\` (production) có lỗ hổng — chạy \`npm audit --omit=dev\` để xem chi tiết."
  fi

  # `npm outdated` cố ý thoát mã 1 khi CÓ package lỗi thời — tách khỏi pipe trước khi đưa vào
  # node, nếu không `set -o pipefail` coi cả pipe là lỗi và in thêm dòng "0" thừa từ `|| echo 0`.
  outdated_json="$(npm outdated --json 2>/dev/null || true)"
  outdated_count="$(printf '%s' "$outdated_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{console.log(Object.keys(JSON.parse(s||"{}")).length)}catch{console.log(0)}})' 2>/dev/null || echo 0)"
  line "- Số package lỗi thời (\`npm outdated\`): ${outdated_count:-0}."
fi

# --- 4. Allowlist có mục sót không còn lý do hợp lệ (review bằng mắt, chỉ đếm ở đây). ---
section "4. Allowlist cần rà bằng mắt định kỳ"
for f in scripts/test-skip-allowlist.json scripts/dead-code-allowlist.json scripts/dead-routes-allowlist.json; do
  if [ -f "$f" ]; then
    cnt="$(node -e "try{const d=require('./$f');console.log(Array.isArray(d)?d.length:Object.keys(d).length)}catch{console.log('?')}" 2>/dev/null || echo '?')"
    line "- \`$f\`: $cnt mục."
  fi
done
line "- Mỗi mục còn lý do hợp lệ không? (không có cổng máy — rà bằng mắt khi bảo trì)."

# --- 5. Cổng static hiện có xanh hay đỏ (snapshot nhanh, không thay CI). ---
section "5. Cổng static (snapshot nhanh)"
if npm run lint >/dev/null 2>&1; then line "- OK: lint."; else line "- 🔴 lint đỏ."; fi
if npm run typecheck >/dev/null 2>&1; then line "- OK: typecheck."; else line "- 🔴 typecheck đỏ."; fi

mkdir -p "$(dirname "$OUT")"
cp "$tmp" "$OUT"
cat "$tmp"
echo -e "\nBáo cáo đã ghi: $OUT" >&2
