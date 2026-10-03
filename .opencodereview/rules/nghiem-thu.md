## Nghiệm thu 2 bước (VÙNG RỦI RO CAO)

- Chỉ đặt/huỷ `nghiem_thu` qua `POST/DELETE /api/tasks/:id/approve` và `POST /api/approvals { taskIds }`; quyền `CAN.approve` (Admin/PM). Route PATCH task thường phải tiếp tục chặn `status=nghiem_thu`.
- Task phải đạt đúng 100% (progress = 1) mới được duyệt; duyệt theo lô áp **cùng** quy tắc cho từng task, không bỏ qua task lỗi một cách im lặng (báo rõ task nào bị từ chối và vì sao).
- Mỗi lần đặt/huỷ ghi audit vào `task_history` trong cùng transaction; đọc trạng thái hiện tại bằng `FOR UPDATE` để 2 request duyệt đồng thời không sinh audit trùng.
- Idempotent: duyệt lại task đã `nghiem_thu` không tạo thêm bản ghi audit / không đổi dữ liệu.
- Biên bản nghiệm thu (`task_documents`): PDF/ảnh, tối đa 20MB, quyền đọc/xoá đối xứng với quyền tải lên.
