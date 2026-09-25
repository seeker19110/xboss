# A6 — Khôi phục theo thời điểm và phát hành có bằng chứng

State: **Approved for implementation**, QUALITY-FINAL-1, 2026-09-25; thi hành sau.
Decisions D08/D09 đã chốt: RPO tối đa5 phút, RTO tối đa60 phút, cửa sổ PITR35 ngày.
Các số này là mục tiêu nghiệm thu, không phải khả năng đã đo hoặc SLA đã được chứng minh.
Không có lệnh backup/restore/production hoặc lịch tự động nào được chạy bởi PR tài liệu này.

## 1. Hiện trạng và lựa chọn

verify-dr-restore hiện kiểm kết nối, migration names, đếm một số bảng, hash audit và một
nhóm quan hệ engineering. Nó không chứng minh backup phục hồi đầy đủ, file/key còn đủ hay
RPO/RTO đạt. Chọn manifest có bằng chứng, base backup+WAL liên tục, attachments có phiên bản,
key references riêng và restore đích cách ly. Không dùng chỉ pg_dump làm PITR.

Giữ modular monolith và các script có ích, mở rộng verifier thay vì mua nền tảng vận hành
không cần thiết. Chi phí hạ tầng/key/store và quyền truy cập nguồn thật vẫn là đầu vào
triển khai cần cấp riêng; không tự mua hoặc coi “chất lượng cao” là quyền chi tiêu không giới hạn.

## 2. Backup, consistency và retention

A6-FR01: recovery set gồm DB/base backup/WAL tới điểm phục hồi, object versions được DB
tham chiếu, migration checksum, app SHA, grants/RLS/extensions/timezone và cấu hình hạ tầng.
Secret/KEK/vault key references có quy trình phục hồi riêng, không nhét secret/raw key vào Git,
logs hoặc manifest công khai. Ciphertext draft mất KEK không được giả khôi phục được.

Manifest: recoverySetId, source identity rút gọn, started/completed timestamps, PostgreSQL
major/tool versions, appSHA, baseBackupId, timeline/LSN/WAL coverage, migration name+SHA256,
row counts và checksums theo snapshot, exact finance totals, audit coverage/watermark,
attachment key/version/size/hash và encryptionKeyReference. Manifest lưu chống sửa ở nơi
chỉ người có quyền dữ liệu được đọc. ID/hash kỹ thuật thay tên người/hợp đồng khi đủ dùng.

A6-FR02: daily base backup, WAL chain liên tục cho mọi điểm trong35 ngày; giữ base backup
trước mép cửa sổ nếu cần, không xóa WAL dựa riêng ngày tạo file khi còn dependency.
Có bản mã hóa chống sửa/xóa ngoài miền lỗi ứng dụng; quyền app không xóa backup.
Kế hoạch key rotation không xóa KEK/version khi recovery window hoặc draft còn cần.
35 ngày là cửa sổ phục hồi vận hành, không tự thay retention chứng từ/audit có nghĩa vụ riêng.

A6-FR03: object key immutable/versioned; không so DB snapshot ởT0 với danh sách file hiện tạiT1
rồi báo consistency. Attachment critical phải được copy/version/hash bảo toàn theo các điểm
PITR được hỗ trợ. Thu gom orphan hoặc xóa object chỉ khi không còn DB/recovery set tham chiếu.
Nếu không có đủ object version cho điểm DB đã chọn thì recovery set đó FAIL, không PASS một nửa.

A6-FR04: archive_timeout60 giây là điểm khởi đầu, chưa chứng minh RPO. Kiểm archive lag,
canary transaction và object replication; cảnh báo2 phút, vi phạm target5 phút.
Nếu không có giao dịch nguồn/canary để đối chiếu thì ghi độ phân giải bằng chứng hoặc
NOT_RUN, không suy transaction-level RPO từ mtime backup.
Không tuyên bố RPO0/failover tự động nếu chưa có replication/quorum/fencing riêng được kiểm.

## 3. Runtime, verifier và diễn tập

A6-FR05: migration production ở bước deploy riêng bằng role migration; runtime app chỉ kiểm
schema tương thích, không DDL trong HTTP/health/diagnostics. Thiếu migration trả lỗi readiness
có mã rõ; không tự seed hoặc sửa schema khi user gọi auth/me. DEV/test có lệnh chủ động riêng.

Verifier chỉ đọc và không kéo helper auto-migrate vào phép đối soát. Input contract gồm
manifest path, expected target identity, evidence output; secret qua cơ chế an toàn không
CLI argument. Output JSON PASS/FAIL/NOT_RUN từng check, appSHA/specVersion/env, thời điểm,
expected/actual count/digest, reason. Mandatory FAIL/NOT_RUN exit khác0, không in raw URI.
Các cờ mới phải được implementation/test trước khi dùng; command hiện có không tự có chúng.

A6-FR06: trước restore phải xác minh host/port/database/user/marker đích disposable, nguồn
và đích khác, quyền không có khả năng ghi production. Không dùng NODE_ENV hoặc hậu tố tên
DB làm bằng chứng duy nhất. Target không xác định thì dừng trước ghi. Không chạy thử phá
production để chứng minh preflight có tác dụng.

Đích restore tắt egress, cron, email, Telegram, webhook, Sheet và provider thật. Dữ liệu tổng
hợp trước; snapshot production chỉ khi có phép với bảo vệ PII. Phục hồi app SHA tương thích
snapshot trước khi thử upgrade; pending migration là giai đoạn riêng không trộn với restore.

A6-FR07: verifier kiểm tên/checksum migration, row counts/digests, FK/orphan/cross-org-project
mọi bảng trọng yếu trong inventory, constraints/policies/grants, hash audit và coverage ký,
exact totals/chuỗi BOQ-contract-IPC-payment, attachments100% critical, key khả dụng và access
đúng role. Count0 vì RLS che không được coi không vi phạm; kiểm toàn vẹn bằng role được cấp
cho audit, sau đó kiểm API bằng app role NOBYPASSRLS. Không nhầm owner query với bằng chứng RLS.

A6-FR08: RTO đo từ bắt đầu sự cố/khôi phục tới app ready và smoke/UAT xong, gồm tìm key,
backup, restore DB/files, app và validation. RPO đo theo nguồn giao dịch/canary đã chứng minh.
Dữ liệu quá lớn khiến không đạt60 phút thì phải nâng năng lực recovery hoặc xử lý trước release,
không tự đổi target thành4 giờ trong báo cáo PASS. Ghi rõ workload/domain đã đo.

## 4. Chu kỳ và kiểm thử lỗi

Yêu cầu vận hành tương lai: kiểm backup hằng ngày, full isolated restore hằng tuần,
PITR/mất máy hằng tháng và trước thay schema rủi ro. Chưa tạo scheduler/automation ở phiên này.
Thử điểm gần hiện tại và mép cửa sổ35 ngày; thiếu WAL/base/key/objectversion phải FAIL rõ.
Giữ evidence của lần thất bại, không xóa đích hoặc ghi đè bản backup tốt để che lỗi.

A6-AC01: recovery set tổng hợp restore đủ DB/files/quyền/money/audit và đúng app/migrations;
không outbound side effects.
A6-AC02: backup checksum hỏng, thiếu attachment critical/key, migration mismatch làm verifier
FAIL đúng hạng mục; query count thành công không che thiếu dữ liệu.
A6-AC03: target trùng nguồn/production/không marker bị chặn trước ghi; verifier không auto-DDL
và không lộ URI/secret.
A6-AC04: cross-org/orphan/audit tamper hoặc role bypass sai bị phát hiện; zero do policy che
không PASS giả.
A6-AC05: mốc RPO/RTO, workload, LSN/timeline và độ phân giải nguồn được ghi, đạt target đã chốt
mới PASS; thiếu phép đo là NOT_RUN. Operator khác lặp được runbook không cần chat cũ.
A6-AC06: lỗi diễn tập không phá nguồn/backup tốt, giữ evidence và cleanup theo quyền đã cấp.
Q-AC07 kiểm runtime/readiness không migrate; Q-AC08 kiểm PITR5m/60m và35 ngày.

## 5. Phát hành và rollback

S15 chỉ CODE_COMPLETE khi54 AC và toàn bộ gates bắt buộc có evidence đúng main/release SHA,
không critical skip mới, không P0/P1 còn mở. UAT đủ vai trò, Safari/iOS thật, desktop/mobile,
axe, money/export, warning/IPC, encrypted queue và restore. Reviewer độc lập ghi kết quả của
họ, không tick thay hoặc coi cùng tác giả tự review là kiểm độc lập.

S16 cần quyền production rõ cho release SHA, môi trường, secrets, chi phí và người vận hành.
Backup đã thử → schema/membership/legacy queue preflight → pilot một project48h → tối đa25%
project24h → mở rộng và quan sát7 ngày. Phải có đủ giao dịch thử/tình huống, không chỉ đợi đồng hồ.
Rò dữ liệu, sai tiền, lost draft do app, bypass QA/approval hoặc archive lag vượt guardrail
là dừng mở rộng. Mục tiêu performance theo D09 có phép đo, không hạ để lấy PASS.

Rollback ba lớp: code về bản hiểu schema/queue; đóng capability lỗi nhưng giữ fail-closed;
dữ liệu chốt xử lý forward-fix/adjustment được duyệt. Không down-migrate phá bảng,
không khôi phục cache chung/project1 hoặc tự reset admin. Restore production thật là hành
động riêng có tác động dữ liệu và quyền rõ; diễn tập thành công không tự cấp quyền làm thật.

## 6. Ownership và Definition of Done

Chủ dự án đã chốt thiết kế. Người triển khai/reviewer/người giữ key/on-call phải được ghi
khi giao việc thực, không giả họ đã được chỉ định hoặc đã ký UAT. Metrics backup_age,
archive_lag, missing_attachment, restore_check_failure và reconciliation_mismatch không PII.
Bằng chứng có runbook/version/commands/target manifest/CI URL và chữ xác nhận vận hành.

RELEASE_VERIFIED chỉ khi deploy được cấp quyền, recovery/UAT/observability thật và owner xác
nhận. Docs complete, CI xanh hoặc một restore fixture không đồng nghĩa production đã hoàn thiện.
