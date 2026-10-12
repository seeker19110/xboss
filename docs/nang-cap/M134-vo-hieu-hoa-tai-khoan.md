# M134 — Vô hiệu hoá tài khoản (thay cho xoá khi còn ràng buộc)

| Thuộc tính       | Giá trị                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Lộ trình hoàn thiện §0.3 mục 3 "xoá user từng duyệt IPC" (F-003); sổ nợ #572                                      |
| Spec owner       | Phiên chính (lượt `/auto-complete` 2026-10-12, hồ sơ `docs/nang-cap/auto/2026-10-12-hoan-thien-no-code.md` W-004) |
| State            | **Approved for implementation** — phiên chính tự duyệt theo /auto-complete (ADR-0015), 2026-10-12                 |
| Người/ngày duyệt | Phiên chính, 2026-10-12 (ủy quyền ADR-0015)                                                                       |
| Cập nhật         | 2026-10-12                                                                                                        |

## 1. Problem, vai trò và bằng chứng

Nhân sự nghỉ việc/chuyển dự án phải bị cắt quyền truy cập ngay. Hiện chỉ có **xoá** (`DELETE /api/users/:id`):
user còn dữ liệu kiểm toán (duyệt IPC, phiếu chi, audit…) thì xoá trả **409 `dependency_conflict`**
(`app/api/users/[id]/route.ts:144-166`) — đúng vì không được mất vết kiểm toán, nhưng Admin **không còn cách nào**
khoá tài khoản đó: người nghỉ việc vẫn đăng nhập được, phiên 7 ngày vẫn sống, điện thoại vẫn nhận Web Push.
Đường tạm duy nhất là đổi mật khẩu hộ (cắt phiên qua `pwFrag`) — không ghi nhận trạng thái, dễ quên, SSO OIDC vẫn
vào được (bỏ qua mật khẩu).

## 2. Outcome, metric và guardrail

- Admin vô hiệu hoá/kích hoạt lại một tài khoản cùng tổ chức; tài khoản bị vô hiệu hoá **không** đăng nhập được
  (mật khẩu, 2FA bước 2, SSO) và **mọi phiên đang có hết hiệu lực ngay** ở request kế tiếp.
- Guardrail: không xoá/đổi dữ liệu lịch sử; không tự quản trị khoá chính mình; tổ chức luôn còn ≥ 1 Admin **đang
  hoạt động** (đếm admin cuối cùng ở cả hạ cấp/xoá/vô hiệu hoá chỉ tính admin chưa bị vô hiệu hoá).

## 3. Nghiên cứu hiện trạng

- `lib/bao-mat/auth.ts` `getCurrentUser`: tra `users` theo uid trong token, kiểm `pwFrag`, `session_version`,
  `org_id` — chưa có khái niệm "bị khoá".
- Đường phát phiên: `app/api/auth/login/route.ts` (mật khẩu), `app/api/auth/login/2fa/route.ts` (bước 2),
  `lib/bao-mat/oidc.ts` `upsertSsoUser` (SSO). Ngữ cảnh offline (`lib/bao-mat/offline-context.ts`) dựa
  `session_version`.
- `app/api/users/[id]/route.ts` PATCH: sửa tên/vai trò/mật khẩu/tắt 2FA (Admin, lọc `org_id`); đếm "admin cuối
  cùng" chưa trừ admin bị khoá (vì chưa có).
- `app/users/page.tsx`: trang quản trị người dùng (Admin).
- API key (`lib/bao-mat/api-keys.ts`) là khoá tích hợp cấp tổ chức, không phải danh tính người dùng.

## 4. Phương án

- **A (chọn):** cột `users.disabled_at TIMESTAMPTZ NULL`; vô hiệu hoá = đặt `disabled_at = now()` +
  `session_version + 1` (cắt mọi phiên, kể cả ngữ cảnh offline) + xoá `push_subscriptions` của user; mọi đường
  đăng nhập và `getCurrentUser` từ chối khi `disabled_at IS NOT NULL`.
- B (loại): chỉ tăng `session_version` + đổi mật khẩu ngẫu nhiên — không có trạng thái để hiển thị/kích hoạt lại,
  SSO vẫn vào được.
- C (loại): xoá mềm kiểu `deleted_at` + ẩn khỏi mọi truy vấn — chạm hàng trăm truy vấn `users`, rủi ro cao, YAGNI.

## 5. Scope / non-goals

- Scope: migration, kiểm ở `getCurrentUser` + 3 đường đăng nhập, `PATCH /api/users/:id { disabled }`, `GET
/api/users` trả `disabledAt`, đếm admin cuối cùng chỉ tính admin hoạt động, nút + nhãn trên `/users`, gợi ý vô
  hiệu hoá trong thông báo 409 khi xoá.
- Non-goals: ẩn user bị khoá khỏi các danh sách chọn người (phân công, người phụ trách…) — chỉ hiển thị nhãn ở
  `/users`; thu hồi API key do user tạo (khoá cấp tổ chức, thu hồi riêng ở `/admin/integrations`); tự động khoá
  theo lịch/HR.

## 6. User journeys và mọi trạng thái

- Admin ở `/users` bấm "Vô hiệu hoá" trên dòng user → xác nhận (`appConfirm`) → dòng hiện nhãn "Đã vô hiệu hoá"
  (icon + chữ, không chỉ màu) và nút đổi thành "Kích hoạt lại". Lỗi (admin cuối, chính mình, mạng) → toast tiếng
  Việt, dòng giữ nguyên.
- User bị khoá đang dùng app: request kế tiếp nhận 401 → trang tự về `/login`. Đăng nhập lại (đúng mật khẩu) →
  **403** "Tài khoản đã bị vô hiệu hoá — liên hệ quản trị viên" (chỉ lộ trạng thái khi mật khẩu đúng).

## 7. Functional và non-functional requirements

- FR1 `PATCH /api/users/:id` nhận `disabled: boolean` (Admin `CAN.manageUsers`, cùng org). `true`: chặn chính mình
  (400), chặn khi target là admin hoạt động cuối cùng của org (400); trong transaction `FOR UPDATE` đặt
  `disabled_at = now()`, `session_version = session_version + 1`, xoá `push_subscriptions` của user. `false`: đặt
  `disabled_at = NULL` + `session_version + 1` (cookie lỡ đúc trong lúc khoá không sống lại). Idempotent: lặp lại cùng giá trị không đổi `disabled_at` gốc, không tăng thêm phiên.
- FR2 `getCurrentUser` trả `null` khi `disabled_at IS NOT NULL`.
- FR3 Login mật khẩu, login 2FA bước 2, SSO: user bị khoá → 403 `{ error, code: "account_disabled" }`, không phát
  cookie phiên. Login mật khẩu chỉ trả 403 **sau** khi mật khẩu đúng (sai mật khẩu vẫn 401 chung + ghi rate-limit).
- FR4 Đếm "Admin cuối cùng" (hạ cấp, xoá, vô hiệu hoá, đồng bộ role SSO) chỉ tính `role='admin' AND disabled_at
IS NULL` của đúng org, khoá dòng `FOR NO KEY UPDATE` trong cùng transaction với lần ghi (không `FOR UPDATE` —
  xung đột khoá FK của transaction khác).
- NFR: không thêm round-trip DB ở `getCurrentUser` (thêm cột vào SELECT có sẵn).

## 8. Acceptance criteria

- AC1 Vô hiệu hoá user → token cũ của user đó: `getCurrentUser` trả `null`.
- AC2 Đăng nhập mật khẩu đúng của user bị khoá → 403 `account_disabled`, không có `Set-Cookie` phiên; sai mật khẩu
  → 401 như cũ.
- AC3 Kích hoạt lại → đăng nhập lại được; `disabled_at` NULL.
- AC4 Không tự khoá chính mình (400); không khoá admin hoạt động cuối cùng của org (400); admin org A không khoá
  được user org B (404).
- AC5 Vô hiệu hoá xoá `push_subscriptions` của user và tăng `session_version` đúng 1 lần; lặp lại không tăng tiếp.
- AC6 Admin cuối cùng: org có 2 admin, 1 bị khoá → không hạ cấp/xoá/khoá được admin còn lại.
- AC7 `npm run gate -- --test --build` xanh; `docs/ERD.md` sinh lại khớp.

## 9. Kiến trúc và điểm chạm code

- `migrations/0171_users_disabled.sql`: `ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;`
  (thêm thuần tuý — đi thẳng production, không cần staging).
- `lib/bao-mat/auth.ts` (§8): thêm `disabled_at` vào SELECT của `getCurrentUser`; hàm thuần
  `taiKhoanBiKhoa(disabledAt)` dùng chung.
- `app/api/auth/login/route.ts`, `app/api/auth/login/2fa/route.ts`, `lib/bao-mat/oidc.ts` (+ route callback):
  từ chối user bị khoá.
- `app/api/users/[id]/route.ts`: nhánh `disabled`, đếm admin hoạt động; `app/api/users/route.ts` GET trả
  `disabledAt`.
- `app/users/page.tsx`: nút + nhãn.

## 10. API contract

- `PATCH /api/users/:id` body thêm `{ disabled: true | false }` → 200 `{ user: { id, name, email, role,
disabledAt } }`; 400 `{ error }` (chính mình / admin cuối); 403; 404.
- `POST /api/auth/login`, `POST /api/auth/login/2fa`: thêm 403 `{ error: "Tài khoản đã bị vô hiệu hoá — liên hệ
quản trị viên", code: "account_disabled" }`.

## 11. Data contract và DDL

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
```

Không backfill (NULL = đang hoạt động). Trigger audit sẵn có trên `users` ghi vết thay đổi.

## Giả định (điều lẽ ra hỏi chủ repo — đã tự chọn)

- Lộ trạng thái "bị vô hiệu hoá" chỉ **sau** khi mật khẩu đúng: người dùng thật cần biết vì sao không vào được;
  kẻ dò email không học thêm gì (sai mật khẩu vẫn 401 chung).
- Xoá push subscription khi khoá (không chỉ tắt): kích hoạt lại thì người dùng bật lại push trên thiết bị như lần
  đầu — đổi lại không còn rò tên task/dự án tới máy của người đã nghỉ.
- Không ẩn user bị khoá khỏi danh sách chọn người: tránh chạm hàng chục truy vấn; để việc sau nếu chủ repo muốn.
