#!/usr/bin/env bash
#
# Script deploy lên VPS cho app "xboss".
# Cách dùng trên VPS (trong thư mục project):
#   bash deploy.sh                # deploy production, dùng bản build CI đã gửi sang (mặc định)
#   bash deploy.sh --build-local  # deploy production, tự build ngay trên VPS (đường dự phòng)
#   bash deploy.sh --staging      # deploy staging — pm2 process/thư mục build/file env riêng (M44 PR4)
#
# Việc nó làm: lấy code mới nhất từ Git -> cài thư viện -> áp migration DB còn thiếu ->
# lấy bản build (giải nén gói từ CI, hoặc tự build vào thư mục tạm) -> swap atomic vào
# ".next" thật -> khởi động lại app.
#
# Vì sao mặc định KHÔNG build trên VPS nữa (2026-08-26): `next build` trên máy này chạy
# 20-23 phút vì RAM thiếu phải bù bằng swap đĩa — từng bị OOM-kill (exit 137) và từng vượt
# command_timeout của ssh-action, cắt ngang deploy đúng lúc build vừa xong khiến commit mới
# nhất KHÔNG lên được production (xem PROGRESS.md mục blocker 2026-07-19). Nay workflow
# .github/workflows/deploy.yml build trên runner GitHub rồi rsync gói ".next-ci.tar.gz" sang
# đây trước khi gọi script này. Cờ --build-local giữ nguyên đường cũ để còn deploy được khi
# GitHub Actions không dùng được.
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
BUILD_LOCAL=false
for arg in "$@"; do
  case "$arg" in
    --staging) STAGING=true ;;
    --build-local) BUILD_LOCAL=true ;;
    *) echo "Tham số không nhận ra: $arg (chỉ có --staging, --build-local)" >&2; exit 2 ;;
  esac
done

# Gói build từ CI chỉ dành cho production: staging được deploy bằng tay trên VPS (tập dượt
# migration, xem docs/ops/staging.md) và không có workflow nào gửi gói sang, nên staging luôn
# tự build tại chỗ như trước.
if [ "$STAGING" = true ]; then
  BUILD_LOCAL=true
fi

# Gói do .github/workflows/deploy.yml gửi sang (tar chứa thư mục ".next-ci" + phiếu ".next-ci.info").
CI_TARBALL=".next-ci.tar.gz"
CI_DIR=".next-ci"
CI_INFO=".next-ci.info"

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
# Trừ thêm gói build từ CI (-e): nó được rsync sang TRƯỚC khi script này chạy, "git clean"
# không biết nó là file hợp lệ nên sẽ xoá mất, khiến bước 5/7 không còn gì để giải nén.
git clean -fd -e "$BUILD_DIR" -e "$OLD_DIR" -e ".env.local" -e ".env.staging" \
  -e "$CI_TARBALL" -e "$CI_TARBALL.part" -e "$CI_DIR" -e "$CI_INFO"

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

echo "==> 4.7/7 Dựng cây thư mục bản vẽ quy chuẩn ISO 19650 (idempotent)"
# Việc cấp phát môi trường, làm một lần lúc triển khai — KHÔNG làm trong route lúc người dùng
# bấm Lưu. Để nó trong đồ thị import của route khiến Turbopack phải trace toàn bộ dự án khi
# build ("Dynamic filesystem access causes tracing of the whole project"), mà build trên VPS
# vốn đã 20-23 phút. Xem scripts/ensure-drawing-tree.ts.
npm run setup:drawing-tree

if [ "$BUILD_LOCAL" = true ]; then
  echo "==> 5/7 Build app tại chỗ vào thư mục tạm ($BUILD_DIR) — không đụng \".next\" đang phục vụ"
  rm -rf "$BUILD_DIR"
  NEXT_DIST_DIR="$BUILD_DIR" npm run build
else
  echo "==> 5/7 Nhận bản build từ CI ($CI_TARBALL) — không build trên VPS"
  if [ ! -f "$CI_TARBALL" ]; then
    echo "    ❌ Không thấy $CI_TARBALL trong $(pwd)." >&2
    echo "       Gói này do .github/workflows/deploy.yml rsync sang ngay trước khi gọi script." >&2
    echo "       Deploy tay từ VPS thì dùng: bash deploy.sh --build-local" >&2
    exit 1
  fi

  rm -rf "$BUILD_DIR" "$CI_DIR" "$CI_INFO"
  tar -xzf "$CI_TARBALL"

  if [ ! -d "$CI_DIR" ] || [ ! -f "$CI_INFO" ]; then
    echo "    ❌ Gói $CI_TARBALL thiếu \"$CI_DIR\" hoặc \"$CI_INFO\" — không dám swap." >&2
    exit 1
  fi

  # Cổng 1 — ĐÚNG COMMIT: bước 2/7 vừa ép code về origin/main, nếu có push mới chen vào giữa
  # thì gói build (của commit cũ) không còn khớp mã nguồn/migration vừa áp. Chạy lệch cặp này
  # là kiểu lỗi rất khó truy: app phục vụ bundle của bản khác với code trên đĩa.
  CI_SHA=$(grep -E '^sha=' "$CI_INFO" | tail -n1 | cut -d= -f2-)
  HEAD_SHA=$(git rev-parse HEAD)
  if [ "$CI_SHA" != "$HEAD_SHA" ]; then
    echo "    ❌ Gói build là của commit $CI_SHA nhưng mã nguồn đang ở $HEAD_SHA." >&2
    echo "       Thường do có push mới chen vào — lần chạy CI kế tiếp sẽ gửi gói đúng." >&2
    exit 1
  fi

  # Cổng 2 — ĐÚNG NODE MAJOR: điều kiện đã ghi ở DEPLOY.md mục "Build ở máy khác" (cùng bản
  # Node để tránh lệch native module/runtime).
  CI_NODE=$(grep -E '^node=' "$CI_INFO" | tail -n1 | cut -d= -f2-)
  VPS_NODE=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$CI_NODE" != "$VPS_NODE" ]; then
    echo "    ❌ Gói build bằng Node $CI_NODE nhưng VPS đang chạy Node $VPS_NODE." >&2
    echo "       Đồng bộ node-version trong .github/workflows/deploy.yml với VPS rồi deploy lại." >&2
    exit 1
  fi

  mv "$CI_DIR" "$BUILD_DIR"
  rm -f "$CI_INFO"
  echo "    ✅ Bản build khớp commit $HEAD_SHA (Node $CI_NODE)"
fi

echo "==> 6/7 Swap atomic \"$BUILD_DIR\" vào \".next\""
rm -rf "$OLD_DIR"
[ -d .next ] && mv .next "$OLD_DIR"
mv "$BUILD_DIR" .next

echo "==> 7/7 Reload app qua PM2 (graceful, kèm nạp lại biến môi trường) — process \"$PM2_NAME\""
pm2 reload "$PM2_NAME" --update-env

# MEPF worker (daemon Python, xem ecosystem.config.js) chạy song song app và cũng đọc code từ
# chính thư mục này, nên phải reload theo — nếu không, worker vẫn chạy code cũ sau khi deploy.
# Chỉ làm ở chế độ production: staging dùng chung DB hàng đợi sẽ tranh chấp tác vụ với prod, và
# reload nhầm worker prod từ thư mục staging là đúng thứ cần tránh (xem docs/ops/staging.md).
# Bỏ qua im lặng nếu VPS này không chạy worker — nhiều VPS chỉ cần app.
if [ "$STAGING" = false ]; then
  if pm2 describe mepf-worker > /dev/null 2>&1; then
    echo "==> 7.5/7 Reload MEPF worker (daemon Python)"
    pm2 reload mepf-worker --update-env
  else
    echo "==> 7.5/7 Bỏ qua MEPF worker — không thấy process \"mepf-worker\" trong PM2"
  fi
fi

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
  # Chỉ xoá gói CI khi đã chắc chắn bản mới sống: hỏng giữa chừng thì gói còn đó để chạy lại
  # `bash deploy.sh` mà không phải chờ CI build lại.
  rm -f "$CI_TARBALL"
  echo "==> Xong! Deploy hoàn tất ($([ "$STAGING" = true ] && echo staging || echo production))."
else
  echo "==> Health-check thất bại sau 5 lần thử ($HEALTH_URL) — rollback về bản build trước"
  # ".next" đang là bản build MỚI (vừa mv vào ở bước 6/7, chưa bị xoá) — phải rm -rf trước
  # thì "mv OLD_DIR .next" mới THAY THẾ đúng chỗ, không thì mv sẽ đẩy OLD_DIR vào TRONG
  # ".next" (thành ".next/.next-old") vì đích đã tồn tại là thư mục.
  rm -rf .next
  mv "$OLD_DIR" .next
  pm2 reload "$PM2_NAME" --update-env
  echo "==> Health-check thất bại — đã rollback về bản trước"
  exit 1
fi
