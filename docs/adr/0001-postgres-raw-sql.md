# ADR-0001: PostgreSQL raw SQL tự quản (không Supabase / ORM / hệ migrate)

- **Trạng thái:** Đã chấp nhận (ghi nhận hồi tố — quyết định đã áp dụng từ đầu dự án)
- **Ngày:** 2026-06-30
- **Cập nhật 2026-08-12:** giai đoạn thử nghiệm chạy trên **Vercel + Postgres của Supabase**
  (kế hoạch quay lại tự host về sau). Quyết định trong ADR này **không đổi** — vẫn raw SQL qua
  `pg`, không ORM, không dùng SDK/Auth/RLS của Supabase, phân quyền vẫn ở tầng API. Đây chính
  là điều làm việc đổi chỗ chạy trở nên rẻ: chỉ dùng Postgres thuần nên chuyển nhà cung cấp =
  đổi `DATABASE_URL` + restore dump, không phải viết lại tầng dữ liệu. Lý do "không phụ thuộc
  nhà cung cấp (tự host VPS)" ở mục Lý do nên đọc là "không phụ thuộc nhà cung cấp" — vế "tự
  host VPS" chỉ đúng ở thời điểm ghi.

## Bối cảnh

Bộ khung tham chiếu (`docs/framework/`) giả định stack **Next.js + Tailwind + Supabase** với migration có phiên bản và RLS. XBoss dùng Next.js + Tailwind nhưng tầng dữ liệu khác hẳn: PostgreSQL truy cập trực tiếp qua `pg`, không Supabase, không ORM (Prisma/Drizzle), không công cụ migrate.

## Quyết định

Giữ tầng CSDL hiện tại:

- Helper mỏng `lib/db` (placeholder `?` → `$1..$n`, parser kiểu tuỳ chỉnh: cột `DATE` giữ chuỗi `'YYYY-MM-DD'`).
- **Schema qua hệ migrate SQL nhẹ** (`migrations/*.sql` đánh số + `schema_migrations` + runner tự áp lúc boot — xem ADR-0003); đổi schema = thêm file migration mới (append-only), không `ALTER` tay ngoài luồng đó. Backfill dữ liệu phức tạp vẫn viết script trong `scripts/`.
- Phân quyền ở **tầng API** (`CAN` / `canTouchTask`), **không dùng RLS**.

## Lý do

- Toàn quyền kiểm soát SQL, kiểu dữ liệu, hiệu năng; không phụ thuộc nhà cung cấp (tự host VPS).
- Quy ước "ngày là chuỗi `'YYYY-MM-DD'`" xuyên suốt code so sánh ngày — ORM sẽ ép kiểu `Date` và phá quy ước này.
- Dự án một người + một dự án thi công: chi phí ORM/migration framework lớn hơn lợi ích lúc này (YAGNI).

## Các phương án đã cân nhắc

- **Supabase (theo khung):** kéo theo RLS, migration CLI, vendor lock-in; không hợp mô hình tự host + raw SQL hiện có.
- **Prisma/Drizzle:** ép kiểu `Date`, thêm bước generate/migrate; lợi ích type-safety đã đạt phần lớn nhờ TS `strict` + helper.

## Hệ quả

- **Tích cực:** đơn giản, không vendor lock-in, build không cần DB thật (pool lazy).
- **Đánh đổi / rủi ro:** không có lịch sử migration → đổi schema phải kỷ luật tay; `docs/ERD.md` cập nhật thủ công; phân quyền sai ở API là điểm yếu duy nhất (phải test kỹ — xem `tests/auth.test.ts`).
- **Việc tiếp theo:** ~~nếu sau này cần nhiều người/nhiều môi trường, cân nhắc baseline schema hiện tại thành migration đầu tiên~~ → **đã làm** ở **ADR-0003** (hệ migrate SQL nhẹ: `migrations/0001_baseline.sql` + `schema_migrations` + runner tự áp lúc boot). Vẫn giữ raw SQL, không ORM.
