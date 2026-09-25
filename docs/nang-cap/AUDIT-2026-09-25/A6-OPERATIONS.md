# A6 — Restore có bằng chứng, phát hành an toàn và final audit

State: In review. Dùng nguồn S08/E05 và hợp đồng chung README.md.
Đọc/soạn runbook có thể đi song song; thao tác trên môi trường thật phải có quyền riêng.
Không coi PR tài liệu hay CI ứng dụng là một lần diễn tập khôi phục.

## 1. Hiện trạng, mục tiêu và phương án

scripts/verify-dr-restore.ts kiểm kết nối, migration name, đếm một số bảng, audit hash chain
và quan hệ engineering khác project. Đây là verifier sau restore, không tự chứng minh backup
khôi phục được, file upload còn đủ, migration không bị sửa hoặc dữ liệu không bị mất.
Không thực hiện backup/restore trong phiên viết đặc tả này.

Không làm: có backup nhưng không biết phục hồi được. Chỉ kiểm script exit 0: coverage hẹp.
Chọn manifest + restore vào môi trường cách ly + đối soát dữ liệu/files/quyền + UAT.
Default để duyệt: RPO <= 24 giờ, RTO <= 4 giờ. Đây là mục tiêu đề xuất chi phí thấp, không
phải SLA đã đạt hoặc đã được chấp thuận. Nhu cầu mất dữ liệu ít hơn phải duyệt chiến lược
base backup+WAL/PITR hoặc dịch vụ tương ứng; không quảng cáo pg_dump là PITR.

## 2. Phạm vi backup và manifest

A6-FR01: một recovery set gồm DB snapshot nhất quán, file upload/object-storage được tham
chiếu, phiên bản ứng dụng, migration file+checksum, cấu hình hạ tầng và danh sách secret/key
cần phục hồi bằng secret manager. Không đưa giá trị secret/private key vào Git/artifact công khai.
Thông tin role/grants/RLS, extension và timezone thuộc manifest. File đính kèm ngoài DB
không được mặc định đã có trong DB backup.

Manifest schema đề xuất: recoverySetId, sourceEnvironmentId, backupStartedAt/CompletedAt,
dbSnapshotId hoặc điểm WAL, appSHA, postgresMajor, migrations[{name,sha256}], bảng rowCounts,
canonical financial totals theo project đã phép, audit-chain watermark/coverage,
attachment manifest key+size+hash/version, encryptionKeyReference và tool versions.
Manifest phải được lưu chống sửa trong kho được phép; quyền đọc tương ứng dữ liệu nhạy cảm.
Không ghi tên người/hợp đồng nếu chỉ technical ID/hash đủ đối soát.

DB và object files cần điểm nhất quán: dùng object version/immutable key, giữ versions đã được
DB snapshot tham chiếu và manifest cùng recovery set. Không so dump ở T0 với danh sách files
hiện tại T1 rồi báo đầy đủ. Nếu snapshot boundary không đồng bộ được thì runbook phải nêu
cửa sổ sai lệch, cơ chế đối soát và no-go khi thiếu attachment quan trọng.

A6-FR02: mã hóa backup, tách quyền ứng dụng khỏi quyền xóa backup; giữ ít nhất một bản sao
ở miền lỗi khác là đề xuất vận hành cần owner duyệt. Retention, nơi lưu và chi phí không
được tự cấu hình. Định kỳ kiểm checksum/tải thử; kích thước file >0 không chứng minh hợp lệ.

## 3. Quy trình diễn tập không phá production

Bước 1: owner xác nhận recovery set, môi trường nguồn/đích, quyền đọc dữ liệu và mục tiêu
RPO/RTO. Dùng dữ liệu tổng hợp trước; snapshot thật chỉ khi có phép và bảo vệ PII.
Bước 2: dựng DB/namespace rỗng tên riêng, network egress bị chặn; tắt cron/email/Telegram/
webhook/Sheet/provider. Credential đích khác nguồn và không có quyền tới DB production.
Bước 3: preflight xác minh hostname/port/database/user/marker đích; nếu trùng production,
không có marker disposable hoặc người vận hành chưa xác nhận thì dừng trước bất kỳ ghi nào.
Không dùng NODE_ENV hay hậu tố tên DB làm bằng chứng duy nhất rằng đích an toàn.
Bước 4: tải và kiểm checksum recovery set, giải mã trong vùng tạm hạn chế quyền; restore DB
và attachments theo công cụ/phiên bản hỗ trợ. Không tự thêm --clean vào lệnh nguồn đang chạy.
Bước 5: ghim app SHA tương ứng snapshot, so migration checksum. Verifier chỉ được đọc; không
dùng helper auto-migrate để vô tình nâng schema trong phép đối soát. Mọi pending migration
chạy ở giai đoạn nâng cấp riêng có log, không trộn với bằng chứng restore snapshot.
Bước 6: chạy ma trận dưới với role kiểm chứng thích hợp; kiểm app bằng role NOBYPASSRLS
khác role restore/owner. Bước 7: ghi timestamps/độ mất dữ liệu/bằng chứng UAT và kết luận.
Bước 8: owner duyệt kết quả; chỉ sau đó hủy bản sao theo retention đã định. Không tự xóa
môi trường diễn tập để che một lần restore thất bại.

## 4. Contract verifier đích

Tái dùng `npm run audit:verify-dr` và `audit:verify-chain` sau khi sửa preflight/coverage trong
slice S14; không suy rằng các cờ mới dưới đây đã tồn tại trong scripts hiện tại.
Verifier đích nhận manifest path, expected target identity và evidence output path qua CLI
được đặc tả trong slice; không nhận secret bằng command-line gây lộ process list.
Output JSON có checkId, status PASS/FAIL/NOT_RUN, expected/actual digest hoặc count,
startedAt/finishedAt, target identity đã rút gọn, appSHA và reason. Có exit != 0 khi FAIL hoặc
bắt buộc NOT_RUN. “Không kiểm được” không được chuyển thành PASS. Không in raw DB URI.

A6-FR03: bắt buộc kiểm:

- Migration cả tên và checksum khớp app snapshot, không thừa/thiếu/sửa file âm thầm.
- Row counts và deterministic checksum/totals từ snapshot manifest; không chỉ query được bảng.
- Foreign key orphan, constraint chưa validate và quan hệ chéo project/org trên toàn inventory
  trọng yếu của A1/A5, không chỉ engineering_relations. Count=0 do RLS che dữ liệu không là PASS.
- Audit hash chain đúng và coverage ký đủ theo policy; “0/0 được ký” không là bằng chứng đầy đủ.
- Chuỗi task/BOQ/contract/IPC/payment và tổng tiền canonical theo A3/A4 khớp nguồn snapshot.
- Attachment tồn tại, dung lượng/hash đúng và mở được qua API với quyền đúng; file bị cấm
  không mở được bằng direct URL/role khác. Critical files phải đủ 100%, không lấy sample thay.
- users/roles/membership/2FA/session revocation hoạt động, không sinh demo users qua HTTP.
- Smoke login, switch project, read tracking, nghiệm thu/phát hành test trên dữ liệu tổng hợp,
  export và logout; không gửi thông báo thật ra hệ ngoài.

A6-FR04: ghi RPO thực tế từ mốc giao dịch nguồn gần nhất có thể chứng minh tới mốc giao dịch
cuối phục hồi; chỉ có timestamp backup không được bịa RPO transaction-level. Ghi rõ độ phân
giải của bằng chứng. RTO đo từ tuyên bố bắt đầu phục hồi tới hoàn tất readiness/UAT, gồm
thời gian tìm backup/key/restore/files/app/check, không chỉ thời gian pg_restore.
Không có marker nguồn phù hợp thì mục đo là NOT_RUN và chưa đạt target.

## 5. Acceptance và fault injection

A6-AC01: restore fixture mới đủ DB+file+permission+money+audit; manifest và appSHA khớp,
đích cách ly, không outbound side effects. Test pipeline disposable.
A6-AC02: làm hỏng checksum backup, thiếu attachment critical, thiếu key hoặc migration
mismatch: từng lỗi phải FAIL rõ, không báo “toàn bộ đạt”. Test không dùng secret thật.
A6-AC03: cố cấu hình URI production/không marker: preflight chặn trước ghi; diagnostics
không tự migrate và không lộ URI/secret.
A6-AC04: nhập fixture cross-org/orphan/audit tamper hoặc role BYPASSRLS: verifier phát hiện;
kiểm admin UI không thay cho truy vấn toàn vẹn bằng role kiểm toán có kiểm soát.
A6-AC05: RPO/RTO có timestamps, manifest và nguồn đối chiếu; kết quả chưa đo không được
đánh dấu đạt. Operator khác có thể lặp runbook mà không dựa vào lịch sử chat.
A6-AC06: phục hồi lỗi giữ bằng chứng, không ghi đè backup tốt hoặc phá nguồn; cleanup có phê duyệt.

## 6. Cổng phát hành sau A1–A5

Release evidence phải có: main SHA, các PR đã merge, AC→test/artifact, output release-gate,
PostgreSQL/RLS đúng role, E2E desktop/mobile, axe, browser offline thật, đối soát tiền/báo cáo,
UAT đủ role và restore drill. Một test critical bị skip = chưa đạt, trừ ngoại lệ được owner
duyệt với lý do/phạm vi/rủi ro rõ ràng; không sửa allowlist để che failure mới.

Đề xuất trình tự vận hành sau phê duyệt: backup xác minh → compatibility/membership/queue
preflight → staging → canary nhóm pilot → đối soát → mở rộng → quan sát 24 giờ.
Cửa sổ 24 giờ là đề xuất để owner duyệt, không là lịch tự động được tạo bởi tài liệu này.
Một canary cross-project/sai tiền/mất draft/bypass nghiệm thu là stop tức thì. Performance
regression vượt 20% cùng điều kiện phải điều tra trước mở rộng.

Rollback phân ba lớp: code về phiên bản tương thích schema/queue; tắt khả năng lỗi nhưng
không mở lại cache chung/fallback scope; dữ liệu đã chốt sửa bằng forward-fix/reversal được
duyệt. Không down-migrate kiểu phá hủy, không reset DB hoặc admin production tự động.
Operator quyết định restore thật là sự kiện riêng, có impact/RPO chấp thuận.

## 7. Ownership, quan sát và final audit

Đầu mối triển khai, chủ dữ liệu tài chính, reviewer bảo mật và người vận hành backup phải
được điền ở APPROVAL. Alert backup_age, restore_check_failure, missing_attachment và
reconciliation_failure không chứa PII; lịch monitor là việc vận hành cần xác nhận, chưa bật.

Đóng goal chỉ khi mọi slice bắt buộc có evidence trên main, không còn P0/P1 liên quan,
không còn migration/backfill/queue legacy dang dở, đã UAT và owner duyệt vận hành.
Tách CODE_COMPLETE khỏi RELEASE_VERIFIED; docs complete hoặc CI green không đồng nghĩa
production hoàn thiện. Báo residual risk và out-of-scope, kể cả các phiên bản browser chưa test.
Không cần DDL cho runbook/verifier; thay schema thiếu do A1/A5 phải qua slice schema riêng.
