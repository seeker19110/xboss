# Họp và Đề xuất — UI tải đúng nhu cầu

- Base: main `00d20712f065c9c10593ab15868bf7d2eed9b0fb` (#685 đã deploy).
- Người dùng đã duyệt sửa, kiểm tra, merge và deploy ngày 24/10/2026; UAT/usage vẫn WAITING.
- Role: admin/PM đọc và điều phối; engineer/subcon tạo theo quyền hiện hữu; BCH/viewer chỉ đọc theo API. Mobile hiện trường và desktop văn phòng.
- Outcome: đọc danh sách không kéo danh mục form; lỗi tải được phân biệt với rỗng, snapshot chỉ xem khi chưa xác minh lại; bảng/form dùng bàn phím và màn hình 360px.
- Sửa UI client của hai trang; một hook list và notice dùng chung. Không đổi backend/API/auth/DTO, tính tiền, điều kiện duyệt/tạo phiếu, schema, dependency, SW hoặc workflow.
- Danh mục cache trong vòng đời trang, hủy request đóng form/đổi loại; không cache lâu dài. Hợp đồng chỉ khi form tiền của admin/PM; vật tư chỉ khi cấp phát; người làm chỉ khi mở biên bản của admin/PM. GET định mức chỉ cho cấp phát có materialId đúng điều kiện server, vẫn là cảnh báo mềm.
- AC: kiểm đếm request; retry đúng nguồn, không mất draft/snapshot; response đã hủy không ghi đè; không ghi từ snapshot chưa xác minh; keyboard mở/đóng và trả focus; input mobile 16px, target 44px, không tràn trang; axe hai theme với motion mặc định.
- Test: đăng nhập thật trên PostgreSQL disposable riêng, dữ liệu API synthetic và chặn ghi ngoài fixture; không dùng dữ liệu/secret production. Production chỉ smoke public nếu chưa có phiên được xác minh.
- Phạm vi không bao gồm khôi phục giao dịch tạo đề xuất + upload từng phần, thay đổi quy trình duyệt hoặc quyết định gỡ tính năng dựa trên usage.
- Gate: RED trước sửa; GREEN targeted hai thiết bị, bất biến AST, lint/type/gate/build/full unit; CI đúng HEAD không flaky, review threads, merge rồi CI main/deploy đúng SHA/public smoke.
