# S07 tiền đề nhỏ — IndexedDB chỉ ACK sau commit

Yêu cầu thi hành việc nhỏ song song ngày 2026-09-25; tham chiếu QUALITY-FINAL-1 PR #531
head 30de3cd. Base code main 8336918; phạm vi chỉ store.ts, test mới và tài liệu này.
Không chạm logic.ts/index.ts của queue, không tranh file với nhánh tiền hoặc Service Worker.

## Hợp đồng giữ nguyên

Giữ DB xboss-offline phiên bản 1, store ops, kiểu QueueStore/QueuedOp và payload đang dùng.
Đã đọc store.ts, các kiểu/caller queue và tests/offline-queue.test.ts. Không đổi schema,
không xóa/nhận chủ/chuyển queue legacy, không thêm vault hoặc thay cơ chế logout/replay.
Đây là sửa primitive nhỏ có thể tích hợp trước S05–S08; không coi S07 vault đã hoàn thành.

## Thay đổi và kiểm chứng

add/update/remove/clear và getAll chỉ resolve sau transaction complete; abort sau request
success vẫn báo lỗi. Request error không preventDefault nên IndexedDB giữ semantics rollback.
Open lỗi không giữ promise reject mãi mãi; versionchange đóng connection để lần sau mở mới.
Open blocked báo lỗi rõ, handle đến muộn được đóng, không rò connection.

13 test trên source thật trong VM có IDB event stub đã đạt cục bộ. Chạy đồng thời với suite
money/cache trong process riêng. Mutation resolve ngay khi request success bị test phát hiện;
đã khôi phục source. Đây không phải E2E IndexedDB trên browser thật hoặc test durability phần cứng.
Tham khảo lifecycle: https://www.w3.org/TR/IndexedDB/
CI đúng HEAD phải qua format/lint/typecheck/unit/DB/build/E2E hiện hữu. Safari/iOS thật và
vault/lease/ownership/conflict/atomic dedup-enqueue vẫn thuộc slice tiếp theo.

Không đổi dữ liệu production, không merge/deploy. Rollback code không down-version/xóa IDB;
không chấp nhận ACK sớm như một giải pháp sửa lỗi vận hành. Kết quả CI cập nhật tại PR.
