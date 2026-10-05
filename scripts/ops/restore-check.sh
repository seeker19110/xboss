#!/usr/bin/env bash
# Restore check chỉ chạy trên PostgreSQL disposable đã được đánh dấu rõ ràng.
# Không dùng DATABASE_URL của ứng dụng làm đích ghi/xoá.
set -euo pipefail
set +x # Secret-bearing environment values must never be expanded into shell trace logs.

BACKUP_DIR="${BACKUP_DIR:-backups}"
CORE_TABLES=(tasks contracts payment_certs materials users)
TARGET_CREATED=0
PGPASSFILE=""
PGSERVICEFILE=""
TARGET_HOST=""
TARGET_PORT=""
TARGET_USER=""
CONTROL_DB=""

cleanup() {
  if ((TARGET_CREATED == 1)); then
    PGPASSFILE="$PGPASSFILE" PGSERVICEFILE="$PGSERVICEFILE" PGSERVICE=xboss_restore_check psql -X -v ON_ERROR_STOP=1 -q \
      -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" -d "$CONTROL_DB" \
      -c "DROP DATABASE $RESTORE_TARGET_DATABASE;" >/dev/null 2>&1 || true
  fi
  if [[ -n "$PGPASSFILE" ]]; then
    rm -f -- "$PGPASSFILE"
  fi
  if [[ -n "$PGSERVICEFILE" ]]; then
    rm -f -- "$PGSERVICEFILE"
  fi
}
trap cleanup EXIT

die() {
  printf '❌ %s\n' "$1" >&2
  exit 1
}

# Cấu hình nguồn chỉ để so sánh danh tính. Mọi lệnh psql/pg_restore chỉ dùng URL đích.
: "${RESTORE_SOURCE_URL:?Thiếu RESTORE_SOURCE_URL (chỉ dùng đối chiếu danh tính nguồn)}"
: "${RESTORE_TARGET_URL:?Thiếu RESTORE_TARGET_URL có credentials riêng cho PostgreSQL disposable}"
: "${RESTORE_TARGET_DATABASE:?Thiếu RESTORE_TARGET_DATABASE (tên DB mới, riêng cho restore)}"
: "${RESTORE_TARGET_MARKER:?Thiếu RESTORE_TARGET_MARKER đã gắn COMMENT vào DB điều khiển disposable}"

if [[ ! "$RESTORE_TARGET_DATABASE" =~ ^[a-z][a-z0-9_]{2,62}$ ]]; then
  die "RESTORE_TARGET_DATABASE chỉ được gồm chữ thường, số và _, bắt đầu bằng chữ cái."
fi
if [[ "$RESTORE_TARGET_DATABASE" =~ (^|_)(prod|production|live)(_|$) ]]; then
  die "Từ chối tên DB đích có vẻ production."
fi
if [[ ! "$RESTORE_TARGET_MARKER" =~ ^xboss-disposable:[A-Za-z0-9_-]{16,}$ ]]; then
  die "Marker phải có dạng xboss-disposable:<token ngẫu nhiên tối thiểu 16 ký tự>."
fi

# Phân tích URI, ghi credentials target vào passfile riêng mode 0600. URL/password không
# được đưa vào argv của psql/pg_restore hoặc output của bước phân tích.
PGPASSFILE="$(mktemp "${TMPDIR:-/tmp}/xboss-restore-check.XXXXXX")" || die "Không tạo được passfile tạm an toàn."
PGSERVICEFILE="$(mktemp "${TMPDIR:-/tmp}/xboss-restore-service.XXXXXX")" || die "Không tạo được service file tạm an toàn."
chmod 600 "$PGPASSFILE"
chmod 600 "$PGSERVICEFILE"
IDENTITIES="$(RESTORE_PGPASSFILE="$PGPASSFILE" RESTORE_PGSERVICEFILE="$PGSERVICEFILE" python3 - "$RESTORE_TARGET_DATABASE" <<'PY'
import os
import sys
import ipaddress
import socket
from urllib.parse import parse_qsl, unquote, urlsplit

def parse(raw):
    u = urlsplit(raw)
    if u.scheme not in ("postgres", "postgresql") or not u.hostname or not u.path.strip("/"):
        raise SystemExit(2)
    if not u.username or not u.password:
        raise SystemExit(2)
    user, password, database = unquote(u.username), unquote(u.password), unquote(u.path.strip("/"))
    if any(c in value for value in (user, password, database) for c in ("\0", "\r", "\n", "\t")):
        raise SystemExit(2)
    return u, user, password, database

try:
    src, src_user, _src_password, src_db = parse(os.environ["RESTORE_SOURCE_URL"])
    dst, dst_user, dst_password, dst_db = parse(os.environ["RESTORE_TARGET_URL"])
except (ValueError, SystemExit):
    raise SystemExit("invalid")

src_host, dst_host = src.hostname.lower(), dst.hostname.lower()
src_port, dst_port = src.port or 5432, dst.port or 5432
def normalized_ip(address):
    parsed = ipaddress.ip_address(address)
    return parsed.ipv4_mapped if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped else parsed

try:
    target_ip = normalized_ip(dst_host)
except ValueError:
    print("target-host-not-ip")
    raise SystemExit(0)
if target_ip.is_global:
    print("target-host-public")
    raise SystemExit(0)
try:
    source_ips = {normalized_ip(src_host)}
except ValueError:
    try:
        source_ips = {
            normalized_ip(item[4][0])
            for item in socket.getaddrinfo(src_host, src_port, type=socket.SOCK_STREAM)
        }
    except OSError:
        print("source-host-unresolved")
        raise SystemExit(0)

def pgpass_escape(value):
    return value.replace("\\", "\\\\").replace(":", "\\:")

with open(os.environ["RESTORE_PGPASSFILE"], "w", encoding="utf-8") as passfile:
    passfile.write(":".join(map(pgpass_escape, (str(target_ip), str(dst_port), "*", dst_user, dst_password))) + "\n")
os.chmod(os.environ["RESTORE_PGPASSFILE"], 0o600)

query_params = parse_qsl(dst.query, keep_blank_values=True, strict_parsing=True)
reserved = {"host", "hostaddr", "port", "dbname", "user", "password", "passfile", "service", "servicefile"}
seen = set()
for key, value in query_params:
    if not key.isascii() or not key.replace("_", "").isalnum() or key.lower() in reserved or key.lower() in seen:
        raise SystemExit(2)
    if any(c in value for c in ("\0", "\r", "\n")):
        raise SystemExit(2)
    seen.add(key.lower())

def service_quote(value):
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"

with open(os.environ["RESTORE_PGSERVICEFILE"], "w", encoding="utf-8") as servicefile:
    servicefile.write("[xboss_restore_check]\n")
    servicefile.write(f"host={service_quote(str(target_ip))}\n")
    servicefile.write(f"port={service_quote(str(dst_port))}\n")
    servicefile.write(f"user={service_quote(dst_user)}\n")
    for key, value in query_params:
        servicefile.write(f"{key}={service_quote(value)}\n")
os.chmod(os.environ["RESTORE_PGSERVICEFILE"], 0o600)

if (target_ip in source_ips and src_port == dst_port):
    print("same-server")
    raise SystemExit(0)
if src_db.lower() == sys.argv[1].lower() or dst_db.lower() == sys.argv[1].lower():
    print("same-database")
    raise SystemExit(0)
if src_user == dst_user:
    print("same-user")
    raise SystemExit(0)

print("\t".join((str(target_ip), str(dst_port), dst_db, dst_user)))
PY
)" || die "Không đọc được danh tính nguồn/đích."

if [[ "$IDENTITIES" == "same-server" ]]; then
  die "Nguồn và đích nằm trên cùng host/port; từ chối restore."
elif [[ "$IDENTITIES" == "same-database" ]]; then
  die "Tên DB đích trùng DB nguồn hoặc DB điều khiển; từ chối restore."
elif [[ "$IDENTITIES" == "same-user" ]]; then
  die "Credentials đích phải khác user nguồn/app."
elif [[ "$IDENTITIES" == "target-host-not-ip" ]]; then
  die "RESTORE_TARGET_URL phải dùng địa chỉ IP rõ ràng để xác minh đúng PostgreSQL server."
elif [[ "$IDENTITIES" == "target-host-public" ]]; then
  die "Đích restore-check phải nằm trên IP private/loopback của sandbox, không dùng IP public."
elif [[ "$IDENTITIES" == "source-host-unresolved" ]]; then
  die "Không phân giải được host của RESTORE_SOURCE_URL để chứng minh đích khác nguồn."
fi
IFS=$'\t' read -r TARGET_HOST TARGET_PORT CONTROL_DB TARGET_USER <<<"$IDENTITIES"
if [[ "$TARGET_HOST" =~ (prod|production|live) || "$CONTROL_DB" =~ (^|_)(prod|production|live)(_|$) ]]; then
  die "Đích có host hoặc DB điều khiển mang tên production-like."
fi

shopt -s nullglob
DUMPS=("$BACKUP_DIR"/xboss-*.dump)
shopt -u nullglob
if ((${#DUMPS[@]} == 0)); then
  die "Không tìm thấy file backup nào trong $BACKUP_DIR — chạy backup.sh trước."
fi
LATEST_DUMP="$(ls -t "${DUMPS[@]}" | head -1)"

# Kiểm tra marker thật ở DB điều khiển, user không phải superuser, server đã trả về đúng
# host/port cấu hình, và database sẽ tạo chưa tồn tại. Tất cả đều SELECT-only.
META_SQL="SELECT COALESCE(inet_server_addr()::text, ''), COALESCE(inet_server_port()::text, ''),
                 current_database(), current_user,
                 COALESCE(shobj_description(d.oid, 'pg_database'), ''),
                 r.rolsuper::text, r.rolcreatedb::text
            FROM pg_database d JOIN pg_roles r ON r.rolname = current_user
           WHERE d.datname = current_database()"
META="$(PGPASSFILE="$PGPASSFILE" PGSERVICEFILE="$PGSERVICEFILE" PGSERVICE=xboss_restore_check psql \
  -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" -d "$CONTROL_DB" \
  -X -v ON_ERROR_STOP=1 -tA -F $'\t' -c "$META_SQL" 2>/dev/null)" \
  || die "Không xác thực được PostgreSQL disposable đích."
IFS=$'\t' read -r SERVER_ADDR SERVER_PORT ACTUAL_CONTROL_DB ACTUAL_USER ACTUAL_MARKER IS_SUPERUSER CAN_CREATE_DB <<<"$META"
if [[ "$SERVER_ADDR" != "$TARGET_HOST" || "$SERVER_PORT" != "$TARGET_PORT" || "$ACTUAL_CONTROL_DB" != "$CONTROL_DB" || "$ACTUAL_USER" != "$TARGET_USER" ]]; then
  die "Danh tính server/user thực tế không khớp cấu hình target."
fi
if [[ "$ACTUAL_MARKER" != "$RESTORE_TARGET_MARKER" ]]; then
  die "DB điều khiển không có marker disposable khớp RESTORE_TARGET_MARKER."
fi
if [[ "$IS_SUPERUSER" != "false" ]]; then
  die "Credentials đích không được là PostgreSQL superuser."
fi
if [[ "$CAN_CREATE_DB" != "true" ]]; then
  die "Role đích phải có quyền CREATEDB để tạo database disposable mới."
fi

EXISTS="$(PGPASSFILE="$PGPASSFILE" PGSERVICEFILE="$PGSERVICEFILE" PGSERVICE=xboss_restore_check psql \
  -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" -d "$CONTROL_DB" \
  -X -v ON_ERROR_STOP=1 -tAc \
  "SELECT count(*) FROM pg_database WHERE datname = '$RESTORE_TARGET_DATABASE'" 2>/dev/null)" \
  || die "Không thể kiểm tra trạng thái database đích."
if [[ "$EXISTS" != "0" ]]; then
  die "Database đích đã tồn tại; sẽ không DROP database không do lần chạy này tạo."
fi

printf '==> Kiểm chứng từ backup: %s\n' "$LATEST_DUMP"
printf '==> Tạo database disposable mới: %s\n' "$RESTORE_TARGET_DATABASE"
if ! PGPASSFILE="$PGPASSFILE" PGSERVICEFILE="$PGSERVICEFILE" PGSERVICE=xboss_restore_check psql \
  -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" -d "$CONTROL_DB" \
  -X -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $RESTORE_TARGET_DATABASE;" 2>/dev/null; then
  die "Không tạo được database disposable đích."
fi
TARGET_CREATED=1
if ! PGPASSFILE="$PGPASSFILE" PGSERVICEFILE="$PGSERVICEFILE" PGSERVICE=xboss_restore_check psql \
  -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" -d "$CONTROL_DB" \
  -X -v ON_ERROR_STOP=1 -q \
  -c "COMMENT ON DATABASE $RESTORE_TARGET_DATABASE IS '$RESTORE_TARGET_MARKER';" 2>/dev/null; then
  die "Không gắn được marker cho database disposable đích."
fi

printf '==> pg_restore vào database disposable đã xác minh\n'
if ! PGPASSFILE="$PGPASSFILE" PGSERVICEFILE="$PGSERVICEFILE" PGSERVICE=xboss_restore_check pg_restore \
  --no-owner --no-privileges -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" \
  -d "$RESTORE_TARGET_DATABASE" "$LATEST_DUMP" >/dev/null 2>/dev/null; then
  die "pg_restore thất bại; không giữ thông tin kết nối trong log."
fi

printf '==> Kiểm tra bảng và dữ liệu lõi\n'
TABLE_COUNT="$(PGPASSFILE="$PGPASSFILE" PGSERVICEFILE="$PGSERVICEFILE" PGSERVICE=xboss_restore_check psql \
  -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" -d "$RESTORE_TARGET_DATABASE" \
  -X -v ON_ERROR_STOP=1 -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null)" \
  || die "Không thể kiểm tra số bảng trong database phục hồi."
if [[ ! "$TABLE_COUNT" =~ ^[0-9]+$ ]] || ((TABLE_COUNT < 1)); then
  die "Restore ra 0 bảng hoặc kết quả đếm không hợp lệ."
fi
printf '    Tổng số bảng public: %s\n' "$TABLE_COUNT"
for table in "${CORE_TABLES[@]}"; do
  rows="$(PGPASSFILE="$PGPASSFILE" PGSERVICEFILE="$PGSERVICEFILE" PGSERVICE=xboss_restore_check psql \
    -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" -d "$RESTORE_TARGET_DATABASE" \
    -X -v ON_ERROR_STOP=1 -tAc "SELECT count(*) FROM $table" 2>/dev/null)" \
    || die "Không thể kiểm tra bảng lõi $table."
  if [[ ! "$rows" =~ ^[0-9]+$ ]] || ((rows < 1)); then
    die "Bảng lõi $table rỗng hoặc kết quả đếm không hợp lệ."
  fi
  printf '    ✅ %s: %s dòng\n' "$table" "$rows"
done

printf '✅ Restore check đạt; cleanup chỉ xoá database do chính lần chạy này tạo.\n'
