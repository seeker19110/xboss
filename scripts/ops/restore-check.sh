#!/usr/bin/env bash
#
# Kiểm chứng phục hồi backup PostgreSQL của XBoss — chạy định kỳ (cron Chủ nhật 02:00),
# KHÔNG đụng gì tới DB thật đang chạy app. "Backup chưa restore được = chưa có backup."
#
# Việc nó làm: lấy bản dump mới nhất trong $BACKUP_DIR -> tạo DB tạm xboss_restore_check
# -> pg_restore vào đó -> đếm tổng số bảng + số dòng 5 bảng lõi (tasks/contracts/
# payment_certs/materials/users) phải > 0 -> DROP DB tạm (kể cả khi kiểm tra fail, qua
# trap) -> exit code khác 0 nếu bất kỳ bước nào sai để cron/monitor bắt được.
#
# Cách dùng trên VPS (đã chạy backup.sh ít nhất 1 lần, DATABASE_URL trỏ tới DB thật để
# lấy thông tin kết nối host/user — script tự tạo DB khác tên, KHÔNG đọc/ghi DB thật):
#   bash scripts/ops/restore-check.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backups}"
TMP_DB="xboss_restore_check"
CORE_TABLES=(tasks contracts payment_certs materials users)

: "${DATABASE_URL:?Thiếu biến DATABASE_URL — cần để lấy host/cổng/user kết nối tạo DB tạm}"

# Đổi tên DB cuối connection string thành "postgres" (DB bảo trì, luôn tồn tại) để có kết
# nối tạo/xoá DB tạm, và thành $TMP_DB để restore vào đúng DB tạm.
MAINT_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#(/)[^/?]*(\?.*)?$#\1postgres\2#')"
TMP_URL="$(printf '%s' "$DATABASE_URL" | sed -E "s#(/)[^/?]*(\?.*)?\$#\1${TMP_DB}\2#")"

# nullglob: pattern không khớp file nào thì thành mảng rỗng thay vì chuỗi literal (tránh
# "set -e" thoát sớm khi "ls" gặp glob không khớp — lỗi thật đã gặp lúc viết script này).
shopt -s nullglob
DUMPS=("$BACKUP_DIR"/xboss-*.dump)
shopt -u nullglob
if [ ${#DUMPS[@]} -eq 0 ]; then
  echo "❌ Không tìm thấy file backup nào trong $BACKUP_DIR — chạy backup.sh trước."
  exit 1
fi
LATEST_DUMP="$(ls -t "${DUMPS[@]}" | head -1)"
echo "==> Kiểm chứng phục hồi từ: $LATEST_DUMP"

# Dọn DB tạm dù script thoát kiểu gì (thành công/fail/Ctrl-C) — không để sót rác trên VPS.
cleanup() {
  psql "$MAINT_URL" -v ON_ERROR_STOP=0 -q -c "DROP DATABASE IF EXISTS $TMP_DB;" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> 1/4 Tạo DB tạm $TMP_DB"
psql "$MAINT_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $TMP_DB;"
psql "$MAINT_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $TMP_DB;"

echo "==> 2/4 pg_restore bản dump vào DB tạm"
pg_restore --no-owner --no-privileges -d "$TMP_URL" "$LATEST_DUMP"

echo "==> 3/4 Đếm bảng + kiểm tra 5 bảng lõi có dữ liệu"
TABLE_COUNT="$(psql "$TMP_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
echo "    Tổng số bảng trong public: $TABLE_COUNT"
if [ "$TABLE_COUNT" -lt 1 ]; then
  echo "❌ Restore ra 0 bảng — backup coi như hỏng."
  exit 1
fi

FAIL=0
for t in "${CORE_TABLES[@]}"; do
  ROWS="$(psql "$TMP_URL" -tAc "SELECT count(*) FROM $t" 2>/dev/null || echo "-1")"
  if [ "$ROWS" -gt 0 ] 2>/dev/null; then
    echo "    ✅ $t: $ROWS dòng"
  else
    echo "    ❌ $t: $ROWS dòng (kỳ vọng > 0)"
    FAIL=1
  fi
done

echo "==> 4/4 Xoá DB tạm $TMP_DB (qua trap cleanup)"

if [ "$FAIL" -ne 0 ]; then
  echo "❌ Kiểm chứng phục hồi THẤT BẠI — báo động, kiểm tra lại backup.sh/rclone ngay."
  exit 1
fi

echo "✅ Kiểm chứng phục hồi THÀNH CÔNG — bản dump $LATEST_DUMP phục hồi được, đủ dữ liệu lõi."
