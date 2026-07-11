#!/usr/bin/env bash
#
# Script deploy lên VPS cho app "xboss".
# Cách dùng trên VPS (trong thư mục project):
#   bash deploy.sh
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

set -e   # Gặp lỗi ở bất kỳ bước nào là dừng ngay, không deploy code lỗi.

# VPS luôn chạy nhánh main.
BRANCH="main"
BUILD_DIR=".next-build"
OLD_DIR=".next-old"

echo "==> 1/7 Lấy code mới từ origin/$BRANCH"
git fetch origin

echo "==> 2/7 Ép code về đúng origin/$BRANCH — 100% code từ GitHub"
# reset --hard: xóa mọi sửa tay trên file đã commit.
# clean -fd  : xóa thêm file/thư mục chưa track (build cũ, file rác...) — trừ
# BUILD_DIR/OLD_DIR (-e) để không xoá nhầm bản build tạm nếu lần chạy trước bị ngắt giữa chừng.
git reset --hard "origin/$BRANCH"
git clean -fd -e "$BUILD_DIR" -e "$OLD_DIR"

echo "==> 3/7 Cài thư viện theo package-lock.json"
npm ci

echo "==> 4/7 Áp migration DB còn thiếu (idempotent, dừng deploy nếu lỗi)"
npm run db:migrate

echo "==> 5/7 Build app vào thư mục tạm ($BUILD_DIR) — không đụng \"${BUILD_DIR%-build}\" đang phục vụ"
rm -rf "$BUILD_DIR"
NEXT_DIST_DIR="$BUILD_DIR" npm run build

echo "==> 6/7 Swap atomic \"$BUILD_DIR\" vào \".next\""
rm -rf "$OLD_DIR"
[ -d .next ] && mv .next "$OLD_DIR"
mv "$BUILD_DIR" .next

echo "==> 7/7 Reload app qua PM2 (graceful, kèm nạp lại biến môi trường)"
pm2 reload xboss --update-env

rm -rf "$OLD_DIR"
echo "==> Xong! Deploy hoàn tất."
