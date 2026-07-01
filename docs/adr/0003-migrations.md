# ADR-0003: Hệ migrate SQL nhẹ (file .sql đánh số + schema_migrations)

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-07-01
- **Liên quan:** tiến hoá mục "Việc tiếp theo" của ADR-0001 (baseline schema hiện tại thành migration đầu tiên).

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
- **Tự áp lúc boot**: `ensureSchema()` (lib/db) gọi `runMigrations` khi query đầu tiên chạy — giữ
  nguyên trải nghiệm vận hành cũ (không cần thêm bước deploy). Advisory lock thay cho việc bắt lỗi
  race `23505/42P07` trước đây.
- **Áp thủ công**: `npm run db:migrate` (scripts/migrate.ts) để chủ động áp/kiểm tra khi deploy.

## Lý do

- Không phụ thuộc: vẫn raw SQL, không ORM/CLI ngoài, không phá quy ước "DATE là chuỗi".
- File `.sql` riêng lẻ dễ review, có lịch sử áp trong DB; baseline idempotent nên áp lại trên
  production đang chạy chỉ **ghi nhận** baseline (không đụng dữ liệu).
- Build vẫn không cần DB: pool lazy, `runMigrations` chỉ chạy lúc query đầu tiên (runtime).

## Các phương án đã cân nhắc

- **Giữ nguyên chuỗi SCHEMA**: diff nhỏ nhất nhưng không giải quyết gốc (vẫn một khối khó review, không có lịch sử).
- **Chỉ chạy thủ công (bỏ auto-init)**: kỷ luật hơn nhưng đổi quy trình deploy, rủi ro quên chạy → app lỗi. Bỏ qua để không thay đổi vận hành.
- **Prisma/Drizzle migrate**: đã loại ở ADR-0001 (ép kiểu Date, thêm generate/migrate, vendor tooling).

## Hệ quả

- **Tích cực:** đổi schema từ nay = thêm file `migrations/000N_*.sql` (không sửa `lib/db/index.ts`); có lịch sử áp; concurrency an toàn hơn nhờ advisory lock.
- **Đánh đổi / rủi ro:** `migrations/` phải có mặt lúc runtime (self-host `next start` từ gốc repo → đã có). Vẫn không tự cập nhật `docs/ERD.md` (làm tay như trước).
- **Quy ước tiếp theo:** đổi schema **luôn** thêm file mới, **không** sửa file migration đã áp trên production (append-only).
