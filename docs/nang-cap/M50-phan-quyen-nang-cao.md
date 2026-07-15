# M50 — Phân quyền nâng cao: quyền dữ liệu-hoá, quyền theo trường, SoD (P2)

> **Mục tiêu**: nâng trục Phân quyền 3.0 → ~4.0 mà **không phá** kiến trúc quyền hiện tại: map `CAN` (`lib/auth.ts`) vẫn là nguồn mặc định; DB chỉ chứa **override**; thêm lớp che trường nhạy cảm ở API; báo cáo xung đột vai trò cho kiểm toán.
>
> **Không làm** (chủ đích, tránh over-engineer): tạo vai trò mới tuỳ ý (7 vai trò là đủ cho nghiệp vụ hiện tại — tạo role mới đòi rà lại toàn bộ UI/route, chi phí lớn lợi ích nhỏ); ABAC tổng quát; quyền theo bản ghi ngoài các `canTouch*` sẵn có.

## PR1 — Override quyền trong DB

### Migration `0055_role_permissions.sql`

```sql
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,            -- lib/roles.ts
  perm_key TEXT NOT NULL,        -- tên hàm trong CAN: 'approve', 'editDates', 'viewPayment', ...
  allowed BOOLEAN NOT NULL,
  updated_by INT, updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(role, perm_key)
);
```

### Điểm chạm `lib/auth.ts`

- Chuyển `CAN` từ map hàm tĩnh sang: `can(user, permKey)` = tra cache override → có dòng thì theo `allowed`; không có → logic mặc định hiện tại (giữ nguyên từng hàm, đổi tên map nội bộ thành `CAN_DEFAULT`).
- Cache: nạp toàn bộ `role_permissions` vào memory, TTL 60s hoặc invalidate qua watermark version (pattern `sheetVersion`) — bảng nhỏ (<100 dòng), đọc mỗi request không được phép chạm DB.
- **Ràng buộc an toàn**: một số perm không cho override mở rộng cho `VIEW_ONLY_ROLES` (danh sách `LOCKED_PERMS` trong code: mọi perm ghi dữ liệu) — API cấu hình từ chối 422 kèm lý do; chỉ cho phép **siết** (allowed=false) với vai trò thao tác hoặc **mở** perm xem.
- Route hiện gọi `CAN.x(role)` đổi dần sang `can(user, 'x')` — cơ học, giao `mechanical` theo lô; trong thời gian chuyển tiếp 2 API cùng tồn tại (CAN.x đọc override qua cùng cache để không lệch).

### UI

- `/admin/permissions`: ma trận role × perm_key (nhóm theo module), ô 3 trạng thái: mặc định (nhạt, ghi rõ giá trị mặc định) / mở / siết; chỉ admin sửa. Mỗi thay đổi ghi audit (M43 trigger gắn thêm bảng `role_permissions`).

## PR2 — Quyền theo trường (field-level)

- `lib/sensitive-fields.ts` (mới):
  ```ts
  // entity → danh sách trường nhạy cảm + perm cần có để xem
  export const SENSITIVE: Record<string, { fields: string[]; perm: string }[]> = {
    variation:    [{ fields: ["amount"], perm: "viewPayment" }],
    contract:     [{ fields: ["value", "retention_pct"], perm: "viewPayment" }],
    payment_cert: [{ fields: ["amount", "deduction", "net"], perm: "viewPayment" }],
    payroll:      [{ fields: ["rate", "gross", "deductions", "net"], perm: "viewPayroll" }], // perm mới, mặc định admin/pm
  };
  export function stripSensitive<T>(entity: string, rows: T[], user): T[]; // thay giá trị bằng null
  ```
- Áp tại **API** (ranh giới bảo mật duy nhất — nguyên tắc sẵn có): các route GET trả entity trong danh sách gọi `stripSensitive` trước khi res.json. UI hiển thị "•••" khi null ở cột tiền (component nhỏ `MaskedValue`).
- Route liệt kê tổng hợp (dashboard tài chính) đã chặn theo `PAYMENT_VIEW_ROLES` từ trước — không đổi.

## PR3 — SoD & báo cáo kiểm toán quyền

- SoD cưỡng bức đã nằm trong Approval Engine (M46: creator ≠ approver). PR này bổ sung:
  - `GET /api/admin/sod-report?days=90` (admin): liệt kê vi phạm mềm — cùng 1 user vừa tạo vừa duyệt (dữ liệu trước M46), vừa lập PO vừa nhận hàng, vừa ghi chi vừa duyệt chi — mỗi rule 1 câu SQL trong `lib/sod.ts` kèm mô tả tiếng Việt.
  - `GET /api/admin/permissions-snapshot`: xuất ma trận quyền hiệu lực (mặc định + override) tại thời điểm — Excel, phục vụ câu hỏi kiểm toán "ai có quyền gì".
- UI: 2 mục thêm vào `/admin/permissions` (tab "Báo cáo SoD", nút "Xuất ma trận quyền").

## Test

- `tests/permissions.test.ts` (integration): override siết admin→false chặn thật ở `can()`; mở perm ghi cho viewer bị 422; cache invalidate sau PATCH.
- `tests/sensitive-fields.test.ts` (unit): strip đúng trường theo perm, không đụng trường khác, mảng rỗng.
- `tests/sod.test.ts` (integration): seed 1 cặp vi phạm → report bắt được.

## Chia PR

1. **PR1**: migration + `can()` + cache + trang ma trận + đổi call-site theo lô.
2. **PR2**: sensitive-fields + strip tại route + MaskedValue.
3. **PR3**: sod-report + permissions-snapshot.
