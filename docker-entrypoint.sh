#!/bin/sh
set -e

mkdir -p "$(dirname "$XBOSS_DB")"

# Lần đầu chạy (volume trống) → nạp dữ liệu từ Excel.
if [ ! -f "$XBOSS_DB" ]; then
  echo "📦 Chưa có DB — đang seed từ Excel..."
  npm run db:seed
else
  echo "✅ DB đã tồn tại tại $XBOSS_DB — bỏ qua seed."
fi

echo "🚀 Khởi động XBoss trên cổng $PORT..."
exec npm start
