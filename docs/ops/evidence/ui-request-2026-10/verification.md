# Kiểm chứng UI tải đúng nhu cầu

Baseline main `e52b4937c8e46936adba15bf4ed7d62d11d7add3` (#682). Source cuối `ed8c35e73296ef85dd14a5518d5081f227a1fc19`; commit tiếp theo chỉ ghi evidence/docs. **VERIFY: checkpoint trước CI/merge/deploy**; kết quả phát hành cuối đối soát tại [PR#683](https://github.com/seeker19110/xboss/pull/683). Owner đã ủy quyền thực hiện và phát hành; UAT/usage F2/F3 vẫn WAITING.

## Kết quả chức năng

Nhân sự tải danh sách song song, độc lập auth/tổ đội/nhà thầu phụ. Response cũ không ghi đè filter mới; lỗi giữ snapshot chỉ xem và có retry riêng từng nguồn; không hiện empty khi chưa có snapshot hợp lệ. Tên nhân sự là nút mở chi tiết bằng bàn phím; tên dài ngắt dòng, target44px; filter có nhãn, input16px dưới sm và bảng cuộn trong vùng giữ cột.

Hợp đồng chỉ tải suppliers/systems khi mở tạo mới; cache trong vòng đời trang, retry chỉ nguồn lỗi. Form chưa mở khi chưa đủ option; đang tải/lỗi vẫn đóng được. Cùng một Modal tồn tại xuyên suốt tải/lỗi/form; sau retry và đóng, focus trở lại nút mở ban đầu. CI đầu có một ca focus chỉ qua retry; bản sửa không chấp nhận kết quả đó để phát hành, kiểm lặp20/20 với retries0 và chạy lại mọi ca. Không đổi logic ghi/state/payload AddContractModal hoặc source ContractDocument, payload/header decimal-string, quyền hoặc tính tiền.

[Invariants](invariants.json) đối chiếu 18 điểm AST/text: PersonnelModal/DetailModal/CertificationModal/certBadge, taiDanhSach/HangHopDong/CAN/refresh và phép tính mSumTien/mulRatio; ContractDocument giữ byte-identical; AddContractModal chỉ thêm nội dung tải/lỗi trước form, chung một Modal; submit/canSubmit/needsSupplier/state giữ nguyên. Backend/API/schema/dependency và offline giữ nguyên. Không gỡ capability.

## RED, repair và GREEN

[RED](red.json) có hash raw và provenance build baseline. Ca held auxiliary chứng minh primary Nhân sự bị chặn; RED riêng đổi filter chứng minh response cũ thay kết quả mới. Ca hợp đồng chỉ đọc bắt được request supplier thừa; source baseline đồng thời gọi supplier và system vô điều kiện.

[Repair](repair.json) phân biệt lỗi fixture/typecheck, lỗi focus sau retry, lỗi tên dài phát hiện bằng ảnh rồi có RED đo text rect. Mỗi lỗi source sửa lần đầu; không hạ assertion/threshold/timeout hoặc thêm skip. Source cuối dùng build mới, toàn ca mới và hồi quy đạt theo [checks](checks.json).

- Focus repeat20/20, retries0; gate18/18, format/lint/typecheck và build đạt; full local unit Postgres16: 385 file, 5.165 pass/0 fail/1 skip health nghịch đảo có sẵn. Unit chạy trước các sửa thuần UI; Node-unit-reachable code không đổi, CI kiểm lại exact HEAD.
- 18 behavior case × desktop/mobile + setup: 37 pass, không fail/flaky/skip, retries=0. HTTP/network/retry/stale/pending option/đóng/mở lại/keyboard/role/401, nhãn và tên dài được kiểm.
- Hồi quy personnel/contracts/subcontractors: 16 pass, không fail/flaky/skip.
- Axe Light và Dark Blue với motion mặc định tại360px: primary Nhân sự và dialog option lỗi; input16px/body không tràn ngang. Không coi Chromium mobile emulation là Safari/cảm ứng người thật.
- npm audit toàn bộ0 vulnerability tại thời điểm kiểm, không suy ra mọi GitHub alert lịch sử đã đóng.

## Request và giới hạn

| Luồng                           | Baseline                                                                             | Candidate                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Chỉ đọc Hợp đồng                | Source mount effect gọi suppliers + systems (1 mỗi nguồn); RED bắt request supplier1 | GREEN xác nhận cả hai0                                          |
| Mở form rồi đóng/mở lại         | Nguồn đã tải từ đầu                                                                  | Cả hai1 khi cần, không GET thêm khi mở lại                      |
| Retry option hệ lỗi             | Không có retry metadata riêng                                                        | Chỉ GET hệ lần2; supplier vẫn1                                  |
| Chọn filter Nhân sự             | Response cũ có thể thay mới                                                          | Chỉ nhận kết quả URL/request hiện tại; auxiliary vẫn1 mỗi nguồn |
| Nhân sự khi giữ supplier vô hạn | Không hiện primary                                                                   | Primary vẫn hiện trong lúc nguồn phụ đang giữ                   |

Đây là request-count và behavior test với fixture/disposable auth, không phải CWV hoặc latency/usage production. Không có benchmark thời gian trước/sau ở vòng này. Snapshot cache chỉ trong vòng đời page, giống tuổi thọ dữ liệu metadata trước đây; không tạo cache dùng chung xuyên project/org.

## Ảnh và phạm vi rà

[Visual metadata](visual.json) và [screenshots](screenshots) chỉ có dữ liệu synthetic; mọi mutation ngoài fixture bị chặn. Đã mở xem trực tiếp tên dài, bảng desktop/mobile, nhãn filter và trạng thái lỗi option hợp đồng; đọc kích thước CSS360/1280 riêng với pixel ảnh theo device scale. Ảnh đầu chưa chờ AppHeader ổn định và lộ lỗi chữ tràn đã được thay bằng ảnh cuối, không dùng làm bằng chứng PASS.

Đã rà source Nhân sự/tổ đội, Hợp đồng, Đề xuất, Cuộc họp, Xe và Thông báo. Loader/cert/write sâu hơn và các nguồn phụ có consumer thật được giữ cho lát sau; không khẳng định đã audit toàn bộ sản phẩm hoặc nghiệm thu UI có auth trên production.

## Phát hành

Chỉ kiểm ghi trên DB disposable/mock; production public smoke chỉ đọc. PR CI phải xanh trên HEAD cuối, review thread giải quyết, squash merge, mainCI/deploy đúng SHA rồi public smoke desktop/393/360px (login/assets/axe/API bảo vệ/health/readiness). Không migration; rollback bằng revert squash/pipeline hiện hữu. Kết quả cuối lưu ở PR và kế hoạch nâng cấp owner, giữ checkpoint trước CI này để truy provenance. UAT/usage vẫn WAITING.
