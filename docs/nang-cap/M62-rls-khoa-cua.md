# M62 — Đóng nốt RLS: bọc `withProjectScope` cho 3 route còn lại + migration "khoá cửa"

> Đặc tả viết 2026-07-19 (đợt đánh giá chi tiết lần 8), đóng nợ kỹ thuật **[Trung] "RLS chưa thực sự
> có hiệu lực trên production"** (xem `PROGRESS.md` › Nợ kỹ thuật). Tiếp nối M51 GĐ0
> (`migrations/0069_rls.sql` + ADR-0005 + `lib/db/index.ts::withProjectScope`). Đọc trước:
> mục M51 PR1/PR2 trong `PROGRESS.md` để hiểu vì sao policy hiện có nhánh "thiếu ngữ cảnh → cho qua".

## Vấn đề

RLS trên 11 bảng tài chính hiện chỉ là lưới an toàn "mềm": policy còn nhánh
`current_setting('app.project_id', true) IN ('', NULL) → cho qua`, nên mọi query **không** chạy trong
`withProjectScope`/`withTransaction` (GUC rỗng) đều không bị lọc. Muốn "khoá cửa" (bỏ nhánh này) thì
**mọi** đường đọc/ghi chạm 11 bảng phải luôn có GUC đúng. Còn đúng 3 route chưa có:

1. `GET /api/notifications` — đọc xen kẽ ghi (~25 khối, mỗi khối: đọc điều kiện cảnh báo — nhiều khối
   JOIN bảng phạm vi RLS như `contracts`, `purchase_orders`, `payment_bills`, `insurance_bonds`,
   `claims`, `variation_orders`, `advances` — rồi `INSERT`/`DELETE` bảng `notifications`), không bọc
   nổi 1 transaction `READ ONLY`.
2. `GET /api/payments/bills` và `GET /api/payments/floors` — đọc `payment_bills` lọc theo
   `responsible`/sheet, **cố ý xuyên dự án** (UI đang hiển thị vậy); bọc `withProjectScope(projectId)`
   thật sẽ đổi hành vi.

## Phạm vi / Không làm

- **Làm**: mở rộng `withProjectScope` cho transaction đọc-ghi; bọc 3 route trên; migration khoá cửa;
  cập nhật test.
- **Không làm**: không đổi logic nghiệp vụ/điều kiện cảnh báo nào trong `notifications`; không đổi
  shape response 3 route; không đụng chính sách RLS của bảng ngoài danh sách 11 bảng M51; không tự
  đổi `DATABASE_URL` production (việc `[Người dùng]`).

## PR1 — `withProjectScope` đọc-ghi + bọc 3 route (`route: spec`)

### 1. `lib/db/index.ts` — mở rộng `withProjectScope`

Chữ ký mới (tương thích ngược 100% — mọi call site hiện tại giữ nguyên):

```ts
export async function withProjectScope<T>(
  projectId: number | "*",
  fn: () => Promise<T>,
  opts?: { readOnly?: boolean }, // mặc định true — giữ đúng hành vi hiện tại
): Promise<T>;
```

- `opts.readOnly === false` → **bỏ** câu `SET TRANSACTION READ ONLY`, vẫn
  `SELECT set_config('app.project_id', <value>, true)` ngay sau khi mở transaction (tái dùng nguyên
  `withTransaction` như hiện tại, kể cả tính reentrant).
- Không thêm cơ chế GUC mới, không đổi tên hàm.

### 2. `app/api/notifications/route.ts`

Bọc **toàn bộ thân `GET` sau bước auth + đọc `projectId`** trong
`withProjectScope(projectId ?? "*", fn, { readOnly: false })`:

- `projectId` có giá trị → GUC = projectId: các khối đọc bảng phạm vi RLS được lọc đúng dự án (trùng
  với lớp WHERE ứng dụng đã có từ M22 — không đổi kết quả); `INSERT`/`DELETE` trên `notifications`
  (bảng KHÔNG có RLS) chạy bình thường trong transaction đọc-ghi.
- `projectId` null (DB chưa có project — tương thích ngược) → GUC = `'*'`: hành vi y hệt hiện tại.
- **Quyết định đã chốt: bọc cả route trong MỘT transaction** (không tách từng khối). Đổi ngữ nghĩa
  lỗi từ "partial progress" sang all-or-nothing: 1 khối lỗi → rollback toàn bộ lượt sync. Chấp nhận
  vì sync là on-fetch idempotent — lượt fetch kế tiếp tự làm lại từ đầu; đổi lại diff nhỏ, không phải
  chẻ 25 khối. KHÔNG tự ý đổi sang phương án tách khối.
- Lưu ý kỹ thuật: các helper trong `lib/*` được route này gọi nếu có `withTransaction` riêng thì
  reentrant tái dùng client — GUC (transaction-local) vẫn hiệu lực, không cần sửa helper.

### 3. `app/api/payments/bills/route.ts` + `app/api/payments/floors/route.ts` (GET)

Bọc `withProjectScope("*")` (đọc thuần → giữ mặc định `readOnly: true`):

- `'*'` là **khai báo tường minh** "route này cố ý đọc xuyên dự án" — hành vi không đổi so với hiện
  tại, nhưng sau khoá cửa route vẫn chạy được (không còn rơi vào nhánh thiếu-ngữ-cảnh).
- KHÔNG đổi sang `withProjectScope(projectId)` — đó là thay đổi nghiệp vụ, ngoài phạm vi (nếu muốn
  scope thật, mở đặc tả riêng sau).

### 4. Test PR1

- `tests/rls.test.ts` thêm ca: transaction đọc-ghi qua `withProjectScope(projA, fn, {readOnly:false})`
  — đọc bảng phạm vi chỉ thấy dự án A, `INSERT` bảng thường (không RLS) trong cùng transaction thành
  công; `readOnly` mặc định vẫn chặn ghi (`cannot execute ... in a read-only transaction`).
- `tests/project-scope-invariant.test.ts`: gỡ `payments/bills`, `payments/floors`, `notifications`
  khỏi whitelist "chưa bọc".
- Chạy thật `GET /api/notifications` trên Postgres cục bộ + role `xboss_app` (NOBYPASSRLS), dữ liệu 2
  dự án: cảnh báo tài chính chỉ sinh cho dự án đang chọn, số lượng bản ghi `notifications` khớp với
  trước khi bọc (không mất loại cảnh báo nào).

### Tiêu chí chấp nhận PR1

- [ ] 3 route đều chạy trong `withProjectScope`; không route nào chạm 11 bảng phạm vi còn nằm ngoài
      (kiểm bằng `tests/project-scope-invariant.test.ts` — whitelist rỗng).
- [ ] Response 3 route không đổi shape/nội dung với cùng dữ liệu (so sánh trước/sau trên seed).
- [ ] `npm run lint`/`typecheck`/`test`/`build` xanh; test tích hợp RLS chạy thật qua
      `TEST_DATABASE_URL` + role NOBYPASSRLS.

## PR2 — Migration "khoá cửa" (`route: spec`, CHỈ chạy sau điều kiện tiên quyết)

### Điều kiện tiên quyết (ghi rõ trong PR, không bỏ qua)

1. `[Người dùng]` đã đổi `DATABASE_URL` production sang role `xboss_app` (NOBYPASSRLS) và chạy ổn.
2. PR1 đã lên production ≥ ~1 tuần, log warn "query nhóm 11 bảng thiếu GUC" (đã thêm từ M51 PR1)
   **không còn xuất hiện** — đối chiếu log thật, không tin trí nhớ.

### Nội dung

- `migrations/007N_rls_lock.sql` (số N lấy kế tiếp thực tế lúc code — bài học trùng số 0071):
  `DROP POLICY IF EXISTS` + `CREATE POLICY` lại cho **cả 11 bảng**, policy mới chỉ còn 2 nhánh:
  `project_id::text = current_setting('app.project_id', true)` **hoặc** GUC = `'*'`. Bỏ hẳn nhánh
  `''`/NULL-cho-qua. Giữ nguyên so-text (KHÔNG cast int — Postgres không bảo đảm short-circuit,
  xem ghi chú M51 PR1). Idempotent, append-only.
- Migration **không đụng dòng dữ liệu** (chỉ DDL policy) → theo checklist DoD vẫn nên qua staging vì
  đổi hành vi truy cập: chạy `bash deploy.sh --staging` + smoke test các trang tài chính trước.
- `tests/rls.test.ts`: kịch bản (2) "thiếu ngữ cảnh" đổi expectation từ "cho qua" → "trả 0 dòng".

### Tiêu chí chấp nhận PR2

- [ ] Trên DB test role `xboss_app`: query 11 bảng KHÔNG có GUC trả 0 dòng; có GUC đúng trả dữ liệu
      dự án đó; GUC `'*'` trả tất cả.
- [ ] Smoke staging: dashboard, `/payments`, `/notifications`, contracts/PO/IPC list + detail đều có
      dữ liệu như trước.
- [ ] Gỡ nợ "[Trung] RLS chưa thực sự có hiệu lực" khỏi `PROGRESS.md` trong cùng PR.

## Rủi ro & lối thoát

- Khoá cửa xong mà còn sót đường đọc thiếu GUC → triệu chứng là **màn hình tài chính rỗng** (không
  phải 500). Lối thoát nhanh: migration revert policy (thêm lại nhánh cho-qua) là 1 file SQL mới —
  chuẩn bị sẵn nội dung trong PR2 nhưng KHÔNG commit vào `migrations/` (để trong mô tả PR).
