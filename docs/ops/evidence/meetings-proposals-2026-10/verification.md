# Checkpoint trước CI — Họp và Đề xuất

Base main `00d20712f065c9c10593ab15868bf7d2eed9b0fb`. Đây là checkpoint local;
trạng thái phát hành cuối được đối soát trên PR. F2/UAT và F3/usage vẫn WAITING.

## Hành vi và request

| Thao tác                           | Trước                             | Sau                                            |
| ---------------------------------- | --------------------------------- | ---------------------------------------------- |
| Chỉ đọc Họp với admin/PM           | 1 GET users                       | 0; tải khi mở biên bản có form giao việc       |
| Chỉ đọc Đề xuất với admin/PM       | 1 GET contracts + 1 GET materials | 0; tải theo loại form cần dùng                 |
| Mở lại form/danh mục đã thành công | Tải sớm khi vào trang             | Cache trong vòng đời trang; không GET lại      |
| Chi tiết tạm ứng/thanh toán/khác   | 1 GET định mức luôn trả null      | 0; cấp phát có materialId vẫn GET cảnh báo mềm |
| Xoá đề xuất thành công             | 2 GET refresh, tổng 3 list GET    | 1 GET refresh, tổng 2 list GET                 |

Số đếm từ fixture quan sát request thật của trình duyệt, không phải benchmark latency/CWV hoặc usage production.
Không gỡ capability nghiệp vụ; đề xuất bỏ tính năng vẫn cần usage/UAT của owner.

## Kiểm chứng local

- RED ban đầu:5 case ×desktop/mobile =10 lỗi +setup pass trước sửa. Bổ sung RED3 lỗi:
  duplicate refresh sau xoá (2 profile), tiêu đề mobile bị nhãn ép hẹp (1 profile).
  RED4 lỗi ô ngày dưới200px trên360px (2theme×2profile), đối chiếu ảnh bị cắt giá trị/icon.
  `red.json` và `repair.json` lưu cả lỗi harness/môi trường và sửa tương ứng.
- E2E sau đăng nhập thật trên PostgreSQL16 disposable:37 case mới ×2 profile +12 hồi quy cũ
  +setup =**87pass/0fail/0flaky/0skip**, retries0, exit0 trên source cuối gồm sửa bố cục ngày.
- Bao phủ: loading/HTTP/network/malformed/empty/401; danh sách độc lập quyền; role đến muộn
  không giành tab; retry riêng nguồn, giữ draft/snapshot chỉ xem; lazy/cache/abort/reopen;
  engineer/subcon không GET hợp đồng; BCH/viewer không có form tạo; status PATCH/decision/POST
  payload và số tiền; pending/đóng/Escape; xác nhận huỷ không ghi và trả focus; delete chỉ1refresh.
- Docs loading/error/retry không giả rỗng; định mức đúng điều kiện, lỗi/cảnh báo vẫn không cấm duyệt.
  Approval/createBill predicate giữ nguyên; refresh sau duyệt lỗi khoá nút và vẫn đóng modal được.
- `invariants.json`:34 bất biến AST giữ tất cả JSON payload, format tiền, bộ lọc/sort/quá hạn,
  role/predicate duyệt/tạo phiếu và financial handlers; không đổi API/backend/auth/schema/
  dependency/lock/SW/workflow. Đã soát caller `act → onChanged → refresh`; `onDeleted` chỉ đóng
  detail để bỏ refresh trùng. Audit hẹp theo `docs/audit.md` §8, không chạm route tài chính.
- Gate cuối **18/18 PASS**, exit0; build production **`Uv5tFTXwWU3vCrSQixQAI` PASS**, exit0, Node24.22.1.
  Full unit PostgreSQL16 **385file/5.165pass/0fail/1skip health cũ**, release-gate exit0.
  Lần process exit143 trước đó không được tính PASS; lượt process group riêng đã hoàn tất.
  [Local result và log hashes](local-verification.json).
- Ảnh synthetic desktop Sáng/mobile360 Dark Blue, list/expanded/create/detail; axe hai theme với
  motion mặc định, chờ trạng thái ready và finite transition tự kết thúc. Input16px mobile,
  controls44px, title dài wrap, table cuộn ngang có tên vùng, không tràn trang. `visual.json` khớp
  source hashes và build cuối;10scene đạt, đã mở ảnh đại diện soát, ô ngày mobile hiển thị đầy đủ.
  Không dùng dữ liệu thật hoặc tắt motion để đo axe.

## Giới hạn và rollout

Phiên test đăng nhập thật vào DB disposable; fixtures mô phỏng nguồn lỗi/chậm/role UI và chặn ghi
ngoài fixture. Không thay thế server RBAC test; full unit/CI vẫn bắt buộc. Không có phiên có auth
production được xác minh. Public health trước phát hành HTTP200; chỉ smoke public sau deploy,
không thử tài khoản demo, không dùng cookie/secret production trong test.

Giữ nguyên luồng tạo đề xuất + upload đính kèm từng phần; khôi phục giao dịch upload từng phần
không thuộc lát UI/request này. Không đổi trạng thái/quy trình duyệt, tính tiền, DTO hoặc quyền.

Chỉ merge sau checks exactHEAD hoàn tất xanh, test không flaky, review đã xử lý; chờ mainCI và
deploy cùng SHA, đối chiếu artifact/PM2 rồi kiểm login/assets/SSR của cả hai trang/API401/
health/readiness. Rollback bằng revert squash, không migration. F2/F3 tiếp tục WAITING.
