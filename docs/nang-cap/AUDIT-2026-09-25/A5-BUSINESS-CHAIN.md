# A5 — Chuỗi nghiệp vụ đúng chính sách và chống duyệt sai

State: **Approved for implementation**, QUALITY-FINAL-1, 2026-09-25; thi hành sau.
Decision D05/D07. Đọc SOURCE-MAP/DATA-CONTRACTS trước khi sửa vùng nghiệm thu/tài chính.

## 1. Quyết định thay thế v1

Mã paymentcerts.ts ghi quyết định người dùng ngày 2026-09-04: vượt khối lượng hợp đồng là
**cảnh báo, không chặn cứng**. Chương này giữ quyết định đó. Yêu cầu v1 coi accepted qty/
contract qty là trần cứng mọi IPC và các test buộc chỉ một IPC15 thành công khi còn20 được
thay thế. Không coi cao chất lượng đồng nghĩa khóa một quy trình phát sinh đã được cho phép.

Các trạng thái IPC thật: draft, submitted, approved, rejected; không tạo cancelled giả.
Gợi ý qty hiện từ thực hiện theo tiến độ không phải chứng cứ khối lượng nghiệm thu.
IPC đang sum rồi round tổng; giữ ipc-sum-v1 và snapshot theo A3.

Chọn hoàn thiện các engine/service hiện có bằng invariants, warning acknowledgement,
khóa transaction và hồ sơ quyết định. Không viết engine mới, tự thay hợp đồng/thuế/SoD hoặc
nối mọi nghiệp vụ thành một luồng bắt buộc không có ngoại lệ advance.

## 2. Hợp đồng chuỗi

BOQ/hợp đồng/mua sắm/thi công/QA/nghiệm thu/IPC/thanh toán liên kết bằng ID nguồn đúng scope.
Thi công không đồng nghĩa nghiệm thu; approved IPC không đồng nghĩa đã chi tiền; PO nhận
hàng không tự ghi chi tiền. Dữ liệu manual được phép phải có nguồn/lý do, không gắn nhãn giả.

A5-FR01: BOQ, task, material, contract/cert/payment và supplier có quan hệ đúng org/project.
boq_codes unique theo org như schema hiện có, không cấm hai org có cùng mã hợp lệ.
Import rerun không nhân dòng, liên kết theo khóa rõ; mã mơ hồ trả lỗi từng dòng để xử lý,
không tự tạo thêm bản ghi gần giống. FK có mặt chưa đủ nếu hai đầu thuộc hai project khác nhau.

A5-FR02: giao/nhận vật tư và tồn kho không cộng hai lần khi retry. Tái dùng idempotency của
warehouse_receipts theo po_id/idempotency_key cho miền kho, không thay bằng receipt offline
chỉ vì cùng tên. Đồng bộ Sheet chỉ ghi snapshot khi remote write thành công; mất ACK hoặc
lỗi giữa các bước phải reconcile, không ghi đè thay đổi người khác. Tests dùng fake provider.

A5-FR03: tiến độ chính xác số ô trên tổng ô, không làm tròn 199/200 thành hoàn thành.
Hold-point chặn tăng tiến độ trên single/batch/offline/import cùng semantics. Khóa task/
package theo thứ tự ổn định; hai request cập nhật hai ô khác nhau không lost update.

A5-FR04: nghiem_thu chỉ sau đủ 100%, QA required đạt và approval flow hoàn tất. Pending/
rejected không tự chuyển status. Recompute không hạ nghiem_thu; hủy duyệt tầng phải giữ task
approval_source=task được duyệt riêng. Không route PATCH status bypass gate hoặc admin bypass.
Giữ quyền CAN.approve, assignment và SoD/flow đang có, không tự tạo người ký thay người thật.

## 3. IPC, cảnh báo và cạnh tranh

A5-FR05: draft/trình IPC vẫn được ghi nhận phần vượt hợp đồng như hiện tại; server tính
cảnh báo theo từng dòng BOQ, lũy kế và basis nguồn. Khối lượng thực hiện/nghiệm thu/đề nghị/
được duyệt/đã thanh toán là các đại lượng riêng. Không lấy tỷ lệ progress làm nhãn đã nghiệm thu.
Thiếu bằng chứng nguồn ghi rõ cần đối soát; luồng manual không bị xóa, nhưng không giả đủ hồ sơ.

A5-FR06: trước quyết định cuối, khóa contract rồi cert/lines theo thứ tự ổn định; tính lại
lũy kế từ tập IPC approved có hiệu lực và dữ liệu kỳ đang duyệt, không tin cumulative draft.
Với cùng BOQ nhiều kỳ, không SUM các cumulative snapshots rồi đếm lặp. Duy trì qty_period
và cumulative đúng nghĩa; chứng từ reversed/adjusted theo quy trình đã chốt không bị tính hai lần.

Khi có kỳ sau đã approved, không duyệt kỳ trước rồi âm thầm sửa snapshot kỳ sau.
Trả conflict cần reconciliation/adjustment; cho lập chứng từ điều chỉnh theo quyền hiện có.
Đây là kiểm thứ tự/toàn vẹn, không phải trần mới cấm overrun.

A5-FR07: response quyết định trả warningVersion do server tạo từ phiên bản nguồn và danh sách
cảnh báo canonical. Client hiển thị từng dòng, yêu cầu acknowledgement và reason khi có cảnh
báo. Server tính lại dưới khóa; warningVersion cũ trả409 warning_changed để người có quyền
xem và xác nhận lại. Xác nhận hiện tại hợp lệ thì không chặn chỉ vì vẫn vượt hợp đồng.
Không có cảnh báo thì không đòi xác nhận cảnh báo rỗng.

Cảnh báo không được bỏ qua khi retry, API ngoài UI hoặc batch. UI hiện loading/conflict và
nguồn thay đổi, không nút bấm tự gửi lại với acknowledged=true. Business audit giữ actor,
reason, danh sách cảnh báo và version. Role không có quyền không được dùng acknowledgement
để vượt auth. Một lỗi 409 không được hiện như “đã duyệt”.

A5-FR08: transition, business audit và immutable snapshot cùng transaction; duplicate request
không tạo transition/snapshot/lịch sử mới. Receipt offline không tự áp vào payment;
endpoint IPC dùng idempotency theo contract cụ thể ở DATA-CONTRACTS. Cùng operationId khác
payload báo conflict. Chỉ COMMIT thành công mới phát sự kiện xuôi dòng; tích hợp ngoài DB
có outbox/retry phù hợp cơ chế hiện hữu, không hứa exactly-once network delivery.

A5-FR09: snapshot quyết định đóng băng qty, giá, rate, basis, tổng, rule version và cảnh báo.
Đổi BOQ hoặc hợp đồng sau đó không reprice chứng từ cũ. Legacy thiếu snapshot ghi provenance,
không tái dựng bằng giá hôm nay. Advance có điều khoản riêng; không tự yêu cầu khối lượng
nghiệm thu giả hoặc trừ thu hồi tạm ứng hai lần.

A5-FR10: hủy upstream có downstream đã chốt bị chặn dependency_conflict và phải adjustment/
reversal được duyệt, không DELETE history hoặc sửa trực tiếp tiền. Downstream draft cần đánh
dấu tính/duyệt lại khi nguồn đổi. Danh sách dependency chỉ gồm tài nguyên được phép thấy.

## 4. Schema/API và điểm chạm

Giữ /api/dimensions/:id, /api/dimensions/batch, /api/tasks/:id/approve, /api/approvals và
/api/payment-certs cùng các endpoint quyết định hiện hữu. Thêm warningVersion/acknowledged/
reason và snapshot contract theo DATA-CONTRACTS, không mở route đi vòng auth/approval engine.

File vùng rủi ro: lib/tien-do/recompute.ts, lib/tien-do/approvals.ts,
lib/ky-thuat/qaqc.ts, lib/khoi-luong/boq.ts, lib/vat-tu/material-sync.ts,
lib/tai-chinh/paymentcerts.ts và route tương ứng. S00 inventory method/status/lock và callers
trước mỗi PR; test/API names mới không chứng minh chúng đã tồn tại.

Schema snapshot mới chỉ bổ sung nếu audit/event hiện có không đáp ứng contract bất biến;
quyết định lựa chọn phải được ghi bằng so sánh cụ thể ở S00, không để hai snapshot là nguồn
sự thật song song. Các DDL/constraint/RLS/grants bắt buộc theo DATA-CONTRACTS và phụ lục dữ liệu.
Không sửa migration đã áp, không backfill thương mại production ngoài quyền được cấp.

## 5. Acceptance

A5-AC01: import/sync rerun không nhân dữ liệu; fault remote write/ACK không làm snapshot
đi trước thành công hoặc mất thay đổi của người khác.
A5-AC02:199/200 ô không nghiệm thu;100% nhưng QA fail vẫn chặn; flow pending/rejected giữ
trạng thái, final mới đổi nghiem_thu và ghi history.
A5-AC03: tick/approve/batch/offline concurrency không lost update/duplicate effect/bypass;
hủy tầng không hủy nhầm task duyệt riêng.
A5-AC04: contract100, approved trước90, kỳ mới20: lũy kế110 và cảnh báo đúng; draft/trình được
phép; duyệt có xác nhận version hiện tại/lý do được phép theo policy, không hard-cap100.
Role không quyền vẫn bị chặn; không được gắn khối lượng chưa có chứng cứ thành đã nghiệm thu.
A5-AC05: hai kỳ20 và10 sau90 được serialize; nếu duyệt theo thứ tự hợp lệ thì cumulative110
và120, cảnh báo thay đổi yêu cầu xác nhận lại; không lost update, không lấy cùng cumulative
cũ và không chặn một kỳ chỉ vì vượt trần do đặc tả tự tạo. Duyệt ngược kỳ sau-approved phải
reconcile/adjust, không sửa snapshot cũ.
A5-AC06: advance theo điều khoản không bị ép giả nghiệm thu, không thu hồi/trừ hai lần;
fixture dùng tỷ lệ hợp đồng, không thuế suất do AI tự đặt.
A5-AC07: downstream chốt chặn hủy upstream; adjustment có quyền/audit; giá hiện tại đổi
không thay hồ sơ chốt, tham chiếu cross-project không được tạo.
A5-AC08: báo cáo exact đối soát approved khác paid; không lộ tiền qua errors/export/audit-view.
A5-AC09: engineer/subcon ghi nhận, PM duyệt, BCH xem, cdt/viewer đúng giới hạn;
keyboard/mobile/retry/conflict không gây hiểu nhầm đã duyệt hoặc tự xác nhận cảnh báo.

## 6. Kiểm chứng và vận hành

Fixture hai org, nhiều project, bảy role; dùng khóa tạo thật, không hardcode FK1.
Unit/policy, PostgreSQL barrier concurrency, HTTP thật, E2E/UAT và fake provider fault
injection. Không mutex ngoài DB để giả mô phỏng serialization đã đúng.
Metrics transition_conflict, warning_changed, acknowledgement_required, dependency_block,
reconciliation_mismatch không kèm tiền/payload. Log kỹ thuật retry khác audit business effect.

S13 tách regression chain rồi vá từng boundary. No-go khi gate QA bị vượt, mất lịch sử,
sai lũy kế/tiền, warning bị bỏ qua hoặc cross-project. Rollback khóa transition lỗi và giữ
hồ sơ; không xóa audit/đổi giá lịch sử để trở về trạng thái có vẻ sạch. Full AC/UAT/restore
phải có bằng chứng mới; tài liệu đã chốt không là bằng chứng code đã hoàn tất.
