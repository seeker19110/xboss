## Chuỗi tính toán tiến độ (VÙNG RỦI RO CAO — docs/audit.md §4, §8)

Lớp lỗi nguy hiểm nhất: code biên dịch sạch nhưng **tính sai** % / trạng thái. Soi kỹ từng nhánh.

- `progressFromChecks`: % = số ô checked / tổng ô; chỉ bằng **1** khi checked đúng bằng tổng — làm tròn không được đẩy 99.5%+ thành 100% (lỗi thật đã sửa; giữ trần 0.99). Tổng ô = 0 phải xử lý rõ, không chia cho 0.
- `deriveStatus`: `nghiem_thu` **không bao giờ** bị hạ cấp tự động; `tre` chỉ khi `end_date < todayISO()` (so chuỗi) **và** progress < 1; enum trạng thái là slug trong `lib/tien-do/status.ts`.
- `recomputeTask`/`recomputePackage`: đọc-sửa-ghi trong `withTransaction` + `SELECT ... FOR UPDATE` (withTransaction reentrant — gọi lồng không mở transaction mới). Gỡ `FOR UPDATE` hay tách khỏi transaction là hồi quy race condition (2 người tick cùng lúc → lost update / audit trùng).
- `task_history` chỉ ghi khi % thực sự đổi; ghi trong cùng transaction với việc cập nhật %.
- % nhóm = trung bình các task của nhóm; nhóm rỗng phải xử lý rõ.
- Ngày thực tế (`capNhatNgayThucTe`) cập nhật trong cùng transaction/khoá với việc ghi %.
- Mọi đổi logic ở đây phải kèm test hồi quy (`tests/recompute.test.ts` hoặc tương đương) — nếu diff đổi hành vi mà không đụng test nào, nêu ra.
