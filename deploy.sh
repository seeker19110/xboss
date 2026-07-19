#!/usr/bin/env bash
#
# Script deploy lên VPS cho app "xboss".
# Cách dùng trên VPS (trong thư mục project):
#   bash deploy.sh              # deploy production (mặc định, hành vi y hệt trước khi có --staging)
#   bash deploy.sh --staging    # deploy staging — pm2 process/thư mục build/file env riêng (M44 PR4)
#
# Việc nó làm: lấy code mới nhất từ Git -> cài thư viện -> áp migration DB còn thiếu ->
# build vào thư mục tạm -> swap atomic vào ".next" thật -> khởi động lại app.
#
# Vì sao build vào thư mục tạm rồi swap: app đang chạy (pm2) đọc trực tiếp ".next"
# hiện tại trong lúc "npm run build" chạy — nếu build ghi đè thẳng lên ".next" đang
# phục vụ, client đã tải HTML cũ có thể xin lại chunk JS/CSS theo hash cũ đúng lúc
# file đó vừa bị build mới xoá/ghi đè → 404/ChunkLoadError thoáng qua, và nếu build
# lỗi giữa chừng thì ".next" bị bỏ dở, không rollback được. Build vào ".next-build"
# (không đụng ".next" đang chạy) rồi "mv" (đổi tên, atomic trên cùng filesystem) vào
# đúng vị trí ".next" ngay trước khi reload — loại bỏ cả 2 rủi ro trên.
#
# Cờ --staging (M44 PR4, xem docs/ops/staging.md): staging = 1 instance pm2 THỨ HAI cho
# cùng codebase (khuyến nghị chạy trong thư mục checkout RIÊNG, vd ~/xboss-staging, để
# "git reset --hard"/"git clean" bên dưới không bao giờ đụng thư mục prod đang chạy) — cờ
# này đổi 3 thứ: tên process pm2 (không tranh chấp với "xboss" thật), tên thư mục build tạm
# (không đụng ".next-build"/".next-old" nếu lỡ chạy chung thư mục, dù không khuyến khích),
# và file env kỳ vọng (".env.staging" thay vì ".env.local" — xem bước 4.5 bên dưới, Next.js
# chỉ tự đọc ".env.local" nên script copy sang trước khi build). KHÔNG cờ = hành vi mặc định
# y hệt trước đây, không phá deploy production.

set -e   # Gặp lỗi ở bất kỳ bước nào là dừng ngay, không deploy code lỗi.

# VPS luôn chạy nhánh main (cả prod lẫn staging — staging tồn tại để tập dượt migration/
# deploy, không phải nhánh tính năng riêng, xem docs/ops/staging.md).
BRANCH="main"

STAGING=false
for arg in "$@"; do
  case "$arg" in
    --staging) STAGING=true ;;
  esac
done

if [ "$STAGING" = true ]; then
  PM2_NAME="xboss-staging"
  BUILD_DIR=".next-build-staging"
  OLD_DIR=".next-old-staging"
  ENV_FILE=".env.staging"
  echo "==> Chế độ STAGING — pm2 process \"$PM2_NAME\" (xem docs/ops/staging.md)"
else
  PM2_NAME="xboss"
  BUILD_DIR=".next-build"
  OLD_DIR=".next-old"
  ENV_FILE=".env.local"
fi

echo "==> 1/7 Lấy code mới từ origin/$BRANCH"
git fetch origin

echo "==> 2/7 Ép code về đúng origin/$BRANCH — 100% code từ GitHub"
# reset --hard: xóa mọi sửa tay trên file đã commit.
# clean -fd  : xóa thêm file/thư mục chưa track (build cũ, file rác...) — trừ
# BUILD_DIR/OLD_DIR (-e) để không xoá nhầm bản build tạm nếu lần chạy trước bị ngắt giữa chừng,
# và trừ *.local/.env.staging (-e) để không xoá mất file bí mật chưa (và sẽ không) commit.
git reset --hard "origin/$BRANCH"
git clean -fd -e "$BUILD_DIR" -e "$OLD_DIR" -e ".env.local" -e ".env.staging"

echo "==> 3/7 Cài thư viện theo package-lock.json"
npm ci

if [ "$STAGING" = true ]; then
  echo "==> 3.5/7 Nạp file env staging ($ENV_FILE → .env.local — Next.js chỉ tự đọc .env.local)"
  if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" .env.local
  else
    echo "    ⚠️  Không thấy $ENV_FILE — dùng .env.local hiện có (phải tự đảm bảo đã trỏ đúng" \
         "DB xboss_staging/PORT riêng trước khi deploy, xem docs/ops/staging.md)"
  fi
fi

echo "==> 4/7 Áp migration DB còn thiếu (idempotent, dừng deploy nếu lỗi)"
# Migration ĐỤNG DỮ LIỆU (UPDATE/backfill/đổi kiểu cột) phải đã chạy staging trước — xem
# CLAUDE.md mục "Quy trình & Definition of Done". Kiểm nhanh trước khi áp thật:
# npm run db:migrate -- --dry-run
npm run db:migrate

echo "==> 5/7 Build app vào thư mục tạm ($BUILD_DIR) — không đụng \".next\" đang phục vụ"
rm -rf "$BUILD_DIR"
NEXT_DIST_DIR="$BUILD_DIR" npm run build

echo "==> 6/7 Swap atomic \"$BUILD_DIR\" vào \".next\""
rm -rf "$OLD_DIR"
[ -d .next ] && mv .next "$OLD_DIR"
mv "$BUILD_DIR" .next

echo "==> 7/7 Reload app qua PM2 (graceful, kèm nạp lại biến môi trường) — process \"$PM2_NAME\""
pm2 reload "$PM2_NAME" --update-env

echo "==> Health-check sau reload (tối đa 5 lần, cách nhau 3 giây) — endpoint /api/health"
# Đọc cổng app từ file env đang dùng ($ENV_FILE — biến "PORT", mặc định 3000 nếu không đặt,
# xem DEPLOY.md). "/api/health" public, không cần đăng nhập (xem app/api/health/route.ts).
PORT_VAL=$(grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
PORT_VAL="${PORT_VAL:-3000}"
HEALTH_URL="http://localhost:$PORT_VAL/api/health"

# curl có thể fail vài lần đầu (app chưa kịp sẵn sàng sau reload) — không để "set -e" dừng
# ngang vòng retry, tự bắt lỗi bằng "if" rồi mới quyết định rollback sau khi thử đủ 5 lần.
HEALTHY=false
for i in 1 2 3 4 5; do
  if curl -sf "$HEALTH_URL" > /dev/null; then
    HEALTHY=true
    break
  fi
  sleep 3
done

if [ "$HEALTHY" = true ]; then
  rm -rf "$OLD_DIR"
  echo "==> Xong! Deploy hoàn tất ($([ "$STAGING" = true ] && echo staging || echo production))."
else
  echo "==> Health-check thất bại sau 5 lần thử ($HEALTH_URL) — rollback về bản build trước"
  mv "$OLD_DIR" .next
  pm2 reload "$PM2_NAME" --update-env
  echo "==> Health-check thất bại — đã rollback về bản trước"
  exit 1
fi
