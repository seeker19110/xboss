# A5 — Bất biến xuyên BOQ, vật tư, thi công, nghiệm thu và thanh toán

State: In review. Phụ thuộc S00, A1, A3; tích hợp A2/A4 theo PLAN.
Đây là đặc tả kiểm chứng và vá hẹp, không là dự án viết lại các module đã có.
Hợp đồng chung về auth, tiền, UX, audit và quyền thi hành: README.md.

## 1. Hiện trạng và giới hạn xác minh

PROJECT.md/spec.md và docs/audit.md đã quy định chuỗi tiến độ, QA&QC, nghiệm thu, BOQ và
thanh toán. Route nghiệm thu task có FOR UPDATE, progress đủ 1, checklist đạt, approval
engine và approval_source. Route tạo IPC dùng CAN.manageContracts, kiểm contract/project,
suggestQtyForContract, saveCertItems, certTotals và openApproval.
Không biến việc có các hàm này thành khẳng định tất cả race/cross-project đã được test.

Nguồn đọc thêm cùng baseline:
[nghiệm thu task](https://github.com/seeker19110/xboss/blob/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/app/api/tasks/%5Bid%5D/approve/route.ts),
[tạo IPC](https://github.com/seeker19110/xboss/blob/a2b9d7b9d28a839a5ee9cf2b23fc6b386ca292b3/app/api/payment-certs/route.ts).
Toàn bộ status/column của các module chưa được đọc đầy đủ ở phiên đặc tả này; S00 phải lập
mapping cụ thể trước slice code. Không gán status mới cho bảng thật từ sơ đồ khái niệm dưới.

Không làm: khó chứng minh chuỗi cuối. Rewrite engine: rủi ro lớn và trùng cơ chế.
Chọn giữ engine/service hiện có, một bộ fixture liên miền, test invariants và chỉ vá failure
đã tái hiện. Không nối vật tư nhận hàng thành tiền thực chi khi chưa có quyết định nghiệp vụ.

## 2. Hợp đồng chuỗi và nguồn sự thật

Sơ đồ nghiệp vụ tham chiếu: BOQ → hợp đồng/đơn hàng → ghi nhận thi công → QA&QC/nghiệm thu
→ đề nghị/đợt thanh toán → phê duyệt → ghi nhận thanh toán → đối soát báo cáo.
Đây không là luật mọi luồng phải đi đúng một đường: advance có thể đi trước nghiệm thu;
PO nhận hàng không đồng nghĩa chi tiền; IPC được duyệt không đồng nghĩa đã thanh toán.

A5-FR01: tất cả liên kết phải cùng org/project theo A1; BOQ liên kết task/material/contract
qua mã/ID được định nghĩa trong schema, không nối tùy theo tên gần giống.
Import cùng dữ liệu lần hai không nhân dòng; bảo toàn cơ chế unique BOQCODE hiện hữu.
Mã/ID sai hoặc trùng mơ hồ trả báo cáo từng dòng, không tự tạo bản ghi khác để “import thành công”.

A5-FR02: phiếu nhận vật tư/giao nhận tính đúng nguồn, hủy/đảo giao dịch có lý do và dấu vết;
request retry không cộng tồn hai lần. Đồng bộ Sheet chỉ cập nhật snapshot sau remote write
thành công. Lỗi giữa remote write và local ACK cần reconcile idempotent, không đẩy bù mù.
Không gọi provider thật hoặc có phí trong test; fault injection bằng fake adapter có hợp đồng.

A5-FR03: tiến độ task đúng số ô/tổng ô theo quy tắc hiện có. Không làm tròn 99,5% lên “xong”.
Ngăn tăng qua hold-point đang chặn trên cả tick đơn, batch, offline replay, import và đường
bulk có khả năng đổi tiến độ. Giao nhiều task cùng package phải có thứ tự khóa nhất quán;
không lost update khi hai request cập nhật các ô khác nhau.

A5-FR04: nghiem_thu chỉ đặt khi đủ 100%, QA&QC đạt và các bước duyệt đang áp đã xong.
Pending/rejected không đổi status thành nghiem_thu. Recompute không hạ nghiem_thu tự động.
Duyệt lô và duyệt đơn dùng cùng invariants, assignment/permission và semantics nguyên tử
đã công bố. Hủy duyệt tầng không hủy nhầm task có approval_source='task'.
Không cho client PATCH status trực tiếp đi vòng gate.

A5-FR05: phân biệt qty thực hiện, qty nghiệm thu, qty đề nghị kỳ này, qty đã duyệt lũy kế và
qty đã thanh toán. Với thanh toán theo khối lượng nghiệm thu, hạn mức:
qty kỳ được duyệt + qty các kỳ đã duyệt trước không vượt qty nghiệm thu hợp lệ và giới hạn
contract/VO đã duyệt. Kiểm lại tại thời điểm approve/commit, không chỉ lúc gợi ý tạo draft.
Không đếm draft/cancelled/rejected vào lũy kế được duyệt. Không dùng progress float × BOQ
làm chứng cứ nghiệm thu khi contract yêu cầu qty nghiệm thu riêng.

Nếu mapping nghiệm thu–BOQ hiện chưa đủ, cho lưu draft/gắn trạng thái cần đối soát;
không tự phát hành thanh toán hoặc giả định toàn bộ qty đã được nghiệm thu. Luồng nhập
khối lượng thủ công đã được duyệt phải được ghi rõ nguồn và approval, không âm thầm xóa.
Điều này là thay đổi nghiệp vụ cần owner tài chính duyệt ở APPROVAL trước slice enforcement.

A5-FR06: advance/retention/recovery/credit note có rule riêng theo hợp đồng; không áp điều
kiện nghiệm thu giống IPC cho advance. Không đổi thuế suất, ngày đến hạn, thứ tự bù trừ
hoặc quyền ký. Chứng từ đã chốt có snapshot các basis/rate/rule version; sửa đơn giá BOQ
hôm nay không đổi tiền của chứng từ đã phát hành hôm qua.

A5-FR07: hai người approve hai IPC của cùng contract đồng thời phải serialize kiểm lũy kế
và commit theo khóa contract/nguồn nghiệm thu với thứ tự ổn định. Nếu chỉ đủ hạn mức cho
một đợt, chỉ một thành công; đợt còn lại conflict có lý do. Audit/domain event cùng transaction
với thay đổi DB, một transition hợp lệ tạo một event; log kỹ thuật có thể ghi mọi retry.
Idempotency của A2 chỉ hỗ trợ bốn kind offline, không tự mở rộng receipt đó sang payment;
tái dùng cơ chế nghiệp vụ hiện có hoặc đặc tả key cho endpoint thanh toán trong slice riêng.

A5-FR08: hủy nghiệm thu đã được chứng từ downstream tham chiếu không được làm mất tính
hợp lệ im lặng. Default đề xuất: chặn 409 dependency_conflict khi downstream đã chốt;
liệt kê chỉ các tham chiếu được phép thấy. Sửa bằng quy trình adjustment/reversal được duyệt,
không DELETE audit hoặc giảm trực tiếp số tiền lịch sử. Với downstream draft phải đánh dấu
cần tính/duyệt lại; không âm thầm giữ draft đủ điều kiện phát hành.

## 3. Contract API, trạng thái và data mapping bắt buộc

Giữ route hiện có: /api/dimensions/:id, /api/dimensions/batch, /api/tasks/:id/approve,
/api/approvals, /api/payment-certs và các route update/approve/cancel thực tế từ inventory.
Không tạo endpoint song song chỉ để vượt middleware. Mã lỗi/permission dùng README/A1;
đường cũ cần adapter giữ payload/status đã có tới khi client chuyển, có contract test.

S00 phải xuất bảng mapping cho từng transition gồm: entity/table, parent scope, trạng thái
đầu/cuối thật, route+method, CAN key, assignment/SoD, lock root, quantity/amount basis,
unique/idempotency, lịch sử/audit, file test. Trạng thái mới chỉ thêm khi có product approval.
Permission read-only bch/cdt/viewer không được ghi dù được xem. Không tự mở rộng quyền
engineer/subcon từ khả năng chuẩn bị dữ liệu sang quyền duyệt.
SoD nhiều bước giữ cấu hình đã chốt; chưa có policy thì ghi decision, không tự tạo luật
“admin được duyệt mọi bước” hoặc khóa hết quy trình một người mà không owner duyệt.

Không có DDL chung bắt buộc cho bộ test. Nếu failure chứng minh thiếu unique/FK/snapshot,
thực hiện một migration hẹp sau S00 với tên cột thực tế, backfill có đối soát và snapshot
history không bị ghi đè. Không thêm bảng sổ cái mới nếu bảng hiện có đã đáp ứng.

## 4. Fixture liên miền và acceptance

Fixture dùng dữ liệu tổng hợp, ít nhất hai org, mỗi org hai project, đủ bảy role, contract
và BOQ khác nhau nhưng cùng mã hiển thị để bắt join nhầm. Không hardcode FK=1; lấy ID insert.

A5-AC01: cùng import chạy hai lần cho kết quả nguồn/idempotency như nhau; lỗi partial có
báo cáo và rerun không nhân BOQ/material/task. Fault remote Sheet write không làm snapshot
đi trước sự thật và không rollback người dùng khác.
A5-AC02: task có 199/200 ô không được nghiệm thu; đủ ô nhưng checklist fail vẫn bị chặn;
flow pending/rejected giữ trạng thái cũ; tất cả step xong mới nghiem_thu và ghi history.
A5-AC03: hai request tick/approve cùng task/package không lost update, không duplicate
event; batch/offline không bypass gate. Hủy tầng giữ task đã duyệt riêng.
A5-AC04: contract 100 đơn vị, nghiệm thu 60, đã duyệt kỳ trước 40: đề nghị thêm 20 đủ giới
hạn; 21 bị chặn tại approve. Tạo draft không làm tăng số đã duyệt. VO pending không tăng trần.
A5-AC05: hai IPC mỗi cái 15 khi còn hạn mức 20 chạy đồng thời: tổng duyệt không vượt 20.
Không pass chỉ vì fixture gửi tuần tự hoặc DB test dùng mutex giả.
A5-AC06: advance hợp lệ theo điều khoản vẫn làm được khi chưa nghiệm thu; không cộng vào
qty đã nghiệm thu hoặc thu hồi hai lần. Dùng fixture hợp đồng được duyệt, không giả thuế suất.
A5-AC07: hủy upstream có downstream chốt bị chặn; adjustment có approval và audit; chứng từ
lịch sử không thay khi BOQ giá hiện tại thay. Resource cross-project luôn bị chặn.
A5-AC08: báo cáo A4 đối soát các nguồn tiền A3 và trạng thái thật; approved != paid; quyền
bị che không lộ qua export, audit-view, toast hoặc API error.
A5-AC09: UAT desktop/mobile với engineer/subcon ghi nhận, PM duyệt, BCH xem; cdt/viewer
không nhận dữ liệu thương mại bị cấm. Loading/error/retry không cho gửi hai transition.

## 5. Vận hành, rủi ro và triển khai

File ưu tiên: lib/tien-do/recompute.ts, lib/tien-do/approvals.ts, lib/ky-thuat/qaqc.ts,
lib/khoi-luong/boq.ts, lib/vat-tu/material-sync.ts, lib/tai-chinh/paymentcerts.ts và routes trên.
Các file này là điểm chạm để đọc; chỉ sửa đúng failure đã tái hiện và có file lock theo PLAN.
Metric: business_transition_conflict, accepted_qty_limit, downstream_dependency_block,
reconciliation_mismatch. Event có correlation ID tới nguồn, không log amount/payload.

Triển khai tests trước, vá một boundary/transition mỗi PR, tái kiểm chain sau từng merge.
No-go khi gate bị bypass, mismatch tiền/qty, duplicate effect hoặc mất audit.
Rollback bằng khóa transition lỗi và giữ dữ liệu chốt; không xóa history/reversal để trở về
“sạch”. Sửa dữ liệu thật phải có danh sách bản ghi, phê duyệt owner và script riêng.

DoD: map trạng thái/schema thật, tất cả AC có test/mẫu UAT, không còn P0/P1 trong chuỗi,
review tài chính/nghiệm thu và approval trước rollout. Người/ngày duyệt: APPROVAL.md.
