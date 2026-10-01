---
paths:
  - "lib/tai-chinh/**/*.ts"
  - "app/api/costs/**/*.ts"
  - "app/api/payment-certs/**/*.ts"
  - "app/api/contracts/**/*.ts"
  - "app/api/purchase-orders/**/*.ts"
  - "lib/nen/money.ts"
---

# Checklist tài chính (vùng rủi ro cao — docs/audit.md §4, §8)

- **Cấm cộng/nhân tiền trên float JS.** `SUM`/`* rate` làm trong SQL; buộc phải tính ở JS thì
  cast cột tiền `::text` rồi qua `parseMoney`/`addMoney`/`mulRate`/`formatVnd`
  (`lib/nen/money.ts`, bigint đơn vị đồng×100).
- Mọi truy vấn tài chính/danh sách lọc đúng `projectId` (lỗi thật: `/api/payment-certs` từng quên
  scope); xem trang tài chính: `PAYMENT_VIEW_ROLES` (`admin/pm/bch`).
- IPC/chứng từ thanh toán theo đợt **tuần tự**: không lập đợt mới khi đợt trước còn nháp/trình
  (lỗi thật 2026-10-01: trả trùng tiền) — trả 409, khoá theo hợp đồng.
- Thao tác lặp lại (bấm 2 lần, offline queue) không cộng dồn sai — idempotent + khoá hàng.
- Review bắt buộc `audit-logic` + `audit-bao-mat`.
