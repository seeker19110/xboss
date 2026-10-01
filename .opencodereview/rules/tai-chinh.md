## Tài chính / hợp đồng / thanh toán (VÙNG RỦI RO CAO — sai tiền, rò chéo dự án)

- **Tiền**: cấm cộng/nhân/chia tiền trên float JS (parser NUMERIC → `parseFloat`). `SUM`, `* rate`, VAT, tạm ứng, giữ lại làm **trong SQL**; nếu buộc tính ở JS thì SELECT cột tiền `::text` rồi dùng `parseMoney`/`addMoney`/`mulRate`/`formatVnd` (`lib/nen/money.ts`, bigint đơn vị đồng×100). `Number(x) * 0.1`, `reduce((a, b) => a + b.amount)` trên tiền là lỗi thật.
- **Phạm vi dự án**: mọi truy vấn danh sách/tổng hợp lọc `project_id` dự án đang chọn (lỗi thật: `/api/payment-certs` từng quên scope hoàn toàn); ghi thì chốt `projectId` qua `chotProjectIdChoGhi`, không tin client. Bảng có RLS (ADR-0005, migration `0069_rls.sql`) chỉ là phòng tuyến thứ hai — không thay được filter ở app; truy vấn chạy trong `withTransaction` để GUC `app.project_id` có hiệu lực.
- Quyền: xem tài chính = `PAYMENT_VIEW_ROLES` (admin/pm/bch); ghi chỉ vai trò được `CAN` cho phép — `bch` không được ghi.
- Trạng thái chứng từ (đề nghị thanh toán, PO, hợp đồng, VO): chuyển trạng thái kiểm trạng thái hiện tại bằng `FOR UPDATE`; duyệt/nhận hàng 2 lần không cộng dồn (idempotent).
- Phân tách nhiệm vụ (SoD, `lib/bao-mat/sod.ts`): người lập không tự duyệt chứng từ của mình nếu quy tắc yêu cầu.
- Mọi thay đổi số liệu tiền có audit (ai, khi nào, giá trị cũ/mới) theo cơ chế sẵn có của bảng đó.
