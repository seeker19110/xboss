# M137 — Tải việc hiện trường độc lập và tạo trang tin cậy

| Thuộc tính       | Giá trị                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State            | **Approved for implementation**                                                                                                                          |
| Người/ngày duyệt | Chủ dự án, 24/10/2026, trong chat: “Còn phần nào cải thiện được ngay về UI và hiệu năng mà không cần chờ UAT và dữ liệu sử dụng thì triển khai tiếp đi.” |
| Base             | `9afb984d46d5e2e0f0d14e6f65e3186b836a2800` — PR #676 đã phát hành                                                                                        |
| Goal             | UPGRADE-2026-10; F2 UAT và F3 usage giữ WAITING theo quyết định owner                                                                                    |

## Vấn đề và outcome

Kỹ sư/thầu phụ mở trang chủ trên điện thoại cần xem ngay việc được giao. Hiện
`HomeHienTruong` chờ Promise.all cả bốn nguồn dù my-tasks đã xong; nguồn phụ chậm làm
chậm toàn bộ trang và lỗi chính. Admin/PM tạo trang tracking có thể gửi POST lặp; mất
mạng không có catch/phản hồi, các label chưa nối input. Đây là lỗi có thể tái hiện bằng
browser và nguồn test, không cần usage hay quyết định thay đổi bố cục dựa trên UAT.

## Contract và điểm chạm

### A — tạo trang tracking

Sở hữu `app/components/NewSheetModal.tsx` và E2E mới `ui-performance-sheet-create.spec.ts`.

- Form có submit semantic; name/code/slug/copyFrom có label liên kết, mô tả/hộp lỗi phù hợp.
- Trong một lần gửi chỉ có một POST; nhả pending ở lỗi mạng/HTTP, giữ toàn bộ nội dung,
  lỗi hiện trong form và có thể thử lại. Có feedback đang lưu, nút gửi khóa khi pending.
- Giữ nguyên payload API `/api/sheets`, default nguồn sao chép, quyền tạo và redirect thành công.
- Input mobile >=16px, control chính >=44px; focus/axe và 360/393px không tràn ngang.
- Không thêm idempotency backend hoặc tự thử lại POST vì chưa rõ request lỗi đã ghi hay chưa.

### B — dữ liệu hiện trường

Sở hữu `app/components/home/HomeHienTruong.tsx` (helper dữ liệu nội bộ nếu cần) và E2E mới
`ui-performance-field-loading.spec.ts`.

- Bốn nguồn khởi chạy song song; thành công hoặc lỗi `/api/my-tasks` cập nhật phần chính
  ngay khi nguồn chính xong, không chờ notifications/sheets/project.
- Từng nguồn phụ có loading/error/empty riêng; không biến lỗi thành “0 thông báo/không có
  dự án/không có trang”. Có thử lại nguồn lỗi; không tải lại primary khi chỉ retry nguồn phụ.
- Khi chưa có sheet, link tracking giữ fallback hợp lệ; badge chỉ dùng số đã tải thành công.
- Abort/sequence guard ngăn kết quả request cũ ghi đè sau retry/unmount. Refresh mới hủy lượt cũ.
- Giữ nguyên 401 redirect, 404 module off (engineer về Điều hành mà không ghi sở thích),
  API/phân quyền và cách tính/sắp công việc, dueSoon theo server, liên kết theo project/sheet.
- Không kéo panel Điều hành/Recharts vào Hiện trường, không đổi auth/cache SW/vault.
- Ở 360/393px, nhãn KPI và ba thao tác chính được xuống dòng trong đúng khung, không
  đè nhau; vùng chạm >=44px và nội dung cuối không bị thanh thao tác che. Ở desktop giữ icon.

### C — bàn phím và scroll khi hộp thoại lồng nhau

Sở hữu `app/components/dialogs.tsx` và E2E mới `ui-performance-modal-keyboard.spec.ts`.
Lỗi source: mọi Modal cùng lắng nghe Escape ở document; xác nhận xóa trong form sửa
tracking có thể đóng cả hai. Focus selector hiện còn tính control bị disabled bởi fieldset
hoặc bị ẩn; khóa scroll riêng lẻ có thể rò khi cả cha/con unmount.

- Chỉ hộp thoại trên cùng xử lý Escape/Tab. Escape xác nhận chỉ hủy xác nhận, giữ form
  và nội dung đang sửa; không gửi DELETE hoặc tự ghi dữ liệu.
- Focus trap chỉ dùng phần tử thực sự nhìn thấy/focus được và không disabled (kể cả
  disabled kế thừa từ fieldset). Toàn bộ control disabled thì focus panel dự phòng.
- Scroll nền khóa khi còn Modal; sau đóng/unmount tất cả, trả trạng thái overflow ban đầu.
  Đóng con trả focus về đúng nút trong cha; đóng cha trả về trigger còn tồn tại.
- Giữ portal, API props, aria-label/labelledby, click backdrop và các confirm hiện có.
- Không sửa handler/API xóa hay logic tracking; browser dùng sheet test độc lập và kiểm
  không có DELETE khi hủy, focus/Tab/Shift+Tab và scroll khi đóng theo thứ tự/lúc unmount.

### D — tương phản khi đổi theme trong tìm kiếm

Hồi quy M136 phát hiện text option chuyển màu trong 150ms còn nền đổi ngay, làm tương
phản giảm tạm thời. Bỏ riêng `transition-colors` ở option `GlobalSearch.tsx`; giữ trạng
thái hover/active/focus và nội dung. Chạy nguyên test axe ngay sau chuyển theme, không
thêm thời gian chờ hoặc hạ ngưỡng để che lỗi.

## Verification

Acceptance Given/When/Then:

- AC1: form đã có bốn giá trị, POST đang chờ; bấm/submit tiếp → chỉ một request, feedback
  đang lưu; lỗi mạng/403/500 → nhả pending, giữ giá trị, lỗi rõ và thử lại thành công.
- AC2: người dùng mở form bằng bàn phím trên desktop hoặc 360/393px → mọi trường có tên
  truy cập, Enter gửi form, nút chính đủ 44px, input >=16px, axe không serious/critical.
- AC3: my-tasks đã phản hồi nhưng một nguồn phụ chưa phản hồi → dữ liệu chính hoặc lỗi
  chính hiện ngay; không phải đợi nguồn phụ hoàn tất.
- AC4: nguồn phụ thất bại rồi retry → báo rõ nguồn và chỉ tải lại nguồn lỗi; primary và
  nguồn phụ đã thành công không bị tải lại, trạng thái chưa tải không giả thành dữ liệu rỗng.
- AC5: refresh/unmount khi request còn chờ → hủy/bỏ kết quả cũ; module off và chuyển chế
  độ của kỹ sư vẫn đúng, thầu phụ không gọi dashboard.
- AC6: form sửa tracking có confirm con hoặc controls pending → Escape chỉ đóng con,
  focus không thoát hoặc chọn control hidden/disabled; scroll và focus phục hồi sau đóng.
- AC7: mở Hiện trường ở 360/393/1280px → toàn bộ glyph nhãn KPI/thao tác nằm trong
  khung, không giao nhau hoặc tràn ngang; thanh thao tác không che footer/nội dung cuối.
- AC8: tìm kiếm mở khi đổi tối/sáng → axe tương phản đạt ngay sau đổi theme, giữ focus-trap.

Browser RED trên main trước sửa: abort/403/500 form, hai lần bấm khi POST chậm, nhãn axe;
nguồn phụ treo mà primary xong hoặc lỗi. GREEN trên production build: cùng ca trên desktop
và Pixel5, thêm retry phụ/đổi lượt/unmount/moduleoff/role và các E2E M127/M136 liên quan.

Đo local cùng fixture PostgreSQL16 disposable, build production và mô phỏng mạng/CPU cố định;
báo riêng thời gian primary sẵn sàng khi một nguồn phụ bị trễ có kiểm soát. Không quy lab
thành field CWV, không hứa cải thiện phần trăm khi chưa đo. Chạy `npm run gate`, unit liên
quan, build và release CI. Không dùng DB/credential production hay provider trả phí.

Research ngày 24/10/2026: source hiện tại chứng minh Promise.all chặn render và form thiếu
guard/catch; [React useEffect](https://react.dev/reference/react/useEffect) mô tả cleanup
và loại kết quả request cũ; [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
cho phép hủy fetch; [form HTML](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form)
là pattern submit/label semantic đang dùng ở các form hiện hữu. Giữ raw fetch/taiJson và
AbortController sẵn có, không thêm thư viện cache/dependency chỉ để xử lý hai lỗi này.

Kết quả local phần UI 24/10 tại `cd1a2cee`: CODE VERIFIED; 18/18 gate, build, full unit 5.152 pass/0 fail/
1 skip allowlist, 50 browser mới đạt và hồi quy tổng 128 pass/0 fail/1 skip nền tảng.
[Bằng chứng, số đo và giới hạn](../ops/evidence/m137/verification.md). Sửa nhãn viewport
benchmark lấy từ profile thực, đính chính metadata M136/M137 và giữ nguyên số đo raw.
CI/merge/rollout theo PR, chưa phát hành M137 tại checkpoint này.

## Phạm vi, đường lùi và triển khai

Không schema/API/CI/hook/auth, không xóa module sống, không telemetry mới. Phần UI không
thêm dependency. Ngoại lệ M137-R1 sau push PR #677: audit tái hiện Undici có sẵn 8.10.2
mức high, pin riêng bản sửa 8.12.2 và đổi hai manifest; [phạm vi/kiểm chứng](../ops/evidence/m137/undici-repair.md).
Modal chung chỉ sửa giới hạn keyboard/scroll đã mô tả ở C, không đổi pattern/design hoặc API.
Rollback bằng revert PR. Nhánh `codex/m137-ui-performance`; commit/push, mở PR với
bằng chứng trên HEAD. Merge/deploy theo quyền người dùng và `xt.yaml`; không thay policy.

## Phát hành 24/10/2026

PR #677 đã merge tại `6b631f15`; CI main 40055784430 và deploy 40056412712 success
cùng SHA. Public smoke desktop/mobile đạt; [release evidence](../ops/evidence/m137/release.md)
ghi riêng flaky/skip và giới hạn. M137 DEPLOYED; UAT/usage vẫn WAITING.
