# Chính sách bảo mật — XBoss

Bảo mật là một trụ cột của dự án (`CLAUDE.md` mục **Auth** và **Vai trò & nguyên tắc**).
Tài liệu này nói **cách báo cáo lỗ hổng** và **các hàng rào bảo mật đang chạy thật** trong repo.

## Báo cáo lỗ hổng

**Đừng** mở issue công khai cho lỗ hổng bảo mật. Thay vào đó:

- Dùng **GitHub Security Advisories**: tab **Security → Report a vulnerability** (báo cáo riêng tư), hoặc
- Gửi email tới người bảo trì repo.

Vui lòng kèm: mô tả, bước tái hiện, ảnh hưởng dự kiến, và phiên bản/commit liên quan.
Mục tiêu phản hồi: xác nhận trong vòng **72 giờ**; thống nhất mốc vá trước khi công bố.

## Hàng rào bảo mật ĐANG chạy

| Lớp               | Cơ chế thật trong XBoss                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ranh giới         | **API là ranh giới bảo mật duy nhất** — mọi route gọi `getCurrentUser()`, kiểm quyền `CAN` / `canTouchTask` (`lib/auth.ts`, `lib/roles.ts`). Trang chỉ redirect client-side khi 401.                                              |
| Phiên             | Cookie stateless `xboss_session = userId.exp.HMAC` ký bằng `XBOSS_SECRET` (bắt buộc ở production, fail-fast nếu thiếu).                                                                                                           |
| Chống dò mật khẩu | Rate-limit login lưu **Postgres** (bảng `login_rate_limits`, `lib/ratelimit.ts` — đúng khi chạy nhiều instance, upsert atomic qua `ON CONFLICT`): 5 lần sai/15 phút theo IP+email, 20/IP → 429 + `Retry-After`.                   |
| SQL injection     | Truy vấn **tham số hoá** bắt buộc qua helper `lib/db` (placeholder `?` → `$n`) — không nối chuỗi giá trị.                                                                                                                         |
| Phụ thuộc         | `npm audit --audit-level=high` trong CI (`.github/workflows/ci.yml`) + Dependabot (cập nhật hằng tuần).                                                                                                                           |
| Bí mật            | Dùng biến môi trường; `.env*` bị `.gitignore` chặn. **gitleaks** (`.github/workflows/secret-scan.yml`) quét diff/commit mỗi push & PR. Cron bảo vệ bằng `CRON_SECRET` qua header `Authorization: Bearer` (không qua query param). |
| Upload            | Ảnh/biên bản giới hạn mime + dung lượng (`lib/photos.ts`), lưu ngoài git (`data/uploads/`).                                                                                                                                       |
| Biến môi trường   | `lib/env.ts` (Zod) validate lúc khởi động — `XBOSS_SECRET` ở production phải ≥32 ký tự, `CRON_SECRET` (nếu đặt) ≥16 ký tự; thiếu/không đạt → **throw sớm** (fail-fast).                                                           |

> **Lưu ý phân quyền:** kiểm soát truy cập **chính** vẫn ở tầng API — mọi route mới **phải**
> kiểm quyền ở server (xem `tests/auth.test.ts`). Từ 2026-07-18 có thêm **RLS Postgres làm
> phòng tuyến thứ 2** (ADR-0005): nếu route quên filter `project_id` thì trả **rỗng** thay vì
> lộ chéo dự án — RLS **không thay** check tầng app.
>
> | Lớp              | Phạm vi                                                                                                                                                                                                 | Migration                                    |
> | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
> | RLS theo dự án   | 11 bảng tài chính/hợp đồng: `contracts`, `variation_orders`, `payment_bills`, `invoices`, `payroll`, `insurance_bonds`, `claims`, `tender_packages`, `purchase_orders`, `advances`, `cash_transactions` | `0069_rls.sql`, khoá cửa `0077_rls_lock.sql` |
> | RLS theo tổ chức | `users`, `projects`, `suppliers`, `code_lists`, `role_permissions`, `api_keys`, `webhooks`, `integrations`, ...                                                                                         | `0080_org_rls.sql`                           |
>
> Điều kiện vận hành bắt buộc: app chạy bằng role **`xboss_app`** (`NOBYPASSRLS`, mọi bảng
> `FORCE ROW LEVEL SECURITY`) — chạy bằng owner/superuser sẽ khiến policy bị **bỏ qua âm thầm**.
> Ngữ cảnh đặt qua GUC `app.project_id` trong `withProjectScope`/`withTransaction`
> (`lib/db/index.ts`).

## Hàng rào bảo mật DỰ KIẾN (Lớp 2 khung — chưa bật)

Nằm trong lộ trình (xem `PROGRESS.md` mục "Tiếp theo"):

- **CodeQL (SAST)** — **bị chặn** vì repo đang **private** và chưa có GitHub Advanced Security.
  Để bật: đưa repo **public** (CodeQL miễn phí) **hoặc** mua GHAS, rồi bật **Settings → Code security &
  analysis → Code scanning**. Khi đủ điều kiện, thêm `.github/workflows/codeql.yml`
  (mẫu sẵn trong `_framework-dropins/.github/workflows/codeql.yml`).

## Nguyên tắc bất biến (không bao giờ phá)

- **Bí mật không bao giờ vào Git** — dùng biến môi trường.
- **Không tin client** — logic nhạy cảm (kiểm tra quyền, tính tiến độ, nghiệm thu) luôn ở server.
- Truy vấn **tham số hoá** (chống SQL injection); **escape** dữ liệu ra HTML (chống XSS).
- Mọi đầu vào (người dùng/API) **validate lúc chạy** trước khi dùng.
- Thiếu cấu hình bắt buộc (vd `XBOSS_SECRET` ở production) → **throw sớm** (fail-fast).
