## Route ghi tiến độ / tick ô dimension (VÙNG RỦI RO CAO)

- Subcon chỉ thao tác task được giao: kiểm `canTouchTask` (cấp task) / `canTouchPackage` (cấp nhóm) ở **mọi** method ghi.
- Sau khi đổi ô/%, gọi `recomputeTask` (và gián tiếp `recomputePackage`) **trong cùng** `withTransaction` với thao tác ghi — không tính lại ngoài transaction.
- Không cho route này đặt `status = nghiem_thu` (chỉ qua route approve).
- Hàng đợi offline (`app/components/offlineQueue/`) sẽ gửi lại request khi có mạng: thao tác phải **idempotent** (tick lại ô đã tick không đổi %, không ghi `task_history` trùng). Trả **4xx** cho dữ liệu/quyền không hợp lệ (client bỏ khỏi hàng đợi) và **5xx** cho lỗi tạm thời (client giữ lại thử tiếp) — trả sai lớp mã làm kẹt hoặc mất thao tác.
- Hold-point QAQC chặn tick phải trả lỗi có lý do cụ thể để client rollback ô đã tick lạc quan.
- Watermark đồng bộ (`sheet_versions`) được trigger `bump_sheet_version` bump trong cùng transaction ghi `tasks`/`work_packages` — ghi bằng đường vòng bỏ qua bảng đó sẽ làm client khác không thấy thay đổi.
