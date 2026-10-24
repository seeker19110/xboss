# Kiểm chứng UI giữ ngữ cảnh và thao tác

Baseline main `d4cb1b7de04ab8d632b9e6338afb98c0cece4f79` (#681). Source kiểm cuối `992bd0c4a7c59853c7bea5a70f90cddb44f33a0b`, build `ZESpfgOuVNTdib35T73lw`; các commit tiếp theo chỉ lưu hồ sơ. [PR#682](https://github.com/seeker19110/xboss/pull/682). Trạng thái: **VERIFY — chưa merge/deploy**. Owner đã ủy quyền merge/deploy sau kiểm tra; F2 UAT/F3 usage giữ **WAITING**.

## Thay đổi và giới hạn

- Chấm công chỉ ghi khi snapshot khớp ngày đang chọn; bỏ response cũ, chặn gửi chồng và giữ draft khi lỗi mạng. Tổng tháng không tải lại khi chỉ đổi ngày trong cùng tháng. Phép tính, quyền và contract giữ nguyên.
- Hồ sơ hiện danh sách độc lập systems/auth phụ; lỗi GET có retry và giữ dữ liệu cũ; upload pending bảo vệ draft/file, retry danh sách chỉ GET. Keyboard chọn file, nhãn, focus và target mobile được kiểm.
- Ảnh tracking phân biệt lỗi/rỗng/loading, retry GET, bỏ response cũ; chọn file và xem ảnh bằng bàn phím, Esc/focus dùng modal nền. Contract upload/xóa/nén/offline queue/receipt/ownership/object URL không đổi; không tuyên bố đã mở rộng guard upload/delete của gallery.
- Thiết bị giữ selection/modal/lịch sử khi refresh lỗi, log/cert có pending guard và giữ draft. Subcon mặc định Thu hồi khớp lựa chọn quyền hiện hữu; không đổi RBAC/API/payload. Definition list dùng dt/dd hợp lệ. AddEquipmentModal không thay đổi.
- OrdersTab bỏ đúng hai GET/state/type không có consumer: approved PR và contracts. Giữ luồng PR, danh mục form, KPI, payload và cả hai GET purchase-orders hiện hữu.

Không thêm dependency, API, schema, capability hoặc gỡ tính năng đang dùng. Trang nhân sự waterfall/stale là ứng viên vòng sau, ngoài lát này.

## RED → repair → GREEN

[red.json](red.json) lưu các execution RED thật trước sửa, phân biệt log bị ghi đè bởi `--list` và lỗi môi trường không được tính RED. [repair.json](repair.json) giữ lượt tích hợp đầu 76 pass/11 fail, sửa definition-list và đồng bộ/locator fixture, cùng RED riêng cho mặc định subcon. Không hạ WCAG/assertion/threshold/timeout hoặc thêm skip.

[checks.json](checks.json) lưu hash raw report/log và nguồn build:

- Build cuối PASS; gate cuối 18/18, gồm format/lint/typecheck/UI guard/quyền/scope/dead code.
- Full local unit PostgreSQL16: 385 file, 5.165 pass/0 fail/1 skip health nghịch đảo có sẵn. Chạy trên ac441d45; các module được unit chạm không đổi tới source cuối. CI sẽ kiểm lại HEAD cuối đầy đủ.
- 44 behavior case × desktop/mobile + setup: **89 pass/0 fail/0 flaky/0 skip**, retries=0. Bao gồm network/HTTP/401/role, pending/draft/không gửi trùng, stale response, refresh sau POST, keyboard/focus, 360px và axe serious/critical Light/Dark Blue với motion mặc định.
- Hồi quy attendance/documents/equipment/offline-deep/ui-gallery-recovery: **44 pass/0 fail/0 flaky/0 skip**. PO regression bổ sung: **4/4 pass**, không fail/flaky/skip.
- Filechooser keyboard kiểm lặp riêng: **20/20 pass**, retries=0; listener đăng ký trước await focus, giữ Enter và mọi assertion.
- npm audit toàn bộ: 0 vulnerability tại thời điểm kiểm. Không coi đây là bằng chứng đóng mọi GitHub alert lịch sử.
- Review độc lập source/behavior và metric provenance không còn P1/P2; test mock role/payload không thay UAT/server RBAC.

## Kiểm hình thức trực tiếp

Root và reviewer độc lập đã mở xem bốn ảnh fixture/synthetic dưới đây. Không tràn ngang tại360/1280px, không pageerror; lỗi gần form, title/file/note còn nguyên. Modal thiết bị có cuộn dọc tại360px, nút gửi tiếp cận được bằng cuộn/bàn phím. Metadata và request read-only/mock tại [visual.json](visual.json); đây không phải UAT hay phép đo latency.

- [Chấm công mobile Dark Blue](screenshots/attendance-mobile-dark.png).
- [Hồ sơ desktop Light, upload lỗi giữ draft](screenshots/documents-desktop-light.png).
- [Thiết bị mobile Dark Blue, log lỗi giữ draft](screenshots/equipment-mobile-dark.png).
- [PO desktop Light, KPI và danh sách](screenshots/orders-desktop-light.png).

## Hiệu năng có thể xác minh

| Phép đo cùng fixture                                                 |   Baseline | Candidate | Phạm vi kết luận                       |
| -------------------------------------------------------------------- | ---------: | --------: | -------------------------------------- |
| Chọn 6 ngày cùng tháng, GET ngày                                     |          6 |         6 | Dữ liệu ngày vẫn được tải              |
| Cùng thao tác, GET tổng tháng                                        |          6 |         1 | Bỏ 5 GET tháng thừa, cả desktop/mobile |
| Mở PO, approved PR / contracts                                       |      1 / 1 |     0 / 0 | Bỏ hai GET không consumer              |
| Mở PO, purchase-orders                                               |          2 |         2 | Giữ nguyên KPI + tab                   |
| Hồ sơ, nguồn phụ trễ 3s: median response-primary→row visible desktop | 3.314,05ms |   27,47ms | Primary không còn chờ nguồn phụ        |
| Cùng phép đo, mobile                                                 | 3.316,65ms |   40,20ms | Primary không còn chờ nguồn phụ        |

Raw trước/sau và script đầy đủ ở thư mục này: [Documents trước](documents-before.json), [sau](documents-after.json), [script](documents-benchmark.ts.txt); [Attendance trước](attendance-before.json), [sau](attendance-after.json), [script](attendance-requests.ts.txt); [PO trước](orders-before.json), [sau](orders-after.json). Script/fixture hash Documents khớp; 5 cặp/profile, xen kẽ 0/3000ms, 20 mẫu mỗi bản. Benchmark candidate XaVy có cùng source Documents/Attendance/Orders với build cuối; sửa sau chỉ Equipment và test/docs.

`primaryToRowMs` dùng clock của runner từ response headers đến Playwright expect visible, gồm polling; không phải browser render timing, CWV hay độ trễ người dùng production. Normal median desktop49,63→40,01ms/mobile40,34→36,68ms **không được diễn giải là nhanh hơn**: baseline có tác vụ lint/typecheck nhẹ chung máy, không kiểm soát CPU load hoàn toàn. Held-request behavior test là bằng chứng cấu trúc chính. Không có số liệu usage thật hay UAT người thật.

## Phát hành

Chỉ ghi/mutation trên DB disposable hoặc mocked route, public production chỉ GET. Không migration; rollback bằng revert squash và pipeline hiện hữu. PR CI phải xanh trên HEAD cuối, review threads giải quyết, squash merge rồi main CI và deploy cùng SHA; public smoke sau deploy gồm desktop/393px/360px, login/assets/axe/API bảo vệ/health/readiness. Kết quả cuối sẽ lưu ở PR và kế hoạch nâng cấp được ủy quyền. Hiện các bước phát hành này đang chờ, không đánh dấu DEPLOYED.
