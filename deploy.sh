#!/usr/bin/env bash
#
# Script deploy lên VPS cho app "xboss".
# Cách dùng trên VPS (trong thư mục project):
#   bash deploy.sh
#
# Việc nó làm: lấy code mới nhất từ Git -> cài thư viện -> build -> khởi động lại app.

set -e   # Gặp lỗi ở bất kỳ bước nào là dừng ngay, không deploy code lỗi.

# VPS luôn chạy nhánh main.
BRANCH="main"

echo "==> 1/5 Lấy code mới từ origin/$BRANCH"
git fetch origin

echo "==> 2/5 Ép code về đúng origin/$BRANCH (xóa mọi sửa tay trên file đã commit)"
# Lưu ý: lệnh này KHÔNG đụng tới .env.local (đã nằm trong .gitignore), nên secret an toàn.
git reset --hard "origin/$BRANCH"

echo "==> 3/5 Cài thư viện theo package-lock.json"
npm ci

echo "==> 4/5 Build app"
npm run build

echo "==> 5/5 Khởi động lại app qua PM2 (kèm nạp lại biến môi trường)"
pm2 restart xboss --update-env

echo "==> Xong! Deploy hoàn tất."
