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

DATE="$(date -u +%Y%m%dT%H%M%SZ)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SET_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
SET_ID="${DATE}-${SET_ID}"
DB_DUMP="$BACKUP_DIR/xboss-$SET_ID.dump"
UPLOADS_TAR="$BACKUP_DIR/xboss-uploads-$SET_ID.tar.gz"
MANIFEST="$BACKUP_DIR/xboss-$SET_ID.manifest.json"
DB_DUMP_TMP="$DB_DUMP.partial"
UPLOADS_TAR_TMP="$UPLOADS_TAR.partial"
MANIFEST_TMP="$MANIFEST.partial"

cleanup_partial() {
  rm -f -- "$DB_DUMP_TMP" "$UPLOADS_TAR_TMP" "$MANIFEST_TMP"
}
trap cleanup_partial EXIT

: "${DATABASE_URL:?Thiếu biến DATABASE_URL — export trước khi chạy (vd: export \$(grep DATABASE_URL .env.local | xargs))}"

mkdir -p "$BACKUP_DIR"

echo "==> 1/4 Dump PostgreSQL (custom format, nén sẵn) → $DB_DUMP"
pg_dump -Fc "$DATABASE_URL" -f "$DB_DUMP_TMP"
mv -- "$DB_DUMP_TMP" "$DB_DUMP"

echo "==> 2/4 Nén thư mục ảnh/tài liệu ($UPLOADS_DIR) → $UPLOADS_TAR"
if [ -d "$UPLOADS_DIR" ]; then
  tar -czf "$UPLOADS_TAR_TMP" "$UPLOADS_DIR"
  mv -- "$UPLOADS_TAR_TMP" "$UPLOADS_TAR"
else
  echo "    (bỏ qua — $UPLOADS_DIR chưa tồn tại, chưa có upload nào)"
fi

echo "==> Ghi manifest cho recovery set $SET_ID"
python3 - "$BACKUP_DIR" "$SET_ID" "$DB_DUMP" "$UPLOADS_TAR" "$MANIFEST_TMP" "$STARTED_AT" <<'PY'
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

backup_dir, set_id, dump_path, uploads_path, manifest_tmp, started_at = sys.argv[1:]
artifacts = []
for role, path in (("database_dump", dump_path), ("uploads_archive", uploads_path)):
    item = {"role": role, "path": os.path.basename(path), "status": "PRESENT"}
    if not os.path.isfile(path):
        item["status"] = "MISSING"
    else:
        item["size"] = os.path.getsize(path)
        digest = hashlib.sha256()
        with open(path, "rb") as artifact:
            for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
                digest.update(chunk)
        item["sha256"] = digest.hexdigest()
    artifacts.append(item)

status = "COMPLETE" if all(item["status"] == "PRESENT" for item in artifacts) else "PARTIAL"
manifest = {
    "schemaVersion": 1,
    "recoverySetId": set_id,
    "status": status,
    "startedAt": started_at,
    "completedAt": datetime.now(timezone.utc).isoformat(),
    "artifacts": artifacts,
}
with open(manifest_tmp, "x", encoding="utf-8") as output:
    json.dump(manifest, output, sort_keys=True, separators=(",", ":"))
    output.write("\n")
PY
mv -- "$MANIFEST_TMP" "$MANIFEST"

echo "==> 3/4 Đẩy bản sao ra ngoài máy qua rclone (đích: \$BACKUP_REMOTE)"
if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$DB_DUMP" "$BACKUP_REMOTE" --log-level NOTICE
  [ ! -f "$UPLOADS_TAR" ] || rclone copy "$UPLOADS_TAR" "$BACKUP_REMOTE" --log-level NOTICE
  rclone copy "$MANIFEST" "$BACKUP_REMOTE" --log-level NOTICE
  echo "    Đã đẩy lên $BACKUP_REMOTE"
else
  echo "    ⚠️  BỎ QUA — chưa cấu hình BACKUP_REMOTE. Backup CHỈ ở local (cùng VPS với DB gốc)," \
       "không đạt RPO/RTO an toàn nếu mất cả VPS — xem docs/ops/backup.md để cấu hình rclone."
fi

echo "==> 4/4 Dọn bản cũ (local > ${LOCAL_RETENTION_DAYS} ngày, remote > ${REMOTE_RETENTION_DAYS} ngày)"
if [ -f "$UPLOADS_TAR" ]; then
  find "$BACKUP_DIR" -maxdepth 1 -name 'xboss-*.dump' -mtime "+${LOCAL_RETENTION_DAYS}" -print -delete
  find "$BACKUP_DIR" -maxdepth 1 -name 'xboss-uploads-*.tar.gz' -mtime "+${LOCAL_RETENTION_DAYS}" -print -delete
  find "$BACKUP_DIR" -maxdepth 1 -name 'xboss-*.manifest.json' -mtime "+${LOCAL_RETENTION_DAYS}" -print -delete
  if [ -n "${BACKUP_REMOTE:-}" ]; then
    rclone delete "$BACKUP_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include 'xboss-*.dump' || true
    rclone delete "$BACKUP_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include 'xboss-uploads-*.tar.gz' || true
    rclone delete "$BACKUP_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include 'xboss-*.manifest.json' || true
  fi
else
  echo "    Giữ nguyên backup cũ vì recovery set mới PARTIAL (thiếu uploads archive)."
fi

echo "==> Xong! Backup: $DB_DUMP (manifest: $MANIFEST; trạng thái: $(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["status"])' "$MANIFEST"))"
