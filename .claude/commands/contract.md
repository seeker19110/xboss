---
description: Thiết kế schema DB/API contract TRƯỚC khi viết code, cho tính năng cần DB schema mới hoặc endpoint mới — ghi vào đặc tả docs/nang-cap/M<xx>, chốt schema/API trước khi implement
---

> 💡 Lệnh lấy từ `projects-template` @ `59bd1d1` (ADR-0014 của XBoss). Model theo `CLAUDE.md` mục "Quy trình theo mức rủi ro".
> Các chỗ ghi `CLAUDE.md §N`, "contract §3d" hay số ADR trong lệnh là của **repo khung** (`docs/framework/02-ai-rules-and-project-template.md`,
> `docs/framework/standard-delivery.md`); ở XBoss, `CLAUDE.md` + `docs/adr/` của XBoss thắng — đối chiếu ở `docs/framework/XBOSS.md`.

Kích hoạt bước **thiết kế contract (schema DB và/hoặc API) trước khi code**, cho tính năng cần schema mới hoặc endpoint mới. Đây là phần schema/API của đặc tả mức M/L (`CLAUDE.md` của XBoss — LUẬT CỨNG "thiếu đặc tả thì hỏi") — không thay thế đặc tả, mà là phần phải chốt **trước khi** giao code.

> **TRIGGER:** người dùng mô tả một tính năng cần bảng/cột DB mới, thay đổi schema hiện có, hoặc một API endpoint mới/đổi chữ ký — **trước khi** bắt đầu sửa source code.

## Bước 1 — Xác định phạm vi contract
- **DB:** bảng/cột mới, thay đổi kiểu dữ liệu, ràng buộc (FK/unique/check), index cần thêm.
- **API:** route, method, request/response schema, mã lỗi, auth/quyền yêu cầu.
Đọc `PROJECT.md`, `docs/ERD.md` và `migrations/` hiện có trước — không bịa cấu trúc, không đoán tên bảng/field đã tồn tại (CLAUDE.md §4).

## Bước 2 — Viết contract vào spec tính năng
Ghi vào `docs/nang-cap/M<xx>-<slug>.md` (khung các đặc tả M<xx> sẵn có), mục schema/API/điểm chạm code:
- **DB:** DDL thật cho một file `migrations/000N_<mo-ta>.sql` MỚI — append-only, idempotent (`IF NOT EXISTS`), không down-migration (ADR-0003); RLS theo ADR-0005 nếu bảng gắn dự án; migration đụng dữ liệu phải qua staging (Definition of Done).
- **API:** bảng route/method/request/response/mã lỗi; format phản hồi hiện có (`NextResponse.json(data)` / `{ error: "<tiếng Việt>" }`), `getCurrentUser()` → 401, quyền qua `CAN`/`canTouchTask`, scope `projectId`.
- Đối chiếu breaking change: đổi contract hiện có ảnh hưởng client/consumer khác → nêu rõ, thuộc CLAUDE.md §9.

## Bước 3 — Đối chiếu ràng buộc bất biến trước khi chốt
- Bảo mật: input từ client validate ở server, không tin client (CLAUDE.md §3 mục A2).
- Không secret/PII lộ trong response mặc định.
- Migration append-only, idempotent; tiền tính trong SQL, không float JS (`CLAUDE.md` mục Tiền tệ).

## Bước 4 — Chờ duyệt (đúng feature gate)
Đặc tả (gồm contract vừa viết) phải được chốt (người dùng duyệt hoặc phiên chính tự chốt trong phạm vi được giao) **trước khi sửa source code**. Chưa chốt → chỉ được tiếp tục research/viết spec, không code.

## Ranh giới
- Không tự chế schema khi thiếu thông tin nghiệp vụ — hỏi người dùng khi đó là dữ kiện không tự xác minh (dừng và hỏi chỉ theo CLAUDE.md §9 (thiếu mục tiêu/dữ kiện không tự xác minh · không có phương án đạt chất lượng trong scope/budget · cần quyền chưa cấp) và `docs/framework/standard-delivery.md` §3d).
- Không code trước khi contract trong spec được duyệt.
- Tính năng nhỏ không đụng DB/API mới (chỉ sửa logic nội bộ) → không cần lệnh này, feature gate thường vẫn áp dụng nhưng khỏi bước contract riêng.
