# Approval — Chốt phương án chất lượng cao

Phiên bản quyết định: **QUALITY-FINAL-1**. Ngày: **2026-09-25**.
State: **Approved for implementation — đặc tả đã chốt để thi hành sau**.

## 1. Căn cứ và giới hạn phê duyệt

Chủ dự án yêu cầu trong hội thoại: **“chốt theo phương án chất lượng cao nhất”**, tiếp nối
yêu cầu hoàn thiện đặc tả để chủ dự án thi hành sau. Người quyết định: chủ dự án XBoss;
ChatGPT ghi nhận và cụ thể hóa lựa chọn kỹ thuật dưới đây. Không giả mạo chữ ký của reviewer,
người phụ trách tài chính, kiểm toán hoặc người vận hành.

D01–D09 đã chốt ở cấp thiết kế. Không tiếp tục hỏi chủ dự án chọn lại các phương án này.
“Approved for implementation” là trạng thái của đặc tả; không phải lệnh bắt đầu viết application
code trong phiên chốt tài liệu này, không tự cấp quyền merge/deploy/chạy production, mua hạ tầng,
truy cập dữ liệu thật hoặc thay điều khoản hợp đồng. Khi chủ dự án bắt đầu thi hành sau, dùng
đúng các lựa chọn này và gates của PLAN.md.

Nguyên tắc quyết định: đúng dữ liệu và bảo mật trước; không mất việc hiện trường; giữ quy tắc
nghiệp vụ đã chốt; thay đổi nhỏ có kiểm chứng; chi phí hợp lý nhưng không hạ chất lượng để tiết kiệm.
Không chuyển microservices/Kubernetes/ORM chỉ vì muốn hệ thống trông hiện đại hơn.

## 2. D01 — Phạm vi và quyền: chốt cách ly nghiêm ngặt theo tổ chức

Mọi actor, kể cả admin ứng dụng, chỉ có quyền trong tổ chức hiện tại được server xác minh.
Non-admin cần membership dự án rõ ràng. Không có fallback dự án 1, bảng membership rỗng
không mở quyền toàn hệ, input sai không được đổi thành bỏ filter. Tài nguyên con phải cùng
phạm vi với cha. Báo cáo nhiều dự án dùng tập IDs được phép của cùng org, không nhận wildcard
hoặc quyền toàn hệ từ client.

Chốt sửa cả cache và CRUD quyền: key phải có org, project, role và permission. Cold start,
cache chưa xác minh hoặc DB lỗi không được trả quyền mặc định như thể không có override deny.
Permission snapshot phải nạp và await trong ngữ cảnh request đã xác thực; đường tài chính,
nghiệm thu và quản trị kiểm quyền từ dữ liệu có hiệu lực, không lấy snapshot stale để cho ghi.
Index/ON CONFLICT/DELETE của role_permissions phải có org_id, theo DATA-CONTRACTS.md.

Giữ giao thức login/2FA của #529; dùng cơ chế 2FA hiện có cho admin/PM trước mở rộng production,
kèm bước enrollment và recovery đã kiểm, không tự reset tài khoản đang chạy. Đổi org, mật khẩu
hoặc session_version phải vô hiệu token không còn phù hợp. Không coi role admin là quyền
bỏ qua RLS hoặc được nhìn mọi org.

## 3. D02 — Cache và offline: chốt hai cấu hình có kiểm soát

Auth, quyền, tài chính, chứng từ thanh toán, export và HTML/RSC cá nhân hóa luôn network-only.
Offline đọc chỉ cho allowlist tracking tối thiểu, cache theo context server và generation;
không phục vụ stale data sau lỗi 401/403/409. Một project hoạt động chung trong cùng phiên
browser; đổi project ở một tab vô hiệu ngữ cảnh các tab khác. Expected-context được server
kiểm, không tin cookie project mới cho request cũ.

Mặc định **shared-safe**: lease đọc offline tối đa 15 phút từ xác minh online.
Cấu hình **field-personal**: tối đa 8 giờ, chỉ khi thiết bị đã được admin cùng org ghi nhận
cho đúng một chủ sử dụng, có phiên đã xác thực online và chưa logout/đổi actor. Client không
được tự chọn profile 8 giờ bằng localStorage hoặc query. Khi browser/SW mất context hoặc app
khởi động lạnh, phải online xác minh lại trước mở dữ liệu cũ, kể cả profile field-personal.
Không hứa thu hồi quyền tức thời khi thiết bị hoàn toàn mất mạng; cửa sổ này là đánh đổi đã chốt.

ACK invalidation có timeout 3 giây: lỗi chuyển LOCKED/network-only, không quay lại cache chung.
SSE/fetch cũ bị hủy hoặc bỏ kết quả theo generation. Có fallback foreground trên Safari;
không phụ thuộc Background Sync, Web Locks hay việc mọi tab luôn chạy.

## 4. D03 — Bản nháp: chốt giữ an toàn, không tự xóa khi logout

Không tự xóa thao tác chưa ACK, không xuất dữ liệu nhạy cảm ra file ngoài yêu cầu.
Bản nháp mới phải nằm trong vault mã hóa AES-256-GCM với ownership và associated data;
khóa giải mã chỉ được cấp qua xác thực server đúng owner/org/project/device và giữ trong bộ
nhớ phiên, không lưu plaintext key cạnh ciphertext. Chi tiết khóa/vault/API ở A2 và DATA-CONTRACTS.
Logout khóa vault, xóa cache dữ liệu đọc và tham chiếu khóa trong bộ nhớ; ciphertext còn lại
để chính chủ xác thực online rồi phục hồi. Xóa bản nháp chỉ khi người dùng xác nhận rõ hoặc
đã có receipt thành công được đối soát. Không tuyên bố JavaScript có thể xóa vật lý mọi bản
sao khóa khỏi RAM, hoặc mã hóa này chống được XSS đang chạy trong phiên đã mở khóa.

Queue v1 không có owner: quarantine và dừng gửi, không tự gán cho người vừa login, không tự
xóa. Trước rollout phải đối soát từng thiết bị còn legacy với người vận hành/chủ dữ liệu;
không có bằng chứng xác định chủ thì giữ cách ly, không biến nó thành draft của user mới.
IDB báo lưu chỉ sau transaction complete; quota/abort không được báo thành công.

Mất thiết bị, xóa site data hoặc browser thu hồi storage vẫn có thể mất draft chưa lên server;
UI phân biệt “đã lưu trên thiết bị” với “đã sao lưu lên máy chủ”. Không hứa bảo đảm không mất
trong mọi trường hợp khi chưa có mạng. Không đặt TTL tự xóa cho draft chưa giải quyết.

## 5. D04 — Gửi lại: chốt receipt bền vững và chống xử lý trùng tại server

Mỗi thao tác có operationId không đổi qua retry. Auth/quyền/scope được kiểm trước lookup
receipt. Cùng key/cùng payload trả ACK trước đó; cùng key/khác payload trả conflict.
Mutation DB, audit nghiệp vụ và receipt hoàn tất cùng transaction. Với object storage dùng
staging + commit metadata + thu gom orphan có đối soát, không giả transaction DB bao trùm file.

Dùng bảng receipt dành cho bốn loại queue hiện có theo DATA-CONTRACTS; không tái sử dụng một
cơ chế dedup webhook/notification chỉ vì tên tương tự. Nếu inventory phát hiện cơ chế tương
đương đầy đủ thì thay bằng adapter cùng contract, không vận hành hai nguồn receipt độc lập.
Lease nhiều tab 30 giây, renew 10 giây, fencing token; server dedup vẫn là hàng rào cuối.

Không có job TTL xóa dedup key trong chương trình này. Giữ receipt/tombstone tối thiểu cùng
vòng đời dữ liệu tham chiếu; không lưu nguyên nội dung ảnh/nhật ký trong receipt. Thủ tục xóa
org/dữ liệu có nghĩa vụ retention là thay đổi riêng có kiểm soát, không suy từ ngày backup.
401 giữ draft chờ auth; 409/412 giữ conflict; 429 tôn trọng Retry-After; lỗi mạng/5xx retry có
backoff+jitter; 403/404/422 giữ trạng thái bị từ chối, không biến mất sau một toast.

## 6. D05 — Tiền: chốt exact, giữ quy tắc hiện có thay vì đổi âm thầm

Giữ PostgreSQL numeric và bigint VND × 100. SQL trả tiền qua ::text; JSON exact dùng chuỗi
canonical 2 số lẻ cho amount, quantity giữ scale riêng. API opt-in decimal-string-v1 rồi
chuyển từng caller; không đổi toàn bộ parser NUMERIC hoặc mọi JSON number cùng lúc.
Giá trị ngoài biên legacy phải báo lỗi, không clamp/round âm thầm. ID/count/progress không
bị đổi kiểu như tiền. Không lấy Number làm bước trung gian trong đường exact.

Chốt **giữ cách tính IPC đang triển khai**: cộng qty nhân unit_price bằng numeric trước,
round tổng đến 2 số lẻ; tính advance/retention theo tỷ lệ hợp đồng trên periodValue đó rồi
round từng khoản; payable bằng các thành phần exact. Không tự chuyển IPC sang round từng
dòng. Hợp đồng/chứng từ đã có rule khác giữ rule có version và snapshot, không bị ghi lại.
Ties làm tròn xa 0; thuế/basis không được hardcode theo một ví dụ kỹ thuật.

Schema nguồn đã đọc: unit_price/amount numeric(15,2), qty BOQ/IPC numeric(15,3), tỷ lệ
advance_pct/retention_pct numeric(5,2). Không cần mass ALTER để sửa lỗi parser/helper.
Giá trị lớn trong test utility/SUM có thể vượt giới hạn từng ô; test phải phân biệt aggregate
numeric với INSERT vào cột numeric(15,2). Xem SOURCE-MAP.md.

## 7. D06 — Báo cáo: chốt nguồn đúng, cùng snapshot, không cộng lặp

Mỗi bản ghi nguồn tính một lần theo khóa thật; không dùng SUM(DISTINCT amount).
selectedTotals là tổng rows đang xem; projectTotals là tổng dự án có unassigned; floor budget
là proxy hợp đồng tầng, không giả đã phân bổ BOQ. Giữ actual gồm advance theo code hiện có.
Báo cáo nhiều statement dùng REPEATABLE READ READ ONLY đặt ngay khi BEGIN; báo cáo một CTE
cũng phải đặt scope và permissions đúng. Không dùng Promise.all để chứng minh snapshot.

payment_bills hiện đã có project_id, contract_id, payment_cert_id và sheet_type_id;
không tiếp tục dựa vào comment cũ nói bảng không có project_id. Các đường liên kết có mặt
phải cùng một project, mâu thuẫn là lỗi dữ liệu cần đối soát. Không loại tiền chỉ vì thiếu sheet.

Portfolio trọng số theo số task của đúng org/tập filter; không task trả unavailable, không
0% giả. Hiển thị rõ đây là tiến độ theo công việc, không phải tiến độ tài chính/EVM.
Dữ liệu lỗi/thiếu coverage không được trình bày như tổng đã được xác nhận đầy đủ.

## 8. D07 — Nghiệm thu và IPC: chốt kiểm soát chặt nhưng không đổi nghiệp vụ đã quyết

Đối chiếu paymentcerts.ts xác nhận quyết định người dùng 2026-09-04: **vượt khối lượng hợp
đồng thì cảnh báo, không chặn cứng**. Vì vậy bỏ yêu cầu v1 tự động cấm mọi IPC vượt contract
hoặc lấy tỷ lệ tiến độ làm bằng chứng khối lượng đã nghiệm thu. Giữ khả năng lập/trình/duyệt
phát sinh theo quy trình đang có, nhưng cảnh báo phải được tính lại dưới khóa, nêu từng dòng,
nguồn và phiên bản; khi duyệt có cảnh báo phải ghi nhận xác nhận/rationale của người có quyền.
Nếu cảnh báo thay đổi do request đồng thời thì yêu cầu xác nhận lại, không dùng bản cảnh báo cũ.

Sổ khối lượng thực hiện, nghiệm thu và được duyệt là các đại lượng khác nhau. Thiếu nguồn
nghiệm thu không được tự gắn nhãn “đã nghiệm thu”; luồng khai báo thủ công phải có nguồn/lý do.
Chứng từ đã chốt không tự reprice; approved không đồng nghĩa paid. Advance có semantics riêng.
Giữ QA/hold-point/100% và approval engine hiện có; không thêm đường bypass cho admin.

Chốt khóa contract trước khi tính lũy kế/duyệt các IPC cùng contract; recompute lũy kế từ
các kỳ approved trước đó trong transaction, không tin snapshot draft. Duyệt ngược thứ tự
period khi đã có kỳ sau approved phải yêu cầu reconciliation/adjustment, không sửa kỳ sau
âm thầm. Không tạo một “trần 20” giả khi chính sách contract cho phép vượt có cảnh báo.

SoD giữ luật/config hiện hữu; không tự tạo người duyệt hoặc giả chữ ký. Hủy upstream có
chứng từ downstream đã chốt phải qua adjustment/reversal, không xóa history. Điều kiện thiếu
người ký theo flow hiện hữu là blocker vận hành, không là quyền để AI bỏ bước duyệt.

## 9. D08 — Phục hồi: chốt PITR, RPO 5 phút và RTO 60 phút

Mục tiêu thiết kế đã chốt: **RPO không quá 5 phút; RTO không quá 60 phút** cho workload
production được benchmark và công bố trong release manifest. Đây chưa là số đo/SLA đã đạt.
Chọn base backup + lưu WAL liên tục, thay phương án chỉ backup mỗi ngày với RPO 24 giờ.
Không gọi pg_dump là PITR; snapshot attachment/version/key reference cùng recovery set.

Chốt cửa sổ khôi phục 35 ngày: base backup hằng ngày, giữ toàn bộ WAL cần để phục hồi mọi
điểm trong cửa sổ; giữ thêm base backup cũ hơn mép cửa sổ nếu cần. Có ít nhất một bản mã hóa,
chống sửa/xóa ngoài miền lỗi của ứng dụng; quyền xóa backup tách khỏi app. Key backup tách
kho dữ liệu. Attachment critical phải đủ và mở được; không chỉ kiểm checksum DB.

archive_timeout 60 giây là cấu hình khởi điểm để test, không chứng minh RPO nếu archive chậm.
Giám sát độ trễ archive, bản ghi canary phục hồi và attachment replication; cảnh báo ở 2 phút,
vi phạm recovery objective ở 5 phút. Phục hồi đầy đủ trên đích cách ly hằng tuần; kiểm backup
hằng ngày; diễn tập PITR và mất máy ít nhất hằng tháng và trước thay schema rủi ro cao.
Lịch này là yêu cầu vận hành tương lai, chưa tạo automation hoặc mua dịch vụ.

Không quảng cáo RPO bằng 0 hoặc failover tự động nếu chưa có replica/quorum/fencing được
thiết kế và diễn tập. Nếu workload không đạt RTO 60 phút, bổ sung năng lực phục hồi trước
phát hành; không tự hạ mục tiêu đã chốt để lấy PASS.

## 10. D09 — Phát hành: chốt bằng chứng trước, triển khai từng nhóm sau

Dùng modular monolith hiện có. Migration production chạy bước triển khai riêng bằng role
migration; runtime chỉ kiểm schema tương thích bằng role app, không tự DDL trong HTTP request.
S00 catalog xác nhận các pending migration trước code; append-only và expand/contract.

Mỗi slice có regression, review độc lập vùng rủi ro và CI đúng HEAD. Không hạ threshold,
skip test mới hoặc nới quyền để làm xanh. Safari/iOS thật và Chromium desktop/mobile nằm
trong nghiệm thu offline; axe không thay toàn bộ UAT. 54 AC của TEST-MATRIX là tối thiểu.

Mục tiêu hiệu năng: p95 read/write tương tác không quá 500 ms, báo cáo chuẩn không quá
2 giây trên fixture 10.000 task, 20 phiên đồng thời, sau warmup; không chậm hơn baseline
quá 10% trên cùng cấu hình. Phải ghi số đo và mẫu thử; không có số đo thì NOT_RUN.
Các ngưỡng không áp cứng cho upload file lớn/restore/job dài; chúng có timeout/quota riêng.

Rollout: một dự án nội bộ pilot 48 giờ, sau đó tối đa 25% dự án 24 giờ, rồi mở rộng và quan
sát 7 ngày. Bất kỳ rò dữ liệu, sai tiền, mất draft đã ACK hoặc bypass nghiệm thu thì dừng ngay.
Thời gian quan sát không thay việc kiểm đủ traffic/tình huống. Không chạy pilot trên dữ liệu
thật khi chưa có quyền riêng. Không khôi phục cache chung/fallback scope khi rollback.

## 11. Việc không còn phải hỏi lại và việc vẫn phải kiểm

Đã chốt: lựa chọn kiến trúc, D01–D09, các ngưỡng đích, cách xử lý xung đột với nghiệp vụ IPC.
Không còn bảng “CHƯA CÓ quyết định” cho chín mục này.

Vẫn phải kiểm trước thi hành: main SHA, catalog/schema thật, tất cả caller thuộc slice,
dữ liệu membership/legacy queue, golden fixture của chứng từ thật, môi trường restore,
khả năng đạt ngưỡng và quyền thao tác production. Đây là đầu vào/bằng chứng thực tế,
không được giả thành đã có từ lời chấp thuận thiết kế. SOURCE-MAP phân biệt phần đã đọc
với phần phải đo. Reviewer ghi kết quả của chính họ, không được AI tự ký thay.

Thay đổi khác bản chốt về chính sách tiền, quyền, dữ liệu thật hoặc retention phải được
báo rõ và duyệt delta; sửa chi tiết triển khai tương đương contract không phải hỏi lại D01–D09.
