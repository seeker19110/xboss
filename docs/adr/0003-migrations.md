# ADR-0003: Hệ migrate SQL nhẹ (file .sql đánh số + schema_migrations)

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-07-01
- **Liên quan:** tiến hoá mục "Việc tiếp theo" của ADR-0001 (baseline schema hiện tại thành migration đầu tiên).

> Cập nhật 2026-10-05 theo S03 / QUALITY-FINAL-1: quyết định tự migrate lúc runtime dưới đây
> đã được thay bằng migrator riêng. App runtime chỉ kiểm tra trạng thái schema; mọi DDL chạy qua
> `npm run db:migrate` trước khi khởi động hoặc chuyển traffic sang phiên bản mới.

## Bối cảnh

Trước đây toàn bộ schema nằm trong một chuỗi `SCHEMA` (~520 dòng) trong `lib/db/index.ts`,
trộn `CREATE TABLE IF NOT EXISTS` với hàng chục `ALTER ... ADD COLUMN IF NOT EXISTS` chạy lại
**mỗi lần boot**. Idempotent nên an toàn, nhưng: khó review (một khối khổng lồ), không có lịch sử
"đổi gì, khi nào", và đổi schema bảng đã tồn tại phải chèn thêm `ALTER` tay vào giữa chuỗi
(nợ kỹ thuật ghi trong PROGRESS.md).

ADR-0001 chọn "không ORM/không migrate framework" và vẫn giữ nguyên. Nhu cầu ở đây **không phải**
ORM mà là **kỷ luật thay đổi schema** — hợp với mô hình raw SQL sẵn có.

## Quyết định

Thêm hệ migrate SQL thuần, không phụ thuộc bên ngoài:

- Thư mục `migrations/` chứa file `.sql` **đánh số 4 chữ số** (`0001_baseline.sql`, `0002_…`). Sắp theo
  tên = sắp theo số. `0001_baseline.sql` = toàn bộ schema hiện tại (trích nguyên văn, vẫn idempotent).
- Bảng `schema_migrations (name, applied_at)` theo dõi file đã áp.
- Runner `lib/db/migrate.ts` (`runMigrations`): giành **advisory lock** (serialize giữa nhiều
  process/instance), tạo bảng theo dõi, chạy từng file **chưa áp** trong 1 transaction riêng rồi
  ghi `schema_migrations`.
- **Migrator riêng:** chỉ lệnh `npm run db:migrate` (scripts/migrate.ts) được áp DDL. Lệnh này
  bắt buộc dùng `MIGRATE_DATABASE_URL`; thiếu biến thì dừng và không fallback sang
  `DATABASE_URL`. `npm run db:migrate -- --dry-run` chỉ liệt kê migration còn thiếu.
- **Runtime chỉ kiểm tra:** trước query nghiệp vụ, `lib/db/index.ts` đọc `schema_migrations` và
  so với danh sách migration của checkout. Nếu bảng tracking không tồn tại/không đọc được hoặc
  còn migration thiếu, query dừng bằng lỗi schema chưa sẵn sàng; runtime không tạo bảng, không
  lấy file SQL để chạy và không tự migrate.
- Health/diagnostic không áp schema thay app. `/api/health` trả trạng thái degraded khi schema
  chưa sẵn sàng để deploy/monitor phát hiện được.

## Lý do

- Không phụ thuộc: vẫn raw SQL, không ORM/CLI ngoài, không phá quy ước "DATE là chuỗi".
- File `.sql` riêng lẻ dễ review, có lịch sử áp trong DB; baseline idempotent nên áp lại trên
  production đang chạy chỉ **ghi nhận** baseline (không đụng dữ liệu).
- Build vẫn không cần DB: pool lazy; migrator chỉ kết nối khi lệnh deploy gọi rõ ràng.
- Tách credential giúp không đặt quyền DDL trong đường phục vụ request. Vận hành phải cấu hình
  `DATABASE_URL` cho app runtime và `MIGRATE_DATABASE_URL` cho job migrate, cùng trỏ đúng một DB.

## Các phương án đã cân nhắc

- **Giữ nguyên chuỗi SCHEMA**: diff nhỏ nhất nhưng không giải quyết gốc (vẫn một khối khó review, không có lịch sử).
- **Tự migrate trong app runtime:** không dùng vì request/health có thể kích DDL với credential
  runtime và nhiều instance có thể cùng triển khai schema trong khi phục vụ traffic.
- **Prisma/Drizzle migrate**: đã loại ở ADR-0001 (ép kiểu Date, thêm generate/migrate, vendor tooling).

## Hệ quả

- **Tích cực:** đổi schema từ nay = thêm file `migrations/000N_*.sql` (không sửa `lib/db/index.ts`); có lịch sử áp; concurrency an toàn hơn nhờ advisory lock.
- **Đánh đổi / rủi ro:** phải chạy migrator thành công trước khi start/đổi traffic; quên bước này
  khiến app từ chối query thay vì tự chữa. `migrations/` phải có mặt ở cả runtime để so trạng
  thái schema. Vẫn không tự cập nhật `docs/ERD.md` (làm tay như trước).
- **Quy ước tiếp theo:** đổi schema **luôn** thêm file mới, **không** sửa file migration đã áp trên production (append-only).

## Quy trình rollout và phục hồi (cập nhật S03, 2026-10-05)

1. Chuẩn bị backup/recovery theo quy trình môi trường; nạp `DATABASE_URL` và
   `MIGRATE_DATABASE_URL` trỏ cùng database đích. Không đưa credential migrator vào cấu hình app
   runtime nếu nền deploy cho phép tách env giữa job migrate và process ứng dụng.
2. Chạy `npm run db:migrate -- --dry-run` để xem tên migration còn thiếu. Dry-run không tạo
   `schema_migrations` và không ghi database.
3. Chạy `npm run db:migrate` trong bước deploy có quyền DDL. Advisory lock tuần tự hóa các
   migrator; mỗi file và dòng `schema_migrations` commit cùng transaction. Nếu file lỗi, file đó
   rollback và lệnh thoát khác 0; migration trước đó đã commit vẫn còn áp.
4. Chỉ start/đổi traffic sau khi lệnh migrate thành công. App dùng runtime URL để kiểm schema;
   thiếu bảng tracking hoặc migration mới làm `/api/health` degraded và request cần DB fail với
   lỗi `XBOSS_SCHEMA_NOT_READY`. Sửa credential/target hoặc chạy migrator đúng DB rồi retry.
5. Không chạy down-migration tự động. Khi rollout code lỗi, chỉ rollback app nếu code cũ tương
   thích schema đã áp; nếu không, forward-fix bằng migration append-only hoặc phục hồi backup đã
   kiểm chứng theo runbook. Không xoá marker `schema_migrations` để ép app qua kiểm tra.
