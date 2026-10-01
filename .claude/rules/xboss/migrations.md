---
paths:
  - "migrations/**/*.sql"
  - "lib/db/**/*.ts"
---

# Checklist khi chạm migration / lớp DB (XBoss)

- **Append-only**: không sửa file `migrations/*.sql` đã có trên `origin/main` (đã áp production)
  — tạo `migrations/000N_<mo-ta>.sql` mới. Hook `protect-config.sh` chặn cứng việc sửa file cũ.
- **Số thứ tự**: `git fetch origin` trước khi đánh số; `npm run check:migrations` chặn trùng số
  (TRAPS.md §1 — đã xảy ra khi dispatch song song).
- **Idempotent**: `CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, chạy lại không lỗi.
- **Đụng dữ liệu** (`UPDATE`/backfill/`ALTER COLUMN … TYPE`/`DROP`): ghi rõ trong PR + `PROGRESS.md`
  là phải qua staging (`bash deploy.sh --staging`) và `npm run db:migrate -- --dry-run` trước
  production. Thêm thuần tuý (`CREATE TABLE`/`ADD COLUMN`/`CREATE INDEX`) đi thẳng được.
- **ERD**: đổi schema → `npm run gen:erd` (CI so `docs/ERD.md` bằng `git diff --exit-code`).
- **Kiểu dữ liệu**: cột `DATE` về JS là chuỗi `'YYYY-MM-DD'` (so sánh chuỗi); NUMERIC → number nên
  tiền phải tính trong SQL hoặc cast `::text` + `lib/nen/money.ts`.
- **Đa dự án / RLS** (ADR-0004/0005): bảng nghiệp vụ mới có `project_id` + policy RLS như bảng
  anh em; index cho cột lọc/join trên bảng lớn (`tasks`, `progress_dimensions`, `task_history`,
  `notifications`).
- Review chuyên sâu: agent `audit-logic` (bắt buộc), `ecc-database-reviewer` (góc nhìn Postgres
  chung — bỏ phần Supabase).
