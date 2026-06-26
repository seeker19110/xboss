#!/usr/bin/env bash
#
# deploy.sh — Triển khai / cập nhật XBoss trên VPS (production)
#
# VPS LUÔN chạy nhánh `main`: script tự ép checkout `main`, kéo code mới nhất,
# build lại image và khởi động qua Docker Compose. Chạy lại nhiều lần an toàn
# (idempotent) — lần đầu tự seed dữ liệu, các lần sau chỉ cập nhật.
#
# Dùng:
#   ./deploy.sh            # cập nhật bình thường (pull main + build + up)
#   ./deploy.sh --seed     # ép chạy seed dữ liệu từ attachments/ sau khi up
#   ./deploy.sh --no-pull  # bỏ qua git pull (deploy code đang có sẵn trên VPS)
#
set -euo pipefail

# Nhánh cố định cho VPS — không lấy từ tham số để tránh deploy nhầm nhánh.
readonly BRANCH="main"

# Luôn chạy từ thư mục chứa script (gốc repo), bất kể gọi từ đâu.
cd "$(dirname "$(readlink -f "$0")")"

FORCE_SEED=0
DO_PULL=1
for arg in "$@"; do
  case "$arg" in
    --seed)    FORCE_SEED=1 ;;
    --no-pull) DO_PULL=0 ;;
    *) echo "Tham số không hợp lệ: $arg" >&2; exit 1 ;;
  esac
done

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# --- 0. Kiểm tra công cụ bắt buộc ------------------------------------------
command -v git >/dev/null    || { echo "Thiếu git" >&2; exit 1; }
command -v docker >/dev/null || { echo "Thiếu docker" >&2; exit 1; }
# Hỗ trợ cả `docker compose` (v2) lẫn `docker-compose` (v1).
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "Thiếu Docker Compose (cần 'docker compose' hoặc 'docker-compose')" >&2
  exit 1
fi

# --- 1. Ép đồng bộ về nhánh main mới nhất -----------------------------------
if [[ "$DO_PULL" -eq 1 ]]; then
  log "Đồng bộ mã nguồn về nhánh '$BRANCH'"
  git fetch --prune origin "$BRANCH"
  git checkout "$BRANCH"
  # reset --hard để VPS luôn khớp đúng origin/main, bỏ mọi sửa đổi cục bộ.
  git reset --hard "origin/$BRANCH"
else
  log "Bỏ qua git pull (--no-pull); deploy code hiện có trên VPS"
fi

# --- 2. Cảnh báo cấu hình mặc định nguy hiểm --------------------------------
# Cho phép đặt secret qua biến môi trường hoặc file .env cạnh compose.
if grep -q "doi-thanh-chuoi-bi-mat-that-dai" docker-compose.yml 2>/dev/null; then
  echo "⚠️  XBOSS_SECRET trong docker-compose.yml vẫn là giá trị mặc định." >&2
  echo "    Hãy đổi thành chuỗi ngẫu nhiên dài: openssl rand -hex 32" >&2
fi

# --- 3. Phát hiện lần deploy đầu (volume DB chưa tồn tại) -------------------
FIRST_RUN=0
if ! docker volume inspect xboss-pgdata >/dev/null 2>&1; then
  FIRST_RUN=1
  log "Phát hiện lần deploy đầu tiên (chưa có volume DB) — sẽ seed dữ liệu"
fi

# --- 4. Build + khởi động nền ------------------------------------------------
log "Build image và khởi động dịch vụ"
$COMPOSE up -d --build

# --- 5. Chờ container app sẵn sàng ------------------------------------------
log "Chờ dịch vụ khởi động"
for _ in $(seq 1 30); do
  if $COMPOSE ps --status running 2>/dev/null | grep -q xboss; then
    break
  fi
  sleep 2
done

# --- 6. Seed dữ liệu lần đầu (hoặc khi ép --seed) ---------------------------
if [[ "$FIRST_RUN" -eq 1 || "$FORCE_SEED" -eq 1 ]]; then
  log "Nạp dữ liệu ban đầu (npm run db:seed)"
  $COMPOSE exec -T xboss npm run db:seed || {
    echo "⚠️  Seed thất bại — kiểm tra file Excel trong attachments/ và DATABASE_URL." >&2
  }
fi

# --- 7. Dọn image cũ để tiết kiệm ổ đĩa -------------------------------------
log "Dọn image Docker không dùng"
docker image prune -f >/dev/null 2>&1 || true

log "Hoàn tất. Truy cập: http://<IP-server>:3000"
$COMPOSE ps
