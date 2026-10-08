# S05 — thiết bị, context và dịch vụ khoá vault offline

State: **Approved for implementation**.
Chủ dự án duyệt QUALITY-FINAL-1 (2026-09-25) và yêu cầu thi hành tiếp lộ trình ngày 2026-10-08.
Spec cha: [A2 Offline](AUDIT-2026-09-25/A2-OFFLINE.md), [DATA-MIGRATIONS §1–§5](AUDIT-2026-09-25/DATA-MIGRATIONS.md),
PLAN §S05, TEST-MATRIX A2/Q-AC02/Q-AC03. Đây là phạm vi con, không thay contract của đặc tả cha.

## Phạm vi và contract

- Migration `0163_offline_vault.sql`: `offline_devices`, `offline_vault_keys` (DDL theo DATA-MIGRATIONS
  §4), RLS ENABLE + FORCE, grant tối thiểu cho `xboss_app` (vault chỉ SELECT/INSERT; thiết bị UPDATE
  đúng 4 cột), sequence generation context, hàm `offline_proof_nguoi_khac` SECURITY DEFINER chỉ trả
  boolean (kiểm "một chủ sử dụng" xuyên org).
- Route `app/api/offline/{devices,devices/[id],context,vault/keys,vault/unlock}`: 401 khi chưa đăng
  nhập, origin nghiêm cho mọi ghi, rate limit theo user, `private, no-store`, thiếu/sai
  `XBOSS_OFFLINE_KEK` → 503 fail-closed. KEK là keyring có version, dẫn xuất HKDF, không được trùng
  `XBOSS_SECRET`; khoá bọc AES-256-GCM, AAD ràng mọi định danh; không lưu/trả raw key.
- Profile mặc định shared-safe (lease 15 phút); field-personal (8 giờ) chỉ admin cùng org có 2FA duyệt,
  bị chặn/hạ khi trình duyệt dùng chung với người khác. Thu hồi thiết bị tăng `session_version` của chủ.
- Client: epoch ngữ cảnh qua BroadcastChannel; đổi dự án/đăng xuất/đổi actor khoá tab khác (đóng
  SSE/poll, tạm dừng hàng đợi offline, lớp khoá `alertdialog`).

## Tiêu chí chấp nhận

- Q-AC02: unlock kiểm lại manifest với quyền hiện hành; thu hồi giao việc/đổi vai trò → `locked`.
- Q-AC03: khác user/khác org không mở được khoá; sửa cột DB → `locked`; xoay KEK không mất khoá.
- A2: đổi dự án ở mọi nơi gọi `/api/project/select` phát epoch (test tĩnh); e2e lớp khoá + axe.
- Ngoài phạm vi (S06–S08): receipt/precondition endpoint thật, vault IndexedDB, UI phục hồi; rewrap KEK
  bằng role bảo trì, retire khoá, phục hồi khi mất proof — ghi "Cần quyết" trong PROGRESS.md.
