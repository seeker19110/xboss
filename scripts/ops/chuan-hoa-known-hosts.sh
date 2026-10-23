#!/usr/bin/env bash
#
# Chuẩn hoá nội dung VPS_SSH_KNOWN_HOSTS (đọc từ stdin) thành file known_hosts ghim đúng
# host đang deploy (in ra stdout). Dùng trong bước "Chuẩn bị SSH" của .github/workflows/deploy.yml.
#   bash scripts/ops/chuan-hoa-known-hosts.sh "$VPS_HOST" <<<"$VPS_SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
#
# Vì sao cần: người dán secret/variable hay dán (a) chỉ phần khoá `ssh-ed25519 AAAA...` (nội dung
# /etc/ssh/ssh_host_ed25519_key.pub), (b) dòng known_hosts gắn tên miền trong khi VPS_HOST là IP
# (hoặc ngược lại), (c) kèm CRLF/thụt đầu dòng — cả ba đều làm `ssh-keygen -F "$VPS_HOST"` không
# khớp và deploy dừng. Cái được ghim là KHOÁ chủ người dán qua kênh tin cậy; nhãn host chỉ để ssh
# tra cứu, nên gắn lại nhãn = VPS_HOST không nới kiểm host key (StrictHostKeyChecking=yes vẫn
# từ chối mọi khoá khác). Dòng không phải khoá (vd fingerprint `256 SHA256:...`) bị bỏ, báo stderr.

set -euo pipefail

host="${1:-}"
host="${host#"${host%%[![:space:]]*}"}"
host="${host%"${host##*[![:space:]]}"}"
if [ -z "$host" ]; then
  echo "Thiếu tham số host (VPS_HOST)." >&2
  exit 2
fi

awk -v host="$host" '
  function la_kieu_khoa(s) { return s ~ /^(ssh-|ecdsa-sha2-|sk-)/ }
  {
    sub(/\r$/, "")
    sub(/^[ \t]+/, "")
    sub(/[ \t]+$/, "")
    if ($0 == "" || $0 ~ /^#/) next
    # Dòng @cert-authority/@revoked giữ nguyên — có ngữ nghĩa riêng, không tự gắn nhãn.
    if ($0 ~ /^@/) { print; next }
    if (la_kieu_khoa($1) && NF >= 2) { print host " " $1 " " $2; next }
    if (NF >= 3 && la_kieu_khoa($2)) { print host " " $2 " " $3; next }
    printf "Bỏ qua dòng %d: không phải khoá công khai SSH (fingerprint SHA256:... không dùng được — cần nguyên khoá ssh-ed25519 AAAA...).\n", NR > "/dev/stderr"
  }
'
