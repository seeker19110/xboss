## Xuất PDF / Excel

- PDF (`@react-pdf/renderer`) phải đăng ký font qua `lib/nen/pdf-fonts.ts` — font mặc định Helvetica vỡ dấu tiếng Việt (lỗi thật).
- Excel (`exceljs`): bám format file tracking gốc khi xuất lưới (hàng nhóm + task, ô dimension "x"/"○"); tên file/tiêu đề lấy tên dự án từ DB, không hardcode.
- Cột SQL phải tồn tại thật (lỗi thật: route 500 vì tham chiếu `work_package_id`/`deadline` không có) — nếu diff thêm cột lạ, kiểm schema trong `migrations/`.
- Quyền xuất: export tracking là Admin/PM; xuất tài chính theo `PAYMENT_VIEW_ROLES`; luôn lọc dự án đang chọn.
- Tiền trong file xuất định dạng từ giá trị SQL/`formatVnd`, không tính lại bằng float JS.
- File lớn: tránh nạp toàn bộ bảng vào bộ nhớ khi có thể lọc/phân trang trong SQL.
