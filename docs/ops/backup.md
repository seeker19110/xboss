# Backup & phục hồi (Disaster Recovery)

> Cụ thể hóa lớp "Vận hành" của M44 — chính sách backup có **kiểm chứng phục hồi**, không chỉ
> "có chạy pg_dump là xong". Liên kết: [`docs/ops/incident-response.md`](./incident-response.md)
> (khi backup này thực sự cần dùng, tức đang xử lý sự cố), [`docs/ops/staging.md`](./staging.md)
> (môi trường tập dượt phục hồi/migration trước khi đụng dữ liệu thật).

## Mục tiêu (SLA nội bộ)

| Chỉ số                             | Mục tiêu | Ý nghĩa                                                                         |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------- |
| **RPO** (Recovery Point Objective) | ≤ 24 giờ | Mất nhiều nhất dữ liệu của 1 ngày làm việc — backup chạy hằng đêm.              |
| **RTO** (Recovery Time Objective)  | ≤ 4 giờ  | Từ lúc phát hiện mất DB/VPS tới lúc app chạy lại với dữ liệu gần nhất, ≤ 4 giờ. |

> **Bảng trên là năng lực của luồng `pg_dump` hằng đêm hiện có, KHÔNG phải mục tiêu nghiệm thu.**
> Mục tiêu đã chốt ở QUALITY-FINAL-1 (D08, `docs/nang-cap/AUDIT-2026-09-25/APPROVAL.md` §9):
> **RPO ≤ 5 phút, RTO ≤ 60 phút, cửa sổ PITR 35 ngày** (base backup + WAL liên tục). Luồng hiện
> có chưa đạt D08; verifier ở mục [Recovery manifest v1 + verifier](#recovery-manifest-v1--verifier-s14--a6)
> báo các hạng mục đó là `NOT_RUN` cho tới khi có số đo hạ tầng thật — không được hạ target để PASS.

**Nguyên tắc cốt lõi: "Backup chưa restore được = chưa có backup."** Vì vậy có **2 script riêng biệt** —
`backup.sh` (tạo bản sao) và `restore-check.sh` (chứng minh bản sao đó thực sự phục hồi được) — chạy
định kỳ độc lập, không tin tưởng "chắc là backup ổn" chỉ vì `pg_dump` không báo lỗi.

## Thành phần được backup

1. **Database** (`pg_dump -Fc`, custom format — nén sẵn, phục hồi chọn lọc được từng bảng nếu cần).
2. **`data/uploads/`** — ảnh hiện trường + biên bản nghiệm thu + hồ sơ hợp đồng/claim/VO (không nằm
   trong DB, mất là mất vĩnh viễn, nên đóng gói cùng RPO 24h với DB).

Không backup: `node_modules/`, `.next/` (build lại được từ Git + `npm ci`), log file.

## Script

- **`scripts/ops/backup.sh`** — `pg_dump -Fc "$DATABASE_URL"` + `tar czf` thư mục uploads thành
  một recovery set có ID duy nhất → đẩy artifact và manifest ra ngoài máy qua `rclone` (đích cấu hình qua biến
  `BACKUP_REMOTE`, xem bên dưới) → dọn bản cũ (local > 35 ngày, remote > 90 ngày, đổi qua
  `LOCAL_RETENTION_DAYS`/`REMOTE_RETENTION_DAYS` nếu cần).
- **`scripts/ops/restore-check.sh`** — lấy manifest recovery set mới nhất, kiểm integrity, rồi chỉ tạo DB phục hồi mới trên
  PostgreSQL disposable đã đánh dấu. Script yêu cầu `RESTORE_SOURCE_URL` (chỉ để so danh tính),
  `RESTORE_TARGET_URL` (credentials riêng), `RESTORE_TARGET_DATABASE` (tên DB mới) và
  `RESTORE_TARGET_MARKER` khớp COMMENT đã cài trên DB điều khiển disposable. Nguồn/đích phải khác
  host/port và user; target credentials không được là superuser. Marker thiếu/sai, host giống
  nguồn, host/DB production-like, DB target đã tồn tại hoặc không kiểm được identity đều dừng
  trước `CREATE DATABASE`. DB mới chỉ bị DROP bởi trap nếu chính lần chạy hiện tại tạo thành công.
  Script không dùng `DATABASE_URL` làm target.

Mỗi lần chạy `backup.sh` tạo một `recoverySetId` riêng và các file cùng ID: dump, archive uploads
và `xboss-<id>.manifest.json`. Dump/archive được ghi qua file tạm rồi đổi tên; manifest JSON ghi
đường dẫn tương đối, kích thước, SHA-256 của từng artifact và trạng thái `COMPLETE` hoặc `PARTIAL`,
rồi được finalize bằng rename sau khi đã kiểm kê artifact. Thiếu `data/uploads/` tạo manifest
`PARTIAL`; restore-check từ chối set này. Nếu tạo artifact thất bại, manifest không được phát hành,
file dump/archive mới của lần lỗi được dọn. Set `PARTIAL` hoặc lỗi tạo artifact trả mã lỗi, không
đẩy manifest/artifact mới lên remote. Lượt `PARTIAL` chỉ dọn file `.partial`, set `PARTIAL`,
artifact mồ côi và các set đã quá tuổi retention, giữ set `COMPLETE` local gần nhất; lượt backup
đầy đủ mới chạy remote retention. Khi đẩy remote, manifest được copy sau các artifact.

`restore-check.sh` chọn manifest mới nhất và kiểm schema, set ID, đủ hai artifact, tồn tại, size và
SHA-256 trước mọi kết nối PostgreSQL; sau đó dùng `tar -tzf` để xác nhận archive uploads có thể
được đọc/liệt kê, cũng trước khi kết nối. Script có thể tạo credential file tạm để phân tích target
trước bước integrity check, nhưng manifest/artifact sai hoặc archive không đọc được sẽ dừng trước
mọi lệnh `psql`/`pg_restore`. Kiểm tra này không giải nén archive hay xác nhận mọi attachment
critical được khôi phục đúng. Manifest hiện nằm cạnh artifact trong backup directory;
SHA-256 giúp phát hiện thiếu/hỏng file nhưng không chứng minh chống sửa nếu người có quyền sửa được
cả manifest lẫn artifact.

Retention artifact local mặc định 35 ngày theo cửa sổ A6; cleanup theo set ID và giữ set
`COMPLETE` local mới nhất. Manifest nhỏ của set cũ có thể được giữ tới khi hết remote retention để
remote cleanup có thể xóa đúng set; sau khi artifact local hết retention, restore-check sẽ fail
đóng nếu chọn manifest mà artifact không còn. Artifact `.partial` và artifact mồ côi chỉ bị dọn
sau tuổi local retention. Remote cleanup chỉ xóa các set `COMPLETE` cũ theo set ID và giữ set
`COMPLETE` mới nhất còn được manifest cục bộ tham chiếu. Các mốc này là cấu hình script, không
chứng minh retention thực tế của provider hoặc môi trường production.

Đây là integrity gate cho cặp dump/uploads hiện tại, không phải full recovery manifest của A6.
`restore-check.sh` kiểm size/hash và khả năng đọc/liệt kê uploads archive bằng `tar -tzf`, nhưng
**không giải nén hoặc xác nhận mọi attachment được khôi phục đúng**. Nó cũng không xác thực
WAL/PITR, object version, key reference hay migration checksum, và không chứng minh RPO/RTO.
Kết quả restore smoke không được dùng làm PITR PASS.

Cả hai là script Bash, không phải TypeScript. `restore-check.sh` cần Bash, Python 3 standard library
để phân tích URI mà không lộ credential, và `pg_restore`/`psql` từ gói `postgresql-client`; không
phụ thuộc Node/npm.

## Cấu hình `rclone` (đẩy backup ra ngoài VPS)

Backup chỉ nằm trên cùng VPS với DB gốc thì **không chống được mất cả VPS** (sự cố phần cứng,
nhà cung cấp khoá tài khoản...). Bắt buộc đẩy 1 bản ra nơi khác:

```bash
# Cài rclone (1 lần trên VPS)
curl https://rclone.org/install.sh | sudo bash

# Cấu hình remote (ví dụ Google Drive hoặc bất kỳ dịch vụ S3-compatible) — làm theo
# hướng dẫn tương tác của "rclone config", đặt tên remote (ví dụ "gdrive").
rclone config

# Đặt biến môi trường cho backup.sh (thêm vào ~/.bashrc hoặc file env riêng của cron)
export BACKUP_REMOTE="gdrive:xboss-backups"
```

Thiếu `BACKUP_REMOTE` → `backup.sh` vẫn chạy (backup local vẫn có ích cho phục hồi nhanh mất-DB-
không-mất-VPS) nhưng in cảnh báo rõ ràng — **không đạt RPO/RTO nếu mất cả VPS**.

## Crontab mẫu (trên VPS, user chạy app)

```cron
# Backup DB + uploads hằng đêm 01:00 (giờ ít người dùng app nhất)
0 1 * * * cd /path/to/xboss && export $(grep -E '^(DATABASE_URL|BACKUP_REMOTE)=' .env.local | xargs) && bash scripts/ops/backup.sh >> logs/backup.log 2>&1

# Kiểm chứng phục hồi Chủ nhật 02:00. File env chỉ operator đọc được, không ghi secret ra log.
0 2 * * 0 cd /path/to/xboss && set -a && . /etc/xboss/restore-check.env && set +a && bash scripts/ops/restore-check.sh >> logs/restore-check.log 2>&1
```

### Chuẩn bị target disposable cho `restore-check.sh`

Tạo riêng một PostgreSQL sandbox, khác host/port với nguồn. `RESTORE_TARGET_URL` dùng địa chỉ
IP private/loopback cụ thể của sandbox (không dùng IP public hoặc alias DNS); script đối chiếu địa chỉ server thực tế và từ chối
nếu IP đích trùng nguồn sau phân giải. Dùng role riêng không phải
superuser, có quyền `CREATEDB`; role này không được dùng bởi ứng dụng và phải khác role nguồn.
Tạo DB điều khiển rỗng, ví dụ `restore_control`, rồi administrator gắn marker không đoán được:

```sql
COMMENT ON DATABASE restore_control IS 'xboss-disposable:<token-ngau-nhien-tu-32-ky-tu>';
```

Đặt các biến `RESTORE_*` trong `/etc/xboss/restore-check.env`, thuộc owner của user chạy cron
và mode `0600`; cron source file trực tiếp, không dùng `export $(grep ... | xargs)` để tránh
hiện nội dung secret trong lệnh/logs.
`RESTORE_TARGET_DATABASE` phải là tên mới, chữ thường/số/underscore, ví dụ
`xboss_restore_check_weekly`; script từ chối nếu tên đã tồn tại. Không đặt `RESTORE_TARGET_URL`
trỏ vào database nguồn, production, hoặc dùng chung credentials app. Re-run sau một lần bị dừng
đột ngột cần operator kiểm tra và tự xử lý DB sót lại; script chủ động không DROP DB có sẵn vì
nó không thể chứng minh DB đó do lần chạy hiện tại tạo.

Gợi ý gửi kết quả qua Telegram — đặt `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` cùng file
`/etc/xboss/restore-check.env` đã giới hạn mode `0600`, rồi dùng entry sau (file env được source
trước cả restore-check lẫn cảnh báo):

```cron
0 2 * * 0 /bin/bash -c 'cd /path/to/xboss && set -a && . /etc/xboss/restore-check.env && set +a && bash scripts/ops/restore-check.sh >> logs/restore-check.log 2>&1 || curl -sS --config - < <(echo "url = \"https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage\""; echo "data = \"chat_id=${TELEGRAM_CHAT_ID}\""; echo "data-urlencode = \"text=⚠️ XBoss restore-check THẤT BẠI — xem logs/restore-check.log\"")'
```

## Uptime monitor (đăng ký tay, không phải script)

Sau khi có `GET /api/health` (M44 PR2), đăng ký 1 uptime monitor ngoài ping endpoint này mỗi phút —
thao tác tay của admin, không tự động hoá trong repo:

1. Đăng ký tài khoản free tier [UptimeRobot](https://uptimerobot.com) hoặc [BetterStack](https://betterstack.com/uptime).
2. Thêm monitor HTTP(S) trỏ tới `https://<domain-production>/api/health`, chu kỳ 1 phút.
3. Cấu hình cảnh báo khi HTTP status khác 200 (endpoint trả 503 khi DB fail) — gửi email/Telegram/SMS
   tuỳ gói.

## Quy trình phục hồi — kịch bản "mất DB" (VPS còn sống)

RTO mục tiêu: ≤ 4 giờ (thực tế nhanh hơn nhiều nếu backup local còn nguyên).

1. **Dừng app** để không ghi dữ liệu mới vào DB hỏng: `pm2 stop xboss`.
2. Xác định bản dump gần nhất dùng được: `ls -t backups/xboss-*.dump | head -1` (hoặc tải từ
   `BACKUP_REMOTE` nếu local cũng mất: `rclone copy "$BACKUP_REMOTE" backups/ --include 'xboss-*.dump'`).
3. Tạo DB mới (không ghi đè DB cũ nếu còn — đổi tên trước để giữ lại điều tra nguyên nhân):
   ```bash
   psql "$MAINT_URL" -c "ALTER DATABASE xboss RENAME TO xboss_broken_$(date +%s);"
   psql "$MAINT_URL" -c "CREATE DATABASE xboss;"
   pg_restore --no-owner --no-privileges -d "$DATABASE_URL" backups/xboss-<ngày-gần-nhất>.dump
   ```
4. Phục hồi `data/uploads/` nếu cũng mất: `tar xzf backups/xboss-uploads-<ngày>.tar.gz -C /`.
5. Chạy migration để đảm bảo schema khớp code hiện tại (backup có thể cũ hơn vài migration):
   `npm run db:migrate`.
6. Khởi động lại app: `pm2 start xboss` (hoặc `pm2 reload xboss --update-env`).
7. Kiểm tra nhanh qua `/api/health` (status `ok`, `db: true`) + đăng nhập thử + xem 1-2 trang có
   dữ liệu quan trọng (dashboard, `/contracts`).
8. Viết post-mortem theo mẫu trong `docs/ops/incident-response.md` — dữ liệu mất giữa lần backup
   cuối và lúc sự cố (tối đa ~24h theo RPO) cần liệt kê rõ trong mục "Ảnh hưởng".

## Quy trình phục hồi — kịch bản "mất cả VPS"

RTO mục tiêu: ≤ 4 giờ — cần chuẩn bị trước (không phải lúc sự cố mới tìm hiểu):

1. Dựng VPS mới (hoặc máy dự phòng) theo `DEPLOY.md` — cài Node, PostgreSQL, pm2, nginx/certbot.
2. Clone repo từ GitHub (nguồn sự thật của code — VPS cũ mất không mất code).
3. Tải bản dump + tar uploads mới nhất từ `BACKUP_REMOTE`:
   ```bash
   rclone copy "$BACKUP_REMOTE" backups/ --include 'xboss-*'
   ```
4. Tạo DB `xboss` mới, `pg_restore` như kịch bản trên, giải nén uploads vào `data/uploads/`.
5. Tạo lại `.env.local` từ **kho secret riêng** (không lưu trong Git) — xem mục xoay secret bên dưới.
6. `npm ci && npm run db:migrate && npm run build && pm2 start ...` (theo `DEPLOY.md`).
7. Trỏ DNS domain production sang IP mới (hoặc cập nhật load balancer/reverse proxy).
8. Kiểm tra `/api/health` + đăng nhập + post-mortem như trên.

## Xoay secret sau sự cố mất VPS

Nếu VPS bị xâm nhập (không chỉ hỏng phần cứng) — coi mọi secret trên máy đó là **lộ**, phải xoay hết
trước khi đưa VPS mới lên production:

- `XBOSS_SECRET` — đổi giá trị mới → **mọi session hiện tại bị vô hiệu** (chấp nhận được, user đăng
  nhập lại).
- `DATABASE_URL` mật khẩu Postgres — đổi mật khẩu user DB.
- `CRON_SECRET` — đổi, cập nhật lại nơi gọi cron ngoài (nếu có).
- `SMTP_PASS`, `TELEGRAM_BOT_TOKEN`, `VAPID_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`,
  `SENTRY_AUTH_TOKEN` — thu hồi/tạo lại key tại nơi cấp (Gmail App Password, BotFather `/revoke`,
  Google Cloud Console, Sentry Settings).
- Rà soát tài khoản user trong DB phục hồi — nếu nghi có tài khoản bị tạo trái phép trong lúc bị
  xâm nhập, khoá/xoá trước khi mở lại truy cập.

## Recovery manifest v1 + verifier (S14 / A6)

Bộ công cụ chỉ-đọc để **chứng minh một bản khôi phục khớp đúng recovery set** (A6-FR01/FR05/FR07),
không chỉ "restore chạy được". Gồm 2 lệnh, chạy tay bởi operator, **không** tạo cron/lịch, không
đẩy remote, không gọi dịch vụ ngoài, không DDL:

| Lệnh                                           | Chạy trên                         | Việc                                                                 |
| ---------------------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `npx tsx scripts/lib/recovery-manifest-cli.ts` | DB **nguồn** (role audit chỉ-đọc) | Chụp snapshot, (tuỳ chọn) `pg_dump` CÙNG snapshot, ghi manifest v1   |
| `npm run audit:verify-dr -- <cờ>`              | DB **đích** đã restore, cách ly   | Đối chiếu đích với manifest, in JSON PASS/FAIL/NOT_RUN từng hạng mục |

Kết quả trên đích cách ly/fixture **chưa phải** bằng chứng PITR thật, RPO/RTO production hay nghiệm
thu phát hành (`completeDrVerified` chỉ `true` khi MỌI hạng mục, kể cả hạ tầng, đều PASS).

### Bước 0 — Role audit (một lần, do DBA tạo)

Verifier/bộ sinh manifest phải đọc **toàn phần** — role app (`xboss_app`, NOBYPASSRLS) bị RLS lọc nên
không dùng được (số 0 do policy che không được coi là "không vi phạm"). Tạo role riêng, không superuser,
chỉ đọc, trên **nguồn** và trên **server đích**:

```sql
CREATE ROLE xboss_dr_audit LOGIN NOSUPERUSER BYPASSRLS PASSWORD '<đặt qua kho secret>';
GRANT pg_read_all_data TO xboss_dr_audit;
```

Thiếu BYPASSRLS/quyền SELECT → hạng mục `audit-role-access` và mọi hạng mục đọc bảng bị chặn ra
`NOT_RUN` (không PASS, không FAIL giả). Mật khẩu chỉ nằm trong file env mode `0600`, không vào lệnh.

### Bước 1 — Sinh manifest v1 trên nguồn

```bash
set -a && . /etc/xboss/dr-source.env && set +a   # DR_SOURCE_DATABASE_URL / _EXPECTED_DATABASE / _EXPECTED_USER
ID="$(date -u +%Y%m%dT%H%M%SZ)-$(python3 -c 'import uuid; print(uuid.uuid4())')"
npx tsx scripts/lib/recovery-manifest-cli.ts \
  --recovery-set-id "$ID" \
  --out "backups/xboss-$ID.recovery-v1.json" \
  --pg-dump "backups/xboss-$ID.snapshot.dump" \
  --attachments-dir data/uploads \
  --key-provider <tên-kho-key> --key-id <tham-chiếu-key> --key-version <phiên-bản> \
  --app-sha "$(git rev-parse HEAD)"   # [--base-backup-id <id base backup PITR nếu có>]
```

- Mở `REPEATABLE READ READ ONLY`, kiểm DB/role kỳ vọng, `pg_export_snapshot()` rồi chạy
  `pg_dump --snapshot` → **dump và manifest mô tả cùng một thời điểm** (A6-FR03). Kết nối của
  `pg_dump` truyền qua biến `PG*`, không có URI trong argv.
- Manifest ghi: recoverySetId, băm danh tính nguồn (không host/user), thời điểm, phiên bản
  PostgreSQL/công cụ, appSha, baseBackupId, LSN/timeline lúc chụp, migration name + SHA-256 tệp,
  số dòng + digest của các bảng trọng yếu, tổng tiền exact (chuỗi), digest ràng buộc/policy/
  trigger/hàm, watermark audit, tệp critical (key/size/SHA-256) và **tham chiếu** key mã hoá.
- Tệp critical = `task_documents`, `contract_documents`, `vo_documents`, `claim_documents` (các
  bảng có cột `sha256` từ migration 0050). Thiếu tệp hoặc lệch size/hash so với DB → **không phát
  hành manifest** (exit 1). Lưu trữ S3: đồng bộ phiên bản object về một thư mục cục bộ rồi trỏ
  `--attachments-dir` vào đó (chưa ghi `version` object — xem Giới hạn).
- Không có `--key-provider/--key-id` → manifest ghi `encryptionKeyReference: null` và verifier sẽ
  FAIL hạng mục key. Validator **từ chối** manifest có URI kèm mật khẩu, PEM, trường tên
  password/secret/token…, hoặc keyId trông như key thô.
- Đặt tên `*.recovery-v1.json` — **không** đặt `*.manifest.json` (định dạng cũ `restore-check.sh`
  đọc). Tệp ghi mode `0600`, không ghi đè; cất ở nơi chống sửa mà chỉ người có quyền dữ liệu đọc.

### Bước 2 — Restore vào đích cách ly

Theo mục [Chuẩn bị target disposable](#chuẩn-bị-target-disposable-cho-restore-checksh): server
sandbox khác host/port nguồn, tắt egress/cron/email/Telegram/webhook. Tạo DB mới,
`pg_restore --no-owner --exit-on-error -d <db_moi> backups/xboss-$ID.snapshot.dump`, giải nén/
sao chép tệp đính kèm sang thư mục riêng, rồi gắn marker lên DB đích (hoặc dùng DB điều khiển):

```sql
COMMENT ON DATABASE <db_moi> IS 'xboss-disposable:<token-ngau-nhien-tu-16-ky-tu>';
```

### Bước 3 — Chạy verifier

```bash
set -a && . /etc/xboss/dr-verify.env && set +a
# DR_VERIFY_DATABASE_URL (role audit trên đích), DR_VERIFY_EXPECTED_DATABASE, DR_VERIFY_EXPECTED_USER,
# DR_VERIFY_EXPECTED_MARKER, (tuỳ chọn) DR_VERIFY_MARKER_DATABASE nếu marker nằm ở DB điều khiển.
npm run audit:verify-dr -- \
  --manifest "backups/xboss-$ID.recovery-v1.json" \
  --attachments-dir /srv/restore/uploads \
  --artifacts-dir backups \
  --app-sha "$(git rev-parse HEAD)" \
  --evidence-out "logs/dr-verify-$ID.json"
```

Trước khi kết nối, verifier chặn: đích trùng `DATABASE_URL`/`MIGRATE_DATABASE_URL` (cùng
host:port/db dù khác credential) và đích có danh tính trùng nguồn ghi trong manifest. Sau khi kết
nối, truy vấn đầu tiên chỉ kiểm DB/role/chế độ chỉ-đọc/marker — sai bất kỳ điều nào thì dừng trước
mọi truy vấn bảng nghiệp vụ. Mọi kiểm tra chạy trong một transaction `REPEATABLE READ READ ONLY`
rồi `ROLLBACK`; không dùng pool/auto-migrate của app; không in URI/mật khẩu/marker.

### Đọc kết quả

JSON có `recoverySetId`, `appSha`, `startedAt/completedAt`, `counts`, `fixtureChecksPassed`,
`completeDrVerified` và `results[]` (mỗi mục: `name`, `status`, `evidence` = `fixture` |
`infrastructure`, `reason`, `expected`/`actual`). **Exit ≠ 0 khi có bất kỳ FAIL hoặc NOT_RUN.**
`--evidence-out` không ghi đè tệp cũ — giữ bằng chứng cả lần thất bại (A6-AC06).

| Hạng mục                                    | PASS khi                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `source-distinct`, `target`                 | Đích khác nguồn; DB/role/marker/chỉ-đọc khớp                                       |
| `manifest`, `app-sha`                       | Manifest v1 hợp lệ; app SHA đang dùng khớp snapshot                                |
| `audit-role-access`                         | Role đọc toàn phần mọi bảng trọng yếu (không bị RLS/quyền chặn)                    |
| `migration-names`, `migration-checksums`    | Tên migration khớp mã nguồn; tên + SHA-256 khớp manifest                           |
| `table-digests`, `finance-totals`           | Số dòng + digest từng bảng; tổng tiền so **chuỗi exact**                           |
| `schema-objects`                            | Ràng buộc, policy RLS, trigger, hàm, extension khớp snapshot                       |
| `integrity:<luật>`                          | 0 dòng mồ côi/lệch org-project (danh sách luật trong `scripts/lib/dr-snapshot.ts`) |
| `audit-chain`, `audit-watermark`            | Hash-chain hợp lệ, phủ 100%; số dòng/id/hash cuối khớp (bắt mất đuôi)              |
| `attachments-manifest`, `attachments-files` | Mọi tệp critical DB tham chiếu có trong manifest; tệp khôi phục đủ + hash khớp     |
| `backup-artifacts`                          | Artifact backup (dump) còn đủ, size/SHA-256 khớp                                   |
| `encryption-key-reference`                  | Manifest có tham chiếu key (không chứa key)                                        |
| `encryption-key-availability`               | Luôn `NOT_RUN` — verifier không truy cập kho key                                   |
| `wal-coverage`, `rpo`, `rto`                | Chỉ khi manifest có số đo, so với D08 (≤300s, ≤3600s, ≥35 ngày, 0 đoạn thiếu)      |

Manifest cũ của `backup.sh` (`schemaVersion: 1`) vẫn đọc được: chỉ `backup-artifacts` chạy được,
các hạng mục cần dữ liệu v1 là `NOT_RUN` (không FAIL cả bộ, không PASS giả).

### Hạng mục `NOT_RUN` còn cần hạ tầng gì

- **`wal-coverage` (Q-AC08):** bật `archive_mode`/`archive_command` tới kho chống sửa,
  `pg_basebackup` hằng ngày, giữ WAL + base backup phủ đủ 35 ngày; manifest phải có `baseBackupId`
  và khối `wal` (timeline, startLsn/endLsn, windowStart/windowEnd, `missingSegments`) **đo từ archive
  thật**. Diễn tập phục hồi ở điểm gần hiện tại và ở mép 35 ngày.
- **`rpo` / `rto` (A6-AC05):** RPO đo bằng giao dịch canary + độ trễ archive/replication object;
  RTO đo từ lúc bắt đầu sự cố tới khi app sẵn sàng + smoke/UAT xong (gồm tìm key, tải backup, restore
  DB/tệp). Ghi vào khối `measurements` (measuredAt, workload, sourceResolution, rpoSeconds,
  rtoSeconds, recoveryTargetLsn, timeline). Thiếu số đo là `NOT_RUN`; vượt target là `FAIL`.
- **`encryption-key-availability`:** cần quy trình mở key thật trên đích cách ly (kho key/KEK
  tách riêng) — chưa có trong repo.

### Giới hạn của bộ verifier

- Digest dùng `string_agg` của SHA-256 từng dòng: tối đa ~16 triệu dòng/bảng; vượt thì truy vấn
  lỗi và hạng mục FAIL (đóng), không PASS. So danh tính bằng host:port/db — không phát hiện alias
  DNS; operator vẫn kiểm topology.
- Khối `wal`/`measurements` do người vận hành ghi vào manifest từ hệ thống đo; verifier chỉ so với
  D08, không tự chứng minh số đo.
- Chưa ghi `version` của object S3; `backup.sh` chưa tự sinh manifest v1 (tích hợp sẽ đổi lệnh
  `pg_dump` sang `--snapshot` — cần quyết định riêng).

## Vị trí backup

- **Local**: `backups/` trong thư mục project trên VPS (ngoài `.gitignore` — không commit vào Git).
- **Remote**: đích cấu hình qua `BACKUP_REMOTE` (Google Drive/S3-compatible tuỳ chọn của admin lúc
  triển khai — xem mục cấu hình `rclone` ở trên).

## Giới hạn đã biết

- Chưa có PITR (point-in-time recovery qua WAL archiving) — RPO thực tế = khoảng cách giữa 2 lần
  backup (mục tiêu hằng đêm = tối đa ~24h dữ liệu mất, đúng SLA đã đặt). Nếu cần RPO chặt hơn sau
  này, cân nhắc bật `wal_archive`/`pg_basebackup` liên tục — ngoài phạm vi M44.
- `restore-check.sh` kiểm tra schema restore được + có dữ liệu, **không** kiểm tra business logic
  đúng đắn (ví dụ tổng tiến độ tính đúng) — coi là smoke test tối thiểu, không thay thế test tích hợp.
