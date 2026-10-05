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
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-35}"
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
MANIFEST_FINALIZED=0

cleanup_partial() {
  rm -f -- "$DB_DUMP_TMP" "$UPLOADS_TAR_TMP" "$MANIFEST_TMP"
  if ((MANIFEST_FINALIZED == 0)); then
    rm -f -- "$DB_DUMP" "$UPLOADS_TAR"
  fi
  if [[ -d "$BACKUP_DIR" ]]; then
    find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.partial' -mtime "+${LOCAL_RETENTION_DAYS}" -delete
  fi
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
MANIFEST_FINALIZED=1

SET_STATUS="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["status"])' "$MANIFEST")"
if [[ "$SET_STATUS" != "COMPLETE" ]]; then
  echo "==> Dọn artifact PARTIAL/mồ côi quá ${LOCAL_RETENTION_DAYS} ngày; giữ set COMPLETE gần nhất"
  python3 - "$BACKUP_DIR" "$LOCAL_RETENTION_DAYS" <<'PY'
import json
import os
import re
import sys
import time

backup_dir, retention_days = sys.argv[1], int(sys.argv[2])
cutoff = time.time() - retention_days * 86400
pattern = re.compile(r"^xboss-(\d{8}T\d{6}Z-[0-9a-f-]{36})\.manifest\.json$")
manifests = []
for name in os.listdir(backup_dir):
    match = pattern.fullmatch(name)
    if not match:
        continue
    path = os.path.join(backup_dir, name)
    try:
        with open(path, encoding="utf-8") as stream:
            data = json.load(stream)
    except (OSError, ValueError):
        data = {}
    set_id = match.group(1)
    names = {item.get("path") for item in data.get("artifacts", []) if isinstance(item, dict)} if isinstance(data, dict) else set()
    is_complete = (
        isinstance(data, dict)
        and data.get("status") == "COMPLETE"
        and names == {f"xboss-{set_id}.dump", f"xboss-uploads-{set_id}.tar.gz"}
    )
    has_local_artifacts = is_complete and all(os.path.isfile(os.path.join(backup_dir, item)) for item in names)
    manifests.append((set_id, path, os.path.getmtime(path), names, is_complete, has_local_artifacts))

complete_local = [item for item in manifests if item[5]]
keep_id = max(complete_local, key=lambda item: item[2])[0] if complete_local else None
expired = [
    item for item in manifests
    if item[2] < cutoff
    and (not item[4] or (keep_id is not None and item[0] != keep_id))
]
retained_refs = {
    name for item in manifests if item not in expired for name in item[3]
    if isinstance(name, str) and os.path.basename(name) == name
}
for _set_id, manifest_path, _mtime, names, _complete, _has_local in expired:
    for name in names:
        if isinstance(name, str) and os.path.basename(name) == name and name not in retained_refs:
            try:
                os.unlink(os.path.join(backup_dir, name))
            except FileNotFoundError:
                pass
    os.unlink(manifest_path)

for name in os.listdir(backup_dir):
    path = os.path.join(backup_dir, name)
    if not os.path.isfile(path) or os.path.getmtime(path) >= cutoff:
        continue
    if name.endswith(".partial") or (
        (name.endswith(".dump") or name.endswith(".tar.gz"))
        and name not in retained_refs
        and not any(name in item[3] for item in expired)
    ):
        os.unlink(path)
PY
  echo "❌ Recovery set $SET_ID là PARTIAL; không upload và giữ set COMPLETE local gần nhất." >&2
  exit 1
fi

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
  PRUNE_SETS="$(python3 - "$BACKUP_DIR" "$LOCAL_RETENTION_DAYS" "$REMOTE_RETENTION_DAYS" <<'PY'
import json
import os
import re
import sys
import time

backup_dir, local_retention_days, remote_retention_days = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
now = time.time()
local_cutoff = now - local_retention_days * 86400
remote_cutoff = now - remote_retention_days * 86400
manifest_pattern = re.compile(r"^xboss-(\d{8}T\d{6}Z-[0-9a-f-]{36})\.manifest\.json$")
artifact_names = lambda set_id: (
    f"xboss-{set_id}.dump",
    f"xboss-uploads-{set_id}.tar.gz",
)
manifests = []
for name in os.listdir(backup_dir):
    match = manifest_pattern.fullmatch(name)
    if not match:
        continue
    path = os.path.join(backup_dir, name)
    try:
        with open(path, encoding="utf-8") as stream:
            data = json.load(stream)
    except (OSError, ValueError):
        data = {}
    set_id = match.group(1)
    artifacts = data.get("artifacts", []) if isinstance(data, dict) else []
    names = {item.get("path") for item in artifacts if isinstance(item, dict)}
    manifest_complete = (
        data.get("status") == "COMPLETE"
        and names == set(artifact_names(set_id))
        and all(item.get("status") == "PRESENT" for item in artifacts if isinstance(item, dict))
    )
    local_complete = manifest_complete and all(
        os.path.isfile(os.path.join(backup_dir, item)) for item in artifact_names(set_id)
    )
    manifests.append((set_id, path, os.path.getmtime(path), manifest_complete, local_complete, names))

local_complete_sets = [item for item in manifests if item[4]]
remote_complete_sets = [item for item in manifests if item[3]]
keep_local_id = max(local_complete_sets, key=lambda item: item[2])[0] if local_complete_sets else None
keep_remote_id = max(remote_complete_sets, key=lambda item: item[2])[0] if remote_complete_sets else None
expired = [item for item in manifests if item[2] < local_cutoff and item[0] != keep_local_id]
remote_expired = [item[0] for item in manifests if item[3] and item[2] < remote_cutoff and item[0] != keep_remote_id]
removed_ids = []
remaining_names = {
    name
    for item in manifests
    if item not in expired
    for name in item[5]
    if isinstance(name, str) and os.path.basename(name) == name
}
for set_id, manifest_path, mtime, is_complete, _local_complete, names in expired:
    for name in names:
        if isinstance(name, str) and os.path.basename(name) == name and name not in remaining_names:
            try:
                os.unlink(os.path.join(backup_dir, name))
            except FileNotFoundError:
                pass
    # Keep only a small manifest pointer until the longer remote retention expires;
    # local artifacts are removed at local retention, remote deletion remains set-aware.
    if not is_complete or mtime < remote_cutoff:
        os.unlink(manifest_path)
    if is_complete and mtime < remote_cutoff:
        removed_ids.append(set_id)

# Old temporary/orphan artifacts are safe to remove only after the retention window.
for name in os.listdir(backup_dir):
    path = os.path.join(backup_dir, name)
    if not os.path.isfile(path) or os.path.getmtime(path) >= local_cutoff:
        continue
    is_partial = name.endswith(".partial")
    is_orphan_artifact = (
        (name.endswith(".dump") or name.endswith(".tar.gz"))
        and name not in remaining_names
        and not any(name in item[5] for item in expired)
    )
    if is_partial or is_orphan_artifact:
        os.unlink(path)

for set_id in removed_ids:
    print(f"local:{set_id}")
for set_id in remote_expired:
    print(f"remote:{set_id}")
PY
)"
  if [ -n "${BACKUP_REMOTE:-}" ]; then
    while IFS=: read -r retention_scope old_set_id; do
      [[ "$retention_scope" == "remote" ]] || continue
      [[ "$old_set_id" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ ]] || continue
      rclone deletefile "$BACKUP_REMOTE/xboss-$old_set_id.dump" || true
      rclone deletefile "$BACKUP_REMOTE/xboss-uploads-$old_set_id.tar.gz" || true
      rclone deletefile "$BACKUP_REMOTE/xboss-$old_set_id.manifest.json" || true
    done <<<"$PRUNE_SETS"
  fi
else
  echo "    Giữ nguyên backup cũ vì recovery set mới PARTIAL (thiếu uploads archive)."
fi

echo "==> Xong! Backup: $DB_DUMP (manifest: $MANIFEST; trạng thái: $SET_STATUS)"
