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

| Lớp | Cơ chế thật trong XBoss |
|-----|--------------------------|
| Ranh giới | **API là ranh giới bảo mật duy nhất** — mọi route gọi `getCurrentUser()`, kiểm quyền `CAN` / `canTouchTask` (`lib/auth.ts`, `lib/roles.ts`). Trang chỉ redirect client-side khi 401. |
| Phiên | Cookie stateless `xboss_session = userId.exp.HMAC` ký bằng `XBOSS_SECRET` (bắt buộc ở production, fail-fast nếu thiếu). |
| Chống dò mật khẩu | Rate-limit login in-memory (`lib/ratelimit.ts`): 5 lần sai/15 phút theo IP+email, 20/IP → 429 + `Retry-After`. |
| SQL injection | Truy vấn **tham số hoá** bắt buộc qua helper `lib/db` (placeholder `?` → `$n`) — không nối chuỗi giá trị. |
| Phụ thuộc | `npm audit --audit-level=high` trong CI (`.github/workflows/ci.yml`) + Dependabot (cập nhật hằng tuần). |
| Bí mật | Dùng biến môi trường; `.env*` bị `.gitignore` chặn. **gitleaks** (`.github/workflows/secret-scan.yml`) quét diff/commit mỗi push & PR. Cron bảo vệ bằng `CRON_SECRET` qua header `Authorization: Bearer` (không qua query param). |
| Upload | Ảnh/biên bản giới hạn mime + dung lượng (`lib/photos.ts`), lưu ngoài git (`data/uploads/`). |

> **Lưu ý phân quyền:** XBoss **không dùng RLS Postgres** — kiểm soát truy cập ở tầng API
> (xem `docs/adr/0001-postgres-raw-sql.md`). Vì vậy mọi route mới **phải** kiểm quyền ở server;
> đây là điểm yếu cần test kỹ (xem `tests/auth.test.ts`).

## Hàng rào bảo mật DỰ KIẾN (Lớp 2 khung — chưa bật)

Nằm trong lộ trình (xem `PROGRESS.md` mục "Tiếp theo"):

- **CodeQL (SAST)** — **bị chặn** vì repo đang **private** và chưa có GitHub Advanced Security.
  Để bật: đưa repo **public** (CodeQL miễn phí) **hoặc** mua GHAS, rồi bật **Settings → Code security &
  analysis → Code scanning**. Khi đủ điều kiện, thêm `.github/workflows/codeql.yml`
  (mẫu sẵn trong `_framework-dropins/.github/workflows/codeql.yml`).
- `lib/env.ts` (Zod) — validate biến môi trường lúc khởi động (PR riêng).

## Nguyên tắc bất biến (không bao giờ phá)

- **Bí mật không bao giờ vào Git** — dùng biến môi trường.
- **Không tin client** — logic nhạy cảm (kiểm tra quyền, tính tiến độ, nghiệm thu) luôn ở server.
- Truy vấn **tham số hoá** (chống SQL injection); **escape** dữ liệu ra HTML (chống XSS).
- Mọi đầu vào (người dùng/API) **validate lúc chạy** trước khi dùng.
- Thiếu cấu hình bắt buộc (vd `XBOSS_SECRET` ở production) → **throw sớm** (fail-fast).
