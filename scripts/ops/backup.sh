#!/usr/bin/env bash
#
# Backup PostgreSQL + thư mục uploads cho XBoss — chạy hằng đêm qua cron trên VPS
# (khác hẳn `npm run db:migrate`/`deploy.sh` — script này KHÔNG đụng code/schema app).
# Cách dùng trên VPS (trong thư mục project, đã có DATABASE_URL trong môi trường/.env):
#   bash scripts/ops/backup.sh
#
# Việc nó làm: pg_dump toàn bộ DB (custom format, nén sẵn) -> nén thư mục data/uploads/
# (ảnh hiện trường + biên bản nghiệm thu — cùng RPO với DB) -> đẩy cả hai ra ngoài máy
# qua rclone (chống mất cả VPS) -> dọn bản cũ để không đầy đĩa.
#
# "Backup chưa kiểm chứng phục hồi được = chưa có backup" — xem restore-check.sh (chạy
# định kỳ riêng) và docs/ops/backup.md (mục tiêu RPO/RTO + quy trình phục hồi từng bước).

set -euo pipefail

# Thư mục lưu backup cục bộ + thư mục uploads nguồn — đổi qua biến môi trường nếu cần.
BACKUP_DIR="${BACKUP_DIR:-backups}"
UPLOADS_DIR="${UPLOADS_DIR:-data/uploads}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-30}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-90}"

DATE="$(date +%F)"
DB_DUMP="$BACKUP_DIR/xboss-$DATE.dump"
UPLOADS_TAR="$BACKUP_DIR/xboss-uploads-$DATE.tar.gz"

: "${DATABASE_URL:?Thiếu biến DATABASE_URL — export trước khi chạy (vd: export \$(grep DATABASE_URL .env.local | xargs))}"

mkdir -p "$BACKUP_DIR"

echo "==> 1/4 Dump PostgreSQL (custom format, nén sẵn) → $DB_DUMP"
pg_dump -Fc "$DATABASE_URL" -f "$DB_DUMP"

echo "==> 2/4 Nén thư mục ảnh/tài liệu ($UPLOADS_DIR) → $UPLOADS_TAR"
if [ -d "$UPLOADS_DIR" ]; then
  tar -czf "$UPLOADS_TAR" "$UPLOADS_DIR"
else
  echo "    (bỏ qua — $UPLOADS_DIR chưa tồn tại, chưa có upload nào)"
fi

echo "==> 3/4 Đẩy bản sao ra ngoài máy qua rclone (đích: \$BACKUP_REMOTE)"
if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$DB_DUMP" "$BACKUP_REMOTE" --log-level NOTICE
  if [ -f "$UPLOADS_TAR" ]; then
    rclone copy "$UPLOADS_TAR" "$BACKUP_REMOTE" --log-level NOTICE
  fi
  echo "    Đã đẩy lên $BACKUP_REMOTE"
else
  echo "    ⚠️  BỎ QUA — chưa cấu hình BACKUP_REMOTE. Backup CHỈ ở local (cùng VPS với DB gốc)," \
       "không đạt RPO/RTO an toàn nếu mất cả VPS — xem docs/ops/backup.md để cấu hình rclone."
fi

echo "==> 4/4 Dọn bản cũ (local > ${LOCAL_RETENTION_DAYS} ngày, remote > ${REMOTE_RETENTION_DAYS} ngày)"
find "$BACKUP_DIR" -maxdepth 1 -name 'xboss-*.dump' -mtime "+${LOCAL_RETENTION_DAYS}" -print -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'xboss-uploads-*.tar.gz' -mtime "+${LOCAL_RETENTION_DAYS}" -print -delete
if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone delete "$BACKUP_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include 'xboss-*.dump' || true
  rclone delete "$BACKUP_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include 'xboss-uploads-*.tar.gz' || true
fi

echo "==> Xong! Backup: $DB_DUMP"
