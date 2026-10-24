# Rà production — giữ đúng ngữ cảnh và trạng thái thao tác

Baseline main `d4cb1b7d` (#681), production đã phát hành và public smoke chỉ đọc đạt.
Owner yêu cầu ngày 24/10/2026 tự triển khai UI/hiệu năng, kiểm kỹ, merge và deploy;
UAT/usage F2/F3 vẫn WAITING. Đây là lát sửa lỗi/refactor mức S trên capability hiện hữu.
Không thêm capability, API, schema, dependency hoặc chính sách quyền.

## Phạm vi và acceptance

- Chấm công: dữ liệu ngày A không được dùng để ghi khi UI chọn ngày B; bỏ response cũ,
  hiện loading/error/retry đúng nguồn và chặn mọi ghi cho tới snapshot hợp lệ. Guard pending
  đồng bộ và lỗi mạng giữ UI dùng được. Tổng tháng chỉ tải khi đổi tháng hoặc ghi thành công,
  không tải lặp mỗi lần chọn ngày trong cùng tháng. Giữ phép tính, endpoint/payload/quyền.
- Hồ sơ: primary không đợi systems; auth vẫn xác minh quyền upload. Lỗi không thành empty;
  refresh lỗi giữ danh sách cũ; retry chỉ GET. Upload pending giữ draft/file, không gửi lặp,
  không đóng/chỉnh khi đang gửi, keyboard chọn file được; nhãn/target mobile theo master.
- Ảnh tracking: GET lỗi có retry, không empty/loading vô hạn, giữ ảnh cũ khi refresh lỗi;
  không áp response cũ/unmount. Keyboard chọn file/xem ảnh được, target mobile phù hợp.
  Giữ nguyên contract upload/xóa/nén ảnh và hàng đợi mã hóa/receipt/ownership/object URL.
- Thiết bị: loader trang giữ danh sách/selection/modal khi refresh lỗi, có retry GET; modal ghi log có guard/finally/error/draft/pending; retry lịch sử chỉ GET sau
  POST được nhận, giữ API/payload/quyền. Load/error/empty phân biệt, không che lỗi mạng. Mặc định Thu hồi cho subcon khớp option hiện hữu; dl dùng dt/dd hợp lệ.
- PO: bỏ đúng hai GET/state/type không có consumer (approved PR và contracts) trong
  OrdersTab; giữ loadPRs, KPI, payload PO và mọi hành vi nhập/tính toán/quyền hiện có.

## Kiểm chứng và ranh giới

Test oracle được viết trước; chạy RED trên build baseline `QTpB20JxOWhybrez898ap` có
app content đồng nhất main. Sau tích hợp chạy build mới, GREEN desktop/mobile, axe Light/
Dark Blue, 360px và hồi quy liên quan; gate18/18, full unit Postgres disposable, CI trên
HEAD cuối. Benchmark cùng fixture cho request-count và nguồn phụ chậm; không kết luận CWV
hoặc độ trễ người dùng production. Không hạ assertion/threshold/timeout hoặc thêm skip.

Chỉ kiểm thử có ghi trên DB disposable; public production chỉ đọc. Review độc lập, squash
merge sau mọi check xanh, main CI/deploy cùng SHA, public smoke sau deploy. Không migration;
rollback bằng revert squash và pipeline hiện hữu. Cùng failure tối đa ba repair attempts.
Nhân sự waterfall/stale được ghi làm ứng viên ngoài lát này; chưa thay đổi page đó.
