# M45 — Chất lượng & toàn vẹn dữ liệu: tiền chính xác, CHECK, ERD tự sinh, soft-delete, test bất biến (P0)

> **Mục tiêu**: đóng các lỗ toàn vẹn đã phát hiện trong nghiên cứu (`docs/nghien-cuu-nang-cap-erp-2026-07.md` §1, §7): tiền chạy trên float JS, thiếu CHECK constraint, ERD trôi khỏi schema thật, xoá cứng thực thể hợp đồng, scoping đa dự án phụ thuộc kỷ luật tay. Toàn quick-win, không đổi hành vi người dùng.

## PR1 — Tiền chính xác (`lib/money.ts` + quy ước)

**Vấn đề**: parser oid 1700 (`lib/db/index.ts:13`) chuyển mọi NUMERIC → `parseFloat` — cộng dồn tiền trên float JS. VND nguyên đồng chưa lộ sai số nhưng sẽ sai khi VAT/tỷ lệ giữ lại/chia lãi.

**Quyết định** (không đổi parser toàn cục — quá rủi ro với code thống kê hiện có):

- Quy ước mới (ghi vào CLAUDE.md mục Quy ước): **mọi phép cộng/nhân tiền làm trong SQL** (`SUM`, `* rate`), JS chỉ hiển thị. Cột tiền lấy về JS để tính tiếp phải cast `::text` trong SELECT rồi xử lý qua helper.
- `lib/money.ts` (mới, thuần — unit test được):
  ```ts
  export function parseMoney(v: string | number): bigint;      // "1234.56" → 123456 (xu/đồng×100)
  export function addMoney(...vs: bigint[]): bigint;
  export function mulRate(v: bigint, rate: number, dp?: number): bigint; // round half-up
  export function formatVnd(v: bigint | string | number): string;        // "1.234.567 ₫"
  ```
- Rà + sửa các điểm JS đang cộng tiền (grep `reduce` / `+=` trong `lib/finance.ts`, `lib/paymentcerts.ts`, `lib/cost.ts`, `lib/dashboardext.ts`, route invoices/advances/payroll): chuyển về SUM trong SQL hoặc qua `lib/money.ts`. Liệt kê cụ thể trong PR, mỗi chỗ 1 dòng ghi chú.

## PR2 — CHECK constraints + số hoá miền giá trị

Migration `0050_checks.sql` (kiểm tra lại số lúc code) — dùng `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS`-pattern (Postgres không có IF NOT EXISTS cho constraint → bọc `DO $$ ... EXCEPTION WHEN duplicate_object`):

- `tasks.progress_percent BETWEEN 0 AND 1`; `work_packages.progress_percent` tương tự.
- Cột tiền `>= 0` ở: `costs.amount`, `advances.amount`, `invoices.net_amount/vat_amount`, `payment_certs` các cột giá trị, `payrolls.gross/net`, `materials.qty_*`.
- Trước khi ADD: câu UPDATE dọn dữ liệu vi phạm (nếu có) — chạy staging trước prod (quy trình M44 PR4).
- KHÔNG thêm CHECK enum cho cột status (đã kiểm soát bằng code + `toStatusSlug`; enum CHECK gây đau khi thêm giá trị).

## PR3 — ERD tự sinh + CI gate

- `scripts/gen-erd.ts`: đọc `information_schema.tables/columns/table_constraints/key_column_usage` → sinh `docs/ERD.md`: mỗi bảng 1 mục (cột, kiểu, NOT NULL, default), danh sách FK, unique, index (từ `pg_indexes`). Nhóm bảng theo module (map tĩnh trong script). Header file ghi "SINH TỰ ĐỘNG — sửa bằng `npm run gen:erd`".
- `package.json`: `"gen:erd": "tsx scripts/gen-erd.ts"`.
- CI (`.github/workflows/ci.yml`, sau bước test — đã có Postgres service + schema từ test): chạy `npm run gen:erd` rồi `git diff --exit-code docs/ERD.md` → ERD lệch schema là CI đỏ.
- Xoá nợ "ERD cập nhật tay" trong PROGRESS.md; Quy ước chung `docs/nang-cap/README.md` sửa dòng "cập nhật docs/ERD.md cùng PR" → "chạy `npm run gen:erd` cùng PR".

## PR4 — Soft-delete thực thể hợp đồng-tài chính

- Migration: thêm `deleted_at TIMESTAMPTZ` cho `contracts`, `variations`, `payment_certs`, `invoices`, `insurance_bonds`, `claims`.
- Route DELETE các thực thể này chuyển thành `UPDATE ... SET deleted_at = now()` (quyền giữ nguyên); mọi SELECT liệt kê/thống kê thêm `AND deleted_at IS NULL` (rà theo bảng, ít điểm — các lib tương ứng `lib/contracts.ts`, `lib/vo.ts`, `lib/paymentcerts.ts`, `lib/finance.ts`, `lib/insurance.ts`, `lib/claims.ts`).
- Admin xem/khôi phục: thêm filter "Đã xoá" trên trang danh sách (chỉ admin) + `POST /api/<entity>/:id/restore` (admin). Không làm trang thùng rác riêng.
- Các bảng tracking (`tasks`, `progress_dimensions`, `materials`…) **giữ hard-delete** — khối lượng lớn, đã có history riêng.

## PR5 — Test bất biến chống bỏ sót scope đa dự án

**Vấn đề**: scoping `project_id` thủ công từng route — đã lộ lỗi thật 2 lần (`payment-certs`, `costs`).

- `tests/project-scope-invariant.test.ts` (unit, không cần DB): glob `app/api/**/route.ts`, với mỗi file xuất `GET` có chữ `SELECT` (đọc source): PASS nếu source tham chiếu `getCurrentProjectId` | `project_id` | nằm trong **whitelist** khai báo tại đầu test (route toàn cục thật: `/api/auth/*`, `/api/health`, `/api/project`, `/api/projects`, `/api/user-projects`, `/api/push/*`, `/api/notifications` (tự scope trong lib), cron...). Mỗi mục whitelist kèm 1 dòng lý do.
- Heuristic tĩnh (đọc text) chấp nhận false-negative; mục tiêu là **chặn route mới quên scope** — route mới không match sẽ đỏ CI, buộc người viết hoặc scope hoặc whitelist có lý do.
- Chạy trong `npm test` bình thường.

## Test

- `tests/money.test.ts` (unit): parse/add/mulRate/format, case làm tròn 0.5, số âm, chuỗi từ NUMERIC.
- PR2: test tích hợp chèn giá trị vi phạm CHECK → expect lỗi 23514.
- PR3: script gen-erd chạy trong CI chính là test.

## Chia PR

1. **PR1**: `lib/money.ts` + rà điểm cộng tiền JS + quy ước CLAUDE.md.
2. **PR2**: migration CHECK + dọn dữ liệu.
3. **PR3**: gen-erd + CI gate + xoá nợ.
4. **PR4**: soft-delete + restore.
5. **PR5**: test bất biến scope.
